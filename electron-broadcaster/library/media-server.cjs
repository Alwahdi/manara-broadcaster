// Manara — local HTTP media server with Range support + IPTV proxy
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Readable } = require('stream');
const db = require('./db.cjs');
const iptv = require('./iptv.cjs');
const cloudIptv = require('./cloud-iptv.cjs');
const scanner = require('./scanner.cjs');

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t', '.srt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.aac': 'audio/aac',
  '.opus': 'audio/ogg',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 300 * 1024 * 1024) req.destroy(new Error('body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseJsonBody(req) {
  return readBody(req).then((body) => body ? JSON.parse(body) : {});
}

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((acc, part) => {
    const i = part.indexOf('=');
    if (i > -1) acc[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    return acc;
  }, {});
}

function randomId(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function getViewerId(req, res) {
  const cookies = parseCookies(req);
  const existing = cookies.manara_viewer;
  if (existing) return existing;
  const id = randomId('viewer');
  res.setHeader('Set-Cookie', `manara_viewer=${encodeURIComponent(id)}; Path=/; SameSite=Lax; Max-Age=31536000`);
  return id;
}

function requireAdmin(req, res, getAdminAuth) {
  const auth = typeof getAdminAuth === 'function' ? getAdminAuth() : {};
  const username = auth.username || 'admin';
  const password = auth.password || 'admin';
  const header = req.headers.authorization || '';
  const token = header.startsWith('Basic ') ? header.slice(6) : '';
  const cookieToken = parseCookies(req).manara_admin || '';
  let provided = '';
  try { provided = Buffer.from(token, 'base64').toString('utf8'); } catch {}
  if (provided === `${username}:${password}` || cookieToken === Buffer.from(`${username}:${password}`).toString('base64')) return true;
  if (String(req.headers.accept || '').includes('text/html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(adminLoginPage());
    return false;
  }
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Manara LAN Admin"',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Authentication required');
  return false;
}

function adminLoginPage(error = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manara Admin</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(180deg,#081126,#070b1e);color:#eef2ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}.card{width:min(420px,92vw);border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.86);border-radius:8px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.38)}h1{font-size:24px;margin:0 0 6px}.lead{color:#94a3b8;line-height:1.6;margin:0 0 18px;font-size:13px}label{display:block;color:#cbd5e1;font-size:12px;font-weight:800;margin-top:12px}input{width:100%;box-sizing:border-box;margin:7px 0 2px;padding:12px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:#111936;color:#fff;font:inherit}button{width:100%;padding:12px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:900;margin-top:16px;cursor:pointer}.err{color:#fecaca;background:rgba(127,29,29,.26);border:1px solid rgba(248,113,113,.34);border-radius:8px;padding:10px;font-size:13px}</style></head><body><form class="card" method="post" action="/admin/login"><h1>Manara Admin</h1><p class="lead">Sign in to manage channels, IPTV, media, viewers, and reports on this local network.</p>${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}<label>Username<input name="username" autocomplete="username" autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password"></label><button>Sign in</button></form></body></html>`;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return 'No limit';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function mediaTitle(item) {
  if (!item) return '';
  const ep = item.season ? ` S${String(item.season).padStart(2, '0')}E${String(item.episode || 1).padStart(2, '0')}` : '';
  return `${item.title || 'Untitled'}${ep}`;
}

function mediaType(item) {
  const ext = path.extname(item?.path || '').toLowerCase();
  if (['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.wma', '.opus'].includes(ext) || item?.kind === 'audio') return 'audio';
  if (['.mp4', '.m4v', '.webm', '.mov', '.ts'].includes(ext)) return 'video';
  return 'unsupported';
}

function listLibraryItems(query = {}) {
  return db.listMedia({
    q: query.q || '',
    kind: query.kind || '',
    limit: Math.min(2000, Math.max(1, Number(query.limit) || 800)),
  });
}

function librarySections(items = listLibraryItems({ limit: 5000 })) {
  const sections = new Map();
  for (const item of items) {
    const section = item.section || (item.kind === 'episode' ? 'Series' : item.kind === 'audio' ? 'Audio' : 'Movies');
    const folder = item.folder || section;
    if (!sections.has(section)) sections.set(section, { name: section, count: 0, folders: new Map() });
    const sec = sections.get(section);
    sec.count += 1;
    sec.folders.set(folder, (sec.folders.get(folder) || 0) + 1);
  }
  return Array.from(sections.values()).map((sec) => ({
    name: sec.name,
    count: sec.count,
    folders: Array.from(sec.folders.entries()).map(([name, count]) => ({ name, count })),
  }));
}

function srtToVtt(text) {
  return 'WEBVTT\n\n' + String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .replace(/(\d\d:\d\d:\d\d),(\d{3})/g, '$1.$2')
    .replace(/^\d+\n/gm, '');
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function reportCsv(rows) {
  const header = ['time', 'action', 'ip', 'targetType', 'targetId', 'targetName', 'bytes', 'status'];
  return [header.join(',')].concat(rows.map((row) => header.map((key) => csvEscape(key === 'time' ? new Date(row.at).toISOString() : row[key])).join(','))).join('\n');
}

function healthDiagnostics() {
  const items = db.listMedia({ limit: 100000 });
  const subs = items.flatMap((item) => db.listSubtitles(item.id).map((sub) => ({ ...sub, mediaTitle: item.title })));
  return {
    generatedAt: Date.now(),
    missingFiles: items.filter((item) => !item.remote_url && !fs.existsSync(item.path)).map((item) => ({ id: item.id, title: item.title, path: item.path })),
    unsupportedFormats: items.filter((item) => mediaType(item) === 'unsupported').map((item) => ({ id: item.id, title: item.title, path: item.path })),
    brokenSubtitles: subs.filter((sub) => !fs.existsSync(sub.path)).map((sub) => ({ id: sub.id, mediaId: sub.media_id, title: sub.mediaTitle, path: sub.path })),
  };
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = forwarded || req.socket?.remoteAddress || '';
  return raw.replace(/^::ffff:/, '') || 'unknown';
}

function attachRequestAccounting(req, res, meta = {}) {
  const ip = clientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  db.touchSession({
    ip,
    userAgent,
    path: req.url,
    targetType: meta.targetType,
    targetId: meta.targetId,
    targetName: meta.targetName,
  });
  let sent = 0;
  const originalWrite = res.write;
  const originalEnd = res.end;
  res.write = function writeWithAccounting(chunk, encoding, cb) {
    if (chunk) sent += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), encoding);
    return originalWrite.call(this, chunk, encoding, cb);
  };
  res.end = function endWithAccounting(chunk, encoding, cb) {
    if (chunk) sent += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), encoding);
    return originalEnd.call(this, chunk, encoding, cb);
  };
  res.once('finish', () => {
    db.addSessionBytes(ip, sent);
    db.addAccessLog({
      ip,
      userAgent,
      action: meta.action || 'stream',
      targetType: meta.targetType,
      targetId: meta.targetId,
      targetName: meta.targetName,
      bytes: sent,
      status: res.statusCode,
    });
  });
}

function denyIfBlocked(req, res, meta = {}) {
  const ip = clientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const block = db.isBlocked({ ip, userAgent });
  if (!block) return false;
  db.touchSession({
    ip,
    userAgent,
    path: req.url,
    targetType: meta.targetType,
    targetId: meta.targetId,
    targetName: meta.targetName,
  });
  db.addAccessLog({
    ip,
    userAgent,
    action: 'blocked',
    targetType: meta.targetType,
    targetId: meta.targetId,
    targetName: meta.targetName,
    status: 403,
    message: block.reason || 'blocked',
  });
  send(res, 403, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stream unavailable</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d1f;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;padding:24px}main{max-width:520px}h1{font-size:24px;margin:0 0 10px}p{color:#cbd5e1;line-height:1.7}</style></head><body><main><h1>Stream unavailable</h1><p>${escapeHtml(db.blockedMessage())}</p></main></body></html>`, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  return true;
}

function safeCloudIptvList() {
  try { return cloudIptv.list(); }
  catch { return []; }
}

function platformStatus(options = {}) {
  try {
    return typeof options.getPlatformStatus === 'function' ? options.getPlatformStatus() : null;
  } catch {
    return null;
  }
}

function featureAllowed(options = {}, feature) {
  const status = platformStatus(options);
  if (!status || status.state === 'unregistered') return true; // legacy/offline installs keep working until registered.
  if (status.state === 'active' && status.features?.[feature]) return true;
  return false;
}

function platformGateMessage(status, feature) {
  const label = {
    channels: 'Broadcast channels',
    iptv: 'IPTV',
    media: 'Media library',
    webAdmin: 'LAN admin',
    analytics: 'Analytics',
    branding: 'Branding',
  }[feature] || feature;
  if (!status || status.state === 'unregistered') return `${label} is not activated yet.`;
  if (status.state === 'pending') return `${label} is waiting for platform owner approval.`;
  if (status.state === 'expired') return `${label} is unavailable because the subscription expired.`;
  if (status.state === 'suspended') return `${label} is temporarily unavailable.`;
  return `${label} is not included in this subscription plan.`;
}

function denyFeature(req, res, options, feature) {
  const status = platformStatus(options);
  const message = platformGateMessage(status, feature);
  if (String(req.headers.accept || '').includes('text/html')) {
    send(res, 402, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feature unavailable</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d1f;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;padding:24px}main{max-width:560px}h1{font-size:24px;margin:0 0 10px}p{color:#cbd5e1;line-height:1.7}</style></head><body><main><h1>Feature unavailable</h1><p>${escapeHtml(message)}</p></main></body></html>`, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Manara-Error': encodeURIComponent(message),
    });
    return true;
  }
  sendJson(res, 402, {
    error: 'feature_unavailable',
    feature,
    message,
    platform: status ? { state: status.state, activationId: status.activationId || '' } : null,
  });
  return true;
}

function adminPage(options = {}) {
  const broadcastJson = escapeHtml(JSON.stringify(db.listBroadcastChannels(), null, 2));
  const status = iptv.status();
  const localRows = db.listIptv().map((ch) => ({ ...ch, sourceKind: 'Manual', readonly: false }));
  let cloudRows = [];
  try {
    cloudRows = safeCloudIptvList().map((ch) => ({
      id: 'cloud-' + ch.id,
      name: ch.name,
      category: ch.category,
      transferLimitBytes: ch.transferLimitBytes,
      enabled: true,
      sourceKind: 'Cloud',
      readonly: true,
    }));
  } catch {}
  const iptvRows = [...cloudRows, ...localRows].map((ch) => `
    <tr>
      <td>${escapeHtml(ch.name)}</td>
      <td>${escapeHtml(ch.sourceKind)}</td>
      <td>${escapeHtml(ch.category || '')}</td>
      <td class="url">Hidden in LAN admin</td>
      <td>${ch.enabled ? 'Enabled' : 'Disabled'}</td>
      <td>${formatBytes(ch.transferLimitBytes)}</td>
      <td>${status[ch.id]?.viewers || 0}</td>
      <td>${formatBytes(status[ch.id]?.totalUpstreamBytes || 0)}</td>
      <td>
        ${ch.readonly ? '<span class="muted">Cloud managed</span>' : `<button data-toggle="${ch.id}">${ch.enabled ? 'Disable' : 'Enable'}</button><button data-del="${ch.id}">Delete</button>`}
      </td>
    </tr>`).join('');
  const sessions = db.listSessions();
  const blocks = db.listBlocks();
  const logs = db.listAccessLogs(80);
  const mediaStats = db.mediaStats();
  const mediaTheme = db.mediaTheme();
  const health = healthDiagnostics();
  const libraryPaths = db.listPaths();
  const mediaItems = db.listMedia({ limit: 120 }).map((item) => ({ ...item, titleText: mediaTitle(item) }));
  const sessionRows = sessions.map((s) => `
    <tr>
      <td class="url">${escapeHtml(s.ip)}</td>
      <td>${escapeHtml(s.targetName || s.targetId || s.path || '')}</td>
      <td>${formatBytes(s.bytes)}</td>
      <td>${Number(s.requests || 0)}</td>
      <td class="url">${escapeHtml(s.userAgent || '')}</td>
      <td><button data-block-ip="${escapeHtml(s.ip)}">Block IP</button></td>
    </tr>`).join('');
  const blockRows = blocks.map((b) => `
    <tr>
      <td>${escapeHtml(b.type)}</td>
      <td class="url">${escapeHtml(b.identifier)}</td>
      <td>${escapeHtml(b.reason || '')}</td>
      <td><button data-remove-block="${b.id}">Remove</button></td>
    </tr>`).join('');
  const logRows = logs.map((l) => `
    <tr>
      <td>${new Date(l.at).toLocaleString()}</td>
      <td>${escapeHtml(l.action)}</td>
      <td class="url">${escapeHtml(l.ip)}</td>
      <td>${escapeHtml(l.targetName || l.targetId || '')}</td>
      <td>${formatBytes(l.bytes)}</td>
      <td>${escapeHtml(l.status)}</td>
    </tr>`).join('');
  const topMediaRows = mediaStats.top.map((m) => `
    <tr>
      <td>${escapeHtml(m.title)}</td>
      <td>${escapeHtml(m.kind)}</td>
      <td>${Number(m.plays || 0)}</td>
      <td>${formatBytes(m.bytes)}</td>
      <td>${m.lastAt ? new Date(m.lastAt).toLocaleString() : '-'}</td>
    </tr>`).join('');
  const mediaRows = mediaItems.map((item) => `
    <tr>
      <td>${escapeHtml(item.titleText)}</td>
      <td>${escapeHtml(item.kind || '')}</td>
      <td>${formatBytes(item.size)}</td>
      <td>${formatDuration(item.wp_duration || item.duration)}</td>
      <td class="url">${escapeHtml(path.basename(item.path || ''))}</td>
      <td>
        <button data-edit-media="${item.id}">Edit</button>
        <button data-delete-media="${item.id}">Remove</button>
      </td>
    </tr>`).join('');
  const pathRows = libraryPaths.map((p) => `
    <tr><td class="url">${escapeHtml(p.path)}</td><td>${escapeHtml(p.kind)}</td><td>${p.locked ? 'Locked' : `<button data-path-del="${p.id}">Remove</button>`}</td></tr>`).join('');
  const mediaPayload = jsonForScript(mediaItems.map((item) => ({
    id: item.id,
    title: item.title || '',
    kind: item.kind || 'movie',
    year: item.year || '',
    season: item.season || '',
    episode: item.episode || '',
    poster_url: item.poster_url || '',
    backdrop_url: item.backdrop_url || '',
    overview: item.overview || '',
    rating: item.rating || '',
  })));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Manara LAN Admin</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:linear-gradient(180deg,#081126,#070b1e);color:#eef2ff}
main{max-width:1280px;margin:auto;padding:24px}
h1{font-size:24px;margin:0 0 6px}.lead{color:#94a3b8;line-height:1.6;margin:0 0 18px}.shell-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:18px}.shell-head a{color:#bfdbfe;text-decoration:none;font-size:13px;font-weight:800}
section{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);border-radius:8px;padding:16px;margin-bottom:14px;box-shadow:0 18px 54px rgba(0,0,0,.18)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
label{display:block;font-size:12px;color:#cbd5e1;margin:10px 0 5px}
input,textarea,select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:9px;background:#111936;color:#fff}
textarea{min-height:240px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
button{border:0;border-radius:8px;padding:8px 11px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;margin:4px 4px 4px 0}
button.secondary{background:#334155}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
td,th{border-bottom:1px solid rgba(255,255,255,.1);padding:8px;text-align:left;vertical-align:top}
.url{word-break:break-all;color:#bfdbfe}
.msg{color:#86efac;font-size:13px;margin-top:8px}
.muted{color:#94a3b8;font-size:12px}
.statcards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:10px 0 12px}.statcard{border:1px solid rgba(148,163,184,.16);background:rgba(0,0,0,.18);border-radius:8px;padding:12px}.statcard b{display:block;font-size:22px}.statcard span{font-size:12px;color:#94a3b8}
@media (max-width:900px){.grid{grid-template-columns:1fr}table{display:block;overflow:auto}}
@media (max-width:700px){.statcards{grid-template-columns:1fr 1fr}}
</style>
</head>
<body><main>
<div class="shell-head"><div><h1>Manara Admin</h1><p class="lead">Manage the local viewing experience, IPTV availability, media library, viewer access, and reports.</p></div><a href="/">Open viewer page</a></div>
<script id="mediaAdminPayload" type="application/json">${mediaPayload}</script>
<section>
  <h2>Media Library</h2>
  <div class="statcards">
    <div class="statcard"><b>${mediaStats.total}</b><span>Total media</span></div>
    <div class="statcard"><b>${formatBytes(mediaStats.totalSize)}</b><span>Library size</span></div>
    <div class="statcard"><b>${mediaStats.byKind.movie || 0}</b><span>Movies</span></div>
    <div class="statcard"><b>${mediaStats.uniqueDevices || 0}</b><span>Unique devices</span></div>
  </div>
  <div class="statcards">
    <div class="statcard"><b>${mediaStats.byKind.episode || 0}</b><span>Episodes</span></div>
    <div class="statcard"><b>${mediaStats.byKind.audio || 0}</b><span>Audio</span></div>
    <div class="statcard"><b>${mediaStats.completionRate || 0}%</b><span>Completion rate</span></div>
    <div class="statcard"><b>${health.missingFiles.length + health.unsupportedFormats.length + health.brokenSubtitles.length}</b><span>Health issues</span></div>
  </div>
  <h3>Folders and scanner</h3>
  <form id="pathForm">
    <label>Folder path on this computer</label><input name="path" required placeholder="C:\\Media\\Movies or /Users/name/Movies">
    <label>Kind</label><select name="kind"><option value="movies">Movies</option><option value="tv">TV / Series</option><option value="audio">Audio</option></select>
    <button>Add path</button><button type="button" id="scanNowBtn">Scan now</button>
  </form>
  <table><thead><tr><th>Path</th><th>Kind</th><th>Action</th></tr></thead><tbody>${pathRows || '<tr><td colspan="3">No folders have been added yet.</td></tr>'}</tbody></table>
  <h3>Theme</h3>
  <form id="themeForm" class="grid">
    <label>Brand name<input name="brandName" value="${escapeHtml(mediaTheme.brandName)}"></label>
    <label>Tagline<input name="tagline" value="${escapeHtml(mediaTheme.tagline)}"></label>
    <label>Logo URL<input name="logoUrl" value="${escapeHtml(mediaTheme.logoUrl)}"></label>
    <label>Direction<select name="direction"><option value="rtl" ${mediaTheme.direction === 'rtl' ? 'selected' : ''}>Arabic / RTL</option><option value="ltr" ${mediaTheme.direction === 'ltr' ? 'selected' : ''}>English / LTR</option></select></label>
    <label>Accent<input name="accent" type="color" value="${escapeHtml(mediaTheme.accent)}"></label>
    <label>Accent 2<input name="accent2" type="color" value="${escapeHtml(mediaTheme.accent2)}"></label>
    <div><button>Save theme</button></div>
  </form>
  <h3>Upload / import media</h3>
  <form id="uploadForm">
    <label>Import file into the local library storage</label><input id="uploadFile" type="file" accept="video/*,audio/*,.mkv,.srt,.vtt">
    <label>Kind</label><select name="kind"><option value="movie">Movie</option><option value="episode">Episode</option><option value="audio">Audio</option></select>
    <button>Upload</button>
  </form>
  <p class="muted">Reports: <a href="/api/admin/reports/views.csv">CSV</a> · <a href="/api/admin/reports/views.json">JSON</a> · <a href="/api/admin/health">Health diagnostics</a></p>
  <p class="muted">Health: ${health.missingFiles.length} missing files, ${health.unsupportedFormats.length} unsupported formats, ${health.brokenSubtitles.length} subtitle issues.</p>
  <h3>Top watched</h3>
  <table><thead><tr><th>Title</th><th>Kind</th><th>Plays</th><th>Transferred</th><th>Last view</th></tr></thead><tbody>${topMediaRows || '<tr><td colspan="5">No viewing activity yet.</td></tr>'}</tbody></table>
  <h3 style="margin-top:18px">Media inventory</h3>
  <table><thead><tr><th>Title</th><th>Kind</th><th>Size</th><th>Duration</th><th>File</th><th>Actions</th></tr></thead><tbody>${mediaRows || '<tr><td colspan="6">No media has been indexed yet. Add folders, then run a scan.</td></tr>'}</tbody></table>
</section>
<section>
  <h2>Active Viewers</h2>
  <table><thead><tr><th>IP</th><th>Watching</th><th>Transferred</th><th>Requests</th><th>Device</th><th>Action</th></tr></thead><tbody>${sessionRows || '<tr><td colspan="6">No active viewers right now.</td></tr>'}</tbody></table>
</section>
<section>
  <h2>IPTV Channels</h2>
  <form id="iptvForm">
    <label>Name</label><input name="name" required>
    <label>URL</label><input name="url" required placeholder="https://.../playlist.m3u8">
    <label>Category</label><input name="category">
    <label>Logo URL</label><input name="logo">
    <label>Internet transfer limit (MB, 0 = no limit)</label><input name="transferLimitMb" type="number" min="0" step="1" value="0">
    <button>Add IPTV</button>
  </form>
  <table><thead><tr><th>Name</th><th>Source</th><th>Category</th><th>Source URL</th><th>Status</th><th>Limit</th><th>Viewers</th><th>Internet used</th><th>Actions</th></tr></thead><tbody>${iptvRows || '<tr><td colspan="9">No IPTV channels have been added yet.</td></tr>'}</tbody></table>
</section>
<div class="grid">
<section>
  <h2>Blocklist</h2>
  <form id="blockForm">
    <label>Type</label><select name="type"><option value="ip">IP address</option><option value="userAgent">Device / user agent contains</option></select>
    <label>Identifier</label><input name="identifier" required placeholder="192.168.1.50">
    <label>Admin note</label><input name="reason" placeholder="Optional">
    <button>Add block</button>
  </form>
  <label>Viewer message</label><input id="blockedMessage" value="${escapeHtml(db.blockedMessage())}">
  <button id="saveBlockedMessage">Save message</button>
  <table><thead><tr><th>Type</th><th>Identifier</th><th>Reason</th><th>Action</th></tr></thead><tbody>${blockRows || '<tr><td colspan="4">No blocked viewers.</td></tr>'}</tbody></table>
</section>
<section>
  <h2>Access Log</h2>
  <table><thead><tr><th>Time</th><th>Action</th><th>IP</th><th>Target</th><th>Bytes</th><th>Status</th></tr></thead><tbody>${logRows || '<tr><td colspan="6">No access logs yet.</td></tr>'}</tbody></table>
</section>
</div>
<section>
  <h2>Broadcast Channels JSON</h2>
  <p class="muted">Advanced editor for the saved broadcast channel list used by the desktop app.</p>
  <textarea id="broadcastJson">${broadcastJson}</textarea>
  <button id="saveBroadcast">Save Broadcast Channels</button>
  <button class="secondary" onclick="location.reload()">Reload</button>
  <div id="msg" class="msg"></div>
</section>
<script>
const msg = document.getElementById('msg');
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
document.getElementById('iptvForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  data.transferLimitBytes = Math.max(0, Number(data.transferLimitMb || 0)) * 1024 * 1024;
  delete data.transferLimitMb;
  await api('/api/admin/iptv', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  location.reload();
});
document.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
  if (!confirm('Delete this IPTV channel?')) return;
  await api('/api/admin/iptv/' + b.dataset.del, { method:'DELETE' });
  location.reload();
});
document.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
  await api('/api/admin/iptv/' + b.dataset.toggle + '/toggle', { method:'POST' });
  location.reload();
});
document.getElementById('blockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  await api('/api/admin/blocklist', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  location.reload();
});
document.querySelectorAll('[data-block-ip]').forEach((b) => b.onclick = async () => {
  await api('/api/admin/blocklist', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:'ip', identifier:b.dataset.blockIp, reason:'Blocked from active viewers' }) });
  location.reload();
});
document.querySelectorAll('[data-remove-block]').forEach((b) => b.onclick = async () => {
  await api('/api/admin/blocklist/' + b.dataset.removeBlock, { method:'DELETE' });
  location.reload();
});
document.getElementById('saveBlockedMessage').onclick = async () => {
  await api('/api/admin/block-message', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message:document.getElementById('blockedMessage').value }) });
  msg.textContent = 'Saved.';
};
document.getElementById('saveBroadcast').onclick = async () => {
  const channels = JSON.parse(document.getElementById('broadcastJson').value);
  await api('/api/admin/broadcast', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ channels }) });
  msg.textContent = 'Saved.';
};
document.getElementById('pathForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/admin/library-paths', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) });
  location.reload();
});
document.querySelectorAll('[data-path-del]').forEach((b) => b.onclick = async () => {
  await api('/api/admin/library-paths/' + b.dataset.pathDel, { method:'DELETE' });
  location.reload();
});
document.getElementById('scanNowBtn').onclick = async () => {
  msg.textContent = 'Scanning...';
  const r = await api('/api/admin/scan', { method:'POST' });
  msg.textContent = r.ok ? 'Scan complete: ' + r.done + ' item(s)' : (r.error || 'Scan failed');
};
document.getElementById('themeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/admin/media-theme', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) });
  location.reload();
});
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('uploadFile').files[0];
  if (!file) return;
  const data = Object.fromEntries(new FormData(e.target).entries());
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = ''; for (let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  await api('/api/admin/upload', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:file.name, kind:data.kind, base64:btoa(binary) }) });
  location.reload();
});
const mediaAdmin = JSON.parse(document.getElementById('mediaAdminPayload').textContent || '[]');
document.querySelectorAll('[data-edit-media]').forEach((b) => b.onclick = async () => {
  const item = mediaAdmin.find((row) => String(row.id) === String(b.dataset.editMedia));
  if (!item) return;
  const title = prompt('Title', item.title || '');
  if (title == null) return;
  const kind = prompt('Kind: movie, episode, audio', item.kind || 'movie');
  if (kind == null) return;
  const year = prompt('Year', item.year || '');
  if (year == null) return;
  const overview = prompt('Overview', item.overview || '');
  if (overview == null) return;
  await api('/api/admin/media/' + item.id, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ ...item, title, kind, year, overview })
  });
  location.reload();
});
document.querySelectorAll('[data-delete-media]').forEach((b) => b.onclick = async () => {
  const removeFile = confirm('Remove this item from the library? Press OK to remove only from the library list. The file stays on disk.');
  if (!removeFile) return;
  await api('/api/admin/media/' + b.dataset.deleteMedia, { method:'DELETE' });
  location.reload();
});
</script>
</main></body></html>`;
}

function libraryPage(req, res) {
  const viewerId = getViewerId(req, res);
  const viewer = db.viewerState(viewerId);
  const theme = db.mediaTheme();
  const items = listLibraryItems({ limit: 1200 });
  const movies = items.filter((item) => item.kind === 'movie');
  const episodes = items.filter((item) => item.kind === 'episode');
  const audio = items.filter((item) => item.kind === 'audio');
  const continueRows = items
    .filter((item) => Number(item.position || 0) > 20 && Number(item.wp_duration || 0) > Number(item.position || 0) + 20)
    .sort((a, b) => Number(b.position || 0) - Number(a.position || 0))
    .slice(0, 18);
  const payload = jsonForScript(items.map((item) => ({
    id: item.id,
    title: mediaTitle(item),
    baseTitle: item.title || '',
    kind: item.kind || 'movie',
    year: item.year || '',
    rating: item.rating || '',
    overview: item.overview || '',
    poster: item.poster_url || '',
    backdrop: item.backdrop_url || '',
    size: item.size || 0,
    position: item.position || 0,
    duration: item.wp_duration || item.duration || 0,
    file: path.basename(item.path || ''),
    section: item.section || '',
    folder: item.folder || '',
  })));
  const viewerPayload = jsonForScript({
    id: viewer.id,
    favorites: viewer.favorites || [],
    watchLater: viewer.watchLater || [],
    history: viewer.history || [],
  });
  const sectionPayload = jsonForScript(librarySections(items));
  const isRtl = theme.direction === 'rtl';
  const text = isRtl ? {
    pageTitle: 'مكتبة Manara',
    channels: 'القنوات',
    admin: 'الإدارة',
    totalItems: 'كل المحتوى',
    movies: 'أفلام',
    episodes: 'حلقات',
    audio: 'صوتيات',
    search: 'ابحث في الأفلام والمسلسلات والصوتيات',
    allMedia: 'كل المحتوى',
    all: 'الكل',
    favorites: 'المفضلة',
    watchLater: 'المشاهدة لاحقاً',
    continue: 'متابعة المشاهدة',
    allSections: 'كل الأقسام',
    sections: 'الأقسام',
    sectionsHint: 'تصفح حسب المجلد أو التصنيف',
    continueHint: 'أكمل من آخر نقطة مشاهدة',
    favoritesHint: 'محفوظة لهذا الجهاز',
    library: 'المكتبة',
    empty: 'لا يوجد محتوى متاح حالياً.',
    items: 'عنصر',
    noResume: 'لا توجد مشاهدة غير مكتملة حالياً.',
    noFavorites: 'لا توجد عناصر مفضلة على هذا الجهاز.',
    favoriteTitle: 'إضافة إلى المفضلة',
    watchTitle: 'مشاهدة لاحقاً',
  } : {
    pageTitle: 'Manara Media Library',
    channels: 'Channels',
    admin: 'Admin',
    totalItems: 'Total items',
    movies: 'Movies',
    episodes: 'Episodes',
    audio: 'Audio',
    search: 'Search movies, series, audio',
    allMedia: 'All media',
    all: 'All',
    favorites: 'Favorites',
    watchLater: 'Watch later',
    continue: 'Continue watching',
    allSections: 'All sections',
    sections: 'Sections',
    sectionsHint: 'Browse folders and categories',
    continueHint: 'Resume where you stopped',
    favoritesHint: 'Saved on this device',
    library: 'Library',
    empty: 'No media is available right now.',
    items: 'item(s)',
    noResume: 'Nothing to resume yet.',
    noFavorites: 'No favorites on this device yet.',
    favoriteTitle: 'Favorite',
    watchTitle: 'Watch later',
  };
  const textPayload = jsonForScript(text);
  return `<!doctype html>
