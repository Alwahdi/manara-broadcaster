// WIVA — IPTV proxy with reference-counted upstream
// ------------------------------------------------------------
// Goal: for each IPTV channel, only open ONE upstream connection
// to the provider while at least one LAN viewer is watching.
// When the last viewer disconnects we wait a short grace period
// (5s) and then close the upstream — so the app stops pulling
// internet entirely until someone tunes in again.
//
// Supports two stream types:
//   - HLS (.m3u8): playlist + segments are proxied. Each request
//     resets an idle timer; once idle, no further upstream calls
//     happen until the player reconnects.
//   - MPEG-TS / raw: single upstream connection is fan-out via
//     PassThrough to all connected client responses.

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

const TS_CHANNELS = new Map(); // id -> { clients:Set<res>, upstreamReq, idleTimer, contentType }
const HLS_IDLE = new Map();    // id -> { lastHit, idleTimer }
const METRICS = new Map();     // id -> detailed transfer/viewer counters
const HLS_RESOURCE_CACHE = new Map(); // key -> { expiresAt, value, promise, channelId, bytes }
const HLS_URI_TOKENS = new Map(); // token -> { url, channelId, expiresAt }

const DEFAULT_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const UA = { 'User-Agent': DEFAULT_BROWSER_UA };
const IDLE_MS = 5000;
const HLS_VIEWER_TTL_MS = 25000;
const RATE_WINDOW_MS = 30000;
const HLS_PLAYLIST_CACHE_MS = 1200;
const HLS_SEGMENT_CACHE_MS = 2 * 60 * 1000;
const HLS_PLAYLIST_STALE_MS = 12 * 1000;
const HLS_SEGMENT_STALE_MS = 10 * 60 * 1000;
const HLS_URI_TOKEN_TTL_MS = 10 * 60 * 1000;
const HLS_CACHE_MAX = 900;
const HLS_CACHE_MAX_BYTES = 192 * 1024 * 1024;
const HLS_CACHEABLE_MAX_BYTES = 32 * 1024 * 1024;
const CLIENT_CHUNK_BYTES = 128 * 1024;
const SLOW_CLIENT_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const SLOW_CLIENT_DRAIN_MS = 8000;
const UPSTREAM_TIMEOUT_MS = 25000;
const MAX_REDIRECTS = 5;

function libFor(u) { return u.startsWith('https') ? https : http; }

function isHls(url) { return /\.m3u8(\?|$)/i.test(url); }

function metrics(id, type = 'unknown') {
  const key = String(id);
  let m = METRICS.get(key);
  if (!m) {
    m = {
      id: key,
      type,
      startedAt: Date.now(),
      lastActivityAt: 0,
      upstreamOpen: false,
      activeViewers: 0,
      peakViewers: 0,
      totalViewerSessions: 0,
      totalUpstreamBytes: 0,
      totalDownstreamBytes: 0,
      upstreamRequests: 0,
      playlistRequests: 0,
      segmentRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheCoalesced: 0,
      cacheEvictions: 0,
      slowClientsDropped: 0,
      errors: 0,
      lastError: '',
      lastStatusCode: 0,
      rateEvents: [],
      hlsViewers: new Map(),
    };
    METRICS.set(key, m);
  }
  if (type && m.type === 'unknown') m.type = type;
  return m;
}

function pruneRates(m) {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  m.rateEvents = m.rateEvents.filter((e) => e.at >= cutoff);
}

function addBytes(id, upstreamBytes = 0, downstreamBytes = 0) {
  const m = metrics(id);
  const at = Date.now();
  m.lastActivityAt = at;
  m.totalUpstreamBytes += upstreamBytes;
  m.totalDownstreamBytes += downstreamBytes;
  if (upstreamBytes || downstreamBytes) m.rateEvents.push({ at, upstreamBytes, downstreamBytes });
  pruneRates(m);
}

function markError(id, message, statusCode = 0) {
  const m = metrics(id);
  m.errors += 1;
  m.lastError = String(message || '').slice(0, 500);
  m.lastStatusCode = statusCode || 0;
  m.lastActivityAt = Date.now();
}

function setViewers(id, count) {
  const m = metrics(id);
  m.activeViewers = Math.max(0, count || 0);
  m.peakViewers = Math.max(m.peakViewers, m.activeViewers);
}

