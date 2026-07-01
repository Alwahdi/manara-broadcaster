// End-to-end test for the WIVA media/admin server.
// Boots the real HTTP handler with in-memory/JSON-backed state and exercises
// the public library, viewer accounts, admin panel, IPTV, and reporting flows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const db = require('../library/db.cjs');
const mediaServer = require('../library/media-server.cjs');

function jar() { return { cookies: {} }; }
function applySetCookie(j, res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie');
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  for (const c of arr) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    if (i > 0) j.cookies[kv.slice(0, i).trim()] = kv.slice(i + 1);
  }
}
function cookieHeader(j) {
  return Object.entries(j.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(base, pathname, { j, ...options } = {}) {
  const headers = { ...(options.headers || {}) };
  if (j && Object.keys(j.cookies).length) headers.Cookie = cookieHeader(j);
  const r = await fetch(base + pathname, { redirect: 'manual', ...options, headers });
  if (j) applySetCookie(j, r);
  return r;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-e2e-'));
  db.init(path.join(dir, 'library.db'), { broadcast: [], iptv: [] });

  let setupState = {
    version: 'e2e',
    setupCompleted: true,
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
    issueAdminSession: () => { const t = crypto.randomBytes(18).toString('base64url'); sessions.add(t); return t; },
    verifyAdminSession: (t) => sessions.has(t),
    clearAdminSession: (t) => sessions.delete(t),
    getPlatformStatus: () => null,
  }));

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let passed = 0;
  const ok = (name) => { passed++; console.log('  \u2713', name); };

  try {
    // Public pages render as HTML.
    for (const p of ['/library', '/setup', '/admin/login']) {
      const r = await req(base, p);
      assert.equal(r.status, 200, `${p} should render`);
      const html = await r.text();
      assert.match(html, /<html/i, `${p} returns html`);
      ok(`GET ${p} renders`);
    }

    // Security headers are applied.
    let r = await req(base, '/library');
    assert.ok(r.headers.get('x-content-type-options'), 'X-Content-Type-Options set');
    ok('security headers present');

    // Viewer account lifecycle.
    const jv = jar();
    r = await req(base, '/api/viewer/state', { j: jv });
    assert.equal(r.status, 200);
    ok('viewer anonymous state');

    r = await req(base, '/api/viewer/signup', {
      j: jv,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Viewer', phone: '+9670000000', email: 'v@example.com' }),
    });
    assert.equal(r.status, 200, 'viewer signup ok');
    const signup = await r.json();
    assert.equal(signup.ok, true);
    assert.ok(signup.account, 'account returned');
    ok('viewer signup');

    r = await req(base, '/api/viewer/message', {
      j: jv,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello from e2e' }),
    });
    assert.equal(r.status, 200, 'viewer message ok');
    ok('viewer message');

    r = await req(base, '/api/viewer/list', {
      j: jv,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list: 'favorites', mediaId: 'm1', active: true }),
    });
    assert.equal(r.status, 200, 'favorites toggle ok');
    ok('viewer favorites toggle');

    r = await req(base, '/api/viewer/logout', { j: jv, method: 'POST' });
    assert.equal(r.status, 200);
    ok('viewer logout');

    // Public library API shape.
    r = await req(base, '/api/library', { j: jv });
    assert.equal(r.status, 200);
    const lib = await r.json();
    assert.ok(Array.isArray(lib.media), 'media array');
    assert.ok(lib.theme, 'theme present');
    ok('library api shape');

    // Admin area requires authentication.
    r = await req(base, '/api/admin/state');
    assert.equal(r.status, 401, 'admin state requires auth');
    ok('admin state protected');

    // Admin login issues an opaque session cookie.
    const ja = jar();
    r = await req(base, '/admin/login', {
      j: ja,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'admin', password: 'correct-password' }),
    });
    assert.equal(r.status, 302, 'admin login redirect');
    assert.ok(ja.cookies.manara_admin, 'admin session cookie set');
    ok('admin login');

    // Authenticated admin endpoints respond.
    for (const ep of ['/api/admin/state', '/api/admin/media-stats', '/api/admin/health', '/api/admin/iptv-analytics', '/api/admin/reports/views.json']) {
      r = await req(base, ep, { j: ja });
      assert.equal(r.status, 200, `${ep} ok`);
      ok(`admin ${ep}`);
    }
    r = await req(base, '/api/admin/reports/views.csv', { j: ja });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /csv/);
    ok('admin reports csv');

    // Admin can add an IPTV channel.
    r = await req(base, '/api/admin/iptv', {
      j: ja,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Channel', url: 'http://example.com/stream.m3u8' }),
    });
    assert.ok([200, 201].includes(r.status), `iptv add status ${r.status}`);
    ok('admin add iptv');

    // Admin can update the block message.
    r = await req(base, '/api/admin/block-message', {
      j: ja,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Blocked' }),
    });
    assert.equal(r.status, 200);
    ok('admin block-message');

    // Unknown routes and missing media are handled gracefully.
    r = await req(base, '/no-such-route-xyz');
    assert.ok([404, 302].includes(r.status), `unknown route handled: ${r.status}`);
    ok('unknown route handled');

    r = await req(base, '/api/media/999999');
    assert.equal(r.status, 404);
    ok('media 404');

    console.log(`\nWIVA e2e test passed (${passed} checks)`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
