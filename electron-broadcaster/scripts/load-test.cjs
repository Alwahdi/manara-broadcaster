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
const RAMP_MS = Math.max(0, Number(process.env.WIVA_LOAD_RAMP_MS || 0));

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

async function timedRequest(base, pathname, options = {}) {
  const started = nowMs();
  try {
    const res = await fetch(base + pathname, { redirect: 'manual', ...options });
    await res.arrayBuffer();
    return { status: res.status, ms: nowMs() - started };
  } catch (error) {
    return { status: 0, ms: nowMs() - started, error: error?.cause?.code || error?.message || String(error) };
  }
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
  const mediaPath = path.join(dir, 'load-video.mp4');
  fs.writeFileSync(mediaPath, Buffer.alloc(8 * 1024 * 1024, 11));
  db.addPath(dir, 'movies');
  const source = db.listPaths()[0];
  const mediaId = db.upsertMedia({
    path: mediaPath,
    kind: 'movie',
    title: 'Load Test Video',
    size: fs.statSync(mediaPath).size,
    section: source?.label || 'Load Test',
    folder: '',
    source_id: source?.id,
    source_path: dir,
    source_label: source?.label || 'Load Test',
    relative_path: 'load-video.mp4',
  });

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

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.requestTimeout = 0;
  await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1', backlog: 2048 }, resolve));
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
      '/',
      '/live',
      '/library',
      '/health',
      '/ready',
      '/api/agent/health',
      '/api/viewer/state',
      '/api/library',
      `/api/library/browse?sourceId=${encodeURIComponent(source?.id || '')}`,
      `/media/${mediaId}`,
      '/api/admin/state',
      '/api/admin/storage/roots',
    ];

    const tasks = Array.from({ length: REQUESTS }, (_, i) => async () => {
      if (RAMP_MS) await new Promise((resolve) => setTimeout(resolve, Math.floor((i % CONCURRENCY) * RAMP_MS / CONCURRENCY)));
      const pathname = paths[i % paths.length];
      const headers = pathname.startsWith('/api/admin')
        ? { Cookie: cookie }
        : pathname.startsWith('/media/')
          ? { Range: 'bytes=0-262143' }
          : {};
      return timedRequest(base, pathname, { headers });
    });

    const results = await runPool(tasks, CONCURRENCY);
    const failures = results.filter((r) => r.status >= 500 || r.status === 0);
    const latencies = results.map((r) => r.ms);
    const p95 = percentile(latencies, 95);
    const max = Math.max(...latencies);

    const errorCounts = failures.reduce((out, failure) => {
      const key = failure.error || String(failure.status);
      out[key] = (out[key] || 0) + 1;
      return out;
    }, {});
    console.log(JSON.stringify({ requests: REQUESTS, concurrency: CONCURRENCY, rampMs: RAMP_MS, failures: failures.length, errorCounts, p95Ms: p95, maxMs: max }, null, 2));

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
