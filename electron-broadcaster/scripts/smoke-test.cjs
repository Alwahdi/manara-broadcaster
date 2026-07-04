const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const db = require('../library/db.cjs');
const mediaServer = require('../library/media-server.cjs');

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
    settings: { brandName: 'WIVA', adminUsername: 'admin', port: 8787, libraryPort: 8788, adminPath: 'admin' },
  };
  const sessions = new Set();
  const server = http.createServer(mediaServer.createHandler({
    getAdminAuth: () => ({ username: 'admin' }),
    getAdminPath: () => 'admin',
    getSetupState: () => setupState,
    checkPort: (port) => ({ ok: true, available: true, port: Number(port), message: 'available' }),
    applySetup: async (patch) => {
      setupState = { ...setupState, setupCompleted: true, settings: { ...setupState.settings, ...patch } };
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
    getPlatformStatus: () => null,
  }));

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    let res = await request(base, '/health');
    assert.equal(res.status, 200);
    const health = await res.json();
    assert.equal(health.app, 'WIVA');
    assert.equal(health.ok, true);

    res = await request(base, '/api/setup/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ networkName: 'Smoke Net', brandName: 'WIVA', port: 8787, libraryPort: 8788 }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);

    res = await request(base, '/setup');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin');

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

    res = await request(base, '/admin/channels/new', { headers: { Cookie: cookie.split(';')[0] } });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /لوحة إدارة WIVA|لوحة الشبكة|id="root"/);

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

    // Adding a single capture channel through the wizard endpoint.
    res = await request(base, '/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ name: 'كاميرا القاعة', captureKind: 'screen', sourceId: 'screen:0', audioId: null }),
    });
    assert.equal(res.status, 200);
    const created = await res.json();
    assert.equal(created.name, 'كاميرا القاعة');
    assert.equal(created.source.type, 'screen');
    assert.equal(created.source.id, 'screen:0');

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
    assert.ok(state2.broadcast.some((c) => c.name === 'كاميرا القاعة'), 'created channel appears in state');

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
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('WIVA smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