<html lang="${theme.direction === 'rtl' ? 'ar' : 'en'}" dir="${theme.direction}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(text.pageTitle)}</title>
<style>
:root{color-scheme:dark;--bg:#070b19;--panel:#10182f;--line:rgba(255,255,255,.1);--text:#eef2ff;--muted:#a7b3cf;--accent:${escapeHtml(theme.accent)};--accent2:${escapeHtml(theme.accent2)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.hero{min-height:52vh;padding:22px;background:linear-gradient(90deg,rgba(7,11,25,.96),rgba(7,11,25,.72)),var(--hero,linear-gradient(135deg,#10182f,#07111f));background-size:cover;background-position:center;display:flex;align-items:flex-end}
.hero-inner{width:100%;max-width:1280px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:58px}.brand{font-weight:900;font-size:18px}.nav{display:flex;gap:8px;flex-wrap:wrap}.nav a,.btn{border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff;text-decoration:none;border-radius:8px;padding:9px 12px;font-weight:800;cursor:pointer}
.btn.primary,.nav a.primary{background:var(--accent);border-color:transparent}.hero h1{font-size:clamp(34px,6vw,72px);line-height:.98;margin:0 0 12px;letter-spacing:0}.hero p{max-width:720px;color:#dbeafe;line-height:1.7;margin:0 0 18px}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{border:1px solid var(--line);background:rgba(0,0,0,.24);border-radius:8px;padding:10px 12px}.stat b{display:block;font-size:18px}.stat span{font-size:12px;color:var(--muted)}
main{max-width:1280px;margin:auto;padding:18px 22px 38px}.tools{display:grid;grid-template-columns:minmax(180px,1fr) 160px 160px;gap:10px;margin:8px 0 22px}
input,select{width:100%;border:1px solid var(--line);background:#111936;color:#fff;border-radius:8px;padding:11px 12px;font:inherit}
.section{margin:26px 0}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.section h2{font-size:20px;margin:0}.section small{color:var(--muted)}
.rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(148px,178px);gap:12px;overflow-x:auto;overscroll-behavior-x:contain;padding-bottom:10px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:14px}
.tile{position:relative;display:block;min-width:0;text-decoration:none;color:#fff;background:rgba(255,255,255,.045);border:1px solid var(--line);border-radius:8px;overflow:hidden;transition:transform .16s,border-color .16s}.tile:hover{transform:translateY(-3px);border-color:rgba(59,130,246,.75)}
.poster{aspect-ratio:2/3;background:#18213d center/cover no-repeat;display:grid;place-items:center;color:rgba(255,255,255,.32);font-size:40px}.poster.audio{aspect-ratio:1;background:linear-gradient(135deg,#18213d,#123c4a)}
.meta{padding:9px}.title{font-size:13px;font-weight:900;line-height:1.35;min-height:35px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sub{font-size:11px;color:var(--muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.progress{height:4px;background:rgba(255,255,255,.12)}.progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.quick{position:absolute;top:8px;right:8px;display:flex;gap:5px}.quick button{width:30px;height:30px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.52);color:#fff;border-radius:8px;cursor:pointer}.quick button.on{background:#dc2626}
.empty{border:1px solid var(--line);background:rgba(255,255,255,.045);border-radius:8px;padding:22px;color:var(--muted);line-height:1.7}.hide{display:none!important}
@media(max-width:760px){.hero{min-height:46vh}.top{margin-bottom:34px}.tools{grid-template-columns:1fr}.rail{grid-auto-columns:minmax(132px,155px)}main{padding:16px 14px 28px}}
</style>
</head>
<body><main>
<script id="mediaPayload" type="application/json">${payload}</script>
<script id="viewerPayload" type="application/json">${viewerPayload}</script>
<script id="sectionPayload" type="application/json">${sectionPayload}</script>
<script id="textPayload" type="application/json">${textPayload}</script>
</main>
<section class="hero" id="hero">
  <div class="hero-inner">
    <div class="top">
      <div class="brand">${theme.logoUrl ? `<img src="${escapeHtml(theme.logoUrl)}" style="height:32px;vertical-align:middle;margin-inline-end:8px">` : ''}${escapeHtml(theme.brandName)}</div>
      <nav class="nav"><a href="/" class="primary">${escapeHtml(text.channels)}</a><a href="/admin">${escapeHtml(text.admin)}</a></nav>
    </div>
    <h1>${escapeHtml(theme.brandName)}</h1>
    <p>${escapeHtml(theme.tagline)}</p>
    <div class="stats">
      <div class="stat"><b>${items.length}</b><span>${escapeHtml(text.totalItems)}</span></div>
      <div class="stat"><b>${movies.length}</b><span>${escapeHtml(text.movies)}</span></div>
      <div class="stat"><b>${episodes.length}</b><span>${escapeHtml(text.episodes)}</span></div>
      <div class="stat"><b>${audio.length}</b><span>${escapeHtml(text.audio)}</span></div>
    </div>
  </div>
</section>
<main>
  <div class="tools">
    <input id="search" placeholder="${escapeHtml(text.search)}" autocomplete="off">
    <select id="kind"><option value="">${escapeHtml(text.allMedia)}</option><option value="movie">${escapeHtml(text.movies)}</option><option value="episode">${escapeHtml(text.episodes)}</option><option value="audio">${escapeHtml(text.audio)}</option></select>
    <select id="view"><option value="all">${escapeHtml(text.all)}</option><option value="favorites">${escapeHtml(text.favorites)}</option><option value="watchLater">${escapeHtml(text.watchLater)}</option><option value="continue">${escapeHtml(text.continue)}</option></select>
    <select id="sectionFilter"><option value="">${escapeHtml(text.allSections)}</option></select>
  </div>
  <section class="section" id="sectionBrowser"><div class="section-head"><div><h2>${escapeHtml(text.sections)}</h2><small>${escapeHtml(text.sectionsHint)}</small></div></div><div class="rail" id="sectionRail"></div></section>
  <section class="section" id="continueSection"><div class="section-head"><div><h2>${escapeHtml(text.continue)}</h2><small>${escapeHtml(text.continueHint)}</small></div></div><div class="rail" id="continueRail"></div></section>
  <section class="section" id="favoritesSection"><div class="section-head"><div><h2>${escapeHtml(text.favorites)}</h2><small>${escapeHtml(text.favoritesHint)}</small></div></div><div class="rail" id="favoritesRail"></div></section>
  <section class="section"><div class="section-head"><div><h2>${escapeHtml(text.library)}</h2><small id="countLabel"></small></div></div><div class="grid" id="grid"></div><div class="empty" id="empty">${escapeHtml(text.empty)}</div></section>
</main>
<script>
const media = JSON.parse(document.getElementById('mediaPayload').textContent || '[]');
const viewer = JSON.parse(document.getElementById('viewerPayload').textContent || '{}');
const sections = JSON.parse(document.getElementById('sectionPayload').textContent || '[]');
const text = JSON.parse(document.getElementById('textPayload').textContent || '{}');
const storeKey = 'manaraMediaStorage';
const storage = {
  get(){ try { const local = JSON.parse(localStorage.getItem(storeKey)) || {}; return { favorites:[...(viewer.favorites||[]),...(local.favorites||[])], watchLater:[...(viewer.watchLater||[]),...(local.watchLater||[])] }; } catch { return { favorites:viewer.favorites||[], watchLater:viewer.watchLater||[] }; } },
  set(v){ localStorage.setItem(storeKey, JSON.stringify(v)); },
  toggle(type, id){ const s=this.get(); const arr=s[type] || []; const key=String(id); const i=arr.indexOf(key); const active=i<0; if(active) arr.push(key); else arr.splice(i,1); s[type]=arr; this.set(s); fetch('/api/viewer/list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({list:type,mediaId:id,active})}).catch(()=>{}); render(); },
  has(type, id){ return (this.get()[type] || []).includes(String(id)); }
};
function esc(s){ return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function bytes(n){ n=Number(n)||0; if(!n) return ''; if(n<1048576) return (n/1024).toFixed(1)+' KB'; if(n<1073741824) return (n/1048576).toFixed(1)+' MB'; return (n/1073741824).toFixed(2)+' GB'; }
function pct(item){ return item.position && item.duration ? Math.max(0,Math.min(100,(item.position/item.duration)*100)) : 0; }
function card(item){
  const p = pct(item);
  const icon = item.kind === 'audio' ? '♪' : '▶';
  return '<a class="tile" href="/player/'+item.id+'" data-title="'+esc(item.title).toLowerCase()+'" data-kind="'+esc(item.kind)+'">'+
    '<div class="quick"><button type="button" title="'+esc(text.favoriteTitle || 'Favorite')+'" class="'+(storage.has('favorites',item.id)?'on':'')+'" data-fav="'+item.id+'">♥</button><button type="button" title="'+esc(text.watchTitle || 'Watch later')+'" class="'+(storage.has('watchLater',item.id)?'on':'')+'" data-watch="'+item.id+'">◷</button></div>'+
    '<div class="poster '+(item.kind==='audio'?'audio':'')+'" '+(item.poster?'style="background-image:url(\\''+esc(item.poster)+'\\')"':'')+'>'+(item.poster?'':icon)+'</div>'+
    '<div class="meta"><div class="title">'+esc(item.title)+'</div><div class="sub">'+esc([item.year,item.rating?('★ '+item.rating):'',bytes(item.size)].filter(Boolean).join(' · '))+'</div></div>'+
    (p?'<div class="progress"><i style="width:'+p+'%"></i></div>':'')+'</a>';
}
function renderList(el, list, emptyText){ el.innerHTML = list.length ? list.map(card).join('') : '<div class="empty">'+emptyText+'</div>'; bindQuick(el); }
function bindQuick(root){ root.querySelectorAll('[data-fav],[data-watch]').forEach(btn=>btn.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); storage.toggle(btn.dataset.fav?'favorites':'watchLater', btn.dataset.fav || btn.dataset.watch); }); }
function filtered(){
  const q = document.getElementById('search').value.trim().toLowerCase();
  const kind = document.getElementById('kind').value;
  const view = document.getElementById('view').value;
  const section = document.getElementById('sectionFilter').value;
  return media.filter(item => !q || item.title.toLowerCase().includes(q) || item.file.toLowerCase().includes(q))
    .filter(item => !kind || item.kind === kind)
    .filter(item => !section || item.section === section || item.folder === section)
    .filter(item => view !== 'favorites' || storage.has('favorites', item.id))
    .filter(item => view !== 'watchLater' || storage.has('watchLater', item.id))
    .filter(item => view !== 'continue' || pct(item) > 2);
}
function render(){
  const list = filtered();
  document.getElementById('countLabel').textContent = list.length + ' ' + (text.items || 'item(s)');
  document.getElementById('grid').innerHTML = list.map(card).join('');
  document.getElementById('empty').classList.toggle('hide', list.length > 0);
  bindQuick(document.getElementById('grid'));
  const cont = media.filter(item => pct(item) > 2).slice(0,18);
  document.getElementById('continueSection').classList.toggle('hide', !cont.length);
  renderList(document.getElementById('continueRail'), cont, text.noResume || 'Nothing to resume yet.');
  const favs = media.filter(item => storage.has('favorites', item.id)).slice(0,18);
  document.getElementById('favoritesSection').classList.toggle('hide', !favs.length);
  renderList(document.getElementById('favoritesRail'), favs, text.noFavorites || 'No favorites on this device yet.');
  const heroItem = cont[0] || media.find(x=>x.backdrop) || media[0];
  if(heroItem && heroItem.backdrop) document.getElementById('hero').style.setProperty('--hero','url('+heroItem.backdrop+')');
}
const sectionFilter = document.getElementById('sectionFilter');
sections.forEach(sec => { const opt=document.createElement('option'); opt.value=sec.name; opt.textContent=sec.name+' ('+sec.count+')'; sectionFilter.appendChild(opt); });
document.getElementById('sectionRail').innerHTML = sections.map(sec => '<button class="btn" data-section="'+esc(sec.name)+'">'+esc(sec.name)+' · '+sec.count+'</button>').join('');
document.querySelectorAll('[data-section]').forEach(btn=>btn.onclick=()=>{ sectionFilter.value=btn.dataset.section; render(); });
['search','kind','view','sectionFilter'].forEach(id=>document.getElementById(id).addEventListener('input', render));
render();
</script>
</body></html>`;
}

function playerPage(id, req, res) {
  const viewerId = getViewerId(req, res);
  const viewer = db.viewerState(viewerId);
  const theme = db.mediaTheme();
  const item = db.getMedia(parseInt(id, 10));
  if (!item) return null;
  const items = db.listMedia({ kind: item.kind, limit: 2000 });
  const index = items.findIndex((row) => String(row.id) === String(item.id));
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const subs = db.listSubtitles(item.id).filter((sub) => ['.vtt', '.srt'].includes(path.extname(sub.path || '').toLowerCase()));
  const type = mediaType(item);
  const title = mediaTitle(item);
  const streamUrl = `/media/${item.id}`;
  const downloadUrl = `/media/${item.id}?download=1`;
  const poster = item.backdrop_url || item.poster_url || '';
  const isRtl = theme.direction === 'rtl';
  const text = isRtl ? {
    library: 'المكتبة',
    channels: 'القنوات',
    admin: 'الإدارة',
    unsupportedTitle: 'الصيغة غير مدعومة',
    unsupportedBody: 'لا يستطيع هذا المتصفح تشغيل هذه الصيغة. يمكنك تنزيل الملف أو فتحه بتطبيق خارجي.',
    noOverview: 'لا يوجد وصف متاح لهذا المحتوى.',
    download: 'تنزيل',
    favorite: 'المفضلة',
    removeFavorite: 'إزالة من المفضلة',
    watchLater: 'مشاهدة لاحقاً',
    removeWatchLater: 'إزالة من المشاهدة لاحقاً',
    previous: 'السابق',
    next: 'التالي',
    openVlc: 'فتح في VLC',
    openMx: 'فتح في MX Player',
    playlist: 'القائمة',
    noPlaylist: 'لا توجد عناصر أخرى في القائمة.',
    stillWatching: 'هل ما زلت تشاهد؟',
    stillWatchingBody: 'سيتم إيقاف التشغيل خلال',
    secondsSuffix: 'ثانية إذا لم يكن هناك تفاعل.',
    yes: 'نعم، أتابع',
    stop: 'إيقاف الآن',
  } : {
    library: 'Library',
    channels: 'Channels',
    admin: 'Admin',
    unsupportedTitle: 'Unsupported format',
    unsupportedBody: 'This browser cannot play this format. You can download it or open it in an external player.',
    noOverview: 'No description is available for this title.',
    download: 'Download',
    favorite: 'Favorite',
    removeFavorite: 'Remove favorite',
    watchLater: 'Watch later',
    removeWatchLater: 'Remove watch later',
    previous: 'Previous',
    next: 'Next',
    openVlc: 'Open VLC',
    openMx: 'Open MX Player',
    playlist: 'Playlist',
    noPlaylist: 'No playlist items.',
    stillWatching: 'Still watching?',
    stillWatchingBody: 'Playback will stop in',
    secondsSuffix: 'seconds if there is no activity.',
    yes: 'Yes, continue',
    stop: 'Stop now',
  };
  const playlist = items.slice(Math.max(0, index - 12), index + 13);
  const metaJson = jsonForScript({
    id: item.id,
    title,
    position: item.position || 0,
    duration: item.wp_duration || item.duration || 0,
    streamUrl,
  });
  const viewerPayload = jsonForScript({ favorites: viewer.favorites || [], watchLater: viewer.watchLater || [] });
  const textPayload = jsonForScript(text);
  const playlistHtml = playlist.map((row, i) => {
    const current = String(row.id) === String(item.id);
    const p = row.poster_url ? `style="background-image:url('${escapeHtml(row.poster_url)}')"` : '';
    return `<a class="track ${current ? 'current' : ''}" href="/player/${row.id}">
      <span>${Math.max(1, index - 11 + i)}</span>
      <b ${p}>${row.poster_url ? '' : (row.kind === 'audio' ? '♪' : '▶')}</b>
      <strong>${escapeHtml(mediaTitle(row))}</strong>
    </a>`;
  }).join('');
  const subtitleTracks = subs.map((sub, i) => `<track kind="subtitles" src="/sub/${sub.id}" srclang="${escapeHtml(sub.lang || 'auto')}" label="${escapeHtml(sub.label || sub.lang || 'Subtitle')}" ${i === 0 ? 'default' : ''}>`).join('');
  return `<!doctype html>
<html lang="${theme.direction === 'rtl' ? 'ar' : 'en'}" dir="${theme.direction}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} - Manara</title>
<style>
:root{color-scheme:dark;--bg:#070b19;--panel:#10182f;--line:rgba(255,255,255,.1);--text:#eef2ff;--muted:#a7b3cf;--accent:${escapeHtml(theme.accent)}}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(90deg,rgba(7,11,25,.98),rgba(7,11,25,.82)),url('${escapeHtml(poster)}');background-size:cover;background-position:center;color:var(--text);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:1280px;margin:auto;padding:18px}.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.bar a,.btn{border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff;text-decoration:none;border-radius:8px;padding:9px 12px;font-weight:800;cursor:pointer}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px}.player{background:#000;border:1px solid var(--line);border-radius:8px;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.42);position:relative}
video,audio{width:100%;display:block;background:#000}video{aspect-ratio:16/9;max-height:72vh}.audioBox{min-height:360px;display:grid;place-items:center;background:linear-gradient(135deg,#111936,#123c4a)}.audioBox audio{max-width:560px}
.logo{position:absolute;top:18px;right:18px;background:rgba(0,0,0,.36);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:8px 10px;font-weight:900;pointer-events:none}
.info{padding:16px 2px}.info h1{font-size:clamp(24px,4vw,44px);line-height:1.05;margin:0 0 10px}.info p{color:#dbeafe;line-height:1.75;max-width:900px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.side{background:rgba(16,24,47,.88);border:1px solid var(--line);border-radius:8px;padding:12px;max-height:82vh;overflow:auto}.side h2{font-size:16px;margin:0 0 10px}.track{display:grid;grid-template-columns:28px 54px minmax(0,1fr);gap:9px;align-items:center;color:#fff;text-decoration:none;border-radius:8px;padding:7px}.track:hover,.track.current{background:rgba(59,130,246,.18)}.track span{color:var(--muted);font-size:12px}.track b{height:42px;background:#1a2544 center/cover no-repeat;border-radius:6px;display:grid;place-items:center;color:#93c5fd}.track strong{font-size:12px;line-height:1.35}
.unsupported{aspect-ratio:16/9;display:grid;place-items:center;background:#121826;padding:22px;text-align:center}.unsupported h2{margin:0 0 8px}.unsupported p{color:var(--muted)}
.watch{position:fixed;inset:0;display:none;place-items:center;background:rgba(3,7,18,.74);padding:18px;z-index:5}.watch>div{max-width:420px;background:#101936;border:1px solid var(--line);border-radius:8px;padding:20px;text-align:center}.watch p{color:var(--muted);line-height:1.7}
@media(max-width:980px){.layout{grid-template-columns:1fr}.side{max-height:none}.bar{flex-wrap:wrap}}
</style>
</head><body>
<script id="mediaMeta" type="application/json">${metaJson}</script>
<script id="viewerMeta" type="application/json">${viewerPayload}</script>
<script id="textMeta" type="application/json">${textPayload}</script>
<div class="wrap">
  <div class="bar"><a href="/library">${escapeHtml(text.library)}</a><div><a href="/">${escapeHtml(text.channels)}</a> <a href="/admin">${escapeHtml(text.admin)}</a></div></div>
  <div class="layout">
    <main>
      <div class="player">
        <div class="logo">${theme.logoUrl ? `<img src="${escapeHtml(theme.logoUrl)}" style="height:28px;vertical-align:middle;margin-inline-end:6px">` : ''}${escapeHtml(theme.brandName)}</div>
        ${type === 'audio' ? `<div class="audioBox"><audio id="media" controls autoplay src="${streamUrl}"></audio></div>` : ''}
        ${type === 'video' ? `<video id="media" controls autoplay playsinline crossorigin="anonymous" poster="${escapeHtml(item.backdrop_url || item.poster_url || '')}"><source src="${streamUrl}" type="${escapeHtml(MIME[path.extname(item.path || '').toLowerCase()] || 'video/mp4')}">${subtitleTracks}</video>` : ''}
        ${type === 'unsupported' ? `<div class="unsupported"><div><h2>${escapeHtml(text.unsupportedTitle)}</h2><p>${escapeHtml(text.unsupportedBody)}</p></div></div>` : ''}
      </div>
      <div class="info">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(item.overview || text.noOverview)}</p>
        <div class="actions">
          <a class="btn" href="${downloadUrl}" download>${escapeHtml(text.download)}</a>
          <button class="btn" id="favBtn">${escapeHtml(text.favorite)}</button>
          <button class="btn" id="watchBtn">${escapeHtml(text.watchLater)}</button>
          ${prev ? `<a class="btn" href="/player/${prev.id}">${escapeHtml(text.previous)}</a>` : ''}
          ${next ? `<a class="btn" href="/player/${next.id}">${escapeHtml(text.next)}</a>` : ''}
          <button class="btn" id="vlcBtn">${escapeHtml(text.openVlc)}</button>
          <button class="btn" id="mxBtn">${escapeHtml(text.openMx)}</button>
        </div>
      </div>
    </main>
    <aside class="side"><h2>${escapeHtml(text.playlist)}</h2>${playlistHtml || `<p>${escapeHtml(text.noPlaylist)}</p>`}</aside>
  </div>
</div>
<div class="watch" id="watchPrompt"><div><h2>${escapeHtml(text.stillWatching)}</h2><p>${escapeHtml(text.stillWatchingBody)} <b id="countdown">60</b> ${escapeHtml(text.secondsSuffix)}</p><button class="btn" id="yesBtn">${escapeHtml(text.yes)}</button> <button class="btn" id="stopBtn">${escapeHtml(text.stop)}</button></div></div>
<script>
const meta = JSON.parse(document.getElementById('mediaMeta').textContent || '{}');
const viewer = JSON.parse(document.getElementById('viewerMeta').textContent || '{}');
const text = JSON.parse(document.getElementById('textMeta').textContent || '{}');
const media = document.getElementById('media');
const storeKey = 'manaraMediaStorage';
function getStore(){ try { const local=JSON.parse(localStorage.getItem(storeKey)) || {}; return { favorites:[...(viewer.favorites||[]),...(local.favorites||[])], watchLater:[...(viewer.watchLater||[]),...(local.watchLater||[])] }; } catch { return { favorites:viewer.favorites||[], watchLater:viewer.watchLater||[] }; } }
function setStore(v){ localStorage.setItem(storeKey, JSON.stringify(v)); }
function toggle(type){ const s=getStore(); const key=String(meta.id); const arr=s[type]||[]; const i=arr.indexOf(key); const active=i<0; if(active) arr.push(key); else arr.splice(i,1); s[type]=arr; setStore(s); fetch('/api/viewer/list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({list:type,mediaId:meta.id,active})}).catch(()=>{}); syncButtons(); }
function has(type){ return (getStore()[type]||[]).includes(String(meta.id)); }
function syncButtons(){ favBtn.textContent=has('favorites')?(text.removeFavorite || 'Remove favorite'):(text.favorite || 'Favorite'); watchBtn.textContent=has('watchLater')?(text.removeWatchLater || 'Remove watch later'):(text.watchLater || 'Watch later'); }
favBtn.onclick=()=>toggle('favorites'); watchBtn.onclick=()=>toggle('watchLater'); syncButtons();
if(media){
  media.addEventListener('loadedmetadata',()=>{ if(meta.position && meta.position < media.duration - 8) media.currentTime = meta.position; },{once:true});
  let last=0; function save(){ if(!media.duration) return; const now=Date.now(); if(now-last<5000) return; last=now; fetch('/api/media/'+meta.id+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({position:media.currentTime,duration:media.duration,completed:(media.currentTime/media.duration)>=0.85}),keepalive:true}).catch(()=>{}); }
  media.addEventListener('timeupdate', save); window.addEventListener('pagehide', save);
}
const full = location.origin + meta.streamUrl;
vlcBtn.onclick=()=>{ location.href='vlc://'+encodeURIComponent(full); setTimeout(()=>open(full,'_blank'),900); };
mxBtn.onclick=()=>{ location.href='intent:'+full+'#Intent;package=com.mxtech.videoplayer.ad;S.title='+encodeURIComponent(meta.title||'Manara')+';end'; };
const prompt=document.getElementById('watchPrompt'); const countdown=document.getElementById('countdown'); let idle, tick, left=60;
function stop(){ if(media){ media.pause(); media.removeAttribute('src'); media.load(); } prompt.style.display='none'; }
function reset(){ clearTimeout(idle); clearInterval(tick); prompt.style.display='none'; idle=setTimeout(show,45*60*1000); }
function show(){ left=60; countdown.textContent=left; prompt.style.display='grid'; tick=setInterval(()=>{ left--; countdown.textContent=left; if(left<=0) stop(); },1000); }
yesBtn.onclick=reset; stopBtn.onclick=stop; ['mousemove','keydown','touchstart','play','pause','seeked'].forEach(e=>addEventListener(e,reset,{passive:true})); reset();
</script>
</body></html>`;
}

function streamFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d+)?/.exec(range);
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': type,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

async function streamRemote(req, res, remoteUrl) {
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const upstream = await fetch(remoteUrl, { headers });
  if (!upstream.ok && upstream.status !== 206) {
    res.writeHead(upstream.status || 502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Remote media failed: ${upstream.status} ${upstream.statusText}`);
    return;
  }
  const outHeaders = {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
  };
  for (const h of ['content-length', 'content-range']) {
    const v = upstream.headers.get(h);
    if (v) outHeaders[h.replace(/(^|-)([a-z])/g, (m) => m.toUpperCase())] = v;
  }
  res.writeHead(upstream.status, outHeaders);
  Readable.fromWeb(upstream.body).pipe(res);
}

function createHandler(options = {}) {
  return async (req, res) => {
    const u = url.parse(req.url, true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      });
      res.end();
      return;
    }
    if (u.pathname === '/admin/login' && req.method === 'GET') {
      return send(res, 200, adminLoginPage(), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (u.pathname === '/admin/login' && req.method === 'POST') {
      const auth = typeof options.getAdminAuth === 'function' ? options.getAdminAuth() : {};
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const username = auth.username || 'admin';
      const password = auth.password || 'admin';
      if (params.get('username') === username && params.get('password') === password) {
        return send(res, 302, '', {
          'Location': '/admin',
          'Set-Cookie': `manara_admin=${Buffer.from(`${username}:${password}`).toString('base64')}; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=604800`,
        });
      }
      return send(res, 401, adminLoginPage('Invalid username or password.'), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (u.pathname === '/admin') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      if (!featureAllowed(options, 'webAdmin')) return denyFeature(req, res, options, 'webAdmin');
      return send(res, 200, adminPage(options), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (/^\/api\/admin\//.test(u.pathname) && !featureAllowed(options, 'webAdmin')) {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      return denyFeature(req, res, options, 'webAdmin');
    }
    if (u.pathname === '/library') {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      return send(res, 200, libraryPage(req, res), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (u.pathname === '/api/library') {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      const media = listLibraryItems(u.query);
      return sendJson(res, 200, {
        media,
        sections: librarySections(media),
        theme: db.mediaTheme(),
        viewer: db.viewerState(getViewerId(req, res)),
      });
    }
    let m = /^\/player\/(\d+)$/.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      const html = playerPage(m[1], req, res);
      if (!html) return send(res, 404, 'Media not found', { 'Content-Type': 'text/plain; charset=utf-8' });
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (u.pathname === '/api/admin/state') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      return sendJson(res, 200, {
        broadcast: db.listBroadcastChannels(),
        iptv: db.listIptv(),
        cloudIptv: safeCloudIptvList(),
        media: db.listMedia({ limit: 500 }),
        mediaStats: db.mediaStats(),
        sessions: db.listSessions(),
        blocks: db.listBlocks(),
        logs: db.listAccessLogs(200),
        blockedMessage: db.blockedMessage(),
      });
    }
    if (u.pathname === '/api/admin/iptv' && req.method === 'POST') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const body = await parseJsonBody(req);
        if (!body.name || !body.url) return sendJson(res, 400, { error: 'name and url are required' });
        const id = db.addIptv({ ...body, enabled: true });
        if (options.onChannelsChanged) options.onChannelsChanged();
        return sendJson(res, 200, db.getIptv(id));
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    let adminMatch = /^\/api\/admin\/iptv\/(\d+)(?:\/toggle)?$/.exec(u.pathname);
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      db.removeIptv(adminMatch[1]);
      if (options.onChannelsChanged) options.onChannelsChanged();
      return sendJson(res, 200, { ok: true });
    }
    adminMatch = /^\/api\/admin\/iptv\/(\d+)\/toggle$/.exec(u.pathname);
    if (adminMatch && req.method === 'POST') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      const ch = db.getIptv(adminMatch[1]);
      if (!ch) return sendJson(res, 404, { error: 'not found' });
      const updated = db.updateIptv(adminMatch[1], { ...ch, enabled: !ch.enabled });
      if (options.onChannelsChanged) options.onChannelsChanged();
      return sendJson(res, 200, updated);
    }
    if (u.pathname === '/api/admin/broadcast' && req.method === 'PUT') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const body = await parseJsonBody(req);
        if (!Array.isArray(body.channels)) return sendJson(res, 400, { error: 'channels must be an array' });
        const channels = db.setBroadcastChannels(body.channels);
        if (options.onChannelsChanged) options.onChannelsChanged();
        return sendJson(res, 200, { channels });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/admin/blocklist' && req.method === 'POST') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const body = await parseJsonBody(req);
        if (!body.identifier) return sendJson(res, 400, { error: 'identifier is required' });
        const block = db.addBlock(body);
        return sendJson(res, 200, { block });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    adminMatch = /^\/api\/admin\/blocklist\/([^/]+)$/.exec(u.pathname);
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      db.removeBlock(decodeURIComponent(adminMatch[1]));
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/admin/block-message' && req.method === 'PUT') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const body = await parseJsonBody(req);
        return sendJson(res, 200, { message: db.setBlockedMessage(body.message) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    adminMatch = /^\/api\/admin\/media\/(\d+)$/.exec(u.pathname);
    if (adminMatch && req.method === 'PUT') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const body = await parseJsonBody(req);
        const media = db.updateMedia(parseInt(adminMatch[1], 10), body);
        if (!media) return sendJson(res, 404, { error: 'not found' });
        return sendJson(res, 200, { media });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        db.removeMedia(parseInt(adminMatch[1], 10), { deleteFile: u.query.deleteFile === '1' });
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/admin/media-stats') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      return sendJson(res, 200, db.mediaStats());
    }
    if (u.pathname === '/api/admin/health') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      return sendJson(res, 200, healthDiagnostics());
    }
    if (u.pathname === '/api/admin/reports/views.json') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      return sendJson(res, 200, { stats: db.mediaStats(), logs: db.listAccessLogs(600) });
    }
    if (u.pathname === '/api/admin/reports/views.csv') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      return send(res, 200, reportCsv(db.listAccessLogs(600)), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="manara-media-report.csv"',
      });
    }
    if (u.pathname === '/api/admin/media-theme' && req.method === 'PUT') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const body = await parseJsonBody(req);
        return sendJson(res, 200, { theme: db.setMediaTheme(body) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/admin/library-paths' && req.method === 'POST') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const body = await parseJsonBody(req);
        if (!body.path) return sendJson(res, 400, { error: 'path is required' });
        db.addPath(body.path, body.kind || 'movies', 0);
        return sendJson(res, 200, { paths: db.listPaths() });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    adminMatch = /^\/api\/admin\/library-paths\/(\d+)$/.exec(u.pathname);
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      db.removePath(parseInt(adminMatch[1], 10));
      return sendJson(res, 200, { paths: db.listPaths() });
    }
    if (u.pathname === '/api/admin/scan' && req.method === 'POST') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const cfg = typeof options.getLibraryConfig === 'function' ? options.getLibraryConfig() : {};
        const result = await scanner.scanAll({ tmdbKey: cfg.tmdbKey || '', tmdbLang: cfg.tmdbLang || 'ar' });
        return sendJson(res, 200, { ok: true, ...result });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    if (u.pathname === '/api/admin/upload' && req.method === 'POST') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const body = await parseJsonBody(req);
        if (!body.name || !body.base64) return sendJson(res, 400, { error: 'name and base64 are required' });
        const baseDir = path.dirname(db.diagnostics().mediaFallbackPath || db.diagnostics().channelsPath || process.cwd());
        const importDir = path.join(baseDir, 'uploads');
        fs.mkdirSync(importDir, { recursive: true });
        const safeName = path.basename(String(body.name)).replace(/[^\w.\- ()\u0600-\u06FF]/g, '_');
        const target = path.join(importDir, Date.now() + '-' + safeName);
        fs.writeFileSync(target, Buffer.from(body.base64, 'base64'));
        const id = db.upsertMedia({
          path: target,
          kind: ['movie', 'episode', 'audio'].includes(body.kind) ? body.kind : 'movie',
          title: path.basename(safeName).replace(/\.[^.]+$/, '').replace(/[._]+/g, ' '),
          size: fs.statSync(target).size,
          section: 'Uploads',
          folder: 'Uploads',
        });
        return sendJson(res, 200, { ok: true, media: db.getMedia(id) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/viewer/state') {
      const viewerId = getViewerId(req, res);
      return sendJson(res, 200, db.viewerState(viewerId));
    }
    if (u.pathname === '/api/viewer/list' && req.method === 'POST') {
      try {
        const viewerId = getViewerId(req, res);
        const body = await parseJsonBody(req);
        const list = body.list === 'watchLater' ? 'watchLater' : 'favorites';
        return sendJson(res, 200, db.updateViewerList(viewerId, list, body.mediaId, !!body.active));
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    m = /^\/api\/media\/(\d+)\/progress$/.exec(u.pathname);
    if (m && req.method === 'POST') {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      try {
        const item = db.getMedia(parseInt(m[1], 10));
        if (!item) return sendJson(res, 404, { error: 'not found' });
        if (denyIfBlocked(req, res, { targetType: 'media', targetId: item.id, targetName: item.title })) return;
        const body = await parseJsonBody(req);
        db.setProgress(item.id, body.position, body.duration);
        db.recordViewerHistory(getViewerId(req, res), item.id, body);
        db.addAccessLog({
          ip: clientIp(req),
          userAgent: req.headers['user-agent'] || '',
          action: 'progress',
          targetType: 'media',
          targetId: item.id,
          targetName: item.title,
          status: 200,
          message: `${Math.round(Number(body.position) || 0)} / ${Math.round(Number(body.duration) || 0)}`,
        });
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    m = /^\/api\/media\/(\d+)$/.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      const item = db.getMedia(parseInt(m[1], 10));
      if (!item) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, { media: item, subtitles: db.listSubtitles(item.id) });
    }
    m = /^\/media\/(\d+)$/.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      try {
        const item = db.getMedia(parseInt(m[1], 10));
        if (!item) { res.writeHead(404); res.end(); return; }
        if (denyIfBlocked(req, res, { targetType: 'media', targetId: item.id, targetName: item.title })) return;
        attachRequestAccounting(req, res, { action: 'media', targetType: 'media', targetId: item.id, targetName: item.title });
        if (/^https?:\/\//i.test(item.remote_url || item.path || '')) return streamRemote(req, res, item.remote_url || item.path);
        return streamFile(req, res, item.path);
      } catch (e) { res.writeHead(500); res.end(String(e.message)); return; }
    }
    m = /^\/sub\/(\d+)$/.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      try {
        const sub = db.getSubtitle(parseInt(m[1], 10));
        if (!sub) { res.writeHead(404); res.end(); return; }
        if (denyIfBlocked(req, res, { targetType: 'subtitle', targetId: sub.id, targetName: sub.label || sub.path })) return;
        attachRequestAccounting(req, res, { action: 'subtitle', targetType: 'subtitle', targetId: sub.id, targetName: sub.label || sub.path });
        if (path.extname(sub.path || '').toLowerCase() === '.srt') {
          return send(res, 200, srtToVtt(fs.readFileSync(sub.path, 'utf8')), {
            'Content-Type': 'text/vtt; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          });
        }
        return streamFile(req, res, sub.path);
      } catch (e) { res.writeHead(500); res.end(String(e.message)); return; }
    }
    // IPTV proxy: /iptv/:id  (local numeric or cloud-<uuid>)
    m = /^\/iptv\/(cloud-[^/]+|\d+)(?:\/(\w+))?$/i.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'iptv')) return denyFeature(req, res, options, 'iptv');
      try {
        const rawId = m[1];
        const sub = m[2] || '';
        let ch = null;
        if (rawId.startsWith('cloud-')) {
          const cc = typeof options.getCloudIptvChannel === 'function'
            ? options.getCloudIptvChannel(rawId)
            : cloudIptv.getById(rawId.slice('cloud-'.length));
          if (cc) ch = { id: rawId, url: cc.url, name: cc.name, enabled: cc.enabled !== false && cc.enabled !== 0, headers: cc.headers || {}, transferLimitBytes: cc.transferLimitBytes || 0 };
        } else {
          ch = db.getIptv(parseInt(rawId, 10));
        }
        if (!ch) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Manara-Error': encodeURIComponent(`IPTV channel was not found: ${rawId}`) });
          res.end(`IPTV channel was not found: ${rawId}`);
          return;
        }
        if (!ch.enabled) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Manara-Error': encodeURIComponent(`IPTV channel is disabled: ${ch.name || rawId}`) });
          res.end(`IPTV channel is disabled: ${ch.name || rawId}`);
          return;
        }
        if (denyIfBlocked(req, res, { targetType: 'iptv', targetId: rawId, targetName: ch.name || rawId })) return;
        attachRequestAccounting(req, res, { action: 'iptv', targetType: 'iptv', targetId: rawId, targetName: ch.name || rawId });
        const baseProxyUrl = `http://${req.headers.host}/iptv/${rawId}`;
        const policy = typeof options.getIptvPolicy === 'function' ? options.getIptvPolicy() : {};
        return iptv.handleRequest(ch, sub, u.query, req, res, baseProxyUrl, policy);
      } catch (e) {
        const message = `Local IPTV proxy failed: ${e.message}`;
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Manara-Error': encodeURIComponent(message) });
        res.end(message);
        return;
      }
    }
    res.writeHead(404); res.end('Manara media');
  };
}

function start(port = 8420, options = {}) {
  const server = http.createServer(createHandler(options));
  server.on('error', (e) => console.error('[media-server]', e.message));
  // Bind to 0.0.0.0 so LAN viewers can pull IPTV through this PC
  server.listen(port, '0.0.0.0');
  return { server, port, close: () => new Promise(r => server.close(r)) };
}

module.exports = { start, createHandler };
