// Multi-channel signaling + viewer landing.
// Channels are registered by the broadcaster app over WebSocket.
// Viewers list channels via GET /api/channels then connect to /ws and join a channel.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

function startSignalingServer({ port = 8080, mediaHandler = null, getIptvChannels = null } = {}) {
  const viewerHtml = fs.readFileSync(path.join(__dirname, 'viewer.html'), 'utf8');
  const watchHtml = fs.readFileSync(path.join(__dirname, 'watch.html'), 'utf8');
  const iptvPlayerHtml = fs.readFileSync(path.join(__dirname, 'iptv-player.html'), 'utf8');
  const hlsJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'hls.min.js'), 'utf8');

  let brand = {
    brandName: 'TeraNet',
    brandTagline: 'بث محلي عبر شبكة Wi-Fi — بدون إنترنت',
    accent: '#3b82f6',
    accent2: '#8b5cf6',
  };

  // channelId -> { meta:{id,name,description,active}, broadcaster: ws|null, viewers: Map<viewerId, ws> }
  const channels = new Map();
  let nextViewerId = 1;

  function channelSummary() {
    const broadcast = [...channels.values()].map(c => ({
      ...c.meta,
      type: 'broadcast',
      viewers: c.viewers.size,
      live: !!(c.broadcaster && c.broadcaster.readyState === 1),
    }));
    let iptv = [];
    try {
      iptv = typeof getIptvChannels === 'function' ? getIptvChannels() : [];
    } catch {}
    return [...broadcast, ...iptv];
  }

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(viewerHtml); return;
    }
    if (url.startsWith('/watch')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(watchHtml); return;
    }
    if (url.startsWith('/iptv-player')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(iptvPlayerHtml); return;
    }
    if (url === '/hls.min.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      res.end(hlsJs); return;
    }
    if (url === '/api/brand') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(brand)); return;
    }
    if (url === '/api/channels') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ channels: channelSummary(), brand })); return;
    }
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true })); return;
    }
    if (mediaHandler && /^(\/iptv\/|\/admin(?:\?|$)|\/api\/admin\/|\/library(?:\?|$)|\/api\/library(?:\?|$)|\/media\/|\/sub\/)/.test(url)) {
      return mediaHandler(req, res);
    }
    res.writeHead(404); res.end('Not Found');
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcasterListeners = new Set();
  function emitStats() {
    const stats = { channels: channelSummary() };
    for (const fn of broadcasterListeners) try { fn(stats); } catch {}
  }

  wss.on('connection', (ws) => {
    let role = null;
    let myChannelId = null;
    let viewerId = null;

    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

      // Broadcaster registers a channel. Multiple channels possible via multiple WS
      // connections from the same app.
      if (msg.type === 'register-broadcaster') {
        const id = String(msg.channelId || '');
        if (!id) { ws.send(JSON.stringify({ type:'error', message:'missing channelId' })); ws.close(); return; }
        let ch = channels.get(id);
        if (!ch) {
          ch = { meta: { id, name: msg.name || id, description: msg.description || '' }, broadcaster: null, viewers: new Map() };
          channels.set(id, ch);
        }
        if (ch.broadcaster && ch.broadcaster.readyState === 1 && ch.broadcaster !== ws) {
          try { ch.broadcaster.close(); } catch {}
        }
        ch.broadcaster = ws;
        ch.meta.name = msg.name || ch.meta.name;
        ch.meta.description = msg.description || ch.meta.description;
        role = 'broadcaster'; myChannelId = id;
        ws.send(JSON.stringify({ type:'broadcaster-ready', viewers:[...ch.viewers.keys()] }));
        // notify existing viewers
        for (const v of ch.viewers.values()) {
          if (v.readyState === 1) v.send(JSON.stringify({ type:'broadcaster-online' }));
        }
        emitStats();
        return;
      }

      if (msg.type === 'unregister-broadcaster') {
        const ch = channels.get(myChannelId);
        if (ch && ch.broadcaster === ws) {
          ch.broadcaster = null;
          for (const v of ch.viewers.values()) {
            if (v.readyState === 1) v.send(JSON.stringify({ type:'broadcaster-left' }));
          }
        }
        try { ws.close(); } catch {}
        emitStats();
        return;
      }

      if (msg.type === 'register-viewer') {
        const id = String(msg.channelId || '');
        const ch = channels.get(id);
        if (!ch) { ws.send(JSON.stringify({ type:'error', message:'channel-not-found' })); ws.close(); return; }
        viewerId = String(nextViewerId++);
        ch.viewers.set(viewerId, ws);
        role = 'viewer'; myChannelId = id;
        ws.send(JSON.stringify({ type:'viewer-id', id: viewerId, hasBroadcaster: !!(ch.broadcaster && ch.broadcaster.readyState === 1) }));
        if (ch.broadcaster && ch.broadcaster.readyState === 1) {
          ch.broadcaster.send(JSON.stringify({ type:'viewer-joined', id: viewerId }));
        }
        emitStats();
        return;
      }

      // Relay
      const ch = channels.get(myChannelId);
      if (!ch) return;
      if (role === 'broadcaster' && msg.to) {
        const v = ch.viewers.get(String(msg.to));
        if (v && v.readyState === 1) v.send(JSON.stringify({ ...msg, from:'broadcaster' }));
        return;
      }
      if (role === 'viewer' && ch.broadcaster && ch.broadcaster.readyState === 1) {
        ch.broadcaster.send(JSON.stringify({ ...msg, from: viewerId }));
        return;
      }
    });

    ws.on('close', () => {
      const ch = channels.get(myChannelId);
      if (!ch) return;
      if (role === 'broadcaster' && ch.broadcaster === ws) {
        ch.broadcaster = null;
        for (const v of ch.viewers.values()) {
          if (v.readyState === 1) v.send(JSON.stringify({ type:'broadcaster-left' }));
        }
      } else if (role === 'viewer' && viewerId) {
        ch.viewers.delete(viewerId);
        if (ch.broadcaster && ch.broadcaster.readyState === 1) {
          ch.broadcaster.send(JSON.stringify({ type:'viewer-left', id: viewerId }));
        }
      }
      emitStats();
    });
  });

  server.listen(port, '0.0.0.0', () => console.log('[TeraNet] signaling on :' + port));

  return {
    port,
    setBrand: (b) => { brand = { ...brand, ...b }; },
    onStats: (fn) => { broadcasterListeners.add(fn); return () => broadcasterListeners.delete(fn); },
    getStats: () => ({ channels: channelSummary() }),
    close: () => new Promise((resolve) => {
      try { wss.close(); } catch {}
      try { server.close(() => resolve()); } catch { resolve(); }
    }),
  };
}

module.exports = { startSignalingServer };
