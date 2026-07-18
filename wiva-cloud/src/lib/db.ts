import { neon } from "@neondatabase/serverless";
import { unstable_cache } from "next/cache";
import postgres from "postgres";
import { demoAssets } from "@/lib/demo";
import { catalogIdentity, isRestrictedMetadata, normalizeProviderTitle, prepareCatalogItem } from "@/lib/catalog-safety";
import { databaseConfigured, isDemoMode, tenantId } from "@/lib/env";
import type { AssetKind, CatalogAsset, MatchScheduleEntry, PaymentRequestSummary, ProviderCatalogItem, ProviderSeriesEpisode, ProviderSummary, ProviderSyncRule, ViewerActivity, ViewerIdentity, ViewerSessionSummary, ViewerSummary } from "@/lib/types";

const globalForDb = globalThis as typeof globalThis & {
  wivaLocalSql?: ReturnType<typeof postgres>;
};

type QueryTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

function sql(): QueryTag {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not configured");
  const hostname = new URL(url).hostname;
  if (hostname === "127.0.0.1" || hostname === "localhost") {
    globalForDb.wivaLocalSql ??= postgres(url, { max: 5 });
    return globalForDb.wivaLocalSql as unknown as QueryTag;
  }
  return neon(url, { fetchOptions: { signal: AbortSignal.timeout(12_000) } }) as unknown as QueryTag;
}

function assetFromRow(row: Record<string, unknown>): CatalogAsset {
  return {
    id: String(row.id),
    kind: row.kind as AssetKind,
    title: String(row.title || ""),
    description: String(row.description || ""),
    category: String(row.category || ""),
    artworkUrl: String(row.artwork_url || ""),
    backdropUrl: String(row.backdrop_url || ""),
    year: row.year == null ? null : Number(row.year),
    rating: row.rating == null ? null : Number(row.rating),
    quality: String(row.quality || "HD"),
    language: String(row.language || ""),
    isFeatured: Boolean(row.is_featured),
    isActive: Boolean(row.is_active),
    isRestricted: Boolean(row.is_restricted),
    isPlayable: row.is_playable == null ? true : Boolean(row.is_playable),
    metadataReview: row.metadata_review === "needs_review" ? "needs_review" : "approved",
    providerId: row.provider_id == null ? null : String(row.provider_id),
    providerAssetRef: String(row.provider_asset_ref || ""),
    parentAssetId: row.parent_asset_id == null ? null : String(row.parent_asset_id),
    seasonNumber: row.season_number == null ? null : Number(row.season_number),
    episodeNumber: row.episode_number == null ? null : Number(row.episode_number),
  };
}