function touchHlsViewer(channel, req) {
  const m = metrics(channel.id, 'hls');
  const key = `${req.socket.remoteAddress || 'unknown'}|${req.headers['user-agent'] || ''}`;
  if (!m.hlsViewers.has(key)) m.totalViewerSessions += 1;
  m.hlsViewers.set(key, Date.now() + HLS_VIEWER_TTL_MS);
  for (const [viewerKey, expiresAt] of m.hlsViewers) {
    if (expiresAt < Date.now()) m.hlsViewers.delete(viewerKey);
  }
  setViewers(channel.id, m.hlsViewers.size);
}

function snapshotMetrics(id) {
  const m = metrics(id);
  pruneRates(m);
  const upstreamWindowBytes = m.rateEvents.reduce((sum, e) => sum + e.upstreamBytes, 0);
  const downstreamWindowBytes = m.rateEvents.reduce((sum, e) => sum + e.downstreamBytes, 0);
  const seconds = RATE_WINDOW_MS / 1000;
  const cache = hlsCacheStatsFor(id);
  const cacheTotal = m.cacheHits + m.cacheMisses;
  return {
    id: m.id,
    type: m.type,
    viewers: m.activeViewers,
    peakViewers: m.peakViewers,
    totalViewerSessions: m.totalViewerSessions,
    upstreamOpen: !!m.upstreamOpen,
    totalUpstreamBytes: m.totalUpstreamBytes,
    totalDownstreamBytes: m.totalDownstreamBytes,
    upstreamKbps: Math.round((upstreamWindowBytes * 8) / seconds / 1000),
    downstreamKbps: Math.round((downstreamWindowBytes * 8) / seconds / 1000),
    upstreamRequests: m.upstreamRequests,
    playlistRequests: m.playlistRequests,
    segmentRequests: m.segmentRequests,
    cacheHits: m.cacheHits,
    cacheMisses: m.cacheMisses,
    cacheCoalesced: m.cacheCoalesced,
    cacheEvictions: m.cacheEvictions,
    cacheHitRate: cacheTotal ? Math.round((m.cacheHits / cacheTotal) * 100) : 0,
    cacheEntries: cache.entries,
    cacheBytes: cache.bytes,
    slowClientsDropped: m.slowClientsDropped,
    errors: m.errors,
    lastError: m.lastError,
    lastStatusCode: m.lastStatusCode,
    lastActivityAt: m.lastActivityAt,
    uptimeMs: Date.now() - m.startedAt,
  };
}

function safeHeaderObject(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const name = String(key || '').trim();
    if (!name || /[\r\n:]/.test(name)) continue;
    const text = String(value ?? '').replace(/[\r\n]/g, ' ').trim();
    if (text) out[name] = text;
  }
  return out;
}

function upstreamHeaders(channel, extra = {}) {
  return { ...UA, ...safeHeaderObject(channel.headers), ...safeHeaderObject(extra) };
}

function explainHttp(statusCode, targetUrl) {
  if (statusCode === 401 || statusCode === 403) return `The IPTV provider rejected the request (${statusCode}). This URL may need a token, user-agent, referrer, subscription login, or it may be geo-blocked. URL: ${targetUrl}`;
  if (statusCode === 404) return `The IPTV provider returned 404 Not Found. The stream URL is wrong, expired, or removed. URL: ${targetUrl}`;
  if (statusCode === 410) return `The IPTV provider says this stream is gone (410). The URL is expired or no longer available. URL: ${targetUrl}`;
  if (statusCode === 429) return `The IPTV provider is rate-limiting this stream (429). Wait and try again, or check provider limits. URL: ${targetUrl}`;
  if (statusCode >= 500) return `The IPTV provider server failed (${statusCode}). Try again later or test the source URL directly. URL: ${targetUrl}`;
  return `The IPTV provider returned HTTP ${statusCode}. URL: ${targetUrl}`;
}

function noContentMessage(targetUrl) {
  return `No broadcast content is available right now. The IPTV provider responded, but this channel has no playable HLS segments or quality variants at the moment. Try another quality or check again later. URL: ${targetUrl}`;
}

