// Multi-channel signaling + viewer landing.
// Channels are registered by the broadcaster app over WebSocket.
// Viewers list channels via GET /api/channels then connect to /ws and join a channel.

const http = require('http');
const { WebSocketServer } = require('ws');

const UNBUILT_UI_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>WIVA</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070b18;color:#f8fafc;font-family:Cairo,system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;text-align:center;padding:24px}
    main{max-width:560px;padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:rgba(255,255,255,.04)}
    h1{margin:0 0 10px;font-size:24px}
    p{margin:0;color:#cbd5e1;line-height:1.8}
  </style>
</head>
<body><main><h1>واجهة WIVA الحديثة غير جاهزة</h1><p>شغّل بناء الواجهة الحديثة أو افتح التطبيق من حزمة الإصدار. لا توجد واجهة قديمة بديلة في هذا المسار.</p></main></body>
</html>`;

function startSignalingServer({
  port = 8787,
  mediaHandler = null,
  getIptvChannels = null,
  getBroadcastChannels = null,
  getFeatureAllowed = null,
} = {}) {
  let brand = {
    brandName: 'ويفا',
    brandTagline: 'خدمة مشاهدة داخل الشبكة',
    accent: '#F8C51C',
    accent2: '#FFD84D',
  };

  // channelId -> { meta:{id,name,description,active}, broadcaster: ws|null, viewers: Map<viewerId, ws> }
  const channels = new Map();
  let nextViewerId = 1;

  function featureAllowed(feature) {
    try {
      return typeof getFeatureAllowed === 'function' ? getFeatureAllowed(feature) !== false : true;
    } catch {
      return true;
    }
  }

  function channelSummary() {
    let broadcast = [];
    if (featureAllowed('channels')) {
      const byId = new Map();
      try {
        const saved = typeof getBroadcastChannels === 'function' ? getBroadcastChannels() : [];
        for (const row of saved || []) {
          const id = String(row?.id || '').trim();
          if (!id || row.enabled === false || row.enabled === 0) continue;
          const liveChannel = channels.get(id);
          byId.set(id, {
            ...row,
            id,
            type: 'broadcast',
            name: row.name || liveChannel?.meta?.name || id,
            description: row.description || liveChannel?.meta?.description || '',
            viewers: liveChannel?.viewers?.size || 0,
            live: !!(liveChannel?.broadcaster && liveChannel.broadcaster.readyState === 1),
          });
        }
      } catch {}
      for (const c of channels.values()) {
        const id = String(c.meta?.id || '').trim();
        if (!id) continue;
        byId.set(id, {
          ...(byId.get(id) || {}),
          ...c.meta,
          id,
          type: 'broadcast',
          viewers: c.viewers.size,
          live: !!(c.broadcaster && c.broadcaster.readyState === 1),
        });
      }
      broadcast = [...byId.values()];
    }
    let iptv = [];
    try {
      iptv = featureAllowed('iptv') && typeof getIptvChannels === 'function' ? getIptvChannels() : [];
    } catch {}
    return [...broadcast, ...iptv];
  }

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (mediaHandler && /^(\/$|\/index\.html(?:\?|$)|\/_next\/|\/live(?:\/|\?|$)|\/watch(?:\/|\?|$)|\/(?:account|favorites|search)(?:\/|\?|$)|\/iptv-player(?:\/|\?|$)|\/favicon\.ico|\/wiva-logo\.png|\/hls\.min\.js(?:\?|$)|\/library-assets\/|\/folder-art\/|\/iptv\/|\/setup(?:\/|\?|$)|\/api\/setup\/|\/api\/platform\/|\/agent(?:\/|\?|$)|\/api\/agent\/|\/admin(?:\/|\?|$)|\/api\/admin\/|\/library(?:\?|\/|$)|\/api\/library(?:\?|\/|$)|\/player\/|\/api\/media\/|\/api\/viewer\/|\/media\/|\/sub\/)/.test(url)) {
      return mediaHandler(req, res);
    }
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(UNBUILT_UI_HTML); return;
    }
    if (url.startsWith('/watch') || url.startsWith('/iptv-player')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(UNBUILT_UI_HTML); return;
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
        if (!featureAllowed('channels')) {
          ws.send(JSON.stringify({ type:'error', message:'broadcast-feature-unavailable' }));
          ws.close();
          return;
        }
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
        if (!featureAllowed('channels')) {
          ws.send(JSON.stringify({ type:'error', message:'broadcast-feature-unavailable' }));
          ws.close();
          return;
        }
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

  server.listen(port, '0.0.0.0', () => {
    const actual = server.address()?.port || port;
    console.log('[WIVA] signaling on :' + actual);
  });

  return {
    get port() { return server.address()?.port || port; },
    setBrand: (b) => { brand = { ...brand, ...b }; },
    onStats: (fn) => { broadcasterListeners.add(fn); return () => broadcasterListeners.delete(fn); },
    getStats: () => ({ channels: channelSummary() }),
    address: () => server.address(),
    close: () => new Promise((resolve) => {
      try { wss.close(); } catch {}
      try { server.close(() => resolve()); } catch { resolve(); }
    }),
  };
}

module.exports = { startSignalingServer };
