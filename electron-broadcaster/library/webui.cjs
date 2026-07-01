// Serves the modern WIVA web UI (built from webui/) and a live event stream.
// This keeps all HTML/markup out of media-server.cjs — the server only serves
// static build artifacts plus JSON APIs and media/IPTV streams.
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(path.join(__dirname, '..', 'webui', 'dist'));
const INDEX_FILE = path.join(DIST_DIR, 'index.html');

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

let _available = null;
function isAvailable() {
  if (_available === null) {
    try {
      _available = fs.existsSync(INDEX_FILE);
    } catch {
      _available = false;
    }
  }
  return _available;
}

function contentType(file) {
  return STATIC_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

// Resolve a request pathname to a safe file inside DIST_DIR (prevents traversal).
function resolveStatic(pathname) {
  const clean = decodeURIComponent(pathname.split('?')[0]);
  const rel = clean.replace(/^\/+/, '');
  const target = path.resolve(DIST_DIR, rel);
  if (target !== DIST_DIR && !target.startsWith(DIST_DIR + path.sep)) return null;
  try {
    if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  } catch {
    /* ignore */
  }
  return null;
}

// Serve a concrete static asset if one matches the request. Returns true when handled.
function serveStatic(req, res, pathname) {
  if (!isAvailable()) return false;
  const file = resolveStatic(pathname);
  if (!file) return false;
  const body = fs.readFileSync(file);
  const hashed = /[.-][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(path.basename(file));
  res.writeHead(200, {
    'Content-Type': contentType(file),
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

// Serve the SPA shell (index.html) for client-side routed navigation requests.
function serveApp(req, res) {
  if (!isAvailable()) return false;
  const body = fs.readFileSync(INDEX_FILE);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

/* ---------------- Live event hub (Server-Sent Events) ---------------- */
const clients = new Set();

function liveHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: message\ndata: ${JSON.stringify({ type: 'hello', data: { at: Date.now() } })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* ignore */
    }
  }, 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

// Push an event to every connected live client.
function broadcast(type, data = {}) {
  const payload = `event: message\ndata: ${JSON.stringify({ type, data })}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

module.exports = {
  DIST_DIR,
  isAvailable,
  serveStatic,
  serveApp,
  liveHandler,
  broadcast,
  clientCount: () => clients.size,
};