function playlistContentIssue(body, targetUrl) {
  const text = String(body || '').replace(/^\uFEFF/, '').trim();
  if (!text) return noContentMessage(targetUrl);
  if (!text.startsWith('#EXTM3U')) {
    return `The IPTV provider responded, but it did not return a playable HLS playlist. This can happen when an error page, login page, or empty response is returned instead of video. URL: ${targetUrl}`;
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const uriLines = lines.filter((line) => !line.startsWith('#'));
  const hasReferencedUri = uriLines.length > 0 || /URI="[^"]+"/i.test(text);
  const expectsMedia = /#EXTINF|#EXT-X-STREAM-INF|#EXT-X-MEDIA/i.test(text);
  if (!hasReferencedUri && !expectsMedia) return noContentMessage(targetUrl);
  if (!hasReferencedUri && /#EXT-X-ENDLIST/i.test(text)) return noContentMessage(targetUrl);
  return '';
}

function sendIptvError(res, statusCode, message) {
  if (res.headersSent) {
    try { res.end(message); } catch {}
    return;
  }
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'X-Manara-Error',
    'X-Manara-Error': encodeURIComponent(message).slice(0, 900),
  });
  res.end(message);
}

function writeBufferToClient(channel, res, body) {
  return new Promise((resolve) => {
    if (!body || !body.length) { res.end(); resolve(true); return; }
    let offset = 0;
    let settled = false;
    function finish(ok) {
      if (settled) return;
      settled = true;
      resolve(ok);
    }
    function closeSlowClient() {
      metrics(channel.id).slowClientsDropped += 1;
      try { res.destroy(new Error('slow client')); } catch {}
      finish(false);
    }
    function pump() {
      if (settled || res.destroyed || res.writableEnded) return finish(false);
      while (offset < body.length) {
        if (Number(res.writableLength) > SLOW_CLIENT_MAX_BUFFER_BYTES) return closeSlowClient();
        const next = Math.min(offset + CLIENT_CHUNK_BYTES, body.length);
        const ok = res.write(body.subarray(offset, next));
        offset = next;
        if (!ok) {
          const timer = setTimeout(closeSlowClient, SLOW_CLIENT_DRAIN_MS);
          res.once('drain', () => {
            clearTimeout(timer);
            setImmediate(pump);
          });
          return;
        }
      }
      try { res.end(); } catch {}
      finish(true);
    }
    res.once('close', () => finish(false));
    pump();
  });
}

function formatLimitBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function limitMessage(channel, limitBytes, usedBytes) {
  return `IPTV transfer limit reached for "${channel.name || channel.id}". Limit: ${formatLimitBytes(limitBytes)}, used: ${formatLimitBytes(usedBytes || 0)}. The local server stopped this stream automatically.`;
}

function activeLimit(channel, policy = {}) {
  const channelLimit = Math.max(0, Number(channel.transferLimitBytes) || 0);
  const globalLimit = Math.max(0, Number(policy.iptvGlobalLimitBytes) || 0);
  if (channelLimit && globalLimit) return Math.min(channelLimit, globalLimit);
  return channelLimit || globalLimit || 0;
}

function limitExceeded(channel, policy = {}) {
  const limit = activeLimit(channel, policy);
  if (!limit) return null;
  const used = metrics(channel.id).totalUpstreamBytes;
  return used >= limit ? { limit, used, message: limitMessage(channel, limit, used) } : null;
}

// ---- TS / raw fan-out ----
function tsState(id) {
  metrics(id, 'ts');
  let s = TS_CHANNELS.get(id);
  if (!s) {
    s = { clients: new Set(), upstreamReq: null, upstreamRes: null, idleTimer: null, contentType: 'video/mp2t' };
    TS_CHANNELS.set(id, s);
  }
  return s;
}

function redirectUrl(targetUrl, location) {
  try { return new URL(location, targetUrl).toString(); }
  catch { return ''; }
}

