// WIVA — Cloud IPTV sync
// Periodically fetches admin-managed IPTV channels from the cloud
// and exposes them alongside locally-added channels.
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { writeJsonAtomic } = require('./atomic-write.cjs');
try { require('./env.cjs').loadLocalEnv(__dirname); } catch {}

let runtimeConfig = {};
try { runtimeConfig = require('./cloud-runtime.cjs'); } catch {}

const CLOUD_BASE = String(process.env.WIVA_CLOUD_URL || process.env.MANARA_CLOUD_URL || runtimeConfig.cloudUrl || '').trim().replace(/\/+$/g, '');
const CLOUD_REST = CLOUD_BASE ? CLOUD_BASE + '/api/public/iptv/list' : '';
const DEFAULT_REFRESH_MS = 3 * 60 * 1000;
let neonDatabaseUrl = process.env.MANARA_NEON_DATABASE_URL || runtimeConfig.neonDatabaseUrl || '';

const DEV_DEMO_CHANNELS = [
  {
    id: 'dev-apple-bipbop-4x3-sd',
    name: 'Apple Demo 4:3 SD',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8',
    logo: '',
    category: 'Demo',
    headers: {},
    transferLimitBytes: 0,
  },
  {
    id: 'dev-mux-240p',
    name: 'Mux Demo 240p',
    url: 'https://test-streams.mux.dev/x36xhzz/url_2/193039199_mp4_h264_aac_ld_7.m3u8',
    logo: '',
    category: 'Demo',
    headers: {},
    transferLimitBytes: 0,
  },
  {
    id: 'dev-mux-380p',
    name: 'Mux Demo 380p',
    url: 'https://test-streams.mux.dev/x36xhzz/url_4/193039199_mp4_h264_aac_7.m3u8',
    logo: '',
    category: 'Demo',
    headers: {},
    transferLimitBytes: 0,
  },
];

let cachePath = null;
let cached = []; // [{id,name,url,logo,category,headers}]
let lastFetch = 0;
let lastStatus = { state: 'idle', at: null, error: '', count: 0, source: '' };
let timer = null;
let initialTimer = null;
let refreshPromise = null;
let refreshMs = DEFAULT_REFRESH_MS;
let cacheSecret = null;

function secretPath() {
  return cachePath ? path.join(path.dirname(cachePath), 'cloud-iptv-cache.key') : '';
}

function getCacheSecret() {
  if (cacheSecret) return cacheSecret;
  const p = secretPath();
  if (!p) return null;
  try {
    if (fs.existsSync(p)) {
      cacheSecret = Buffer.from(fs.readFileSync(p, 'utf8'), 'base64');
      if (cacheSecret.length === 32) return cacheSecret;
    }
  } catch {}
  cacheSecret = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, cacheSecret.toString('base64'), { mode: 0o600 });
  } catch (e) {
    console.error('[cloud-iptv] cache key write', e.message);
  }
  return cacheSecret;
}

function encryptText(value) {
  const secret = getCacheSecret();
  if (!secret) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  const encrypted = Buffer.concat([cipher.update(String(value || ''), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decryptText(value) {
  const secret = getCacheSecret();
  if (!secret || !value) return '';
  const raw = Buffer.from(String(value), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', secret, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function rowsFromCache(rows = []) {
  return rows.map((row) => {
    const url = row.url || (row.urlCipher ? decryptText(row.urlCipher) : '');
    let headers = row.headers || {};
    if (!row.headers && row.headersCipher) {
      try { headers = JSON.parse(decryptText(row.headersCipher) || '{}'); } catch { headers = {}; }
    }
    return { ...row, url, headers };
  }).filter((row) => row.id && row.name && row.url);
}

function rowsForCache(rows = []) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    logo: row.logo || '',
    category: row.category || '',
    transferLimitBytes: Math.max(0, Number(row.transferLimitBytes) || 0),
    urlCipher: encryptText(row.url || ''),
    headersCipher: encryptText(JSON.stringify(row.headers || {})),
  }));
}

function setCachePath(p) {
  cachePath = p;
  try {
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(j.channels)) cached = rowsFromCache(j.channels);
      if (j.lastFetch) lastFetch = j.lastFetch;
      if (cached.length && j.cacheVersion !== 2) persist();
    }
  } catch (e) { console.error('[cloud-iptv] cache read', e.message); }
}

function persist() {
  if (!cachePath) return;
  try {
    writeJsonAtomic(cachePath, { cacheVersion: 2, channels: rowsForCache(cached), lastFetch });
  }
  catch (e) { console.error('[cloud-iptv] cache write', e.message); }
}

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'WIVA-Agent/2.6.5', ...headers } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

