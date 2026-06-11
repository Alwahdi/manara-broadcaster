// Manara — local HTTP media server with Range support + IPTV proxy
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./db.cjs');
const iptv = require('./iptv.cjs');
const cloudIptv = require('./cloud-iptv.cjs');

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t', '.srt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy(new Error('body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseJsonBody(req) {
  return readBody(req).then((body) => body ? JSON.parse(body) : {});
}

function requireAdmin(req, res, getAdminAuth) {
  const auth = typeof getAdminAuth === 'function' ? getAdminAuth() : {};
  const username = auth.username || 'admin';
  const password = auth.password || 'admin';
  const header = req.headers.authorization || '';
  const token = header.startsWith('Basic ') ? header.slice(6) : '';
  let provided = '';
  try { provided = Buffer.from(token, 'base64').toString('utf8'); } catch {}
  if (provided === `${username}:${password}`) return true;
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Manara LAN Admin"',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Authentication required');
  return false;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return 'No limit';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function adminPage(options = {}) {
  const broadcastJson = escapeHtml(JSON.stringify(db.listBroadcastChannels(), null, 2));
  const status = iptv.status();
  const iptvRows = db.listIptv().map((ch) => `
    <tr>
      <td>${escapeHtml(ch.name)}</td>
      <td>${escapeHtml(ch.category || '')}</td>
      <td class="url">Hidden in LAN admin</td>
      <td>${ch.enabled ? 'Enabled' : 'Disabled'}</td>
      <td>${formatBytes(ch.transferLimitBytes)}</td>
      <td>${status[ch.id]?.viewers || 0}</td>
      <td>${formatBytes(status[ch.id]?.totalUpstreamBytes || 0)}</td>
      <td>
        <button data-toggle="${ch.id}">${ch.enabled ? 'Disable' : 'Enable'}</button>
        <button data-del="${ch.id}">Delete</button>
      </td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Manara LAN Admin</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#0b1024;color:#eef2ff}
main{max-width:1100px;margin:auto;padding:24px}
h1{font-size:22px;margin:0 0 18px}
section{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:8px;padding:16px;margin-bottom:14px}
label{display:block;font-size:12px;color:#cbd5e1;margin:10px 0 5px}
input,textarea{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.16);border-radius:6px;padding:9px;background:#111936;color:#fff}
textarea{min-height:240px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
button{border:0;border-radius:6px;padding:8px 11px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;margin:4px 4px 4px 0}
button.secondary{background:#334155}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
td,th{border-bottom:1px solid rgba(255,255,255,.1);padding:8px;text-align:left;vertical-align:top}
.url{word-break:break-all;color:#bfdbfe}
.msg{color:#86efac;font-size:13px;margin-top:8px}
</style>
</head>
<body><main>
<h1>Manara LAN Admin</h1>
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
  <table><thead><tr><th>Name</th><th>Category</th><th>Source URL</th><th>Status</th><th>Limit</th><th>Viewers</th><th>Internet used</th><th>Actions</th></tr></thead><tbody>${iptvRows || '<tr><td colspan="8">No IPTV channels yet.</td></tr>'}</tbody></table>
</section>
<section>
  <h2>Broadcast Channels JSON</h2>
  <p>Edit carefully. This is the same saved channel list used by the Windows app.</p>
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
document.getElementById('saveBroadcast').onclick = async () => {
  const channels = JSON.parse(document.getElementById('broadcastJson').value);
  await api('/api/admin/broadcast', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ channels }) });
  msg.textContent = 'Saved.';
};
</script>
</main></body></html>`;
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
    if (u.pathname === '/admin') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      return send(res, 200, adminPage(options), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (u.pathname === '/api/admin/state') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      return sendJson(res, 200, { broadcast: db.listBroadcastChannels(), iptv: db.listIptv() });
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
    let m = /^\/media\/(\d+)$/.exec(u.pathname);
    if (m) {
      try {
        const item = db.getMedia(parseInt(m[1], 10));
        if (!item) { res.writeHead(404); res.end(); return; }
        return streamFile(req, res, item.path);
      } catch (e) { res.writeHead(500); res.end(String(e.message)); return; }
    }
    m = /^\/sub\/(\d+)$/.exec(u.pathname);
    if (m) {
      try {
        const sub = db.getSubtitle(parseInt(m[1], 10));
        if (!sub) { res.writeHead(404); res.end(); return; }
        return streamFile(req, res, sub.path);
      } catch (e) { res.writeHead(500); res.end(String(e.message)); return; }
    }
    // IPTV proxy: /iptv/:id  (local numeric or cloud-<uuid>)
    m = /^\/iptv\/(cloud-[^/]+|\d+)(?:\/(\w+))?$/i.exec(u.pathname);
    if (m) {
      try {
        const rawId = m[1];
        const sub = m[2] || '';
        let ch = null;
        if (rawId.startsWith('cloud-')) {
          const cc = cloudIptv.getById(rawId.slice('cloud-'.length));
          if (cc) ch = { id: rawId, url: cc.url, name: cc.name, enabled: 1, headers: cc.headers || {}, transferLimitBytes: cc.transferLimitBytes || 0 };
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
