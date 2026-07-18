import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
const tenantId = process.env.WIVA_TENANT_ID?.trim() || "00000000-0000-0000-0000-000000000001";
const confirmation = process.env.WIVA_PURGE_CONFIRM?.trim();

if (!databaseUrl) {
  console.error("Content purge stopped: DATABASE_URL is not configured.");
  process.exit(1);
}

if (confirmation !== "DELETE-ALL-CONTENT") {
  console.error("Content purge stopped: set WIVA_PURGE_CONFIRM=DELETE-ALL-CONTENT explicitly.");
  process.exit(1);
}

const hostname = new URL(databaseUrl).hostname;
const local = hostname === "127.0.0.1" || hostname === "localhost";
const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: local ? false : "require",
  connect_timeout: 12,
});

function number(row, key) {
  return Number(row?.[key] || 0);
}

async function counts(query) {
  const [providers, assets, schedule, favorites, progress, catalogCache] = await Promise.all([
    query`select count(*)::int as total from wiva_cloud_providers where tenant_id=${tenantId}`,
    query`select count(*)::int as total from wiva_cloud_assets where tenant_id=${tenantId}`,
    query`select count(*)::int as total from wiva_cloud_match_schedule where tenant_id=${tenantId}`,
    query`select count(*)::int as total from wiva_cloud_viewer_favorites where tenant_id=${tenantId}`,
    query`select count(*)::int as total from wiva_cloud_viewer_progress where tenant_id=${tenantId}`,
    query`select count(*)::int as total from wiva_cloud_provider_catalog_cache where tenant_id=${tenantId}`,
  ]);
  return {
    providers: number(providers[0], "total"),
    assets: number(assets[0], "total"),
    matchSchedule: number(schedule[0], "total"),
    favorites: number(favorites[0], "total"),
    progress: number(progress[0], "total"),
    providerCatalogCache: number(catalogCache[0], "total"),
  };
}

try {
  const before = await counts(sql);
  const deleted = await sql.begin(async (tx) => {
    const scheduleRows = await tx`
      delete from wiva_cloud_match_schedule where tenant_id=${tenantId} returning id
    `;
    const catalogCacheRows = await tx`
      delete from wiva_cloud_provider_catalog_cache where tenant_id=${tenantId} returning provider_id
    `;
    const assetRows = await tx`
      delete from wiva_cloud_assets where tenant_id=${tenantId} returning id
    `;
    await tx`
      insert into wiva_cloud_audit_log
        (tenant_id, actor_type, actor_id, action, target_type, target_id, metadata)
      values
        (${tenantId}, 'admin', 'maintenance-cli', 'catalog.purge', 'catalog', null,
         ${JSON.stringify({ assets: assetRows.length, matchSchedule: scheduleRows.length, providerCatalogCache: catalogCacheRows.length })}::jsonb)
    `;
    return { assets: assetRows.length, matchSchedule: scheduleRows.length, providerCatalogCache: catalogCacheRows.length };
  });
  const after = await counts(sql);
  if (after.assets !== 0 || after.matchSchedule !== 0 || after.providers !== before.providers) {
    throw new Error("Post-purge verification failed.");
  }
  console.log(JSON.stringify({ ok: true, tenantId, before, deleted, after }, null, 2));
} catch (error) {
  console.error("Content purge failed:", error instanceof Error ? error.message : "unknown database error");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