function startTsUpstream(channel, s, policy = {}, targetUrl = channel.url, redirects = 0) {
  if (s.upstreamReq) return;
  const blocked = limitExceeded(channel, policy);
  if (blocked) {
    markError(channel.id, blocked.message, 429);
    for (const c of s.clients) sendIptvError(c, 429, blocked.message);
    return;
  }
  const m = metrics(channel.id, 'ts');
  m.upstreamRequests += 1;
  m.upstreamOpen = true;
  const u = new URL(targetUrl);
  console.log('[IPTV][TS] open upstream', channel.id, u.host);
  const req = libFor(targetUrl).get(targetUrl, { headers: upstreamHeaders(channel) }, (up) => {
    if ([301, 302, 303, 307, 308].includes(up.statusCode || 0) && up.headers.location && redirects < MAX_REDIRECTS) {
      const nextUrl = redirectUrl(targetUrl, up.headers.location);
      try { up.resume(); } catch {}
      s.upstreamReq = null; s.upstreamRes = null;
      if (nextUrl) return startTsUpstream(channel, s, policy, nextUrl, redirects + 1);
    }
    if (up.statusCode && up.statusCode >= 400) {
      const message = explainHttp(up.statusCode, targetUrl);
      markError(channel.id, message, up.statusCode);
      console.error('[IPTV][TS] upstream HTTP', channel.id, message);
      for (const c of s.clients) sendIptvError(c, 502, message);
      try { up.resume(); } catch {}
      s.upstreamReq = null; s.upstreamRes = null;
      return;
    }
    s.upstreamRes = up;
    s.contentType = up.headers['content-type'] || 'video/mp2t';
    for (const c of s.clients) {
      if (!c.headersSent) {
        try { c.writeHead(200, { 'Content-Type': s.contentType, 'Cache-Control': 'no-cache' }); } catch {}
      }
    }
    up.on('data', (chunk) => {
      addBytes(channel.id, chunk.length, chunk.length * s.clients.size);
      const blockedNow = limitExceeded(channel, policy);
      if (blockedNow) {
        markError(channel.id, blockedNow.message, 429);
        for (const c of s.clients) sendIptvError(c, 429, blockedNow.message);
        stopTsUpstream(channel, s);
        return;
      }
      for (const c of s.clients) {
        try {
          if (c.destroyed || c.writableEnded) continue;
          const ok = c.write(chunk);
          if (!ok && Number(c.writableLength) > SLOW_CLIENT_MAX_BUFFER_BYTES) {
            metrics(channel.id).slowClientsDropped += 1;
            c.destroy(new Error('slow client'));
          }
        } catch {}
      }
    });
    up.on('end', () => stopTsUpstream(channel, s));
    up.on('error', () => stopTsUpstream(channel, s));
  });
  req.on('error', (e) => {
    const message = e.message === 'timeout'
      ? `Timed out while connecting to the IPTV provider. Check the URL or provider availability: ${targetUrl}`
      : `Could not connect to the IPTV provider: ${e.message}. URL: ${targetUrl}`;
    console.error('[IPTV][TS] upstream error', channel.id, message);
    markError(channel.id, message);
    for (const c of s.clients) sendIptvError(c, 502, message);
    s.upstreamReq = null; s.upstreamRes = null;
    metrics(channel.id, 'ts').upstreamOpen = false;
  });
  req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  s.upstreamReq = req;
}

function stopTsUpstream(channel, s) {
  if (!s.upstreamReq && !s.upstreamRes) return;
  console.log('[IPTV][TS] close upstream', channel.id);
  try { s.upstreamRes && s.upstreamRes.destroy(); } catch {}
  try { s.upstreamReq && s.upstreamReq.destroy(); } catch {}
  s.upstreamReq = null; s.upstreamRes = null;
  metrics(channel.id, 'ts').upstreamOpen = false;
}

function serveTs(channel, req, res, policy = {}) {
  const blocked = limitExceeded(channel, policy);
  if (blocked) {
    markError(channel.id, blocked.message, 429);
    sendIptvError(res, 429, blocked.message);
    return;
  }
  const s = tsState(channel.id);
  const m = metrics(channel.id, 'ts');
  m.totalViewerSessions += 1;
  if (s.idleTimer) { clearTimeout(s.idleTimer); s.idleTimer = null; }
  s.clients.add(res);
  setViewers(channel.id, s.clients.size);
  if (s.upstreamRes && !res.headersSent) {
    try { res.writeHead(200, { 'Content-Type': s.contentType, 'Cache-Control': 'no-cache' }); } catch {}
  }
  if (!s.upstreamReq) startTsUpstream(channel, s, policy);
  const cleanup = () => {
    if (!s.clients.has(res)) return;
    s.clients.delete(res);
    setViewers(channel.id, s.clients.size);
    console.log('[IPTV][TS] client left', channel.id, 'remaining=', s.clients.size);
    if (s.clients.size === 0) {
      s.idleTimer = setTimeout(() => { stopTsUpstream(channel, s); s.idleTimer = null; }, IDLE_MS);
      if (typeof s.idleTimer.unref === 'function') s.idleTimer.unref();
    }
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
}

// ---- HLS proxy ----
function fetchUpstream(targetUrl, headers = UA, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = libFor(targetUrl).get(targetUrl, { headers }, (up) => {
      if ([301, 302, 303, 307, 308].includes(up.statusCode || 0) && up.headers.location && redirects < MAX_REDIRECTS) {
        const nextUrl = redirectUrl(targetUrl, up.headers.location);
        try { up.resume(); } catch {}
        if (nextUrl) {
          fetchUpstream(nextUrl, headers, redirects + 1).then(resolve, reject);
          return;
        }
      }
      resolve(up);
    });
    req.on('error', reject);
    req.setTimeout(UPSTREAM_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
  });
}

