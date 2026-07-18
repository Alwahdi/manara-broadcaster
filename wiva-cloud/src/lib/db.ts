import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import { demoAssets } from "@/lib/demo";
import { databaseConfigured, isDemoMode, tenantId } from "@/lib/env";
import type { AssetKind, CatalogAsset, ProviderCatalogItem, ProviderSeriesEpisode, ProviderSummary, ViewerIdentity, ViewerSummary } from "@/lib/types";

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
    providerId: row.provider_id == null ? null : String(row.provider_id),
    providerAssetRef: String(row.provider_asset_ref || ""),
    parentAssetId: row.parent_asset_id == null ? null : String(row.parent_asset_id),
    seasonNumber: row.season_number == null ? null : Number(row.season_number),
    episodeNumber: row.episode_number == null ? null : Number(row.episode_number),
  };
}

export async function listAssets(kind?: AssetKind, includeDisabled = false) {
  if (!databaseConfigured()) return isDemoMode() ? demoAssets.filter((item) => !kind || item.kind === kind) : [];
  const query = sql();
  const tenant = tenantId();
  const rows = kind
    ? await query`select * from wiva_cloud_assets where tenant_id = ${tenant} and kind = ${kind} and (${kind !== "series"} or parent_asset_id is null) and (${includeDisabled} or is_active = true) order by sort_order, title`
    : await query`select * from wiva_cloud_assets where tenant_id = ${tenant} and (${includeDisabled} or is_active = true) order by is_featured desc, sort_order, title`;
  return (rows as Record<string, unknown>[]).map(assetFromRow);
}

export async function listSeriesEpisodes(parentId: string, includeDisabled = false) {
  const query = sql();
  const rows = await query`select * from wiva_cloud_assets where tenant_id=${tenantId()} and parent_asset_id=${parentId} and (${includeDisabled} or is_active=true) order by season_number, episode_number, title`;
  return (rows as Record<string, unknown>[]).map(assetFromRow);
}

export async function getAsset(id: string) {
  if (!databaseConfigured()) return isDemoMode() ? demoAssets.find((item) => item.id === id) || null : null;
  const query = sql();
  const rows = await query`select * from wiva_cloud_assets where tenant_id = ${tenantId()} and id = ${id} limit 1`;
  return rows[0] ? assetFromRow(rows[0] as Record<string, unknown>) : null;
}

