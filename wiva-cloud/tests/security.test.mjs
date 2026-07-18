import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (["node_modules", ".next"].includes(name)) return [];
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

test("cloud source does not contain supplied private provider accounts", () => {
  const source = files(root)
    .filter((file) => !file.endsWith("package-lock.json"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const forbiddenValues = [
    ["hydraa", ".st"].join(""),
    ["goldclub", ".tv"].join(""),
    ["591", "760275"].join(""),
    ["296", "9671186"].join(""),
    ["310", "841504"].join(""),
    ["187", "1565099"].join(""),
  ];
  for (const forbidden of forbiddenValues) {
    assert.equal(source.includes(forbidden), false, `must not commit private provider value: ${forbidden}`);
  }
});

test("provider route defaults to HTTPS and gates insecure HTTP behind explicit local opt-in", () => {
  const route = readFileSync(join(root, "src/app/api/admin/providers/route.ts"), "utf8");
  assert.match(route, /WIVA_ALLOW_INSECURE_PROVIDER_HTTP === "true"/);
  assert.match(route, /body\.allowInsecureHttp === "true"/);
  assert.match(route, /parsed\.protocol !== "https:" && !insecureHttp/);
  assert.match(route, /rightsReference\.length < 8/);
  assert.match(route, /body\.attested !== "true"/);
  assert.match(route, /encryptCredentials/);
});

test("playback grants are short-lived and signed", () => {
  const playback = readFileSync(join(root, "src/lib/playback.ts"), "utf8");
  assert.match(playback, /\+ 90/);
  assert.match(playback, /WIVA_PLAYBACK_SIGNING_SECRET/);
  assert.match(playback, /hmac\(`/);
  assert.doesNotMatch(playback, /username|password/i);
});

test("database stores encrypted provider credentials rather than plaintext fields", () => {
  const schema = readFileSync(join(root, "db/schema.sql"), "utf8");
  const providerBlock = schema.split("create table if not exists wiva_cloud_providers")[1].split(");")[0];
  assert.match(providerBlock, /credentials_cipher text not null/);
  assert.doesNotMatch(providerBlock, /username\s+text|password\s+text/);
});

test("password helper emits a scrypt hash and rejects short passwords", () => {
  const script = join(root, "scripts/hash-password.mjs");
  const output = execFileSync(process.execPath, [script, "a-very-long-admin-password"], { encoding: "utf8" }).trim();
  assert.match(output, /^scrypt:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.throws(() => execFileSync(process.execPath, [script, "short"], { stdio: "pipe" }));
});

test("catalog discovery keeps credentials server-side and blocks unsafe origins", () => {
  const catalog = readFileSync(join(root, "src/lib/provider-catalog.ts"), "utf8");
  const route = readFileSync(join(root, "src/app/api/admin/providers/[id]/catalog/route.ts"), "utf8");
  assert.match(catalog, /decryptCredentials/);
  assert.match(catalog, /url\.protocol === "https:"/);
  assert.match(catalog, /WIVA_ALLOW_INSECURE_PROVIDER_HTTP === "true"/);
  assert.match(catalog, /privateIp/);
  assert.match(catalog, /50_000/);
  assert.doesNotMatch(route, /credentials|password|username/);
  assert.match(route, /requireAdminRequest/);
  assert.match(route, /assertSameOrigin/);
});

test("bulk catalog import is bounded and revalidates discovered references", () => {
  const route = readFileSync(join(root, "src/app/api/admin/providers/[id]/catalog/route.ts"), "utf8");
  assert.match(route, /discovered\.length > 1000/);
  assert.match(route, /body\.refs\.length > 500/);
  assert.match(route, /selected\.length !== wanted\.size/);
  assert.match(route, /connection\.status !== "active"/);
});

test("large movie catalogs and series episodes have bounded dedicated flows", () => {
  const catalog = readFileSync(join(root, "src/lib/provider-catalog.ts"), "utf8");
  const route = readFileSync(join(root, "src/app/api/admin/providers/[id]/catalog/route.ts"), "utf8");
  const manager = readFileSync(join(root, "src/components/ProviderCatalogManager.tsx"), "utf8");
  const schema = readFileSync(join(root, "db/schema.sql"), "utf8");
  assert.match(catalog, /timeoutMs = 180_000/);
  assert.match(catalog, /discoverSeriesEpisodes/);
  assert.match(catalog, /xtream:episode:/);
  assert.match(route, /episodeRefs/);
  assert.match(route, /importProviderSeries/);
  assert.match(manager, /section === "series" && openSeries/);
  assert.match(manager, /section === "series" \? <small className="series-open-label"/);
  assert.match(manager, /loadSequence\.current \+= 1; setData\(null\)/);
  assert.match(schema, /parent_asset_id uuid references wiva_cloud_assets/);
  assert.match(schema, /episode_number integer/);
  assert.match(schema, /delivery_mode text not null default 'auto'/);
});

test("Xtream discovery resolves player_api.php from the server root", () => {
  const catalog = readFileSync(join(root, "src/lib/provider-catalog.ts"), "utf8");
  assert.match(catalog, /new URL\("\/player_api\.php", base\)/);
});

test("JSON array parameters are normalized for local Postgres and Neon", () => {
  const database = readFileSync(join(root, "src/lib/db.ts"), "utf8");
  assert.match(database, /jsonb_to_recordset\(\(\(\$\{JSON\.stringify\(payload\)\}::jsonb\) #>> '\{\}'\)::jsonb\)/);
  assert.match(database, /jsonb_array_elements_text\(\(\(\$\{JSON\.stringify\(ids\)\}::jsonb\) #>> '\{\}'\)::jsonb\)/);
});

test("local media gateway validates grants and hides upstream URLs behind tokens", () => {
  const gateway = readFileSync(join(root, "scripts/local-media-gateway.mjs"), "utf8");
  assert.match(gateway, /safeEqual\(signature, expected\)/);
  assert.match(gateway, /registerUri/);
  assert.match(gateway, /MAX_CACHE_BYTES/);
  assert.match(gateway, /existing\?\.promise/);
  assert.match(gateway, /redistribution_attested/);
  assert.match(gateway, /const HOST = process\.env\.WIVA_LOCAL_GATEWAY_HOST \|\| "0\.0\.0\.0"/);
  assert.match(gateway, /server\.listen\(PORT, HOST/);
  assert.match(gateway, /req\.headers\["x-forwarded-proto"\]/);
  assert.match(gateway, /req\.headers\["x-forwarded-host"\]/);
  assert.match(gateway, /forwardedProto === "https" \? "https" : "http"/);
  assert.doesNotMatch(gateway, /Access-Control-Allow-Origin': '\*'/);
});

test("disabled providers fail closed across catalog, playback, and active gateway sessions", () => {
  const database = readFileSync(join(root, "src/lib/db.ts"), "utf8");
  const gateway = readFileSync(join(root, "scripts/local-media-gateway.mjs"), "utf8");
  const providers = readFileSync(join(root, "src/components/ProviderManager.tsx"), "utf8");
  assert.match(database, /join wiva_cloud_providers p on p\.id = a\.provider_id and p\.tenant_id = a\.tenant_id/);
  assert.match(database, /p\.status\s*=\s*'active' and p\.redistribution_attested\s*=\s*true/);
  assert.match(database, /getAsset\(id: string, includeUnavailable = false\)/);
  assert.match(gateway, /AVAILABILITY_TTL_MS = 2_000/);
  assert.match(gateway, /async function assetIsAvailable/);
  assert.match(gateway, /revokeAssetRuntime\(assetId\)/);
  assert.match(gateway, /assetIsAvailable\(session\.channel\.assetId\)/);
  assert.match(providers, /اختفى كل محتواه من المشاهدين/);
});

test("admins can permanently delete one asset with cascade-aware confirmation and audit", () => {
  const database = readFileSync(join(root, "src/lib/db.ts"), "utf8");
  const route = readFileSync(join(root, "src/app/api/admin/assets/[id]/route.ts"), "utf8");
  const manager = readFileSync(join(root, "src/components/ChannelManager.tsx"), "utf8");
  assert.match(database, /export async function deleteAsset/);
  assert.match(database, /delete from wiva_cloud_assets/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /assertSameOrigin\(request\); requireAdminRequest\(request\)/);
  assert.match(route, /audit\("asset\.delete"/);
  assert.match(manager, /window\.confirm/);
  assert.match(manager, /method: "DELETE"/);
  assert.match(manager, /جميع مواسمه وحلقاته/);
});

test("local live gateway uses one bounded TS ingest shared by viewer sessions", () => {
  const gateway = readFileSync(join(root, "scripts/local-media-gateway.mjs"), "utf8");
  assert.match(gateway, /const liveIngests = new Map\(\)/);
  assert.match(gateway, /ensureLiveIngest\(session\.channel, ingestKey\)/);
  assert.match(gateway, /\.ts`, base\)/);
  assert.match(gateway, /"-hls_list_size", "24"/);
  assert.match(gateway, /"-hls_delete_threshold", "8"/);
  assert.match(gateway, /files\.filter\(\(name\) => \/\^seg-/);
  assert.match(gateway, /"-reconnect_streamed", "1"/);
  assert.match(gateway, /"-c:v", "libx264"/);
  assert.match(gateway, /"-c:a", "aac"/);
  assert.match(gateway, /get_vod_info/);
  assert.match(gateway, /mediaType = "movie"/);
  assert.match(gateway, /channel\.mediaType === "live" \? 15_000 : 60_000/);
  assert.match(gateway, /\.catch\(\(\) => \{\}\)/);
  assert.match(gateway, /LIVE_IDLE_MS = 45_000/);
  assert.match(gateway, /stopLiveIngest/);
  assert.match(gateway, /const hlsTime = vod \? "6" : "2"/);
  assert.match(gateway, /"-preset", "ultrafast"/);
  assert.match(gateway, /"-c:v", "h264_videotoolbox"/);
  assert.match(gateway, /"-level", "4\.0"/);
  assert.match(gateway, /"-b:v", "4200k", "-maxrate", "4800k"/);
  assert.match(gateway, /aresample=async=1000:first_pts=0/);
  assert.match(gateway, /const probeArgs = copyInput/);
});

test("movies and episodes use a seekable bounded shared range cache", () => {
  const gateway = readFileSync(join(root, "scripts/local-media-gateway.mjs"), "utf8");
  const grants = readFileSync(join(root, "src/lib/playback.ts"), "utf8");
  const playback = readFileSync(join(root, "src/app/api/playback/[id]/route.ts"), "utf8");
  const player = readFileSync(join(root, "src/components/PlayerClient.tsx"), "utf8");
  assert.match(grants, /asset\.kind === "live" \? "index\.m3u8" : "media"/);
  assert.match(gateway, /VOD_INITIAL_BYTES = 512 \* 1024/);
  assert.match(gateway, /VOD_CHUNK_BYTES = 2 \* 1024 \* 1024/);
  assert.match(gateway, /MAX_VOD_CACHE_BYTES = 128 \* 1024 \* 1024/);
  assert.match(gateway, /state\.queue\.catch\(\(\) => \{\}\)\.then/);
  assert.match(gateway, /state\.pending\.has\(index\)/);
  assert.match(gateway, /resolvedChannels\.set\(assetId/);
  assert.match(gateway, /offset <= 2/);
  assert.match(gateway, /"content-range": `bytes \$\{range\.start\}-\$\{range\.end\}\/\$\{state\.total\}`/);
  assert.match(gateway, /"accept-ranges": "bytes"/);
  assert.match(playback, /live: asset\.kind === "live"/);
  assert.match(player, /!live && duration > 0/);
  assert.match(player, /video\.currentTime = Math\.max/);
  assert.match(player, /player-live-badge/);
  assert.match(player, /ahead < tuning\.liveStartBuffer/);
  assert.match(player, /setInterval\(recoverLivePlayback, 450\)/);
  assert.doesNotMatch(player, /onWaiting[\s\S]{0,220}setState\("loading"\)/);
  assert.match(player, /Hls\.Events\.BUFFER_APPENDED/);
  assert.match(player, /maxLiveSyncPlaybackRate: 1\.04/);
  assert.match(gateway, /channel\.deliveryMode !== "transcode"/);
  assert.doesNotMatch(gateway, /split_by_time/);
  assert.match(player, /ahead >= tuning\.vodStartBuffer/);
  assert.match(player, /media\.preload = "auto"/);
  assert.match(gateway, /MAX_VOD_SPOOL_TOTAL_BYTES/);
  assert.match(gateway, /startVodSpool/);
  assert.match(gateway, /createWriteStream/);
});

test("anonymous preview is signed, time bounded, and followed by a three-day self-service trial", () => {
  const auth = readFileSync(join(root, "src/lib/auth.ts"), "utf8");
  const playback = readFileSync(join(root, "src/lib/playback.ts"), "utf8");
  const route = readFileSync(join(root, "src/app/api/playback/[id]/route.ts"), "utf8");
  const signup = readFileSync(join(root, "src/app/api/auth/viewer/signup/route.ts"), "utf8");
  const gateway = readFileSync(join(root, "scripts/local-media-gateway.mjs"), "utf8");
  assert.match(auth, /PREVIEW_COOKIE/);
  assert.match(auth, /startedAt \+ 3 \* 60 \* 1000/);
  assert.match(auth, /preview\./);
  assert.match(route, /status: 402/);
  assert.match(route, /previewEndsAt/);
  assert.match(playback, /accessExp/);
  assert.match(gateway, /effectiveAccessExp/);
  assert.match(signup, /3 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(signup, /viewer\.self_signup/);
});

test("manual payment requests require a viewer and admin review atomically extends access", () => {
  const schema = readFileSync(join(root, "db/schema.sql"), "utf8");
  const database = readFileSync(join(root, "src/lib/db.ts"), "utf8");
  const viewerRoute = readFileSync(join(root, "src/app/api/payments/requests/route.ts"), "utf8");
  const adminRoute = readFileSync(join(root, "src/app/api/admin/payments/[id]/route.ts"), "utf8");
  assert.match(schema, /wiva_cloud_payment_requests/);
  assert.match(schema, /status in \('pending','approved','rejected'\)/);
  assert.match(viewerRoute, /currentViewerAccount/);
  assert.match(viewerRoute, /assertSameOrigin/);
  assert.match(adminRoute, /requireAdminRequest/);
  assert.match(database, /with reviewed as/);
  assert.match(database, /make_interval\(days => r\.requested_days\)/);
});

test("mobile playback keeps a ready state and rewrites loopback gateway hosts", () => {
  const player = readFileSync(join(root, "src/components/PlayerClient.tsx"), "utf8");
  const route = readFileSync(join(root, "src/app/api/playback/[id]/route.ts"), "utf8");
  assert.match(player, /"ready"/);
  assert.match(player, /الفيديو جاهز/);
  assert.doesNotMatch(player, /setState\("playing"\);\s*\}\s*catch/);
  assert.match(route, /request\.headers\.get\("host"\)/);
  assert.match(route, /gateway\.hostname = publicHostname/);
});

test("viewer player supports polished fullscreen gestures and hides technical copy", () => {
  const player = readFileSync(join(root, "src/components/PlayerClient.tsx"), "utf8");
  const home = readFileSync(join(root, "src/app/(viewer)/page.tsx"), "utf8");
  const live = readFileSync(join(root, "src/app/(viewer)/live/page.tsx"), "utf8");
  const catalog = readFileSync(join(root, "src/components/CatalogPage.tsx"), "utf8");
  const brandAssets = readFileSync(join(root, "src/lib/brand-assets.ts"), "utf8");
  const manifest = readFileSync(join(root, "src/app/manifest.ts"), "utf8");
  assert.match(player, /onDoubleClick=\{handleVideoDoubleClick\}/);
  assert.match(player, /toggleFullscreen\(\)/);
  assert.match(player, /player-buffering/);
  assert.match(player, /position >= \.58 \? 10 : -10/);
  assert.match(player, /lastTouchTapRef/);
  assert.match(player, /Math\.hypot\(dx, dy\) < 22/);
  assert.match(player, /handlePointerUp/);
  assert.match(player, /orientation\?\.lock\?\.\("landscape"\)/);
  assert.match(player, /player-scrub-preview/);
  assert.match(player, /scrubbingRef\.current/);
  assert.match(player, /navigator\.mediaSession/);
  const encodedWordmark = brandAssets.match(/WIVA_WORDMARK_BASE64 = "([^"]+)"/)?.[1];
  assert.deepEqual(Buffer.from(encodedWordmark || "", "base64"), readFileSync(join(root, "../electron-broadcaster/assets/wiva-logo-128.png")));
  assert.match(manifest, /brand-icon/);
  for (const publicCopy of [home, live, catalog]) {
    assert.doesNotMatch(publicCopy, /بوابة وسائط|إدخال مشترك|المصادر المرخّصة|لوحة الإدارة/);
  }
});

test("viewer catalog is bounded and playback adapts without exposing partial live segments", () => {
  const database = readFileSync(join(root, "src/lib/db.ts"), "utf8");
  const player = readFileSync(join(root, "src/components/PlayerClient.tsx"), "utf8");
  const gateway = readFileSync(join(root, "scripts/local-media-gateway.mjs"), "utf8");
  assert.match(database, /listViewerCatalog/);
  assert.match(database, /pageSize = Math\.min\(60/);
  assert.match(database, /limit \$\{pageSize\} offset \$\{offset\}/);
  assert.match(player, /playbackTuning/);
  assert.match(player, /capLevelToPlayerSize: true/);
  assert.match(player, /liveStartBuffer: constrained \? 5 : 3\.2/);
  assert.match(gateway, /program_date_time\+temp_file/);
  assert.match(gateway, /max_muxing_queue_size/);
});

test("LAN viewer mutations preserve the browser HTTP origin in development", () => {
  const security = readFileSync(join(root, "src/lib/security.ts"), "utf8");
  const config = readFileSync(join(root, "next.config.mjs"), "utf8");
  assert.match(security, /requestUrl\.protocol\.replace\(":", ""\)/);
  assert.doesNotMatch(security, /x-forwarded-proto"\) \|\| "https"/);
  assert.match(config, /allowedDevOrigins: \["127\.0\.0\.1", "192\.168\.1\.200"\]/);
});

test("viewer account exposes a POST logout that clears the session without JavaScript", () => {
  const account = readFileSync(join(root, "src/app/(viewer)/account/page.tsx"), "utf8");
  const logout = readFileSync(join(root, "src/app/api/auth/viewer/logout/route.ts"), "utf8");
  assert.match(account, /action="\/api\/auth\/viewer\/logout" method="post"/);
  assert.match(account, /تسجيل الخروج/);
  assert.match(logout, /assertSameOrigin\(request\)/);
  assert.match(logout, /status: 303/);
  assert.match(logout, /clearViewerCookie\(\)/);
});

test("admin and authentication flows expose clear navigation, feedback, and mobile-first forms", () => {
  const shell = readFileSync(join(root, "src/components/AdminShell.tsx"), "utf8");
  const navigation = readFileSync(join(root, "src/components/AdminNavigation.tsx"), "utf8");
  const adminLogout = readFileSync(join(root, "src/app/api/auth/admin/logout/route.ts"), "utf8");
  const login = readFileSync(join(root, "src/components/LoginForm.tsx"), "utf8");
  const signup = readFileSync(join(root, "src/components/SignupForm.tsx"), "utf8");
  const styles = readFileSync(join(root, "src/app/globals.css"), "utf8");
  assert.match(navigation, /usePathname/);
  assert.match(navigation, /aria-current=\{active \? "page"/);
  assert.match(shell, /action="\/api\/auth\/admin\/logout" method="post"/);
  assert.match(adminLogout, /status: 303/);
  assert.match(adminLogout, /new URL\("\/admin\/login"/);
  assert.match(login, /إظهار كلمة المرور/);
  assert.match(login, /aria-busy=\{pending\}/);
  assert.match(signup, /12 حرفًا على الأقل/);
  assert.match(styles, /\.viewer-auth-page \.auth-promo \{ display: none; \}/);
  assert.match(styles, /\.form-message\.error/);
});

test("viewer concurrency is enforced with expiring playback leases", () => {
  const schema = readFileSync(join(root, "db/schema.sql"), "utf8");
  const database = readFileSync(join(root, "src/lib/db.ts"), "utf8");
  const playback = readFileSync(join(root, "src/app/api/playback/[id]/route.ts"), "utf8");
  const gateway = readFileSync(join(root, "scripts/local-media-gateway.mjs"), "utf8");
  assert.match(schema, /wiva_cloud_playback_leases/);
  assert.match(database, /acquirePlaybackLease/);
  assert.match(playback, /وصل الحساب إلى الحد المسموح للمشاهدة المتزامنة/);
  assert.match(gateway, /leaseIsActive/);
});

test("catalog purge preserves providers and records an audit event", () => {
  const purge = readFileSync(join(root, "scripts/purge-content.mjs"), "utf8");
  assert.match(purge, /delete from wiva_cloud_assets/);
  assert.doesNotMatch(purge, /delete from wiva_cloud_providers/);
  assert.match(purge, /catalog\.purge/);
});

test("provider catalogs use a persistent cache and imported series require episodes", () => {
  const schema = readFileSync(join(root, "db/schema.sql"), "utf8");
  const catalog = readFileSync(join(root, "src/lib/provider-catalog.ts"), "utf8");
  const database = readFileSync(join(root, "src/lib/db.ts"), "utf8");
  assert.match(schema, /wiva_cloud_provider_catalog_cache/);
  assert.match(catalog, /getProviderCatalogCache/);
  assert.match(database, /اختر حلقة واحدة على الأقل قبل استيراد المسلسل/);
  assert.match(database, /catalogIdentity/);
});

test("public health is minimal while gateway metrics require a signed health request", () => {
  const health = readFileSync(join(root, "src/app/api/health/route.ts"), "utf8");
  const gateway = readFileSync(join(root, "scripts/local-media-gateway.mjs"), "utf8");
  assert.doesNotMatch(health, /WIVA_ADMIN_EMAIL|databaseConfigured|mediaGateway/);
  assert.match(gateway, /hmac\(`health\.\$\{ts\}`\)/);
});