async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

function pruneHlsCache() {
  const now = Date.now();
  for (const [key, entry] of HLS_RESOURCE_CACHE) {
    const keepUntil = Number(entry.staleUntil || entry.expiresAt || 0);
    if (!entry.promise && keepUntil <= now) evictHlsCacheEntry(key);
  }
  while (HLS_RESOURCE_CACHE.size > HLS_CACHE_MAX) {
    const first = HLS_RESOURCE_CACHE.keys().next().value;
    if (!first) break;
    evictHlsCacheEntry(first);
  }
  while (hlsCacheBytes() > HLS_CACHE_MAX_BYTES) {
    let evicted = false;
    for (const [key, entry] of HLS_RESOURCE_CACHE) {
      if (entry.promise) continue;
      evictHlsCacheEntry(key);
      evicted = true;
      break;
    }
    if (!evicted) break;
  }
}

function evictHlsCacheEntry(key) {
  const entry = HLS_RESOURCE_CACHE.get(key);
  if (entry?.channelId) metrics(entry.channelId).cacheEvictions += 1;
  HLS_RESOURCE_CACHE.delete(key);
}

function hlsCacheBytes() {
  let bytes = 0;
  for (const entry of HLS_RESOURCE_CACHE.values()) bytes += Number(entry.bytes) || 0;
  return bytes;
}

function hlsCacheStatsFor(id) {
  const channelId = String(id);
  let entries = 0;
  let bytes = 0;
  for (const entry of HLS_RESOURCE_CACHE.values()) {
    if (String(entry.channelId) !== channelId) continue;
    entries += 1;
    bytes += Number(entry.bytes) || 0;
  }
  return { entries, bytes };
}

function pruneHlsUriTokens() {
  const now = Date.now();
  for (const [token, row] of HLS_URI_TOKENS) {
    if (!row || row.expiresAt <= now) HLS_URI_TOKENS.delete(token);
  }
}

function registerHlsUri(channelId, absoluteUrl) {
  pruneHlsUriTokens();
  const id = String(channelId);
  const url = String(absoluteUrl || '');
  const token = crypto
    .createHash('sha256')
    .update(id)
    .update('\0')
    .update(url)
    .digest('base64url')
    .slice(0, 36);
  HLS_URI_TOKENS.set(token, { url, channelId: id, expiresAt: Date.now() + HLS_URI_TOKEN_TTL_MS });
  return token;
}

function resolveHlsUri(channelId, token) {
  pruneHlsUriTokens();
  const row = HLS_URI_TOKENS.get(String(token || ''));
  if (!row || String(row.channelId) !== String(channelId)) return '';
  row.expiresAt = Date.now() + HLS_URI_TOKEN_TTL_MS;
  return row.url;
}

function hlsTokenStatsFor(id) {
  pruneHlsUriTokens();
  const channelId = String(id);
  let entries = 0;
  for (const row of HLS_URI_TOKENS.values()) {
    if (String(row.channelId) === channelId) entries += 1;
  }
  return { entries };
}