export async function listProviders(): Promise<ProviderSummary[]> {
  if (!databaseConfigured()) return [];
  const query = sql();
  const rows = await query`
    select id, name, kind, status, priority, rights_reference, redistribution_attested, created_at
    from wiva_cloud_providers where tenant_id = ${tenantId()} order by priority, name
  `;
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as ProviderSummary["kind"],
    status: row.status as ProviderSummary["status"],
    priority: Number(row.priority),
    rightsReference: String(row.rights_reference),
    redistributionAttested: Boolean(row.redistribution_attested),
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

export async function getProviderSecret(id: string) {
  const query = sql();
  const rows = await query`
    select id, name, kind, status, rights_reference, redistribution_attested, credentials_cipher
    from wiva_cloud_providers where tenant_id = ${tenantId()} and id = ${id} limit 1
  `;
  return rows[0] || null;
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
  const payload = items.map((item) => ({
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
  }));
  const rows = await query`
    insert into wiva_cloud_assets
      (tenant_id, provider_id, provider_asset_ref, kind, title, description, category, artwork_url, year, rating, quality, language, is_active)
    select ${tenantId()}, x.provider_id::uuid, x.provider_asset_ref, x.kind, x.title, x.description,
      x.category, x.artwork_url, x.year, x.rating, x.quality, x.language, ${active}
    from jsonb_to_recordset(((${JSON.stringify(payload)}::jsonb) #>> '{}')::jsonb) as x(
      provider_id text, provider_asset_ref text, kind text, title text, description text,
      category text, artwork_url text, year integer, rating numeric, quality text, language text
    )
    on conflict (tenant_id, provider_id, provider_asset_ref) do update set
      kind = excluded.kind, title = excluded.title, description = excluded.description,
      category = excluded.category, artwork_url = excluded.artwork_url, year = excluded.year,
      rating = excluded.rating, quality = excluded.quality, language = excluded.language,
      is_active = excluded.is_active, updated_at = now()
    returning id
  `;
  return rows.length;
}

export async function importProviderSeries(providerId: string, series: ProviderCatalogItem, episodes: ProviderSeriesEpisode[], active: boolean) {
  const query = sql();
  const parents = await query`
    insert into wiva_cloud_assets (tenant_id,provider_id,provider_asset_ref,kind,title,description,category,artwork_url,year,rating,quality,language,is_active)
    values (${tenantId()},${providerId},${series.ref},'series',${series.title},${series.description},${series.category},${series.artworkUrl || null},${series.year},${series.rating},${series.quality},${series.language},${active})
    on conflict (tenant_id,provider_id,provider_asset_ref) do update set title=excluded.title,description=excluded.description,category=excluded.category,artwork_url=excluded.artwork_url,year=excluded.year,rating=excluded.rating,is_active=excluded.is_active,updated_at=now()
    returning id
  `;
  const parentId = String(parents[0].id);
  const payload = episodes.map((episode) => ({ ref: episode.ref, title: episode.title, description: episode.description, artwork_url: episode.artworkUrl || series.artworkUrl || null, season: episode.seasonNumber, episode: episode.episodeNumber }));
  const rows = await query`
    insert into wiva_cloud_assets (tenant_id,provider_id,provider_asset_ref,parent_asset_id,season_number,episode_number,kind,title,description,category,artwork_url,quality,is_active)
    select ${tenantId()},${providerId},x.ref,${parentId}::uuid,x.season,x.episode,'series',x.title,x.description,${series.title},x.artwork_url,'HD',${active}
    from jsonb_to_recordset(((${JSON.stringify(payload)}::jsonb) #>> '{}')::jsonb) as x(ref text,title text,description text,artwork_url text,season integer,episode integer)
    on conflict (tenant_id,provider_id,provider_asset_ref) do update set parent_asset_id=excluded.parent_asset_id,season_number=excluded.season_number,episode_number=excluded.episode_number,title=excluded.title,description=excluded.description,artwork_url=excluded.artwork_url,is_active=excluded.is_active,updated_at=now()
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
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    status: row.status as ViewerIdentity["status"],
    maxConcurrentStreams: Number(row.max_concurrent_streams),
  };
}

export async function deleteViewerSession(tokenHash: string) {
  if (!databaseConfigured()) return;
  const query = sql();
  await query`delete from wiva_cloud_viewer_sessions where tenant_id = ${tenantId()} and token_hash = ${tokenHash}`;
}

export async function audit(action: string, targetType: string, targetId: string | null, metadata: Record<string, unknown> = {}) {
  if (!databaseConfigured()) return;
  const query = sql();
  await query`
    insert into wiva_cloud_audit_log (tenant_id, actor_type, actor_id, action, target_type, target_id, metadata)
    values (${tenantId()}, 'admin', 'environment-admin', ${action}, ${targetType}, ${targetId}, ${JSON.stringify(metadata)}::jsonb)
  `;
}

export async function dashboardCounts() {
  if (!databaseConfigured()) {
    const assets = isDemoMode() ? demoAssets : [];
    return { assets: assets.length, live: assets.filter((x) => x.kind === "live").length, providers: 0, viewers: 0 };
  }
  const query = sql();
  const tenant = tenantId();
  const [assetRows, providerRows, viewerRows] = await Promise.all([
    query`select count(*)::int as total, count(*) filter (where kind='live')::int as live from wiva_cloud_assets where tenant_id=${tenant}`,
    query`select count(*)::int as total from wiva_cloud_providers where tenant_id=${tenant}`,
    query`select count(*)::int as total from wiva_cloud_viewers where tenant_id=${tenant}`,
  ]);
  return {
    assets: Number(assetRows[0]?.total || 0),
    live: Number(assetRows[0]?.live || 0),
    providers: Number(providerRows[0]?.total || 0),
    viewers: Number(viewerRows[0]?.total || 0),
  };
}
