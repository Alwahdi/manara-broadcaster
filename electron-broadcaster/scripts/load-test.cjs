const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const db = require('../library/db.cjs');
const mediaServer = require('../library/media-server.cjs');

const CONCURRENCY = Number(process.env.WIVA_LOAD_CONCURRENCY || 40);
const REQUESTS = Number(process.env.WIVA_LOAD_REQUESTS || 240);
const MAX_P95_MS = Number(process.env.WIVA_LOAD_MAX_P95_MS || 800);

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

async function timedRequest(base, pathname, options = {}) {
  const started = nowMs();
  const res = await fetch(base + pathname, { redirect: 'manual', ...options });
  await res.arrayBuffer();
  return { status: res.status, ms: nowMs() - started };
}

async function runPool(tasks, concurrency) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] || 0;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiva-load-'));
  db.init(path.join(dir, 'library.db'), { broadcast: [], iptv: [] });

  const sessions = new Set();
  const server = http.createServer(mediaServer.createHandler({
    getAdminAuth: () => ({ username: 'admin' }),
    getAdminPath: () => 'admin',
    getSetupState: () => ({
      version: 'load-test',
      setupCompleted: true,
      ports: { live: 8787, library: 8788 },
      urls: { setupLocal: 'http://127.0.0.1:8788/setup', adminLocal: 'http://127.0.0.1:8788/admin' },
      settings: { brandName: 'WIVA', adminUsername: 'admin', port: 8787, libraryPort: 8788, adminPath: 'admin' },
    }),
    verifyAdminCredentials: ({ username, password }) => username === 'admin' && password === 'correct-password',
    issueAdminSession: () => {
      const token = crypto.randomBytes(18).toString('base64url');
      sessions.add(token);
      return token;
    },
    verifyAdminSession: (token) => sessions.has(token),
    clearAdminSession: (token) => sessions.delete(token),
    getPlatformStatus: () => ({
      state: 'active',
      activationId: 'act_load',
      features: { channels: true, iptv: true, media: true, webAdmin: true, analytics: true, branding: true },
      instance: { tenantName: 'Load Test', plan: 'test' },
    }),
  }));

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const login = await fetch(base + '/admin/login', {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'admin', password: 'correct-password' }),
    });
    assert.equal(login.status, 302);
    const cookie = String(login.headers.get('set-cookie') || '').split(';')[0];
    assert.match(cookie, /manara_admin=/);

    const paths = [
      '/health',
      '/ready',
      '/api/agent/health',
      '/api/admin/state',
      '/api/admin/storage/roots',
    ];

    const tasks = Array.from({ length: REQUESTS }, (_, i) => async () => {
      const pathname = paths[i % paths.length];
      const headers = pathname.startsWith('/api/admin') ? { Cookie: cookie } : {};
      return timedRequest(base, pathname, { headers });
    });

    const results = await runPool(tasks, CONCURRENCY);
    const failures = results.filter((r) => r.status >= 500 || r.status === 0);
    const latencies = results.map((r) => r.ms);
    const p95 = percentile(latencies, 95);
    const max = Math.max(...latencies);

    console.log(JSON.stringify({ requests: REQUESTS, concurrency: CONCURRENCY, failures: failures.length, p95Ms: p95, maxMs: max }, null, 2));

    assert.equal(failures.length, 0, 'load test must not return 5xx responses');
    assert.ok(p95 <= MAX_P95_MS, `p95 latency ${p95}ms exceeded ${MAX_P95_MS}ms`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