async function fetchCachedHlsResource(channel, targetUrl, headers, ttlMs, staleMs = ttlMs) {
  pruneHlsCache();
  const rangeKey = headers?.Range || headers?.range || '';
  const key = `${channel.id}|${rangeKey}|${targetUrl}`;
  const now = Date.now();
  const existing = HLS_RESOURCE_CACHE.get(key);
  if (existing?.value && existing.expiresAt > now) {
    metrics(channel.id, 'hls').cacheHits += 1;
    HLS_RESOURCE_CACHE.delete(key);
    HLS_RESOURCE_CACHE.set(key, existing);
    return { ...existing.value, fromCache: true };
  }
  const staleValue = existing?.value && Number(existing.staleUntil || 0) > now ? existing.value : null;
  if (existing?.promise) {
    metrics(channel.id, 'hls').cacheCoalesced += 1;
    try {
      const value = await existing.promise;
      return { ...value, fromCache: true };
    } catch (e) {
      const pendingStale = existing.value && Number(existing.staleUntil || 0) > now ? existing.value : null;
      if (pendingStale) {
        metrics(channel.id, 'hls').cacheHits += 1;
        return { ...pendingStale, fromCache: true, stale: true };
      }
      throw e;
    }
  }
  const m = metrics(channel.id, 'hls');
  m.cacheMisses += 1;
  m.upstreamRequests += 1;
  m.upstreamOpen = true;
  const promise = (async () => {
    const up = await fetchUpstream(targetUrl, headers);
    const body = up.statusCode && up.statusCode >= 400 ? Buffer.alloc(0) : await readAll(up);
    if (up.statusCode && up.statusCode >= 400) {
      try { up.resume(); } catch {}
    }
    return {
      statusCode: up.statusCode || 200,
      headers: up.headers || {},
      body,
    };
  })();
  HLS_RESOURCE_CACHE.set(key, {
    expiresAt: now + ttlMs,
    staleUntil: now + ttlMs + staleMs,
    promise,
    value: staleValue || undefined,
    channelId: String(channel.id),
    bytes: staleValue && Buffer.isBuffer(staleValue.body) ? staleValue.body.length : 0,
  });
  try {
    const value = await promise;
    if (value.statusCode >= 400) {
      if (staleValue) {
        m.cacheHits += 1;
        HLS_RESOURCE_CACHE.set(key, {
          expiresAt: Date.now() + Math.min(ttlMs, 1000),
          staleUntil: Date.now() + staleMs,
          value: staleValue,
          channelId: String(channel.id),
          bytes: Buffer.isBuffer(staleValue.body) ? staleValue.body.length : 0,
        });
        return { ...staleValue, fromCache: true, stale: true };
      }
      HLS_RESOURCE_CACHE.delete(key);
      return { ...value, fromCache: false };
    }
    const bytes = Buffer.isBuffer(value.body) ? value.body.length : 0;
    if (bytes > HLS_CACHEABLE_MAX_BYTES) {
      HLS_RESOURCE_CACHE.delete(key);
      return { ...value, fromCache: false };
    }
    HLS_RESOURCE_CACHE.set(key, {
      expiresAt: Date.now() + ttlMs,
      staleUntil: Date.now() + ttlMs + staleMs,
      value,
      channelId: String(channel.id),
      bytes,
    });
    pruneHlsCache();
    return { ...value, fromCache: false };
  } catch (e) {
    if (staleValue) {
      m.cacheHits += 1;
      HLS_RESOURCE_CACHE.set(key, {
        expiresAt: Date.now() + Math.min(ttlMs, 1000),
        staleUntil: Date.now() + staleMs,
        value: staleValue,
        channelId: String(channel.id),
        bytes: Buffer.isBuffer(staleValue.body) ? staleValue.body.length : 0,
      });
      return { ...staleValue, fromCache: true, stale: true };
    }
    HLS_RESOURCE_CACHE.delete(key);
    throw e;
  }
}

function touchHls(id) {
  const s = HLS_IDLE.get(id) || { lastHit: 0, idleTimer: null };
  s.lastHit = Date.now();
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => {
    console.log('[IPTV][HLS] idle, no viewer for', id);
    const m = metrics(id, 'hls');
    m.upstreamOpen = false;
    m.activeViewers = 0;
    m.hlsViewers.clear();
    HLS_IDLE.delete(id);
  }, IDLE_MS * 3);
  if (typeof s.idleTimer.unref === 'function') s.idleTimer.unref();
  HLS_IDLE.set(id, s);
}

function rewritePlaylist(body, playlistUrl, baseProxyUrl, channelId) {
  const base = new URL(playlistUrl);
  return body.split(/\r?\n/).map((line) => {
    if (!line || line.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
        const abs = new URL(uri, base).toString();
        const token = registerHlsUri(channelId, abs);
        return `URI="${baseProxyUrl}/seg?t=${encodeURIComponent(token)}"`;
      });
    }
    const abs = new URL(line.trim(), base).toString();
    const token = registerHlsUri(channelId, abs);
    return `${baseProxyUrl}/seg?t=${encodeURIComponent(token)}`;
  }).join('\n');
}

