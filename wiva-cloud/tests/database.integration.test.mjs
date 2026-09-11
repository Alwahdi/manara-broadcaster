import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import test from "node:test";
import postgres from "postgres";

const url = process.env.WIVA_TEST_DATABASE_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("Integration tests require an isolated local PostgreSQL database");
}

test("real PostgreSQL cloud workflows", { skip: !url }, async (t) => {
  register("./typescript-loader.mjs", import.meta.url);
  process.env.DATABASE_URL = url;
  const db = await import("../src/lib/db.ts");
  const sql = postgres(url, { max: 8 });
  const tenants = [randomUUID(), randomUUID()];
  const originalTenant = process.env.WIVA_TENANT_ID;
  t.after(async () => {
    await sql`delete from wiva_cloud_tenants where id in ${sql(tenants)}`;
    await sql.end();
    await globalThis.wivaLocalSql?.end();
    if (originalTenant === undefined) delete process.env.WIVA_TENANT_ID;
    else process.env.WIVA_TENANT_ID = originalTenant;
  });
  for (const id of tenants) await sql`insert into wiva_cloud_tenants (id,name,status) values (${id},'Integration fixture','active')`;
  process.env.WIVA_TENANT_ID = tenants[0];
  const providerId = await db.createProvider({ name: "Owned fixture", kind: "licensed_xtream", credentialsCipher: "fixture", rightsReference: "Owned test content", priority: 1 });
  await db.setProviderStatus(providerId, "active");
  const series = (ref, overrides = {}) => ({
    ref, kind: "series", title: `Test series ${ref}`, description: "", category: "Test",
    artworkUrl: "", year: 2025, rating: 7, quality: "HD", language: "EN", ...overrides,
  });
  const episode = (ref, overrides = {}) => ({
    ref, title: `Episode ${ref}`, description: "", artworkUrl: "",
    seasonNumber: 1, episodeNumber: 1, ...overrides,
  });

  await t.test("provider, asset and viewer CRUD stay in the selected tenant", async () => {
    const assetId = await db.createAsset({ providerId, providerAssetRef: "movie:crud", kind: "movie", title: "Owned movie", description: "", category: "", quality: "HD", language: "EN" });
    const viewerId = await db.createViewer({ name: "Fixture", email: "fixture@example.invalid", passwordHash: "not-a-real-password-hash", maxConcurrentStreams: 1, expiresAt: null });
    assert.equal(await db.setAssetActive(assetId, true), true);
    process.env.WIVA_TENANT_ID = tenants[1];
    assert.deepEqual(await db.listProviders(), []);
    assert.deepEqual(await db.listViewers(), []);
    assert.equal(await db.getProviderSecret(providerId), null);
    assert.equal(await db.setProviderStatus(providerId, "disabled"), false);
    assert.equal(await db.setAssetActive(assetId, false), false);
    assert.equal(await db.deleteAsset(assetId), null);
    assert.equal(await db.setViewerStatus(viewerId, "blocked"), false);
    process.env.WIVA_TENANT_ID = tenants[0];
    assert.equal((await db.listProviders())[0].status, "active");
    assert.equal((await db.findViewerByEmail("FIXTURE@example.invalid")).status, "active");
    assert.equal((await db.deleteAsset(assetId)).id, assetId);
    assert.equal(await db.deleteAsset(assetId), null);
  });

  await t.test("series reimport is idempotent", async () => {
    const first = await db.importProviderSeries(providerId, series("series:repeat"), [episode("episode:repeat")], true);
    const second = await db.importProviderSeries(providerId, series("series:repeat"), [episode("episode:repeat")], true);
    assert.equal(first.parentId, second.parentId);
    assert.equal(second.imported, 1);
    assert.equal((await db.listImportedSeriesEpisodeRefs(providerId, "series:repeat")).size, 1);
  });

  await t.test("failed episode import rolls back its parent", async () => {
    await assert.rejects(db.importProviderSeries(providerId, series("series:rollback"), [episode("episode:rollback", { seasonNumber: "invalid integer" })], true));
    const rows = await sql`select id from wiva_cloud_assets where tenant_id=${tenants[0]} and provider_asset_ref='series:rollback'`;
    assert.equal(rows.length, 0);
  });

  await t.test("duplicate episode refs do not abort an otherwise valid import", async () => {
    const result = await db.importProviderSeries(providerId, series("series:duplicate"), [episode("episode:duplicate"), episode("episode:duplicate")], true);
    assert.equal(result.imported, 1);
  });

  await t.test("sync lease has one owner, recovers after expiry, and rejects stale completion", async () => {
    const rule = await db.upsertProviderSyncRule({ providerId, seriesRef: "series:lease", seriesTitle: "Lease fixture", enabled: true, publishNew: false });
    const claims = await Promise.all(Array.from({ length: 8 }, () => db.claimProviderSyncRule(rule.id)));
    const tokens = claims.filter(Boolean);
    assert.equal(tokens.length, 1);
    process.env.WIVA_TENANT_ID = tenants[1];
    assert.equal(await db.claimProviderSyncRule(rule.id), null);
    process.env.WIVA_TENANT_ID = tenants[0];
    await sql`update wiva_cloud_provider_sync_rules set sync_locked_until=now()-interval '1 second' where id=${rule.id}`;
    const recovered = await db.claimProviderSyncRule(rule.id);
    assert.ok(recovered);
    assert.notEqual(recovered, tokens[0]);
    await db.finishProviderSyncRule(rule.id, { token: tokens[0], added: 99 });
    assert.equal((await db.getProviderSyncRule(providerId, "series:lease")).importedCount, 0);
    await db.finishProviderSyncRule(rule.id, { token: recovered, added: 1 });
    assert.equal((await db.getProviderSyncRule(providerId, "series:lease")).importedCount, 1);
    await sql`delete from wiva_cloud_provider_sync_rules where id=${rule.id}`;
  });

  await t.test("sync preserves deferred episodes after the 500-episode batch limit", async () => {
    const { syncProviderSeriesNow } = await import("../src/lib/provider-sync.ts");
    const ref = "series:batch";
    const rule = await db.upsertProviderSyncRule({ providerId, seriesRef: ref, seriesTitle: "Batch fixture", enabled: true, publishNew: true });
    globalThis.wivaSyncFixture = {
      catalog: [series(ref)], discoveries: 0,
      episodes: Array.from({ length: 501 }, (_, i) => episode(`episode:batch:${i}`, { episodeNumber: i + 1 })),
    };
    const first = await syncProviderSeriesNow(providerId);
    assert.equal(first.added, 500);
    assert.equal(first.failed, 0);
    assert.equal((await db.getProviderSyncRule(providerId, ref)).knownEpisodeRefs.length, 500);
    const second = await syncProviderSeriesNow(providerId);
    assert.equal(second.added, 1);
    assert.equal((await db.listImportedSeriesEpisodeRefs(providerId, ref)).size, 501);
    assert.equal((await db.getProviderSyncRule(providerId, ref)).importedCount, 501);
    await sql`delete from wiva_cloud_provider_sync_rules where id=${rule.id}`;
  });

  await t.test("overlapping manual syncs skip claimed work and failures release the lease", async () => {
    const { syncProviderSeriesNow } = await import("../src/lib/provider-sync.ts");
    const ref = "series:overlap";
    const rule = await db.upsertProviderSyncRule({ providerId, seriesRef: ref, seriesTitle: "Overlap fixture", enabled: true, publishNew: false, knownEpisodeRefs: ["previously-seen"] });
    let release;
    globalThis.wivaSyncFixture = {
      catalog: [series(ref)], episodes: [episode("episode:overlap")], discoveries: 0,
      wait: new Promise((resolve) => { release = resolve; }),
    };
    const first = syncProviderSeriesNow(providerId);
    for (let i = 0; i < 100 && !globalThis.wivaSyncFixture.discoveries; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    try {
      assert.equal(globalThis.wivaSyncFixture.discoveries, 1);
      const second = await syncProviderSeriesNow(providerId);
      assert.equal(second.checked, 0);
    } finally { release(); }
    assert.equal((await first).added, 1);
    globalThis.wivaSyncFixture.error = "Owned test provider unavailable";
    assert.equal((await syncProviderSeriesNow(providerId)).failed, 1);
    const failed = await db.getProviderSyncRule(providerId, ref);
    assert.equal(failed.importedCount, 1);
    assert.deepEqual(failed.knownEpisodeRefs.sort(), ["episode:overlap", "previously-seen"]);
    delete globalThis.wivaSyncFixture.error;
    assert.equal((await syncProviderSeriesNow(providerId)).failed, 0);
    await sql`delete from wiva_cloud_provider_sync_rules where id=${rule.id}`;
  });

  await t.test("one concurrent payment decision wins and extends expiry only once", async () => {
    const viewerId = await db.createViewer({ name: "Payment fixture", email: "payment@example.invalid", passwordHash: "fixture", maxConcurrentStreams: 1, expiresAt: "2035-01-01T00:00:00.000Z" });
    const id = await db.createPaymentRequest({ viewerId, amount: 10, currency: "USD", transferReference: "owned-test", note: "", requestedDays: 30 });
    const results = await Promise.all(Array.from({ length: 8 }, () => db.reviewPaymentRequest(id, "approved")));
    assert.equal(results.filter(Boolean).length, 1);
    const [viewer] = await sql`select expires_at from wiva_cloud_viewers where id=${viewerId}`;
    assert.equal(viewer.expires_at.toISOString(), "2035-01-31T00:00:00.000Z");
    process.env.WIVA_TENANT_ID = tenants[1];
    assert.deepEqual(await db.listPaymentRequests(), []);
    assert.equal(await db.reviewPaymentRequest(id, "rejected"), false);
    process.env.WIVA_TENANT_ID = tenants[0];
  });
});