function normalizeRows(rows) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    logo: r.logo || r.logo_url || '',
    category: r.category || '',
    headers: r.headers || {},
    transferLimitBytes: Math.max(0, Number(r.transferLimitBytes ?? r.transfer_limit_bytes) || 0),
  })).filter((r) => r.id && r.name && r.url);
}

async function fetchFromNeon() {
  if (!neonDatabaseUrl) return null;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(neonDatabaseUrl, { fetchOptions: { signal: AbortSignal.timeout(12000) } });
  const rows = await sql`
    select id, name, url, logo_url, category, headers, transfer_limit_bytes
    from cloud_iptv_channels
    where is_active = true
    order by sort_order asc, name asc
  `;
  return normalizeRows(rows);
}

function setNeonDatabaseUrl(url) {
  neonDatabaseUrl = String(url || '').trim() || process.env.MANARA_NEON_DATABASE_URL || runtimeConfig.neonDatabaseUrl || '';
}

async function performRefresh(licenseKey) {
  const failures = [];
  if (!neonDatabaseUrl && process.defaultApp) {
    cached = DEV_DEMO_CHANNELS;
    lastFetch = Date.now();
    lastStatus = { state: 'ok', at: new Date().toISOString(), error: '', count: cached.length, source: 'dev-demo-no-neon' };
    persist();
    console.warn('[cloud-iptv] using dev demo IPTV channels because MANARA_NEON_DATABASE_URL is not configured');
    return cached;
  }
  try {
    const rows = await fetchFromNeon();
    if (Array.isArray(rows)) {
      cached = rows;
      lastFetch = Date.now();
      lastStatus = { state: 'ok', at: new Date().toISOString(), error: '', count: cached.length, source: 'neon-postgres' };
      persist();
      console.log('[cloud-iptv] refreshed from Neon', cached.length, 'channels');
      return cached;
    }
  } catch (e) {
    failures.push(`neon postgres: ${e.message}`);
  }
  if (!neonDatabaseUrl) failures.push('neon postgres: MANARA_NEON_DATABASE_URL is not configured');

  if (CLOUD_REST) {
    try {
      const url = CLOUD_REST + (licenseKey ? `?license_key=${encodeURIComponent(licenseKey)}` : '');
      const payload = await fetchJson(url, licenseKey ? { 'X-License-Key': licenseKey } : {});
      const rows = Array.isArray(payload) ? payload : payload.channels;
      if (Array.isArray(rows)) {
        const normalized = normalizeRows(rows);
        cached = normalized;
        lastFetch = Date.now();
        lastStatus = { state: 'ok', at: new Date().toISOString(), error: '', count: cached.length, source: CLOUD_REST };
        persist();
        console.log('[cloud-iptv] refreshed', cached.length, 'channels');
      }
      return cached;
    } catch (e) {
      failures.push(`public endpoint: ${e.message}`);
    }
  } else {
    failures.push('public endpoint: WIVA_CLOUD_URL is not configured');
  }

  lastStatus = { state: 'error', at: new Date().toISOString(), error: failures.join(' | '), count: cached.length, source: 'cache' };
  console.error('[cloud-iptv] refresh failed', lastStatus.error);
  return cached;
}

function refresh(licenseKey) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = performRefresh(licenseKey).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function setRefreshIntervalMs(ms) {
  refreshMs = Math.max(60 * 1000, Math.min(24 * 60 * 60 * 1000, Number(ms) || DEFAULT_REFRESH_MS));
  return refreshMs;
}

function startAutoRefresh(getLicenseKey, intervalMs) {
  setRefreshIntervalMs(intervalMs);
  if (timer) clearInterval(timer);
  if (initialTimer) clearTimeout(initialTimer);
  // First fetch shortly after start
  initialTimer = setTimeout(() => refresh(getLicenseKey()), 5000);
  if (typeof initialTimer.unref === 'function') initialTimer.unref();
  timer = setInterval(() => refresh(getLicenseKey()), refreshMs);
  if (typeof timer.unref === 'function') timer.unref();
}

function list(options = {}) {
  const includeUrl = !!options.includeUrl;
  // Return channels with cloud- prefix so they don't collide with local sqlite ids
  return cached.map((c) => ({
    id: `cloud-${c.id}`,
    name: c.name,
    ...(includeUrl ? { url: c.url, headers: c.headers || {} } : {}),
    logo: c.logo || '',
    category: c.category || '',
    transferLimitBytes: Math.max(0, Number(c.transferLimitBytes) || 0),
    enabled: 1,
    source: 'cloud',
  }));
}

function status() {
  return { ...lastStatus, lastFetch, refreshMs };
}

function getById(id) {
  // id is the raw cloud uuid (without prefix)
  return cached.find((c) => String(c.id) === String(id)) || null;
}

module.exports = { setCachePath, setNeonDatabaseUrl, setRefreshIntervalMs, refresh, startAutoRefresh, list, getById, status };