function isPlaylistResponse(targetUrl, contentType, body) {
  return isHls(targetUrl) ||
    /mpegurl|vnd\.apple\.mpegurl/i.test(contentType || '') ||
    body.slice(0, 512).toString('utf8').trimStart().startsWith('#EXTM3U');
}

async function serveHlsPlaylist(channel, playlistUrl, baseProxyUrl, req, res, policy = {}) {
  try {
    const blocked = limitExceeded(channel, policy);
    if (blocked) {
      markError(channel.id, blocked.message, 429);
      sendIptvError(res, 429, blocked.message);
      return;
    }
    touchHls(channel.id);
    touchHlsViewer(channel, req);
    const m = metrics(channel.id, 'hls');
    m.playlistRequests += 1;
    const up = await fetchCachedHlsResource(channel, playlistUrl, upstreamHeaders(channel), HLS_PLAYLIST_CACHE_MS, HLS_PLAYLIST_STALE_MS);
    if (up.statusCode && up.statusCode >= 400) {
      const message = explainHttp(up.statusCode, playlistUrl);
      markError(channel.id, message, up.statusCode);
      sendIptvError(res, 502, message);
      return;
    }
    const body = up.body.toString('utf8');
    const issue = playlistContentIssue(body, playlistUrl);
    if (issue) {
      markError(channel.id, issue, 503);
      sendIptvError(res, 503, issue);
      return;
    }
    const rewritten = rewritePlaylist(body, playlistUrl, baseProxyUrl, channel.id);
    addBytes(channel.id, up.fromCache ? 0 : Buffer.byteLength(body), Buffer.byteLength(rewritten));
    const blockedNow = limitExceeded(channel, policy);
    if (blockedNow) {
      markError(channel.id, blockedNow.message, 429);
      metrics(channel.id, 'hls').upstreamOpen = false;
      sendIptvError(res, 429, blockedNow.message);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(rewritten);
  } catch (e) {
    const message = e.message === 'timeout'
      ? `Timed out while loading the IPTV playlist. URL: ${playlistUrl}`
      : `Could not load the IPTV playlist: ${e.message}. URL: ${playlistUrl}`;
    console.error('[IPTV][HLS] playlist error', message);
    markError(channel.id, message);
    sendIptvError(res, 502, message);
  }
}

async function serveHlsSegment(channel, segUrl, baseProxyUrl, req, res, policy = {}) {
  try {
    const blocked = limitExceeded(channel, policy);
    if (blocked) {
      markError(channel.id, blocked.message, 429);
      sendIptvError(res, 429, blocked.message);
      return;
    }
    touchHls(channel.id);
    touchHlsViewer(channel, req);
    const m = metrics(channel.id, 'hls');
    m.segmentRequests += 1;
    const extra = req.headers.range ? { Range: req.headers.range } : {};
    const ttl = isHls(segUrl) ? HLS_PLAYLIST_CACHE_MS : HLS_SEGMENT_CACHE_MS;
    const staleTtl = isHls(segUrl) ? HLS_PLAYLIST_STALE_MS : HLS_SEGMENT_STALE_MS;
    const up = await fetchCachedHlsResource(channel, segUrl, upstreamHeaders(channel, extra), ttl, staleTtl);
    if (up.statusCode && up.statusCode >= 400) {
      const message = explainHttp(up.statusCode, segUrl);
      markError(channel.id, message, up.statusCode);
      sendIptvError(res, 502, message);
      return;
    }
    const contentType = up.headers['content-type'] || '';
    const body = up.body;
    if (isPlaylistResponse(segUrl, contentType, body)) {
      const bodyText = body.toString('utf8');
      const issue = playlistContentIssue(bodyText, segUrl);
      if (issue) {
        markError(channel.id, issue, 503);
        sendIptvError(res, 503, issue);
        return;
      }
      const rewritten = rewritePlaylist(bodyText, segUrl, baseProxyUrl, channel.id);
      addBytes(channel.id, up.fromCache ? 0 : body.length, Buffer.byteLength(rewritten));
      const blockedNow = limitExceeded(channel, policy);
      if (blockedNow) {
        markError(channel.id, blockedNow.message, 429);
        metrics(channel.id, 'hls').upstreamOpen = false;
        sendIptvError(res, 429, blockedNow.message);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(rewritten);
      return;
    }
    if (!body.length) {
      const issue = noContentMessage(segUrl);
      markError(channel.id, issue, 503);
      sendIptvError(res, 503, issue);
      return;
    }
    addBytes(channel.id, up.fromCache ? 0 : body.length, body.length);
    const blockedNow = limitExceeded(channel, policy);
    if (blockedNow) {
      markError(channel.id, blockedNow.message, 429);
      metrics(channel.id, 'hls').upstreamOpen = false;
      sendIptvError(res, 429, blockedNow.message);
      return;
    }
    const headers = {
      'Content-Type': contentType || 'video/mp2t',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    };
    if (up.headers['content-length']) headers['Content-Length'] = up.headers['content-length'];
    if (up.headers['content-range']) headers['Content-Range'] = up.headers['content-range'];
    if (up.headers['accept-ranges']) headers['Accept-Ranges'] = up.headers['accept-ranges'];
    res.writeHead(up.statusCode || 200, headers);
    await writeBufferToClient(channel, res, body);
  } catch (e) {
    const message = e.message === 'timeout'
      ? `Timed out while loading an IPTV segment. URL: ${segUrl}`
      : `Could not load an IPTV segment: ${e.message}. URL: ${segUrl}`;
    console.error('[IPTV][HLS] segment error', message);
    markError(channel.id, message);
    sendIptvError(res, 502, message);
  }
}

// ---- Public entry called from media-server ----
async function handleRequest(channel, subPath, query, req, res, baseProxyUrl, policy = {}) {
  if (isHls(channel.url)) {
    if (subPath === 'seg') {
      const segUrl = resolveHlsUri(channel.id, query.t);
      if (!segUrl) {
        const message = 'Invalid or expired IPTV segment token. Refresh the channel and try again.';
        markError(channel.id, message, 400);
        sendIptvError(res, 400, message);
        return;
      }
      return serveHlsSegment(channel, segUrl, baseProxyUrl, req, res, policy);
    }
    return serveHlsPlaylist(channel, channel.url, baseProxyUrl, req, res, policy);
  }
  return serveTs(channel, req, res, policy);
}

function status() {
  const out = {};
  for (const [id, s] of TS_CHANNELS) {
    const snap = snapshotMetrics(id);
    out[id] = { ...snap, viewers: s.clients.size, upstreamOpen: !!s.upstreamReq };
  }
  for (const [id, s] of HLS_IDLE) {
    const snap = snapshotMetrics(id);
    out[id] = out[id] || snap;
    out[id].lastHitMs = Date.now() - s.lastHit;
  }
  for (const [id] of METRICS) {
    if (!out[id]) out[id] = snapshotMetrics(id);
    out[id].hlsTokenEntries = hlsTokenStatsFor(id).entries;
  }
  return out;
}

// Probe a URL — fetch a few bytes/playlist to confirm it's reachable.
async function probe(channelUrl, headers = {}) {
  try {
    const up = await fetchUpstream(channelUrl, upstreamHeaders({ headers }));
    const ct = up.headers['content-type'] || '';
    const status = up.statusCode || 0;
    if (status >= 400) {
      try { up.resume(); } catch {}
      return { ok: false, status, contentType: ct, error: explainHttp(status, channelUrl) };
    }
    if (isHls(channelUrl)) {
      const buf = await readAll(up);
      return { ok: status < 400, status, contentType: ct, bytes: buf.length, hls: true };
    }
    // For TS, read first chunk then close
    return await new Promise((resolve) => {
      let bytes = 0;
      up.on('data', (c) => {
        bytes += c.length;
        if (bytes > 64 * 1024) { try { up.destroy(); } catch {} resolve({ ok: status < 400, status, contentType: ct, bytes, hls: false }); }
      });
      up.on('end', () => resolve({ ok: status < 400, status, contentType: ct, bytes, hls: false }));
      up.on('error', (e) => resolve({ ok: false, error: e.message }));
      setTimeout(() => { try { up.destroy(); } catch {} resolve({ ok: status < 400, status, contentType: ct, bytes, hls: false }); }, 5000);
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { handleRequest, status, probe, isHls };