function matchScheduleFromRow(row: Record<string, unknown>): MatchScheduleEntry {
  return {
    id: String(row.id),
    homeTeam: String(row.home_team || ""),
    awayTeam: String(row.away_team || ""),
    competition: String(row.competition || ""),
    channelName: String(row.channel_name || ""),
    startsAt: new Date(String(row.starts_at)).toISOString(),
    endsAt: new Date(String(row.ends_at)).toISOString(),
    isActive: Boolean(row.is_active),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listPublicMatchSchedule(limit = 8) {
  if (!databaseConfigured()) return [];
  const safeLimit = Math.min(20, Math.max(1, Math.floor(limit)));
  const query = sql();
  const rows = await query`
    select * from wiva_cloud_match_schedule
    where tenant_id = ${tenantId()} and is_active = true
      and ends_at > now() - interval '15 minutes'
      and starts_at < now() + interval '30 days'
    order by starts_at asc limit ${safeLimit}
  `;
  return (rows as Record<string, unknown>[]).map(matchScheduleFromRow);
}

export async function listMatchSchedule() {
  if (!databaseConfigured()) return [];
  const query = sql();
  const rows = await query`
    select * from wiva_cloud_match_schedule
    where tenant_id = ${tenantId()} and ends_at > now() - interval '30 days'
    order by starts_at asc limit 250
  `;
  return (rows as Record<string, unknown>[]).map(matchScheduleFromRow);
}

export async function createMatchSchedule(input: Omit<MatchScheduleEntry, "id" | "createdAt" | "updatedAt">) {
  const query = sql();
  const rows = await query`
    insert into wiva_cloud_match_schedule
      (tenant_id, home_team, away_team, competition, channel_name, starts_at, ends_at, is_active)
    values
      (${tenantId()}, ${input.homeTeam}, ${input.awayTeam}, ${input.competition}, ${input.channelName}, ${input.startsAt}, ${input.endsAt}, ${input.isActive})
    returning id
  `;
  return String(rows[0].id);
}

export async function updateMatchSchedule(id: string, input: Partial<Omit<MatchScheduleEntry, "id" | "createdAt" | "updatedAt">>) {
  const query = sql();
  const rows = await query`
    update wiva_cloud_match_schedule set
      home_team = coalesce(${input.homeTeam ?? null}, home_team),
      away_team = coalesce(${input.awayTeam ?? null}, away_team),
      competition = coalesce(${input.competition ?? null}, competition),
      channel_name = coalesce(${input.channelName ?? null}, channel_name),
      starts_at = coalesce(${input.startsAt ?? null}, starts_at),
      ends_at = coalesce(${input.endsAt ?? null}, ends_at),
      is_active = coalesce(${input.isActive ?? null}, is_active)
    where tenant_id = ${tenantId()} and id = ${id}
    returning id
  `;
  return Boolean(rows[0]);
}

export async function deleteMatchSchedule(id: string) {
  const query = sql();
  const rows = await query`
    delete from wiva_cloud_match_schedule where tenant_id = ${tenantId()} and id = ${id}
    returning id
  `;
  return Boolean(rows[0]);
}

export async function listAssets(kind?: AssetKind, includeDisabled = false) {
  if (!databaseConfigured()) return isDemoMode() ? demoAssets.filter((item) => !kind || item.kind === kind) : [];
  const query = sql();
  const tenant = tenantId();
  const rows = includeDisabled
    ? kind
      ? await query`select * from wiva_cloud_assets where tenant_id = ${tenant} and kind = ${kind} and (${kind !== "series"} or parent_asset_id is null) order by sort_order, title`
      : await query`select * from wiva_cloud_assets where tenant_id = ${tenant} order by is_featured desc, sort_order, title`
    : kind
      ? await query`
          select a.* from wiva_cloud_assets a
          join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
          where a.tenant_id = ${tenant} and a.kind = ${kind} and (${kind !== "series"} or a.parent_asset_id is null)
            and a.is_active = true and a.is_restricted = false and a.is_playable = true
            and p.status = 'active' and p.redistribution_attested = true
            and (${kind !== "series"} or exists (
              select 1 from wiva_cloud_assets episode
              where episode.tenant_id=a.tenant_id and episode.parent_asset_id=a.id
                and episode.is_active=true and episode.is_restricted=false and episode.is_playable=true
            ))
          order by a.sort_order, a.title
        `
      : await query`
          select a.* from wiva_cloud_assets a
          join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
          where a.tenant_id = ${tenant} and a.is_active = true and a.is_restricted = false and a.is_playable = true
            and p.status = 'active' and p.redistribution_attested = true
          order by a.is_featured desc, a.sort_order, a.title
        `;
  return (rows as Record<string, unknown>[]).map(assetFromRow);
}

async function queryViewerAssets(kind: AssetKind, limit = 5) {
  const safeLimit = Math.min(60, Math.max(1, Math.floor(limit)));
  if (!databaseConfigured()) return isDemoMode() ? demoAssets.filter((item) => item.kind === kind).slice(0, safeLimit) : [];
  const query = sql(); const tenant = tenantId();
  const rows = await query`
    select a.* from wiva_cloud_assets a
    join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
    where a.tenant_id = ${tenant} and a.kind = ${kind} and (${kind !== "series"} or a.parent_asset_id is null)
      and a.is_active = true and a.is_restricted = false and a.is_playable = true
      and p.status = 'active' and p.redistribution_attested = true
      and (${kind !== "series"} or exists (
        select 1 from wiva_cloud_assets episode
        where episode.tenant_id=a.tenant_id and episode.parent_asset_id=a.id
          and episode.is_active=true and episode.is_restricted=false and episode.is_playable=true
      ))
    order by a.is_featured desc, a.sort_order, a.title
    limit ${safeLimit}
  `;
  return (rows as Record<string, unknown>[]).map(assetFromRow);
}

const cachedViewerAssets = unstable_cache(queryViewerAssets, ["wiva-viewer-assets-v3"], {
  revalidate: 20,
  tags: ["wiva-viewer-catalog"],
});

export async function listViewerAssets(kind: AssetKind, limit = 5) {
  return cachedViewerAssets(kind, Math.min(60, Math.max(1, Math.floor(limit))));
}

async function queryLatestViewerAssets(kind: AssetKind, limit = 10) {
  const safeLimit = Math.min(30, Math.max(1, Math.floor(limit)));
  if (!databaseConfigured()) return isDemoMode() ? demoAssets.filter((item) => item.kind === kind).slice(0, safeLimit) : [];
  const query = sql(); const tenant = tenantId();
  const rows = await query`
    select a.* from wiva_cloud_assets a
    join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
    where a.tenant_id = ${tenant} and a.kind = ${kind} and (${kind !== "series"} or a.parent_asset_id is null)
      and a.is_active = true and a.is_restricted = false and a.is_playable = true
      and p.status = 'active' and p.redistribution_attested = true
      and (${kind !== "series"} or exists (
        select 1 from wiva_cloud_assets episode
        where episode.tenant_id=a.tenant_id and episode.parent_asset_id=a.id
          and episode.is_active=true and episode.is_restricted=false and episode.is_playable=true
      ))
    order by a.last_imported_at desc, a.created_at desc
    limit ${safeLimit}
  `;
  return (rows as Record<string, unknown>[]).map(assetFromRow);
}

const cachedLatestViewerAssets = unstable_cache(queryLatestViewerAssets, ["wiva-latest-viewer-assets-v1"], {
  revalidate: 20,
  tags: ["wiva-viewer-catalog"],
});

export async function listLatestViewerAssets(kind: AssetKind, limit = 10) {
  return cachedLatestViewerAssets(kind, Math.min(30, Math.max(1, Math.floor(limit))));
}

async function queryViewerCatalog(kind: AssetKind, options: { page?: number; pageSize?: number; category?: string; search?: string } = {}) {
  const pageSize = Math.min(60, Math.max(12, Math.floor(options.pageSize || 30)));
  const page = Math.max(1, Math.floor(options.page || 1));
  const category = String(options.category || "").trim().slice(0, 120);
  const search = String(options.search || "").trim().slice(0, 120);
  if (!databaseConfigured()) {
    const filtered = (isDemoMode() ? demoAssets : []).filter((item) => item.kind === kind && (!category || item.category === category) && (!search || `${item.title} ${item.category}`.toLocaleLowerCase("ar").includes(search.toLocaleLowerCase("ar"))));
    const categories = [...new Set((isDemoMode() ? demoAssets : []).filter((item) => item.kind === kind).map((item) => item.category).filter(Boolean))];
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, categories, page, pageSize };
  }
  const query = sql(); const tenant = tenantId(); const offset = (page - 1) * pageSize; const pattern = `%${search}%`;
  const [rows, counts, categoryRows] = await Promise.all([
    query`
      select a.* from wiva_cloud_assets a
      join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
      where a.tenant_id = ${tenant} and a.kind = ${kind} and (${kind !== "series"} or a.parent_asset_id is null)
        and a.is_active = true and a.is_restricted = false and a.is_playable = true
        and p.status = 'active' and p.redistribution_attested = true
        and (${kind !== "series"} or exists (
          select 1 from wiva_cloud_assets episode
          where episode.tenant_id=a.tenant_id and episode.parent_asset_id=a.id
            and episode.is_active=true and episode.is_restricted=false and episode.is_playable=true
        ))
        and (${category} = '' or a.category = ${category})
        and (${search} = '' or a.title ilike ${pattern} or a.category ilike ${pattern})
      order by a.is_featured desc, a.sort_order, a.title limit ${pageSize} offset ${offset}
    `,
    query`
      select count(*)::int as total from wiva_cloud_assets a
      join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
      where a.tenant_id = ${tenant} and a.kind = ${kind} and (${kind !== "series"} or a.parent_asset_id is null)
        and a.is_active = true and a.is_restricted = false and a.is_playable = true
        and p.status = 'active' and p.redistribution_attested = true
        and (${kind !== "series"} or exists (
          select 1 from wiva_cloud_assets episode
          where episode.tenant_id=a.tenant_id and episode.parent_asset_id=a.id
            and episode.is_active=true and episode.is_restricted=false and episode.is_playable=true
        ))
        and (${category} = '' or a.category = ${category})
        and (${search} = '' or a.title ilike ${pattern} or a.category ilike ${pattern})
    `,
    query`
      select distinct a.category from wiva_cloud_assets a
      join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
      where a.tenant_id = ${tenant} and a.kind = ${kind} and a.is_active = true
        and a.is_restricted = false and a.is_playable = true
        and p.status = 'active' and p.redistribution_attested = true and a.category <> ''
        and (${kind !== "series"} or exists (
          select 1 from wiva_cloud_assets episode
          where episode.tenant_id=a.tenant_id and episode.parent_asset_id=a.id
            and episode.is_active=true and episode.is_restricted=false and episode.is_playable=true
        ))
      order by a.category limit 80
    `,
  ]);
  return {
    items: (rows as Record<string, unknown>[]).map(assetFromRow), total: Number(counts[0]?.total || 0),
    categories: categoryRows.map((row) => String(row.category || "")).filter(Boolean), page, pageSize,
  };
}

const cachedViewerCatalog = unstable_cache(queryViewerCatalog, ["wiva-viewer-catalog-v3"], {
  revalidate: 20,
  tags: ["wiva-viewer-catalog"],
});

export async function listViewerCatalog(kind: AssetKind, options: { page?: number; pageSize?: number; category?: string; search?: string } = {}) {
  const page = Math.min(500, Math.max(1, Math.floor(options.page || 1)));
  const pageSize = Math.min(60, Math.max(12, Math.floor(options.pageSize || 30)));
  const category = String(options.category || "").trim().slice(0, 120);
  const search = String(options.search || "").trim().slice(0, 120);
  if (category || search) return queryViewerCatalog(kind, { page, pageSize, category, search });
  return cachedViewerCatalog(kind, { page, pageSize });
}

export async function searchViewerAssets(search: string, limit = 48) {
  const value = search.trim().slice(0, 120); if (!value) return [];
  if (!databaseConfigured()) return (isDemoMode() ? demoAssets : []).filter((asset) => `${asset.title} ${asset.category}`.toLocaleLowerCase("ar").includes(value.toLocaleLowerCase("ar"))).slice(0, limit);
  const query = sql(); const tenant = tenantId(); const pattern = `%${value}%`; const safeLimit = Math.min(60, Math.max(1, limit));
  const rows = await query`
    select a.* from wiva_cloud_assets a
    join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
    where a.tenant_id = ${tenant} and a.is_active = true and a.is_restricted = false and a.is_playable = true
      and p.status = 'active' and p.redistribution_attested = true
      and (a.title ilike ${pattern} or a.category ilike ${pattern}) and (a.kind <> 'series' or a.parent_asset_id is null)
      and (a.kind <> 'series' or exists (
        select 1 from wiva_cloud_assets episode
        where episode.tenant_id=a.tenant_id and episode.parent_asset_id=a.id
          and episode.is_active=true and episode.is_restricted=false and episode.is_playable=true
      ))
    order by a.is_featured desc, a.sort_order, a.title limit ${safeLimit}
  `;
  return (rows as Record<string, unknown>[]).map(assetFromRow);
}

export async function listSeriesEpisodes(parentId: string, includeDisabled = false) {
  const query = sql();
  const rows = includeDisabled
    ? await query`select * from wiva_cloud_assets where tenant_id=${tenantId()} and parent_asset_id=${parentId} order by season_number, episode_number, title`
    : await query`
        select a.* from wiva_cloud_assets a
        join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
        where a.tenant_id=${tenantId()} and a.parent_asset_id=${parentId} and a.is_active=true
          and a.is_restricted=false and a.is_playable=true
          and p.status='active' and p.redistribution_attested=true
        order by a.season_number, a.episode_number, a.title
      `;
  return (rows as Record<string, unknown>[]).map(assetFromRow);
}

export async function getAsset(id: string, includeUnavailable = false) {
  if (!databaseConfigured()) return isDemoMode() ? demoAssets.find((item) => item.id === id) || null : null;
  const query = sql();
  const rows = includeUnavailable
    ? await query`select * from wiva_cloud_assets where tenant_id = ${tenantId()} and id = ${id} limit 1`
    : await query`
        select a.* from wiva_cloud_assets a
        join wiva_cloud_providers p on p.id = a.provider_id and p.tenant_id = a.tenant_id
        where a.tenant_id = ${tenantId()} and a.id = ${id} and a.is_active = true
          and a.is_restricted = false and a.is_playable = true
          and p.status = 'active' and p.redistribution_attested = true
        limit 1
      `;
  return rows[0] ? assetFromRow(rows[0] as Record<string, unknown>) : null;
}

export async function listProviders(): Promise<ProviderSummary[]> {
  if (!databaseConfigured()) return [];
  const query = sql();
  const rows = await query`
    select p.id, p.name, p.kind, p.status, p.priority, p.rights_reference, p.redistribution_attested, p.created_at,
      count(r.id) filter (where r.enabled = true)::int as tracked_series_count,
      max(r.last_success_at) as last_auto_sync_at
    from wiva_cloud_providers p
    left join wiva_cloud_provider_sync_rules r on r.provider_id=p.id and r.tenant_id=p.tenant_id
    where p.tenant_id = ${tenantId()}
    group by p.id order by p.priority, p.name
  `;
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as ProviderSummary["kind"],
    status: row.status as ProviderSummary["status"],
    priority: Number(row.priority),
    rightsReference: String(row.rights_reference),
    redistributionAttested: Boolean(row.redistribution_attested),
    trackedSeriesCount: Number(row.tracked_series_count || 0),
    lastAutoSyncAt: row.last_auto_sync_at ? new Date(String(row.last_auto_sync_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

function syncRuleFromRow(row: Record<string, unknown>): ProviderSyncRule {
  return {
    id: String(row.id), providerId: String(row.provider_id), seriesRef: String(row.series_ref),
    seriesTitle: String(row.series_title), enabled: Boolean(row.enabled), publishNew: Boolean(row.publish_new),
    lastCheckedAt: row.last_checked_at ? new Date(String(row.last_checked_at)).toISOString() : null,
    lastSuccessAt: row.last_success_at ? new Date(String(row.last_success_at)).toISOString() : null,
    nextRunAt: new Date(String(row.next_run_at)).toISOString(), lastError: String(row.last_error || ""),
    importedCount: Number(row.imported_count || 0),
    knownEpisodeRefs: Array.isArray(row.known_episode_refs) ? (row.known_episode_refs as unknown[]).map(String).slice(0, 20_000) : [],
  };
}

export async function getProviderSyncRule(providerId: string, seriesRef: string) {
  const query = sql();
  const rows = await query`
    select * from wiva_cloud_provider_sync_rules
    where tenant_id=${tenantId()} and provider_id=${providerId} and series_ref=${seriesRef} limit 1
  `;
  return rows[0] ? syncRuleFromRow(rows[0] as Record<string, unknown>) : null;
}

export async function listProviderSyncRules(providerId: string) {
  const query = sql();
  const rows = await query`
    select * from wiva_cloud_provider_sync_rules
    where tenant_id=${tenantId()} and provider_id=${providerId}
    order by enabled desc, series_title
  `;
  return (rows as Record<string, unknown>[]).map(syncRuleFromRow);
}

export async function upsertProviderSyncRule(input: { providerId: string; seriesRef: string; seriesTitle: string; enabled: boolean; publishNew: boolean; knownEpisodeRefs?: string[] }) {
  const query = sql();
  const knownEpisodeRefs = [...new Set(input.knownEpisodeRefs || [])].slice(0, 20_000);
  const rows = await query`
    insert into wiva_cloud_provider_sync_rules
      (tenant_id,provider_id,series_ref,series_title,enabled,publish_new,next_run_at,last_error,known_episode_refs,updated_at)
    values (${tenantId()},${input.providerId},${input.seriesRef},${input.seriesTitle},${input.enabled},${input.publishNew},now(),'',${JSON.stringify(knownEpisodeRefs)}::jsonb,now())
    on conflict (tenant_id,provider_id,series_ref) do update set
      series_title=excluded.series_title,enabled=excluded.enabled,publish_new=excluded.publish_new,
      next_run_at=case when excluded.enabled then least(wiva_cloud_provider_sync_rules.next_run_at,now()) else wiva_cloud_provider_sync_rules.next_run_at end,
      known_episode_refs=case when jsonb_array_length(excluded.known_episode_refs)>0 then excluded.known_episode_refs else wiva_cloud_provider_sync_rules.known_episode_refs end,
      last_error='',updated_at=now()
    returning *
  `;
  return syncRuleFromRow(rows[0] as Record<string, unknown>);
}

export async function listDueProviderSyncRules(limit = 12) {
  const safeLimit = Math.min(25, Math.max(1, Math.floor(limit)));
  const query = sql();
  const rows = await query`
    select r.* from wiva_cloud_provider_sync_rules r
    join wiva_cloud_providers p on p.id=r.provider_id and p.tenant_id=r.tenant_id
    where r.tenant_id=${tenantId()} and r.enabled=true and r.next_run_at <= now()
      and p.status='active' and p.redistribution_attested=true
    order by r.next_run_at asc limit ${safeLimit}
  `;
  return (rows as Record<string, unknown>[]).map(syncRuleFromRow);
}

export async function listImportedSeriesEpisodeRefs(providerId: string, parentRef: string) {
  const query = sql();
  const rows = await query`
    select episode.provider_asset_ref from wiva_cloud_assets episode
    join wiva_cloud_assets parent on parent.id=episode.parent_asset_id and parent.tenant_id=episode.tenant_id
    where episode.tenant_id=${tenantId()} and episode.provider_id=${providerId} and parent.provider_asset_ref=${parentRef}
  `;
  return new Set(rows.map((row) => String(row.provider_asset_ref)));
}

export async function finishProviderSyncRule(id: string, input: { added: number; error?: string; knownEpisodeRefs?: string[] }) {
  const query = sql(); const error = String(input.error || "").slice(0, 500);
  const knownEpisodeRefs = [...new Set(input.knownEpisodeRefs || [])].slice(0, 20_000);
  await query`
    update wiva_cloud_provider_sync_rules set
      last_checked_at=now(),last_success_at=case when ${error}='' then now() else last_success_at end,
      next_run_at=now() + interval '24 hours',last_error=${error},
      imported_count=imported_count + ${Math.max(0, Math.floor(input.added))},
      known_episode_refs=case when ${error}='' then ${JSON.stringify(knownEpisodeRefs)}::jsonb else known_episode_refs end,updated_at=now()
    where tenant_id=${tenantId()} and id=${id}
  `;
}

export async function getProviderSecret(id: string) {
  const query = sql();
  const rows = await query`
    select id, name, kind, status, rights_reference, redistribution_attested, credentials_cipher
    from wiva_cloud_providers where tenant_id = ${tenantId()} and id = ${id} limit 1
  `;
  return rows[0] || null;
}

export async function getProviderCatalogCache(providerId: string, section: AssetKind) {
  const query = sql();
  const rows = await query`
    select payload from wiva_cloud_provider_catalog_cache
    where tenant_id=${tenantId()} and provider_id=${providerId} and section=${section} and expires_at > now()
    limit 1
  `;
  return Array.isArray(rows[0]?.payload) ? rows[0].payload as unknown as ProviderCatalogItem[] : null;
}

export async function saveProviderCatalogCache(providerId: string, section: AssetKind, items: ProviderCatalogItem[]) {
  const query = sql();
  await query`
    insert into wiva_cloud_provider_catalog_cache
      (tenant_id, provider_id, section, payload, item_count, expires_at, updated_at)
    values
      (${tenantId()}, ${providerId}, ${section}, ${JSON.stringify(items)}::jsonb, ${items.length}, now() + interval '15 minutes', now())
    on conflict (tenant_id, provider_id, section) do update set
      payload=excluded.payload, item_count=excluded.item_count, expires_at=excluded.expires_at, updated_at=now()
  `;
}

export async function createProvider(input: {
  name: string;
  kind: ProviderSummary["kind"];
  credentialsCipher: string;
  rightsReference: string;
  priority: number;
}) {
  const query = sql();
  const rows = await query`
    insert into wiva_cloud_providers
      (tenant_id, name, kind, credentials_cipher, rights_reference, redistribution_attested, status, priority)
    values
      (${tenantId()}, ${input.name}, ${input.kind}, ${input.credentialsCipher}, ${input.rightsReference}, true, 'disabled', ${input.priority})
    returning id
  `;
  return String(rows[0].id);
}

export async function setProviderStatus(id: string, status: ProviderSummary["status"]) {
  const query = sql();
  const rows = await query`
    update wiva_cloud_providers set status = ${status}
    where tenant_id = ${tenantId()} and id = ${id}
    returning id
  `;
  return Boolean(rows[0]);
}

export async function createAsset(input: {
  providerId: string;
  providerAssetRef: string;
  kind: AssetKind;
  title: string;
  description: string;
  category: string;
  quality: string;
  language: string;
}) {
  const query = sql();
  const rows = await query`
    insert into wiva_cloud_assets
      (tenant_id, provider_id, provider_asset_ref, kind, title, description, category, quality, language, is_active)
    values
      (${tenantId()}, ${input.providerId}, ${input.providerAssetRef}, ${input.kind}, ${input.title}, ${input.description}, ${input.category}, ${input.quality}, ${input.language}, false)
    returning id
  `;
  return String(rows[0].id);
}

export async function importProviderAssets(providerId: string, items: ProviderCatalogItem[], active: boolean) {
  if (!items.length) return 0;
  const query = sql();
  const uniqueItems = [...new Map(items.map((item) => [catalogIdentity(item), item])).values()];
  const payload = uniqueItems.map(prepareCatalogItem).map((item) => ({
    provider_id: providerId,
    provider_asset_ref: item.ref,
    kind: item.kind,
    title: item.title,
    description: item.description,
    category: item.category,
    artwork_url: item.artworkUrl || null,
    year: item.year,
    rating: item.rating,
    quality: item.quality,
    language: item.language,
    is_restricted: item.restricted,
    is_playable: item.playable,
    metadata_review: item.restricted || !item.playable ? "needs_review" : "approved",
  }));
  const rows = await query`
    insert into wiva_cloud_assets
      (tenant_id, provider_id, provider_asset_ref, kind, title, description, category, artwork_url, year, rating, quality, language, is_active, is_restricted, is_playable, metadata_review)
    select ${tenantId()}, x.provider_id::uuid, x.provider_asset_ref, x.kind, x.title, x.description,
      x.category, x.artwork_url, x.year, x.rating, x.quality, x.language,
      (${active} and x.is_restricted = false and x.is_playable = true), x.is_restricted, x.is_playable, x.metadata_review
    from jsonb_to_recordset(((${JSON.stringify(payload)}::jsonb) #>> '{}')::jsonb) as x(
      provider_id text, provider_asset_ref text, kind text, title text, description text,
      category text, artwork_url text, year integer, rating numeric, quality text, language text,
      is_restricted boolean, is_playable boolean, metadata_review text
    )
    on conflict (tenant_id, provider_id, provider_asset_ref) do update set
      kind = excluded.kind, title = excluded.title, description = excluded.description,
      category = excluded.category, artwork_url = excluded.artwork_url, year = excluded.year,
      rating = excluded.rating, quality = excluded.quality, language = excluded.language,
      is_active = excluded.is_active, is_restricted = excluded.is_restricted,
      is_playable = excluded.is_playable, metadata_review = excluded.metadata_review,
      consecutive_failures=0, last_failure_at=null, last_imported_at=now(), updated_at = now()
    returning id
  `;
  return rows.length;
}

export async function importProviderSeries(providerId: string, series: ProviderCatalogItem, episodes: ProviderSeriesEpisode[], active: boolean) {
  if (!episodes.length) throw new Error("اختر حلقة واحدة على الأقل قبل استيراد المسلسل");
  const query = sql();
  const prepared = prepareCatalogItem(series);
  const publishParent = active && !prepared.restricted && prepared.playable;
  const parents = await query`
    insert into wiva_cloud_assets (tenant_id,provider_id,provider_asset_ref,kind,title,description,category,artwork_url,year,rating,quality,language,is_active,is_restricted,is_playable,metadata_review)
    values (${tenantId()},${providerId},${prepared.ref},'series',${prepared.title},${prepared.description},${prepared.category},${prepared.artworkUrl || null},${prepared.year},${prepared.rating},${prepared.quality},${prepared.language},${publishParent},${prepared.restricted},${prepared.playable},${prepared.restricted || !prepared.playable ? "needs_review" : "approved"})
    on conflict (tenant_id,provider_id,provider_asset_ref) do update set title=excluded.title,description=excluded.description,category=excluded.category,artwork_url=excluded.artwork_url,year=excluded.year,rating=excluded.rating,is_active=(wiva_cloud_assets.is_active or excluded.is_active),is_restricted=excluded.is_restricted,is_playable=excluded.is_playable,metadata_review=excluded.metadata_review,consecutive_failures=0,last_failure_at=null,last_imported_at=now(),updated_at=now()
    returning id
  `;
  const parentId = String(parents[0].id);
  const payload = episodes.map((episode) => {
    const restricted = prepared.restricted || isRestrictedMetadata(episode.title, episode.description, prepared.category);
    return { ref: episode.ref, title: normalizeProviderTitle(episode.title), description: episode.description, artwork_url: episode.artworkUrl || prepared.artworkUrl || null, season: episode.seasonNumber, episode: episode.episodeNumber, restricted, active: active && !restricted && prepared.playable };
  });
  const rows = await query`
    insert into wiva_cloud_assets (tenant_id,provider_id,provider_asset_ref,parent_asset_id,season_number,episode_number,kind,title,description,category,artwork_url,quality,is_active,is_restricted,is_playable,metadata_review)
    select ${tenantId()},${providerId},x.ref,${parentId}::uuid,x.season,x.episode,'series',x.title,x.description,${prepared.title},x.artwork_url,'HD',x.active,x.restricted,true,case when x.restricted then 'needs_review' else 'approved' end
    from jsonb_to_recordset(((${JSON.stringify(payload)}::jsonb) #>> '{}')::jsonb) as x(ref text,title text,description text,artwork_url text,season integer,episode integer,restricted boolean,active boolean)
    on conflict (tenant_id,provider_id,provider_asset_ref) do update set parent_asset_id=excluded.parent_asset_id,season_number=excluded.season_number,episode_number=excluded.episode_number,title=excluded.title,description=excluded.description,artwork_url=excluded.artwork_url,is_active=(wiva_cloud_assets.is_active or excluded.is_active),is_restricted=excluded.is_restricted,is_playable=excluded.is_playable,metadata_review=excluded.metadata_review,consecutive_failures=0,last_failure_at=null,last_imported_at=now(),updated_at=now()
    returning id
  `;
  return { parentId, imported: rows.length };
}

export async function setAssetActive(id: string, active: boolean) {
  const query = sql();
  const rows = await query`
    update wiva_cloud_assets set is_active = ${active}
    where tenant_id = ${tenantId()} and id = ${id}
    returning id
  `;
  return Boolean(rows[0]);
}

export async function setAssetSafety(id: string, input: { restricted?: boolean; playable?: boolean }) {
  const query = sql();
  const rows = await query`
    update wiva_cloud_assets set
      is_restricted = coalesce(${input.restricted ?? null}, is_restricted),
      is_playable = coalesce(${input.playable ?? null}, is_playable),
      metadata_review = 'approved'
    where tenant_id = ${tenantId()} and id = ${id}
    returning id
  `;
  return Boolean(rows[0]);
}

export async function deleteAsset(id: string) {
  const query = sql();
  const rows = await query`
    delete from wiva_cloud_assets
    where tenant_id = ${tenantId()} and id = ${id}
    returning id, title, kind, provider_id
  `;
  return (rows[0] as Record<string, unknown> | undefined) || null;
}

export async function deleteAssets(ids: string[]) {
  if (!ids.length) return 0;
  const query = sql();
  const rows = await query`
    delete from wiva_cloud_assets
    where tenant_id=${tenantId()}
      and id::text in (select value from jsonb_array_elements_text(((${JSON.stringify(ids)}::jsonb) #>> '{}')::jsonb))
    returning id
  `;
  return rows.length;
}

export async function setAssetsActive(ids: string[], active: boolean) {
  if (!ids.length) return 0;
  const query = sql();
  const rows = await query`
    update wiva_cloud_assets set is_active = ${active}
    where tenant_id = ${tenantId()}
      and id::text in (select value from jsonb_array_elements_text(((${JSON.stringify(ids)}::jsonb) #>> '{}')::jsonb))
    returning id
  `;
  return rows.length;
}

export async function findViewerByEmail(email: string) {
  const query = sql();
  const rows = await query`
    select id, name, email, password_hash, status, max_concurrent_streams, expires_at
    from wiva_cloud_viewers where tenant_id = ${tenantId()} and lower(email) = lower(${email}) limit 1
  `;
  return (rows[0] as Record<string, unknown> | undefined) || null;
}

export async function listViewers(): Promise<ViewerSummary[]> {
  if (!databaseConfigured()) return [];
  const query = sql();
  const rows = await query`
    select id, name, email, status, max_concurrent_streams, expires_at, last_login_at, created_at
    from wiva_cloud_viewers where tenant_id = ${tenantId()} order by created_at desc
  `;
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    status: row.status as ViewerIdentity["status"],
    maxConcurrentStreams: Number(row.max_concurrent_streams),
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    lastLoginAt: row.last_login_at ? new Date(String(row.last_login_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

export async function createViewer(input: { name: string; email: string; passwordHash: string; maxConcurrentStreams: number; expiresAt: string | null }) {
  const query = sql();
  const rows = await query`
    insert into wiva_cloud_viewers
      (tenant_id, name, email, password_hash, status, max_concurrent_streams, expires_at)
    values
      (${tenantId()}, ${input.name}, ${input.email}, ${input.passwordHash}, 'active', ${input.maxConcurrentStreams}, ${input.expiresAt})
    returning id
  `;
  return String(rows[0].id);
}

export async function setViewerStatus(id: string, status: ViewerIdentity["status"]) {
  const query = sql();
  const rows = await query`
    update wiva_cloud_viewers set status = ${status}
    where tenant_id = ${tenantId()} and id = ${id}
    returning id
  `;
  if (status !== "active") {
    await query`delete from wiva_cloud_viewer_sessions where tenant_id = ${tenantId()} and viewer_id = ${id}`;
  }
  return Boolean(rows[0]);
}

export async function createViewerSession(viewerId: string, tokenHash: string, userAgent: string, ipHash: string) {
  const query = sql();
  await query`
    insert into wiva_cloud_viewer_sessions
      (tenant_id, viewer_id, token_hash, user_agent, ip_hash, expires_at)
    values
      (${tenantId()}, ${viewerId}, ${tokenHash}, ${userAgent}, ${ipHash}, now() + interval '30 days')
  `;
  await query`update wiva_cloud_viewers set last_login_at = now() where tenant_id = ${tenantId()} and id = ${viewerId}`;
}

export async function acquirePlaybackLease(viewerId: string, sessionHash: string, assetId: string) {
  const query = sql();
  const rows = await query`
    with locked as (
      select pg_advisory_xact_lock(hashtextextended(${viewerId}, 0))
    ), pruned as (
      delete from wiva_cloud_playback_leases
      where tenant_id=${tenantId()} and expires_at <= now()
      returning lease_id
    ), viewer_limit as (
      select max_concurrent_streams from wiva_cloud_viewers, locked
      where tenant_id=${tenantId()} and id=${viewerId} and status='active'
    ), active_count as (
      select count(*)::int as total from wiva_cloud_playback_leases, locked
      where tenant_id=${tenantId()} and viewer_id=${viewerId}
        and session_hash <> ${sessionHash} and expires_at > now()
    ), leased as (
      insert into wiva_cloud_playback_leases
        (tenant_id, viewer_id, session_hash, asset_id, expires_at, last_seen_at)
      select ${tenantId()}, ${viewerId}, ${sessionHash}, ${assetId}, now() + interval '90 seconds', now()
      from viewer_limit, active_count
      where active_count.total < viewer_limit.max_concurrent_streams
      on conflict (tenant_id, viewer_id, session_hash) do update set
        asset_id=excluded.asset_id, expires_at=excluded.expires_at, last_seen_at=now()
      returning lease_id
    )
    select lease_id from leased
  `;
  return rows[0] ? String(rows[0].lease_id) : null;
}

export async function touchPlaybackLease(viewerId: string, sessionHash: string, leaseId: string) {
  const query = sql();
  const rows = await query`
    update wiva_cloud_playback_leases set expires_at=now() + interval '90 seconds', last_seen_at=now()
    where tenant_id=${tenantId()} and viewer_id=${viewerId} and session_hash=${sessionHash}
      and lease_id=${leaseId} and expires_at > now() - interval '30 seconds'
    returning lease_id
  `;
  return Boolean(rows[0]);
}

export async function releasePlaybackLease(viewerId: string, sessionHash: string, leaseId: string) {
  const query = sql();
  const rows = await query`
    delete from wiva_cloud_playback_leases
    where tenant_id=${tenantId()} and viewer_id=${viewerId} and session_hash=${sessionHash} and lease_id=${leaseId}
    returning lease_id
  `;
  return Boolean(rows[0]);
}

export async function viewerBySessionHash(tokenHash: string): Promise<ViewerIdentity | null> {
  if (!databaseConfigured()) return null;
  const query = sql();
  const rows = await query`
    select v.id, v.name, v.email, v.status, v.max_concurrent_streams, v.expires_at
    from wiva_cloud_viewer_sessions s
    join wiva_cloud_viewers v on v.id = s.viewer_id and v.tenant_id = s.tenant_id
    where s.tenant_id = ${tenantId()} and s.token_hash = ${tokenHash} and s.expires_at > now()
    limit 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  if (row.status !== "active") return null;
  if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) return null;
  await query`
    update wiva_cloud_viewer_sessions set last_seen_at=now()
    where tenant_id=${tenantId()} and token_hash=${tokenHash} and last_seen_at < now() - interval '5 minutes'
  `;
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    status: row.status as ViewerIdentity["status"],
    maxConcurrentStreams: Number(row.max_concurrent_streams),
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
  };
}

export async function viewerAccountBySessionHash(tokenHash: string): Promise<ViewerIdentity | null> {
  if (!databaseConfigured()) return null;
  const query = sql();
  const rows = await query`
    select v.id, v.name, v.email, v.status, v.max_concurrent_streams, v.expires_at
    from wiva_cloud_viewer_sessions s
    join wiva_cloud_viewers v on v.id = s.viewer_id and v.tenant_id = s.tenant_id
    where s.tenant_id = ${tenantId()} and s.token_hash = ${tokenHash} and s.expires_at > now()
    limit 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row || row.status === "blocked") return null;
  await query`
    update wiva_cloud_viewer_sessions set last_seen_at=now()
    where tenant_id=${tenantId()} and token_hash=${tokenHash} and last_seen_at < now() - interval '5 minutes'
  `;
  return {
    id: String(row.id), name: String(row.name), email: String(row.email),
    status: row.status as ViewerIdentity["status"],
    maxConcurrentStreams: Number(row.max_concurrent_streams),
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
  };
}

export async function deleteViewerSession(tokenHash: string) {
  if (!databaseConfigured()) return;
  const query = sql();
  await query`delete from wiva_cloud_viewer_sessions where tenant_id = ${tenantId()} and token_hash = ${tokenHash}`;
}

function deviceName(userAgent: string) {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "جهاز Apple";
  if (/android/i.test(userAgent)) return "جهاز Android";
  if (/windows/i.test(userAgent)) return "كمبيوتر Windows";
  if (/macintosh|mac os x/i.test(userAgent)) return "جهاز Mac";
  if (/smart-tv|smarttv|tizen|webos|hbbtv/i.test(userAgent)) return "تلفاز ذكي";
  return "متصفح ويب";
}

export async function listViewerSessions(viewerId: string, currentTokenHash: string): Promise<ViewerSessionSummary[]> {
  const query = sql();
  const rows = await query`
    select id, token_hash, user_agent, last_seen_at, created_at
    from wiva_cloud_viewer_sessions
    where tenant_id=${tenantId()} and viewer_id=${viewerId} and expires_at > now()
    order by last_seen_at desc limit 20
  `;
  return rows.map((row) => ({
    id: String(row.id), device: deviceName(String(row.user_agent || "")),
    lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    current: String(row.token_hash) === currentTokenHash,
  }));
}

export async function deleteViewerSessionById(viewerId: string, sessionId: string) {
  const query = sql();
  const rows = await query`delete from wiva_cloud_viewer_sessions where tenant_id=${tenantId()} and viewer_id=${viewerId} and id=${sessionId} returning id`;
  return Boolean(rows[0]);
}

export async function deleteOtherViewerSessions(viewerId: string, currentTokenHash: string) {
  const query = sql();
  const rows = await query`delete from wiva_cloud_viewer_sessions where tenant_id=${tenantId()} and viewer_id=${viewerId} and token_hash <> ${currentTokenHash} returning id`;
  return rows.length;
}

export async function updateViewerPassword(viewerId: string, passwordHash: string, currentTokenHash: string) {
  const query = sql();
  const rows = await query`update wiva_cloud_viewers set password_hash=${passwordHash} where tenant_id=${tenantId()} and id=${viewerId} returning id`;
  if (!rows[0]) return false;
  await query`delete from wiva_cloud_viewer_sessions where tenant_id=${tenantId()} and viewer_id=${viewerId} and token_hash <> ${currentTokenHash}`;
  return true;
}

export async function getViewerActivity(viewerId: string, assetId: string): Promise<ViewerActivity> {
  const query = sql();
  const [favoriteRows, progressRows] = await Promise.all([
    query`select 1 from wiva_cloud_viewer_favorites where tenant_id=${tenantId()} and viewer_id=${viewerId} and asset_id=${assetId} limit 1`,
    query`select position_seconds, duration_seconds, completed from wiva_cloud_viewer_progress where tenant_id=${tenantId()} and viewer_id=${viewerId} and asset_id=${assetId} limit 1`,
  ]);
  const progress = progressRows[0];
  return { favorite: Boolean(favoriteRows[0]), positionSeconds: Number(progress?.position_seconds || 0), durationSeconds: Number(progress?.duration_seconds || 0), completed: Boolean(progress?.completed) };
}

export async function setViewerFavorite(viewerId: string, assetId: string, favorite: boolean) {
  const query = sql();
  if (favorite) {
    await query`insert into wiva_cloud_viewer_favorites (tenant_id,viewer_id,asset_id) values (${tenantId()},${viewerId},${assetId}) on conflict do nothing`;
  } else {
    await query`delete from wiva_cloud_viewer_favorites where tenant_id=${tenantId()} and viewer_id=${viewerId} and asset_id=${assetId}`;
  }
}

export async function saveViewerProgress(viewerId: string, assetId: string, positionSeconds: number, durationSeconds: number, completed: boolean) {
  const query = sql();
  await query`
    insert into wiva_cloud_viewer_progress (tenant_id,viewer_id,asset_id,position_seconds,duration_seconds,completed)
    values (${tenantId()},${viewerId},${assetId},${positionSeconds},${durationSeconds},${completed})
    on conflict (tenant_id,viewer_id,asset_id) do update set
      position_seconds=excluded.position_seconds,duration_seconds=excluded.duration_seconds,
      completed=excluded.completed,updated_at=now()
  `;
}

export async function listViewerFavorites(viewerId: string, limit = 10) {
  if (!databaseConfigured()) return [];
  const query = sql(); const safeLimit = Math.min(30, Math.max(1, limit));
  const rows = await query`
    select a.* from wiva_cloud_viewer_favorites f
    join wiva_cloud_assets a on a.id=f.asset_id and a.tenant_id=f.tenant_id
    join wiva_cloud_providers p on p.id=a.provider_id and p.tenant_id=a.tenant_id
    where f.tenant_id=${tenantId()} and f.viewer_id=${viewerId} and a.is_active=true
      and a.is_restricted=false and a.is_playable=true and p.status='active' and p.redistribution_attested=true
    order by f.created_at desc limit ${safeLimit}
  `;
  return rows.map((row) => assetFromRow(row as Record<string, unknown>));
}

export async function listContinueWatching(viewerId: string, limit = 10) {
  if (!databaseConfigured()) return [];
  const query = sql(); const safeLimit = Math.min(30, Math.max(1, limit));
  const rows = await query`
    select a.* from wiva_cloud_viewer_progress h
    join wiva_cloud_assets a on a.id=h.asset_id and a.tenant_id=h.tenant_id
    join wiva_cloud_providers p on p.id=a.provider_id and p.tenant_id=a.tenant_id
    where h.tenant_id=${tenantId()} and h.viewer_id=${viewerId} and h.completed=false and h.position_seconds > 5
      and a.kind <> 'live' and a.is_active=true and a.is_restricted=false and a.is_playable=true
      and p.status='active' and p.redistribution_attested=true
    order by h.updated_at desc limit ${safeLimit}
  `;
  return rows.map((row) => assetFromRow(row as Record<string, unknown>));
}

export async function audit(action: string, targetType: string, targetId: string | null, metadata: Record<string, unknown> = {}) {
  return auditEvent("admin", "environment-admin", action, targetType, targetId, metadata);
}

export async function auditEvent(actorType: string, actorId: string, action: string, targetType: string, targetId: string | null, metadata: Record<string, unknown> = {}) {
  if (!databaseConfigured()) return;
  const query = sql();
  await query`
    insert into wiva_cloud_audit_log (tenant_id, actor_type, actor_id, action, target_type, target_id, metadata)
    values (${tenantId()}, ${actorType}, ${actorId}, ${action}, ${targetType}, ${targetId}, ${JSON.stringify(metadata)}::jsonb)
  `;
}

export async function consumeRateLimit(scope: string, keyHash: string, windowMs: number) {
  const query = sql();
  const expiresAt = new Date(Date.now() + windowMs).toISOString();
  const rows = await query`
    insert into wiva_cloud_rate_limits (tenant_id, scope, key_hash, count, expires_at)
    values (${tenantId()}, ${scope}, ${keyHash}, 1, ${expiresAt})
    on conflict (tenant_id, scope, key_hash) do update set
      count=case when wiva_cloud_rate_limits.expires_at <= now() then 1 else wiva_cloud_rate_limits.count + 1 end,
      expires_at=case when wiva_cloud_rate_limits.expires_at <= now() then excluded.expires_at else wiva_cloud_rate_limits.expires_at end
    returning count
  `;
  return Number(rows[0]?.count || 1);
}

function paymentFromRow(row: Record<string, unknown>): PaymentRequestSummary {
  return {
    id: String(row.id), viewerId: String(row.viewer_id), viewerName: String(row.viewer_name || ""),
    viewerEmail: String(row.viewer_email || ""), method: "bank_transfer",
    amount: row.amount == null ? null : Number(row.amount), currency: String(row.currency || "USD"),
    transferReference: String(row.transfer_reference || ""), note: String(row.note || ""),
    requestedDays: Number(row.requested_days), status: row.status as PaymentRequestSummary["status"],
    createdAt: new Date(String(row.created_at)).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)).toISOString() : null,
  };
}

export async function listPaymentRequests(viewerId?: string): Promise<PaymentRequestSummary[]> {
  if (!databaseConfigured()) return [];
  const query = sql();
  const rows = viewerId
    ? await query`
        select r.*, v.name viewer_name, v.email viewer_email
        from wiva_cloud_payment_requests r join wiva_cloud_viewers v on v.id=r.viewer_id
        where r.tenant_id=${tenantId()} and r.viewer_id=${viewerId}
        order by r.created_at desc limit 20
      `
    : await query`
        select r.*, v.name viewer_name, v.email viewer_email
        from wiva_cloud_payment_requests r join wiva_cloud_viewers v on v.id=r.viewer_id
        where r.tenant_id=${tenantId()}
        order by (r.status='pending') desc, r.created_at desc limit 200
      `;
  return (rows as Record<string, unknown>[]).map(paymentFromRow);
}

export async function createPaymentRequest(input: { viewerId: string; amount: number | null; currency: string; transferReference: string; note: string; requestedDays: number }) {
  const query = sql();
  const rows = await query`
    insert into wiva_cloud_payment_requests
      (tenant_id, viewer_id, amount, currency, transfer_reference, note, requested_days)
    select ${tenantId()}, ${input.viewerId}, ${input.amount}, ${input.currency}, ${input.transferReference}, ${input.note}, ${input.requestedDays}
    where not exists (
      select 1 from wiva_cloud_payment_requests
      where tenant_id=${tenantId()} and viewer_id=${input.viewerId} and status='pending'
    )
    returning id
  `;
  return rows[0] ? String(rows[0].id) : null;
}

export async function reviewPaymentRequest(id: string, status: "approved" | "rejected") {
  const query = sql();
  if (status === "rejected") {
    const rows = await query`
      update wiva_cloud_payment_requests set status='rejected', reviewed_at=now()
      where tenant_id=${tenantId()} and id=${id} and status='pending' returning id
    `;
    return Boolean(rows[0]);
  }
  const rows = await query`
    with reviewed as (
      update wiva_cloud_payment_requests set status='approved', reviewed_at=now()
      where tenant_id=${tenantId()} and id=${id} and status='pending'
      returning viewer_id, requested_days
    ), activated as (
      update wiva_cloud_viewers v set status='active',
        expires_at=greatest(coalesce(v.expires_at, now()), now()) + make_interval(days => r.requested_days)
      from reviewed r where v.tenant_id=${tenantId()} and v.id=r.viewer_id returning v.id
    )
    select exists(select 1 from activated) accepted
  `;
  return Boolean(rows[0]?.accepted);
}

export async function dashboardCounts() {
  if (!databaseConfigured()) {
    const assets = isDemoMode() ? demoAssets : [];
    return { assets: assets.length, live: assets.filter((x) => x.kind === "live").length, providers: 0, activeProviders: 0, viewers: 0, pendingPayments: 0, needsReview: 0, hiddenAssets: 0 };
  }
  const query = sql();
  const tenant = tenantId();
  const [assetRows, providerRows, viewerRows, paymentRows] = await Promise.all([
    query`select count(*)::int as total, count(*) filter (where kind='live')::int as live, count(*) filter (where is_active=false)::int as hidden, count(*) filter (where metadata_review='needs_review')::int as review from wiva_cloud_assets where tenant_id=${tenant}`,
    query`select count(*)::int as total, count(*) filter (where status='active')::int as active from wiva_cloud_providers where tenant_id=${tenant}`,
    query`select count(*)::int as total from wiva_cloud_viewers where tenant_id=${tenant}`,
    query`select count(*)::int as total from wiva_cloud_payment_requests where tenant_id=${tenant} and status='pending'`,
  ]);
  return {
    assets: Number(assetRows[0]?.total || 0),
    live: Number(assetRows[0]?.live || 0),
    providers: Number(providerRows[0]?.total || 0),
    activeProviders: Number(providerRows[0]?.active || 0),
    viewers: Number(viewerRows[0]?.total || 0),
    pendingPayments: Number(paymentRows[0]?.total || 0),
    needsReview: Number(assetRows[0]?.review || 0),
    hiddenAssets: Number(assetRows[0]?.hidden || 0),
  };
}

export async function databaseReady() {
  if (!databaseConfigured()) return false;
  try {
    const query = sql();
    const rows = await query`select exists(select 1 from wiva_cloud_tenants where id=${tenantId()}) as ready`;
    return Boolean(rows[0]?.ready);
  } catch { return false; }
}
