const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const db = require('../library/db.cjs');
const mediaServer = require('../library/media-server.cjs');
const { startSignalingServer } = require('../server/signaling.cjs');

function request(base, pathname, options = {}) {
  return fetch(base + pathname, {
    redirect: 'manual',
    ...options,
  });
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-smoke-'));
  db.init(path.join(dir, 'library.db'), { broadcast: [], iptv: [] });

  let setupState = {
    version: 'test',
    setupCompleted: false,
    ports: { live: 8787, library: 8788 },
    urls: { setupLocal: 'http://127.0.0.1:8788/setup', adminLocal: 'http://127.0.0.1:8788/admin' },
    autoStart: { afterLogin: true, beforeLogin: false, beforeLoginSupported: true, beforeLoginInstalled: false },
    settings: {
      brandName: 'WIVA',
      adminUsername: 'admin',
      port: 8787,
      libraryPort: 8788,
      adminPath: 'admin',
      experienceLayout: 'unified',
      autoStartOnBoot: true,
      autoStartBeforeLogin: false,
    },
  };
  let platformState = { state: 'unregistered', features: {}, activationId: '' };
  let iptvPolicy = { iptvGlobalLimitBytes: 0, cloudIptvRefreshMinutes: 3 };
  let cloudIptvRows = [
    { id: 'cloud-smoke', name: 'Cloud Smoke IPTV HD', url: 'https://example.com/cloud.m3u8', category: 'سحابي', enabled: false, source: 'cloud' },
  ];
  const sessions = new Set();
  const handlerOptions = {
    getAdminAuth: () => ({ username: 'admin' }),
    getAdminPath: () => 'admin',
    getSetupState: () => setupState,
    checkPort: (port) => ({ ok: true, available: true, port: Number(port), message: 'available' }),
    applySetup: async (patch) => {
      const livePort = Number(patch.port || patch.livePort || setupState.settings.port || 8787);
      const libraryPort = Number(patch.libraryPort || patch.adminPort || setupState.settings.libraryPort || 8788);
      const experienceLayout = patch.experienceLayout === 'separate' ? 'separate' : 'unified';
      setupState = {
        ...setupState,
        setupCompleted: true,
        networkName: patch.networkName || setupState.networkName,
        brandName: patch.brandName || setupState.brandName,
        ports: {
          live: livePort,
          library: experienceLayout === 'unified' ? livePort : libraryPort,
          libraryConfigured: libraryPort,
          mode: experienceLayout,
        },
        autoStart: {
          afterLogin: patch.autoStartOnBoot !== false,
          beforeLogin: !!patch.autoStartBeforeLogin,
          beforeLoginSupported: true,
          beforeLoginInstalled: !!patch.autoStartBeforeLogin,
        },
        settings: {
          ...setupState.settings,
          ...patch,
          port: livePort,
          libraryPort,
          experienceLayout,
          autoStartOnBoot: patch.autoStartOnBoot !== false,
          autoStartBeforeLogin: !!patch.autoStartBeforeLogin,
        },
      };
      return setupState;
    },
    verifyAdminCredentials: ({ username, password }) => username === 'admin' && password === 'correct-password',
    issueAdminSession: () => {
      const token = crypto.randomBytes(18).toString('base64url');
      sessions.add(token);
      return token;
    },
    verifyAdminSession: (token) => sessions.has(token),
    clearAdminSession: (token) => sessions.delete(token),
    getPlatformStatus: () => platformState,
    getBroadcastChannels: () => db.listBroadcastChannels(),
    getIptvChannels: () => [
      ...cloudIptvRows.filter((ch) => ch.enabled !== false && ch.enabled !== 0).map((ch) => ({
        ...ch,
        id: String(ch.id),
        type: 'iptv',
        group: ch.category || 'IPTV',
        playUrl: `/iptv/${ch.id}/index.m3u8`,
      })),
      ...db.listIptv().map((ch) => ({
        ...ch,
        id: String(ch.id),
        type: 'iptv',
        group: ch.category || 'IPTV',
        playUrl: `/iptv/${ch.id}/index.m3u8`,
      })),
    ],
    getCloudIptv: () => cloudIptvRows.slice(),
    setCloudIptvEnabled: (id, enabled) => {
      cloudIptvRows = cloudIptvRows.map((row) => String(row.id) === String(id)
        ? { ...row, enabled: !!enabled }
        : row);
      return cloudIptvRows.find((row) => String(row.id) === String(id)) || null;
    },
    getIptvPolicy: () => iptvPolicy,
    updateIptvPolicy: (patch) => {
      iptvPolicy = {
        iptvGlobalLimitBytes: Number(patch.iptvGlobalLimitBytes) || 0,
        cloudIptvRefreshMinutes: Number(patch.cloudIptvRefreshMinutes) || 3,
      };
      return iptvPolicy;
    },
    getLibraryConfig: () => ({ tmdbKey: '', tmdbLang: 'ar' }),
    requestPlatformActivation: async (body) => {
      platformState = {
        state: 'pending',
        activationId: 'act_smoke',
        instance: { tenantName: body.tenantName || body.networkName || '', contactEmail: body.contactEmail || '' },
        features: {},
      };
      return platformState;
    },
    refreshPlatformStatus: async () => platformState,
  };
  const server = http.createServer(mediaServer.createHandler(handlerOptions));

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const signaling = startSignalingServer({
    port: 0,
    mediaHandler: mediaServer.createHandler(handlerOptions),
    getIptvChannels: handlerOptions.getIptvChannels,
    getBroadcastChannels: handlerOptions.getBroadcastChannels,
    getFeatureAllowed: (feature) => platformState.state === 'active' && !!platformState.features?.[feature],
  });
  while (!signaling.address()) await new Promise((resolve) => setTimeout(resolve, 10));
  const signalingBase = `http://127.0.0.1:${signaling.address().port}`;

  try {
    let res = await request(base, '/health');
    assert.equal(res.status, 200);
    const health = await res.json();
    assert.equal(health.app, 'WIVA');
    assert.equal(health.ok, true);

    res = await request(base, '/api/setup/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        networkName: 'Smoke Net',
        brandName: 'WIVA',
        port: 8791,
        libraryPort: 8792,
        experienceLayout: 'separate',
        autoStartOnBoot: false,
        autoStartBeforeLogin: true,
        adminUsername: 'admin',
        adminPassword: 'Correct-password-123',
      }),
    });
    assert.equal(res.status, 200);
    const savedSetup = await res.json();
    assert.equal(savedSetup.ok, true);
    assert.equal(savedSetup.state.ports.live, 8791, 'setup save returns the new live port immediately');
    assert.equal(savedSetup.state.ports.library, 8792, 'setup save returns the configured library port in separate mode');
    assert.equal(savedSetup.state.settings.experienceLayout, 'separate', 'setup save persists separate layout');
    assert.equal(savedSetup.state.settings.autoStartOnBoot, false, 'setup save persists after-login autostart toggle');
    assert.equal(savedSetup.state.settings.autoStartBeforeLogin, true, 'setup save persists before-login autostart toggle');

    res = await request(base, '/setup');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin');

    res = await request(base, '/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'admin', password: 'correct-password' }),
    });
    assert.equal(res.status, 403, 'unregistered installs must show registration before admin login');

    res = await request(base, '/api/platform/activation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantName: 'Smoke Net', contactEmail: 'owner@example.com' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).subscription.state, 'pending');

    platformState = {
      state: 'active',
      activationId: 'act_smoke',
      features: { channels: true, iptv: true, media: true, webAdmin: true, analytics: true, branding: true },
      instance: { tenantName: 'Smoke Net', plan: 'test' },
    };

    res = await request(base, '/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'admin', password: 'wrong' }),
    });
    assert.equal(res.status, 401);

    res = await request(base, '/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'admin', password: 'correct-password' }),
    });
    assert.equal(res.status, 302);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /manara_admin=/);
    assert.doesNotMatch(cookie, /admin:correct-password/);

    // The modern web UI (webui/dist) is the one and only user-facing surface.
    // When it is built, admin/setup navigation returns the SPA shell (id="root").
    // When it is not built (quick local `npm test` before a build), the server
    // returns a small offline-safe "UI not built" notice (HTTP 503) — never the
    // old giant server-rendered admin/setup/library HTML, which has been removed.
    const spaBuilt = fs.existsSync(path.join(__dirname, '..', 'webui', 'dist', 'index.html'));

    res = await request(signalingBase, '/');
    const signalingHomeBody = await res.text();
    assert.doesNotMatch(signalingHomeBody, /id="grid"|\.channel-card|viewer\.html/, 'signaling / must not serve the old viewer HTML');
    if (spaBuilt) {
      assert.equal(res.status, 200, 'signaling / serves the modern SPA when built');
      assert.match(signalingHomeBody, /data-wiva-app="next"|\/_next\/static\//, 'signaling / serves the modern Next SPA shell');
      const scriptMatch = signalingHomeBody.match(/src="(\/_next\/static\/[^"]+\.js)"/);
      assert.ok(scriptMatch, 'signaling / includes a Next.js client script');
      const assetRes = await request(signalingBase, scriptMatch[1]);
      assert.equal(assetRes.status, 200, 'signaling server must serve Next.js static JS assets');
      assert.match(assetRes.headers.get('content-type') || '', /javascript/, 'Next.js asset is served as JavaScript');
    }

    res = await request(signalingBase, '/watch/channel/smoke');
    const signalingWatchBody = await res.text();
    assert.doesNotMatch(signalingWatchBody, /new RTCPeerConnection|watch\.html/, 'signaling /watch/channel must not serve the old watch HTML');
    if (spaBuilt) {
      assert.equal(res.status, 200, 'signaling /watch/channel serves the modern SPA when built');
      assert.match(signalingWatchBody, /data-wiva-app="next"|\/_next\/static\//, 'signaling watch path serves the modern Next SPA shell');
    }

    res = await request(base, '/admin/channels/new', { headers: { Cookie: cookie.split(';')[0] } });
    if (spaBuilt) {
      assert.equal(res.status, 200);
      assert.match(await res.text(), /data-wiva-app="next"|\/_next\/static\//, 'admin nav serves the modern Next SPA shell');
    } else {
      assert.equal(res.status, 503, 'admin nav returns the UI-not-built notice when unbuilt');
      assert.match(await res.text(), /غير مبنية/, 'shows the offline-safe UI-not-built notice');
    }

    // The old break-glass /admin/legacy and /setup/legacy paths are now just
    // ordinary client-routed URLs — never the old server-rendered giant HTML.
    res = await request(base, '/admin/legacy', { headers: { Cookie: cookie.split(';')[0] } });
    const legacyBody = await res.text();
    assert.doesNotMatch(legacyBody, /broadcastJson|openMediaEditor/, 'old server-rendered admin panel is gone');
    if (spaBuilt) {
      assert.equal(res.status, 200, 'legacy admin path is now served by the SPA shell');
      assert.match(legacyBody, /data-wiva-app="next"|\/_next\/static\//, 'admin path serves the modern Next SPA shell');
    }

    res = await request(base, '/setup/legacy');
    const legacySetupBody = await res.text();
    assert.doesNotMatch(legacySetupBody, /id="setupForm"|checkPort/, 'old server-rendered setup wizard is gone');
    if (spaBuilt) {
      assert.equal(res.status, 200, 'legacy setup path is now served by the SPA shell');
      assert.match(legacySetupBody, /data-wiva-app="next"|\/_next\/static\//, 'setup path serves the modern Next SPA shell');
    }

    // The old /player/:id watch URL now redirects into the SPA watch route so
    // any lingering bookmarks keep working.
    res = await request(base, '/player/1', { redirect: 'manual' });
    assert.equal(res.status, 302, 'legacy /player/:id must redirect to the SPA');
    assert.match(res.headers.get('location') || '', /\/watch\/media\/1/, 'redirect points to modern watch route');

    res = await request(base, '/api/admin/state', { headers: { Cookie: cookie.split(';')[0] } });
    assert.equal(res.status, 200);
    const state = await res.json();
    assert.ok(Array.isArray(state.broadcast));

    const auth = { Cookie: cookie.split(';')[0] };

    // Storage roots: the in-app file browser lists the Agent's own disks.
    res = await request(base, '/api/admin/storage/roots', { headers: auth });
    assert.equal(res.status, 200);
    const roots = await res.json();
    assert.ok(Array.isArray(roots.roots), 'storage roots must be an array');
    assert.ok(roots.roots.length > 0, 'at least one storage root is expected');
    assert.ok(roots.roots.every((r) => typeof r.path === 'string'), 'each root has a path');

    // Browsing a known folder returns dir/file entries matching the web UI contract.
    res = await request(base, '/api/admin/storage/browse?path=' + encodeURIComponent(dir), { headers: auth });
    assert.equal(res.status, 200);
    const listing = await res.json();
    assert.equal(listing.ok, true);
    assert.ok(Array.isArray(listing.entries));
    assert.ok(listing.entries.every((e) => e.type === 'dir' || e.type === 'file'), 'entries use dir/file types');

    // Requires admin auth.
    res = await request(base, '/api/admin/storage/roots');
    assert.equal(res.status, 401);

    res = await request(base, '/api/admin/library/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ path: dir, kind: 'movies' }),
    });
    assert.equal(res.status, 200);
    const addedSource = await res.json();
    assert.equal(addedSource.ok, true);
    assert.ok(addedSource.sources.some((s) => s.path === dir), 'library source add endpoint returns the new source');
    const sourceRow = addedSource.sources.find((s) => s.path === dir);
    assert.ok(sourceRow?.id, 'added library source has an id for folder browsing');

    const scannedDir = path.join(dir, 'قسم للفحص');
    const emptyVisibleDir = path.join(dir, 'مجلد ظاهر بدون ملفات');
    const excludedDir = path.join(dir, 'قسم مستبعد');
    fs.mkdirSync(scannedDir, { recursive: true });
    fs.mkdirSync(emptyVisibleDir, { recursive: true });
    fs.mkdirSync(excludedDir, { recursive: true });
    fs.writeFileSync(path.join(scannedDir, 'included-video.mp4'), Buffer.from('fake video'));
    fs.writeFileSync(path.join(excludedDir, 'excluded-video.mp4'), Buffer.from('fake video'));

    res = await request(base, `/api/admin/library/sources/${encodeURIComponent(sourceRow.id)}/excludes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ path: excludedDir }),
    });
    assert.equal(res.status, 200);
    const excludeAdded = await res.json();
    const sourceWithExclude = excludeAdded.sources.find((s) => String(s.id) === String(sourceRow.id));
    assert.ok(sourceWithExclude.excludePaths.includes(excludedDir), 'library source stores excluded paths');

    res = await request(base, `/api/admin/library/sources/${encodeURIComponent(sourceRow.id)}/rescan`, {
      method: 'POST',
      headers: auth,
    });
    assert.equal(res.status, 200);

    res = await request(base, '/api/library');
    assert.equal(res.status, 200);
    let scannedLibraryPayload = await res.json();
    assert.ok(scannedLibraryPayload.items.some((item) => item.title === 'included-video'), 'scanner indexes media outside excluded folders');
    assert.ok(!scannedLibraryPayload.items.some((item) => item.title === 'excluded-video'), 'scanner skips excluded folders');

    res = await request(base, '/api/library/browse?sourceId=' + encodeURIComponent(sourceRow.id));
    assert.equal(res.status, 200);
    let scannedBrowseSource = await res.json();
    assert.ok(scannedBrowseSource.entries.some((entry) => entry.type === 'folder' && entry.name === 'قسم للفحص'), 'folder browser shows included source folders');
    assert.ok(scannedBrowseSource.entries.some((entry) => entry.type === 'folder' && entry.name === 'مجلد ظاهر بدون ملفات'), 'folder browser shows real disk folders even before media is indexed');
    assert.ok(!scannedBrowseSource.entries.some((entry) => entry.name === 'قسم مستبعد'), 'folder browser hides excluded source folders');

    // Adding a single capture channel through the wizard endpoint.
    res = await request(base, '/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        name: 'كاميرا القاعة',
        captureKind: 'screen',
        sourceId: 'screen:0',
        sourceName: 'الشاشة الرئيسية',
        audioId: 'audio:usb',
        audioName: 'USB Digital Audio Interface',
      }),
    });
    assert.equal(res.status, 200);
    const created = await res.json();
    assert.equal(created.name, 'كاميرا القاعة');
    assert.equal(created.source.type, 'screen');
    assert.equal(created.source.id, 'screen:0');
    assert.equal(created.source.name, 'الشاشة الرئيسية');
    assert.equal(created.audioDeviceName, 'USB Digital Audio Interface', 'broadcast channel preserves selected audio device name');

    res = await request(base, `/api/admin/broadcast/${encodeURIComponent(created.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'كاميرا القاعة HD', audioDeviceName: 'USB Audio Updated', enabled: true }),
    });
    assert.equal(res.status, 200);
    const updatedBroadcast = await res.json();
    assert.equal(updatedBroadcast.name, 'كاميرا القاعة HD');
    assert.equal(updatedBroadcast.audioDeviceName, 'USB Audio Updated');

    // A name is required.
    res = await request(base, '/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ captureKind: 'screen', sourceId: 'screen:0' }),
    });
    assert.equal(res.status, 400);

    // The new channel is persisted and visible in admin state.
    res = await request(base, '/api/admin/state', { headers: auth });
    assert.equal(res.status, 200);
    const state2 = await res.json();
    assert.ok(state2.broadcast.some((c) => c.name === 'كاميرا القاعة HD'), 'updated channel appears in state');

    res = await request(base, '/api/viewer/state');
    assert.equal(res.status, 200);
    let viewerState = await res.json();
    assert.ok(viewerState.broadcast.some((c) => c.name === 'كاميرا القاعة HD'), 'viewer state exposes enabled broadcast channels');
    assert.ok(viewerState.channels.some((c) => c.name === 'كاميرا القاعة HD'), 'viewer live channels include broadcast channels');

    const nestedDir = path.join(dir, 'قسم رئيسي', 'أفلام عربية');
    fs.mkdirSync(nestedDir, { recursive: true });
    const mediaPath = path.join(nestedDir, 'smoke-video.mp4');
    fs.writeFileSync(mediaPath, Buffer.from('fake video'));
    const mediaId = db.upsertMedia({
      path: mediaPath,
      kind: 'movie',
      title: 'فيلم smoke',
      size: 10,
      section: sourceRow.label || 'أفلام',
      folder: 'قسم رئيسي/أفلام عربية',
      source_id: sourceRow.id,
      source_path: dir,
      source_label: sourceRow.label || 'Smoke Source',
      relative_path: 'قسم رئيسي/أفلام عربية/smoke-video.mp4',
    });

    res = await request(base, '/api/library');
    assert.equal(res.status, 200);
    const libraryPayload = await res.json();
    assert.ok(Array.isArray(libraryPayload.items), 'library API exposes items for the web UI');
    assert.ok(Array.isArray(libraryPayload.media), 'library API keeps media alias for compatibility');
    assert.ok(libraryPayload.items.some((item) => item.title === 'فيلم smoke'), 'library API returns scanned media items');

    res = await request(base, '/api/library/browse');
    assert.equal(res.status, 200);
    const browseRoot = await res.json();
    assert.ok(browseRoot.entries.some((entry) => String(entry.sourceId) === String(sourceRow.id)), 'folder browser root shows added library source');

    res = await request(base, '/api/library/browse?sourceId=' + encodeURIComponent(sourceRow.id));
    assert.equal(res.status, 200);
    const browseSource = await res.json();
    assert.ok(browseSource.entries.some((entry) => entry.type === 'folder' && entry.name === 'قسم رئيسي'), 'folder browser shows top-level folders');

    res = await request(base, '/api/library/browse?sourceId=' + encodeURIComponent(sourceRow.id) + '&path=' + encodeURIComponent('قسم رئيسي/أفلام عربية'));
    assert.equal(res.status, 200);
    const browseNested = await res.json();
    assert.ok(browseNested.entries.some((entry) => entry.type === 'media' && entry.media?.title === 'فيلم smoke'), 'folder browser shows media files inside nested folders');

    res = await request(base, `/api/media/${mediaId}`);
    assert.equal(res.status, 200);
    const mediaDetails = await res.json();
    assert.equal(mediaDetails.id, mediaId, 'media details API returns the media item directly for the web player');
    assert.ok(Array.isArray(mediaDetails.subtitles), 'media details include subtitles array');

    res = await request(base, '/api/admin/iptv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'Smoke IPTV HD', url: 'https://example.com/live.m3u8', category: 'اختبار' }),
    });
    assert.equal(res.status, 200);
    const iptvCreated = await res.json();

    res = await request(base, `/api/admin/iptv/${iptvCreated.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'Smoke IPTV FHD', category: 'اختبار معدل', transferLimitBytes: 4096 }),
    });
    assert.equal(res.status, 200);
    const iptvUpdated = await res.json();
    assert.equal(iptvUpdated.name, 'Smoke IPTV FHD');
    assert.equal(iptvUpdated.category, 'اختبار معدل');

    res = await request(base, `/iptv/${iptvCreated.id}/index.m3u8`);
    assert.notEqual(res.status, 404, 'IPTV proxy accepts the player /index.m3u8 route');

    res = await request(base, '/api/viewer/state');
    assert.equal(res.status, 200);
    viewerState = await res.json();
    assert.ok(viewerState.iptv.some((c) => c.name === 'Smoke IPTV FHD'), 'viewer state exposes enabled IPTV');
    assert.ok(viewerState.channels.some((c) => c.name === 'Smoke IPTV FHD'), 'viewer live channels include IPTV');

    res = await request(base, '/api/admin/state', { headers: auth });
    assert.equal(res.status, 200);
    const adminWithCloud = await res.json();
    assert.equal(adminWithCloud.cloudIptv.find((c) => c.id === 'cloud-smoke').enabled, false, 'admin state reflects local cloud IPTV override state');
    assert.equal(adminWithCloud.iptvPolicy.cloudIptvRefreshMinutes, 3, 'admin state exposes cloud IPTV refresh policy');

    res = await request(base, '/api/admin/iptv-policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ cloudIptvRefreshMinutes: 7, iptvGlobalLimitBytes: 123456 }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).policy.cloudIptvRefreshMinutes, 7);

    res = await request(base, '/api/admin/state', { headers: auth });
    assert.equal(res.status, 200);
    const adminWithPolicy = await res.json();
    assert.equal(adminWithPolicy.iptvPolicy.cloudIptvRefreshMinutes, 7, 'updated cloud IPTV refresh policy persists in admin state');
    assert.equal(adminWithPolicy.iptvPolicy.iptvGlobalLimitBytes, 123456, 'updated global IPTV limit persists in admin state');

    res = await request(base, '/api/admin/iptv/cloud-smoke/toggle', { method: 'POST', headers: auth });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).enabled, true);

    res = await request(base, '/api/viewer/state');
    assert.equal(res.status, 200);
    viewerState = await res.json();
    assert.ok(viewerState.iptv.some((c) => c.name === 'Cloud Smoke IPTV HD'), 'viewer state exposes enabled cloud IPTV');

    res = await request(base, '/api/admin/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        name: 'Smoke Camera',
        source: { type: 'screen', id: '' },
        audioDeviceId: 'none',
        enabled: true,
        autoStart: true,
      }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).name, 'Smoke Camera');

    res = await request(base, '/api/admin/channels', { headers: auth });
    assert.equal(res.status, 200);
    assert.ok((await res.json()).channels.length >= 2);

    // Reports JSON exposes numeric metrics the admin dashboard renders as tiles.
    res = await request(base, '/api/admin/reports', { headers: auth });
    assert.equal(res.status, 200);
    const reports = await res.json();
    assert.equal(typeof reports.totalMedia, 'number', 'reports expose numeric metrics');
    assert.equal(typeof reports.activeSessions, 'number');

    // Seed an access log with Arabic text so the CSV export exercises escaping
    // and UTF-8 handling exactly as a real viewing report would.
    db.addAccessLog({ ip: '10.0.0.5', action: 'media', targetType: 'media', targetId: '1', targetName: 'فيلم تجريبي', bytes: 2048, status: 200 });

    // CSV export must be Windows/Excel-safe: UTF-8 BOM + CRLF line endings so
    // Arabic report data is not garbled when opened on Windows. The BOM must be
    // asserted on the raw bytes because response.text() strips a leading BOM.
    res = await request(base, '/api/admin/reports/views.csv', { headers: auth });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/csv/);
    assert.match(res.headers.get('content-disposition') || '', /attachment/);
    const csvBytes = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(csvBytes.subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]), 'CSV must start with a UTF-8 BOM for Excel on Windows');
    const csv = csvBytes.toString('utf8');
    assert.ok(csv.includes('\r\n'), 'CSV must use CRLF line endings');
    assert.match(csv, /time,action,ip,targetType,targetId,targetName,bytes,status/);
    assert.ok(csv.includes('فيلم تجريبي'), 'Arabic report text must survive the CSV export intact');

    // Admin export endpoints stay behind authentication.
    res = await request(base, '/api/admin/reports/views.csv');
    assert.equal(res.status, 401);

    res = await request(base, '/api/admin/state');
    assert.equal(res.status, 401);
  } finally {
    await signaling.close();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('WIVA smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
