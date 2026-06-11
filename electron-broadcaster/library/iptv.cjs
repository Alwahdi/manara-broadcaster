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

const UA = { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' };
const IDLE_MS = 5000;

function libFor(u) { return u.startsWith('https') ? https : http; }

function isHls(url) { return /\.m3u8(\?|$)/i.test(url); }

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

// ---- TS / raw fan-out ----
function tsState(id) {
  let s = TS_CHANNELS.get(id);
  if (!s) {
    s = { clients: new Set(), upstreamReq: null, upstreamRes: null, idleTimer: null, contentType: 'video/mp2t' };
    TS_CHANNELS.set(id, s);
  }
  return s;
}

function startTsUpstream(channel, s) {
  if (s.upstreamReq) return;
  const u = new URL(channel.url);
  console.log('[IPTV][TS] open upstream', channel.id, u.host);
  const req = libFor(channel.url).get(channel.url, { headers: upstreamHeaders(channel) }, (up) => {
    if (up.statusCode && up.statusCode >= 400) {
      const message = explainHttp(up.statusCode, channel.url);
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
    for (const c of s.clients) sendIptvError(c, 502, message);
    s.upstreamReq = null; s.upstreamRes = null;
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
}

function serveTs(channel, req, res) {
  const s = tsState(channel.id);
  if (s.idleTimer) { clearTimeout(s.idleTimer); s.idleTimer = null; }
  s.clients.add(res);
  if (s.upstreamRes && !res.headersSent) {
    try { res.writeHead(200, { 'Content-Type': s.contentType, 'Cache-Control': 'no-cache' }); } catch {}
  }
  if (!s.upstreamReq) startTsUpstream(channel, s);
  const cleanup = () => {
    if (!s.clients.has(res)) return;
    s.clients.delete(res);
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

function touchHls(id) {
  const s = HLS_IDLE.get(id) || { lastHit: 0, idleTimer: null };
  s.lastHit = Date.now();
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => { console.log('[IPTV][HLS] idle, no viewer for', id); HLS_IDLE.delete(id); }, IDLE_MS * 3);
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

async function serveHlsPlaylist(channel, playlistUrl, baseProxyUrl, req, res) {
  try {
    touchHls(channel.id);
    const up = await fetchUpstream(playlistUrl, upstreamHeaders(channel));
    if (up.statusCode && up.statusCode >= 400) {
      sendIptvError(res, 502, explainHttp(up.statusCode, playlistUrl));
      try { up.resume(); } catch {}
      return;
    }
    const body = (await readAll(up)).toString('utf8');
    const rewritten = rewritePlaylist(body, playlistUrl, baseProxyUrl);
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
    sendIptvError(res, 502, message);
  }
}

async function serveHlsSegment(channel, segUrl, baseProxyUrl, req, res) {
  try {
    touchHls(channel.id);
    const extra = req.headers.range ? { Range: req.headers.range } : {};
    const up = await fetchUpstream(segUrl, upstreamHeaders(channel, extra));
    if (up.statusCode && up.statusCode >= 400) {
      sendIptvError(res, 502, explainHttp(up.statusCode, segUrl));
      try { up.resume(); } catch {}
      return;
    }
    const contentType = up.headers['content-type'] || '';
    const body = await readAll(up);
    if (isPlaylistResponse(segUrl, contentType, body)) {
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(rewritePlaylist(body.toString('utf8'), segUrl, baseProxyUrl));
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
    sendIptvError(res, 502, message);
  }
}

// ---- Public entry called from media-server ----
async function handleRequest(channel, subPath, query, req, res, baseProxyUrl) {
  if (isHls(channel.url)) {
    if (subPath === 'seg' && query.u) {
      return serveHlsSegment(channel, query.u, baseProxyUrl, req, res);
    }
    return serveHlsPlaylist(channel, channel.url, baseProxyUrl, req, res);
  }
  return serveTs(channel, req, res);
}

function status() {
  const out = {};
  for (const [id, s] of TS_CHANNELS) {
    out[id] = { type: 'ts', viewers: s.clients.size, upstreamOpen: !!s.upstreamReq };
  }
  for (const [id, s] of HLS_IDLE) {
    out[id] = out[id] || { type: 'hls', viewers: 0, upstreamOpen: false };
    out[id].lastHitMs = Date.now() - s.lastHit;
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
