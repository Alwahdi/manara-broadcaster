// Manara — Cloud IPTV sync
// Periodically fetches admin-managed IPTV channels from the cloud
// and exposes them alongside locally-added channels.
const fs = require('fs');
const path = require('path');
const https = require('https');

const CLOUD_BASE = process.env.MANARA_CLOUD_URL ||
  'https://project--67c27b7a-ed28-4f60-b80e-05a2f89dcda5.lovable.app';
const CLOUD_REST = CLOUD_BASE + '/api/public/iptv/list';
const SUPABASE_URL = process.env.MANARA_SUPABASE_URL || 'https://yvfyvanvkjrgapufatnn.supabase.co';
const SUPABASE_ANON_KEY = process.env.MANARA_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Znl2YW52a2pyZ2FwdWZhdG5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MzU3OTcsImV4cCI6MjA5NDAxMTc5N30.yx8R7ZpkUWj52cEfaNNtU0uaUrw_QS9lNRNAg-sUsPo';
const SUPABASE_PUBLIC_REST = SUPABASE_URL +
  '/rest/v1/cloud_iptv_channels?select=id,name,url,logo_url,category,headers,transfer_limit_bytes,is_active,sort_order&is_active=eq.true&order=sort_order.asc';
const REFRESH_MS = 60 * 60 * 1000; // 1h
let runtimeConfig = {};
try { runtimeConfig = require('./cloud-runtime.cjs'); } catch {}
let neonDatabaseUrl = process.env.MANARA_NEON_DATABASE_URL || runtimeConfig.neonDatabaseUrl || '';

let cachePath = null;
let cached = []; // [{id,name,url,logo,category,headers}]
let lastFetch = 0;
let lastStatus = { state: 'idle', at: null, error: '', count: 0, source: '' };
let timer = null;

function setCachePath(p) {
  cachePath = p;
  try {
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(j.channels)) cached = j.channels;
      if (j.lastFetch) lastFetch = j.lastFetch;
    }
  } catch (e) { console.error('[cloud-iptv] cache read', e.message); }
}

function persist() {
  if (!cachePath) return;
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const tmp = cachePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ channels: cached, lastFetch }, null, 2));
    fs.renameSync(tmp, cachePath);
  }
  catch (e) { console.error('[cloud-iptv] cache write', e.message); }
}

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Manara/2.4.2', ...headers } }, (res) => {
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
  const sql = neon(neonDatabaseUrl);
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

async function refresh(licenseKey) {
  const failures = [];
  try {
    const rows = await fetchFromNeon();
    if (Array.isArray(rows)) {
      if (rows.length === 0) throw new Error('Neon returned zero active IPTV channels');
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

  try {
    const url = CLOUD_REST + (licenseKey ? `?license_key=${encodeURIComponent(licenseKey)}` : '');
    const payload = await fetchJson(url, licenseKey ? { 'X-License-Key': licenseKey } : {});
    const rows = Array.isArray(payload) ? payload : payload.channels;
    if (Array.isArray(rows)) {
      const normalized = normalizeRows(rows);
      if (normalized.length === 0) throw new Error('public endpoint returned zero IPTV channels');
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

  try {
    const rows = await fetchJson(SUPABASE_PUBLIC_REST, {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    });
    if (Array.isArray(rows)) {
      const normalized = normalizeRows(rows);
      if (normalized.length === 0) throw new Error('Supabase REST returned zero IPTV channels');
      cached = normalized;
      lastFetch = Date.now();
      lastStatus = { state: 'ok', at: new Date().toISOString(), error: '', count: cached.length, source: 'supabase-rest' };
      persist();
      console.log('[cloud-iptv] refreshed from Supabase REST', cached.length, 'channels');
    }
    return cached;
  } catch (e) {
    failures.push(`supabase rest: ${e.message}`);
  }

  lastStatus = { state: 'error', at: new Date().toISOString(), error: failures.join(' | '), count: cached.length, source: 'cache' };
  console.error('[cloud-iptv] refresh failed', lastStatus.error);
  return cached;
}

function startAutoRefresh(getLicenseKey) {
  if (timer) clearInterval(timer);
  // First fetch shortly after start
  setTimeout(() => refresh(getLicenseKey()), 5000);
  timer = setInterval(() => refresh(getLicenseKey()), REFRESH_MS);
}

function list() {
  // Return channels with cloud- prefix so they don't collide with local sqlite ids
  return cached.map((c) => ({
    id: `cloud-${c.id}`,
    name: c.name,
    url: c.url,
    logo: c.logo || '',
    category: c.category || '',
    transferLimitBytes: Math.max(0, Number(c.transferLimitBytes) || 0),
    enabled: 1,
    source: 'cloud',
  }));
}

function status() {
  return { ...lastStatus, lastFetch };
}

function getById(id) {
  // id is the raw cloud uuid (without prefix)
  return cached.find((c) => String(c.id) === String(id)) || null;
}

module.exports = { setCachePath, setNeonDatabaseUrl, refresh, startAutoRefresh, list, getById, status };
