// Manara — IPTV proxy with reference-counted upstream
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
const { URL } = require('url');

const TS_CHANNELS = new Map(); // id -> { clients:Set<res>, upstreamReq, idleTimer, contentType }
const HLS_IDLE = new Map();    // id -> { lastHit, idleTimer }
const METRICS = new Map();     // id -> detailed transfer/viewer counters
const HLS_RESOURCE_CACHE = new Map(); // key -> { expiresAt, value, promise }

const UA = { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' };
const IDLE_MS = 5000;
const HLS_VIEWER_TTL_MS = 25000;
const RATE_WINDOW_MS = 30000;
const HLS_PLAYLIST_CACHE_MS = 1200;
const HLS_SEGMENT_CACHE_MS = 2 * 60 * 1000;
const HLS_CACHE_MAX = 900;

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
    errors: m.errors,
    lastError: m.lastError,
    lastStatusCode: m.lastStatusCode,
    lastActivityAt: m.lastActivityAt,
    uptimeMs: Date.now() - m.startedAt,
  };
}

function upstreamHeaders(channel, extra = {}) {
  return { ...UA, ...(channel.headers || {}), ...extra };
}

function explainHttp(statusCode, targetUrl) {
  if (statusCode === 401 || statusCode === 403) return `The IPTV provider rejected the request (${statusCode}). This URL may need a token, user-agent, referrer, subscription login, or it may be geo-blocked. URL: ${targetUrl}`;
  if (statusCode === 404) return `The IPTV provider returned 404 Not Found. The stream URL is wrong, expired, or removed. URL: ${targetUrl}`;
  if (statusCode === 410) return `The IPTV provider says this stream is gone (410). The URL is expired or no longer available. URL: ${targetUrl}`;
  if (statusCode === 429) return `The IPTV provider is rate-limiting this stream (429). Wait and try again, or check provider limits. URL: ${targetUrl}`;
  if (statusCode >= 500) return `The IPTV provider server failed (${statusCode}). Try again later or test the source URL directly. URL: ${targetUrl}`;
  return `The IPTV provider returned HTTP ${statusCode}. URL: ${targetUrl}`;
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

function startTsUpstream(channel, s, policy = {}) {
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
  const u = new URL(channel.url);
  console.log('[IPTV][TS] open upstream', channel.id, u.host);
  const req = libFor(channel.url).get(channel.url, { headers: upstreamHeaders(channel) }, (up) => {
    if (up.statusCode && up.statusCode >= 400) {
      const message = explainHttp(up.statusCode, channel.url);
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
      for (const c of s.clients) { try { c.write(chunk); } catch {} }
    });
    up.on('end', () => stopTsUpstream(channel, s));
    up.on('error', () => stopTsUpstream(channel, s));
  });
  req.on('error', (e) => {
    const message = e.message === 'timeout'
      ? `Timed out while connecting to the IPTV provider. Check the URL or provider availability: ${channel.url}`
      : `Could not connect to the IPTV provider: ${e.message}. URL: ${channel.url}`;
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
    }
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
}

// ---- HLS proxy ----
function fetchUpstream(targetUrl, headers = UA) {
  return new Promise((resolve, reject) => {
    const req = libFor(targetUrl).get(targetUrl, { headers }, (up) => resolve(up));
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
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
    if (!entry.promise && entry.expiresAt <= now) HLS_RESOURCE_CACHE.delete(key);
  }
  while (HLS_RESOURCE_CACHE.size > HLS_CACHE_MAX) {
    const first = HLS_RESOURCE_CACHE.keys().next().value;
    if (!first) break;
    HLS_RESOURCE_CACHE.delete(first);
  }
}

async function fetchCachedHlsResource(channel, targetUrl, headers, ttlMs) {
  pruneHlsCache();
  const rangeKey = headers?.Range || headers?.range || '';
  const key = `${channel.id}|${rangeKey}|${targetUrl}`;
  const now = Date.now();
  const existing = HLS_RESOURCE_CACHE.get(key);
  if (existing?.value && existing.expiresAt > now) {
    return { ...existing.value, fromCache: true };
  }
  if (existing?.promise) {
    const value = await existing.promise;
    return { ...value, fromCache: true };
  }
  const m = metrics(channel.id, 'hls');
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
  HLS_RESOURCE_CACHE.set(key, { expiresAt: now + ttlMs, promise });
  try {
    const value = await promise;
    if (value.statusCode >= 400) {
      HLS_RESOURCE_CACHE.delete(key);
      return { ...value, fromCache: false };
    }
    HLS_RESOURCE_CACHE.set(key, { expiresAt: Date.now() + ttlMs, value });
    return { ...value, fromCache: false };
  } catch (e) {
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
  HLS_IDLE.set(id, s);
}

function rewritePlaylist(body, playlistUrl, baseProxyUrl) {
  const base = new URL(playlistUrl);
  return body.split(/\r?\n/).map((line) => {
    if (!line || line.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
        const abs = new URL(uri, base).toString();
        return `URI="${baseProxyUrl}/seg?u=${encodeURIComponent(abs)}"`;
      });
    }
    const abs = new URL(line.trim(), base).toString();
    return `${baseProxyUrl}/seg?u=${encodeURIComponent(abs)}`;
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
    const up = await fetchCachedHlsResource(channel, playlistUrl, upstreamHeaders(channel), HLS_PLAYLIST_CACHE_MS);
    if (up.statusCode && up.statusCode >= 400) {
      const message = explainHttp(up.statusCode, playlistUrl);
      markError(channel.id, message, up.statusCode);
      sendIptvError(res, 502, message);
      return;
    }
    const body = up.body.toString('utf8');
    const rewritten = rewritePlaylist(body, playlistUrl, baseProxyUrl);
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
    const up = await fetchCachedHlsResource(channel, segUrl, upstreamHeaders(channel, extra), ttl);
    if (up.statusCode && up.statusCode >= 400) {
      const message = explainHttp(up.statusCode, segUrl);
      markError(channel.id, message, up.statusCode);
      sendIptvError(res, 502, message);
      return;
    }
    const contentType = up.headers['content-type'] || '';
    const body = up.body;
    if (isPlaylistResponse(segUrl, contentType, body)) {
      const rewritten = rewritePlaylist(body.toString('utf8'), segUrl, baseProxyUrl);
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
    res.end(body);
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
    if (subPath === 'seg' && query.u) {
      return serveHlsSegment(channel, query.u, baseProxyUrl, req, res, policy);
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
  }
  return out;
}

// Probe a URL — fetch a few bytes/playlist to confirm it's reachable.
async function probe(channelUrl) {
  try {
    const up = await fetchUpstream(channelUrl);
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
