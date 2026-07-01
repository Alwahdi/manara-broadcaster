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

    res = await request(base, '/api/admin/state', { headers: { Cookie: cookie.split(';')[0] } });
    assert.equal(res.status, 200);
    const state = await res.json();
    assert.ok(Array.isArray(state.broadcast));

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
