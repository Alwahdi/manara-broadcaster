// WIVA — local HTTP media server with Range support + IPTV proxy
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Readable } = require('stream');
const db = require('./db.cjs');
const iptv = require('./iptv.cjs');
const cloudIptv = require('./cloud-iptv.cjs');
const scanner = require('./scanner.cjs');
const webui = require('./webui.cjs');
const { formatDataBytes, formatTransferLimit, formatDuration } = require('./format.cjs');
const adminLoginAttempts = new Map();
const ADMIN_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 8;

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

// Offline-safe font stack for the few standalone HTML responses the server still
// renders (admin login, feature-gate notice, UI-not-built fallback). WIVA runs on
// isolated LANs, so we must never pull fonts from a CDN. Cairo is preferred and
// falls back to system fonts when it is not installed on the viewing device.
const HTML_FONT_STACK = '"Cairo","Tajawal",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif';

// Minimal notice shown only when the built web UI (webui/dist) is missing — i.e.
// a broken/dev build. In normal production the SPA is always packaged and served,
// so this should never appear to end users. Kept tiny and offline-safe on purpose.
function uiUnavailable(res) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WIVA</title><style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05070d;color:#eef2ff;font-family:${HTML_FONT_STACK};text-align:center;padding:24px;line-height:1.7}main{max-width:520px}h1{font-size:22px;margin:0 0 10px}p{color:#9aa6c7;margin:0}</style></head><body><main><h1>واجهة WIVA غير مبنية بعد</h1><p>لم يتم العثور على واجهة الويب المبنية. شغّل <code>npm run build:webui</code> ثم أعد تشغيل الوكيل.</p></main></body></html>`;
  return send(res, 503, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
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

function appendCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) return res.setHeader('Set-Cookie', cookie);
  if (Array.isArray(existing)) return res.setHeader('Set-Cookie', [...existing, cookie]);
  return res.setHeader('Set-Cookie', [existing, cookie]);
}

function getViewerId(req, res) {
  const cookies = parseCookies(req);
  const existing = cookies.manara_viewer;
  if (existing) return existing;
  const id = randomId('viewer');
  appendCookie(res, `manara_viewer=${encodeURIComponent(id)}; Path=/; SameSite=Lax; Max-Age=31536000`);
  return id;
}

function getViewerContext(req, res) {
  const cookies = parseCookies(req);
  const account = db.viewerAccountBySession(cookies.manara_user || '');
  if (account?.viewerId) {
    appendCookie(res, `manara_viewer=${encodeURIComponent(account.viewerId)}; Path=/; SameSite=Lax; Max-Age=31536000`);
    return { viewerId: account.viewerId, account, signedIn: true };
  }
  const viewerId = getViewerId(req, res);
  return { viewerId, account: null, signedIn: false };
}

function viewerAuthErrorMessage(code) {
  return {
    name_required: 'اكتب الاسم أولاً.',
    phone_required: 'اكتب رقم الهاتف أو رقم الغرفة أولاً.',
    account_disabled: 'هذا الحساب غير متاح حالياً.',
    email_required: 'أدخل بريداً إلكترونياً صحيحاً.',
    password_too_short: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل.',
    account_exists: 'يوجد حساب بهذا البريد بالفعل.',
    invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    message_required: 'اكتب الرسالة أولاً.',
  }[code] || 'تعذر تنفيذ الطلب حالياً.';
}

function setViewerAccountCookies(res, token, viewerId) {
  appendCookie(res, `manara_user=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  appendCookie(res, `manara_viewer=${encodeURIComponent(viewerId)}; Path=/; SameSite=Lax; Max-Age=31536000`);
}

function adminRateKey(req) {
  return clientIp(req);
}

function adminRateStatus(req) {
  const key = adminRateKey(req);
  const now = Date.now();
  const entry = adminLoginAttempts.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (entry.lockedUntil && entry.lockedUntil > now) return { locked: true, retryAfterMs: entry.lockedUntil - now };
  if (now - entry.firstAt > ADMIN_LOGIN_WINDOW_MS) return { locked: false, count: 0, firstAt: now, key };
  return { locked: false, count: entry.count || 0, firstAt: entry.firstAt || now, key };
}

function recordAdminLogin(req, ok) {
  const status = adminRateStatus(req);
  if (ok) {
    adminLoginAttempts.delete(adminRateKey(req));
    return;
  }
  const count = Number(status.count || 0) + 1;
  const entry = {
    count,
    firstAt: status.firstAt || Date.now(),
    lockedUntil: count >= ADMIN_LOGIN_MAX_ATTEMPTS ? Date.now() + ADMIN_LOGIN_WINDOW_MS : 0,
  };
  adminLoginAttempts.set(adminRateKey(req), entry);
}

function verifyAdminCredentials(options, username, password) {
  if (typeof options.verifyAdminCredentials === 'function') {
    return !!options.verifyAdminCredentials({ username, password });
  }
  const auth = typeof options.getAdminAuth === 'function' ? options.getAdminAuth() : {};
  return String(username || '') === String(auth.username || 'admin') && String(password || '') === String(auth.password || 'admin');
}

function requireAdmin(req, res, options = {}, basePath = '/admin') {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Basic ') ? header.slice(6) : '';
  const cookieToken = parseCookies(req).manara_admin || '';
  let provided = '';
  try { provided = Buffer.from(token, 'base64').toString('utf8'); } catch {}
  const sep = provided.indexOf(':');
  const basicOk = sep > -1 && verifyAdminCredentials(options, provided.slice(0, sep), provided.slice(sep + 1));
  const sessionOk = cookieToken && typeof options.verifyAdminSession === 'function' && options.verifyAdminSession(cookieToken);
  if (basicOk || sessionOk) return true;
  if (String(req.headers.accept || '').includes('text/html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(adminLoginPage('', basePath));
    return false;
  }
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="WIVA LAN Admin"',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('تسجيل الدخول مطلوب');
  return false;
}

function adminLoginPage(error = '', basePath = '/admin') {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دخول إدارة WIVA</title><style>:root{color-scheme:dark;--bg:#07090f;--panel:#111827;--line:rgba(226,232,240,.14);--text:#f8fafc;--muted:#9ca3af;--accent:#2563eb;--accent2:#14b8a6}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top right,rgba(37,99,235,.24),transparent 34%),linear-gradient(180deg,#080a12,#0b1020);color:var(--text);font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;padding:22px}.login{width:min(430px,100%)}.mark{display:flex;align-items:center;gap:12px;margin-bottom:14px}.mark img{height:38px;max-width:120px;object-fit:contain}.brand b{display:block;font-size:16px}.brand span{display:block;color:var(--muted);font-size:12px;margin-top:2px}.card{border:1px solid var(--line);background:rgba(16,24,39,.92);border-radius:8px;padding:22px;box-shadow:0 26px 80px rgba(0,0,0,.36)}h1{font-size:23px;margin:0 0 7px;letter-spacing:0}.lead{color:#cbd5e1;line-height:1.7;margin:0 0 18px;font-size:13px}label{display:block;color:#dbeafe;font-size:12px;font-weight:900;margin-top:12px}input{width:100%;margin:7px 0 2px;padding:13px 14px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:#0b1220;color:#fff;font:inherit;outline:none}input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.18)}button{width:100%;min-height:46px;padding:12px;border:0;border-radius:8px;background:linear-gradient(135deg,var(--accent),#1d4ed8);color:#fff;font-weight:900;margin-top:16px;cursor:pointer;font:inherit}.err{color:#fecaca;background:rgba(127,29,29,.26);border:1px solid rgba(248,113,113,.34);border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.6}.note{margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.7;text-align:center}</style></head><body><main class="login"><div class="mark"><img src="/wiva-logo.png" alt="WIVA"><div class="brand"><b>WIVA</b><span>إدارة الشبكة المحلية</span></div></div><form class="card" method="post" action="${escapeHtml(basePath)}/login"><h1>تسجيل الدخول</h1><p class="lead">ادخل ببيانات الإدارة لإدارة القنوات، IPTV، المكتبة، المشاهدين، والتقارير.</p>${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}<label>اسم المستخدم<input name="username" autocomplete="username" placeholder="admin" required autofocus></label><label>كلمة المرور<input name="password" type="password" autocomplete="current-password" placeholder="كلمة المرور" required></label><button>دخول إلى اللوحة</button><p class="note">الجلسة محفوظة على هذا الجهاز لمدة أسبوع.</p></form></main></body></html>`;
}

function mediaTitle(item) {
  if (!item) return '';
  const ep = item.season ? ` S${String(item.season).padStart(2, '0')}E${String(item.episode || 1).padStart(2, '0')}` : '';
  return `${item.title || 'بدون عنوان'}${ep}`;
}

function mediaType(item) {
  const ext = path.extname(item?.path || '').toLowerCase();
  if (['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.aac', '.wma', '.opus'].includes(ext) || item?.kind === 'audio') return 'audio';
  if (['.mp4', '.m4v', '.webm', '.mov', '.ts'].includes(ext)) return 'video';
  return 'unsupported';
}

const ARTWORK_EXT = ['.jpg', '.jpeg', '.jpe', '.jfif', '.png', '.webp', '.avif', '.gif', '.bmp'];
const FOLDER_ARTWORK_NAMES = [
  'poster', 'cover', 'folder', 'thumbnail', 'thumb',
  'fanart', 'backdrop', 'background', 'landscape', 'banner',
  'art', 'artwork', 'preview', 'screenshot', 'screen',
  'front', 'frontcover', 'front-cover', 'default', 'movie', 'movies',
  'series', 'show', 'tv', 'season', 'season01', 'season 01',
  'folder-poster', 'folder-cover', 'cover-front', 'poster-large',
  'بوستر', 'غلاف', 'صورة', 'خلفية', 'ملصق',
];

function artworkMime(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.avif') return 'image/avif';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.bmp') return 'image/bmp';
  return 'image/jpeg';
}

function bundledAssetMime(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/png';
}

function findArtworkFile(item) {
  const source = String(item?.path || '');
  if (!source || /^https?:\/\//i.test(source)) return '';
  const dir = path.dirname(source);
  const base = path.basename(source, path.extname(source));
  const candidates = [];
  for (const ext of ARTWORK_EXT) candidates.push(path.join(dir, base + ext), path.join(dir, base + '-poster' + ext), path.join(dir, base + '.poster' + ext));
  for (const name of FOLDER_ARTWORK_NAMES) for (const ext of ARTWORK_EXT) candidates.push(path.join(dir, name + ext));
  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate) && fs.statSync(candidate).isFile(); } catch { return false; }
  }) || '';
}

function findFolderArtworkFile(folderPath) {
  const dir = String(folderPath || '');
  if (!dir) return '';
  const candidates = [];
  const folderBase = path.basename(dir.replace(/[\\/]+$/g, ''));
  const names = [...FOLDER_ARTWORK_NAMES, folderBase].filter(Boolean);
  for (const name of names) {
    for (const variant of [name, `.${name}`, `_${name}`]) {
      for (const ext of ARTWORK_EXT) candidates.push(path.join(dir, variant + ext));
    }
  }
  const exact = candidates.find((candidate) => {
    try { return fs.existsSync(candidate) && fs.statSync(candidate).isFile(); } catch { return false; }
  }) || '';
  if (exact) return exact;
  try {
    const images = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && ARTWORK_EXT.includes(path.extname(entry.name).toLowerCase()))
      .slice(0, 300)
      .map((entry) => path.join(dir, entry.name));
    images.sort((a, b) => {
      const scoreA = folderArtworkScore(a, folderBase);
      const scoreB = folderArtworkScore(b, folderBase);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true });
    });
    return images[0] || '';
  } catch {
    return '';
  }
}

function folderArtworkScore(filePath, folderBase = '') {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase().replace(/[_\-.]+/g, ' ').trim();
  const folder = String(folderBase || '').toLowerCase().replace(/[_\-.]+/g, ' ').trim();
  if (folder && base === folder) return 1000;
  const exactIndex = FOLDER_ARTWORK_NAMES.findIndex((name) => base === String(name).toLowerCase().replace(/[_\-.]+/g, ' ').trim());
  if (exactIndex >= 0) return 900 - exactIndex;
  if (/poster|cover|folder|بوستر|غلاف|ملصق/i.test(base)) return 760;
  if (/fanart|backdrop|background|landscape|خلفية/i.test(base)) return 650;
  if (/thumb|thumbnail|preview|screenshot|screen|صورة/i.test(base)) return 520;
  if (/logo|banner/i.test(base)) return 420;
  return 100;
}

function mediaPosterUrl(item) {
  if (item?.poster_url) return item.poster_url;
  return findArtworkFile(item) ? `/media-art/${item.id}/poster` : '';
}

function mediaBackdropUrl(item) {
  if (item?.backdrop_url) return item.backdrop_url;
  return findArtworkFile(item) ? `/media-art/${item.id}/poster` : '';
}

function mediaOnline(item) {
  const source = String(item?.remote_url || item?.path || '');
  if (!source || /^https?:\/\//i.test(source)) return true;
  try { return fs.existsSync(source); } catch { return false; }
}

function mediaPayload(item) {
  if (!item) return item;
  const poster = mediaPosterUrl(item);
  const backdrop = mediaBackdropUrl(item);
  return {
    ...item,
    poster,
    posterUrl: poster,
    backdrop,
    backdropUrl: backdrop,
    durationSec: Number(item.duration || item.durationSec || 0) || 0,
    online: mediaOnline(item),
  };
}

function listLibraryItems(query = {}) {
  return db.listMedia({
    q: query.q || '',
    kind: query.kind || '',
    limit: Math.min(100000, Math.max(1, Number(query.limit) || 800)),
  }).map(mediaPayload);
}

function uniqueByPath(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = String(row.path || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function storageRoots() {
  const roots = [];
  const add = (label, rootPath, type = 'folder') => {
    try {
      if (!rootPath || !fs.existsSync(rootPath)) return;
      const st = fs.statSync(rootPath);
      roots.push({ label, path: rootPath, type, readable: true, isDirectory: st.isDirectory() });
    } catch {
      roots.push({ label, path: rootPath, type, readable: false, isDirectory: true });
    }
  };
  if (process.platform === 'win32') {
    for (let code = 67; code <= 90; code += 1) {
      const drive = String.fromCharCode(code) + ':\\';
      add(drive, drive, 'drive');
    }
  } else {
    add('الجهاز', '/', 'drive');
    add('الأقراص الخارجية', '/Volumes', 'drive');
  }
  add('المجلد الشخصي', os.homedir(), 'home');
  add('سطح المكتب', path.join(os.homedir(), 'Desktop'), 'folder');
  add('التنزيلات', path.join(os.homedir(), 'Downloads'), 'folder');
  return uniqueByPath(roots);
}

function browseStoragePath(rawPath) {
  const requested = String(rawPath || '').trim();
  const target = requested || os.homedir();
  let stat;
  try {
    stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      return { ok: false, path: target, message: 'المسار المحدد ليس مجلداً. اختر مجلداً يحتوي على ملفات الوسائط.' };
    }
  } catch {
    return { ok: false, path: target, message: 'لا يمكن فتح هذا المسار. تأكد أن القرص متصل وأن الصلاحيات متاحة.' };
  }
  let rows = [];
  try {
    rows = fs.readdirSync(target, { withFileTypes: true }).slice(0, 500).map((entry) => {
      const fullPath = path.join(target, entry.name);
      let childStat = null;
      try { childStat = fs.statSync(fullPath); } catch {}
      const isDirectory = entry.isDirectory() || (entry.isSymbolicLink() && !!childStat?.isDirectory?.());
      return {
        name: entry.name,
        path: fullPath,
        // 'dir' | 'file' — matches the web UI StorageEntry contract.
        type: isDirectory ? 'dir' : 'file',
        readable: !!childStat,
        size: childStat?.size || 0,
        modifiedAt: childStat?.mtimeMs || 0,
      };
    }).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'dir' ? -1 : 1));
  } catch {
    return { ok: false, path: target, message: 'لا توجد صلاحية لقراءة هذا المجلد.' };
  }
  return {
    ok: true,
    path: target,
    parent: path.dirname(target) !== target ? path.dirname(target) : '',
    entries: rows,
    folders: rows.filter((entry) => entry.type === 'dir').length,
    files: rows.filter((entry) => entry.type === 'file').length,
  };
}

function validateLibraryPath(rawPath) {
  const target = String(rawPath || '').trim();
  if (!target) return { ok: false, message: 'اختر مجلداً أولاً.' };
  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return { ok: false, message: 'هذا المسار ليس مجلداً.' };
    fs.accessSync(target, fs.constants.R_OK);
    const preview = browseStoragePath(target);
    return {
      ok: true,
      path: target,
      message: 'المجلد جاهز للإضافة.',
      folders: preview.folders || 0,
      files: preview.files || 0,
    };
  } catch {
    return { ok: false, path: target, message: 'لا يمكن قراءة هذا المجلد. تحقق من توصيل القرص أو صلاحيات الوصول.' };
  }
}

function libraryPathStatus(row) {
  const result = validateLibraryPath(row.path);
  const items = db.listMedia({ limit: 100000 }).filter((item) => String(item.path || '').startsWith(String(row.path || '')));
  return {
    ...row,
    status: result.ok ? 'connected' : 'disconnected',
    message: result.message,
    fileCount: items.length,
    lastScanAt: items.reduce((max, item) => Math.max(max, Number(item.scanned_at || 0)), 0),
  };
}

// Library sources for the modern web UI. A disconnected drive keeps its media
// records and simply reports online:false (media is never deleted on unplug).
function librarySourcesPayload() {
  return db.listPaths().map((row) => {
    const info = libraryPathStatus(row);
    const excludePaths = Array.isArray(row.exclude_paths) ? row.exclude_paths : Array.isArray(row.excludePaths) ? row.excludePaths : [];
    return {
      id: row.id,
      label: row.label || info.message || String(row.path || ''),
      path: row.path,
      kind: row.kind || 'movies',
      online: info.status === 'connected',
      mediaCount: info.fileCount,
      lastScan: info.lastScanAt || row.last_scan_at || null,
      message: info.message,
      excludePaths,
      exclude_paths: excludePaths,
    };
  });
}

function normalizeExcludePaths(value, rootPath = '') {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n|,/) : [];
  const root = String(rootPath || '').trim();
  const seen = new Set();
  return raw
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .map((entry) => {
      if (!root || path.isAbsolute(entry)) return entry;
      return path.join(root, entry);
    })
    .map((entry) => path.normalize(entry).replace(/[\\/]+$/g, ''))
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 200);
}

// Minimal, dependency-free M3U/M3U8 playlist parser for IPTV import preview.
function parseM3U(content) {
  const text = String(content || '');
  const lines = text.split(/\r?\n/);
  const channels = [];
  let pending = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const name = (line.split(',').slice(1).join(',') || '').trim();
      const attrs = {};
      const attrRe = /([\w-]+)="([^"]*)"/g;
      let m;
      while ((m = attrRe.exec(line))) attrs[m[1]] = m[2];
      pending = {
        name: name || attrs['tvg-name'] || 'قناة',
        group: attrs['group-title'] || '',
        logo: attrs['tvg-logo'] || '',
      };
    } else if (!line.startsWith('#')) {
      const url = line;
      const base = pending || { name: 'قناة', group: '', logo: '' };
      channels.push({ id: channels.length + 1, name: base.name, group: base.group, logo: base.logo, url });
      pending = null;
    }
  }
  return channels;
}

// Aggregated service/system diagnostics for the admin diagnostics page.
function diagnosticsPayload(options) {
  const health = serviceHealth(options);
  let dbDiag = {};
  try { dbDiag = db.diagnostics(); } catch { dbDiag = {}; }
  const services = [
    { name: 'خادم الوسائط', ok: true, detail: 'يعمل' },
    { name: 'قنوات IPTV', ok: !!iptv.status, detail: 'وكيل البث' },
    { name: 'قاعدة البيانات', ok: !!dbDiag, detail: dbDiag.driver || (dbDiag.mediaFallbackPath ? 'JSON' : 'SQLite') },
    { name: 'البث المباشر', ok: webui.clientCount() >= 0, detail: `${webui.clientCount()} متصل` },
  ];
  return {
    health,
    services,
    system: {
      platform: os.platform(),
      arch: os.arch(),
      uptimeSec: Math.round(process.uptime()),
      memory: process.memoryUsage().rss,
      liveClients: webui.clientCount(),
      node: process.version,
    },
  };
}


function librarySections(items = listLibraryItems({ limit: 5000 })) {
  const sections = new Map();
  for (const item of items) {
    const section = item.section || (item.kind === 'episode' ? 'مسلسلات' : item.kind === 'audio' ? 'صوتيات' : 'أفلام');
    const folder = item.folder || section;
    if (!sections.has(section)) sections.set(section, { name: section, count: 0, cover: '', folders: new Map() });
    const sec = sections.get(section);
    sec.count += 1;
    if (!sec.cover) sec.cover = mediaBackdropUrl(item) || mediaPosterUrl(item);
    const current = sec.folders.get(folder) || { name: folder, count: 0, cover: '' };
    current.count += 1;
    if (!current.cover) current.cover = mediaPosterUrl(item) || mediaBackdropUrl(item);
    sec.folders.set(folder, current);
  }
  return Array.from(sections.values()).map((sec) => ({
    name: sec.name,
    count: sec.count,
    cover: sec.cover || '',
    folders: Array.from(sec.folders.values()),
  }));
}

function normalizeRelativePath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
}

function isHiddenOrSystemEntry(name = '') {
  const lower = String(name || '').toLowerCase();
  return !lower || lower.startsWith('.') ||
    lower === '$recycle.bin' ||
    lower === 'system volume information' ||
    lower === '@eadir' ||
    lower === 'node_modules';
}

function isDirectoryLikeEntry(entry, parentPath) {
  if (!entry) return false;
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try { return fs.statSync(path.join(parentPath, entry.name)).isDirectory(); }
  catch { return false; }
}

function isWithinPath(rootPath, targetPath) {
  const root = path.resolve(String(rootPath || ''));
  const target = path.resolve(String(targetPath || ''));
  return target === root || target.startsWith(root + path.sep);
}

function sourceExcludeMatcher(source) {
  const root = path.resolve(String(source?.path || ''));
  const excludes = normalizeExcludePaths(source?.excludePaths || source?.exclude_paths || [], root)
    .map((entry) => path.resolve(entry).replace(/[\\/]+$/g, '').toLowerCase());
  return (targetPath) => {
    if (!excludes.length) return false;
    const target = path.resolve(String(targetPath || '')).replace(/[\\/]+$/g, '').toLowerCase();
    return excludes.some((entry) => target === entry || target.startsWith(entry + path.sep));
  };
}

function folderArtworkPathForSource(source, relPath = '') {
  if (!source) return '';
  const root = path.resolve(String(source.path || ''));
  const rel = normalizeRelativePath(relPath || '');
  const target = path.resolve(root, rel);
  const excluded = sourceExcludeMatcher(source);
  if (!isWithinPath(root, target) || excluded(target)) return '';
  return findFolderArtworkFile(target);
}

function folderCoverUrl(source, relPath = '') {
  const art = folderArtworkPathForSource(source, relPath);
  if (!art) return '';
  const query = relPath ? `?path=${encodeURIComponent(normalizeRelativePath(relPath))}` : '';
  return `/folder-art/${encodeURIComponent(String(source.id))}${query}`;
}

const LIBRARY_BROWSE_CACHE_LIMIT = 160;
const LIBRARY_BROWSE_CACHE_TTL_MS = 2 * 60 * 1000;
let libraryBrowseVersion = 1;
const libraryBrowseCache = new Map();

function invalidateLibraryBrowseCache() {
  libraryBrowseVersion += 1;
  libraryBrowseCache.clear();
}

function cachedLibraryBrowsePayload(query = {}) {
  const key = JSON.stringify({
    version: libraryBrowseVersion,
    mediaRevision: typeof db.mediaRevision === 'function' ? db.mediaRevision() : 0,
    sourceId: query.sourceId ? String(query.sourceId) : '',
    path: normalizeRelativePath(query.path || ''),
  });
  const cached = libraryBrowseCache.get(key);
  if (cached && Date.now() - cached.at < LIBRARY_BROWSE_CACHE_TTL_MS) {
    return cached.payload;
  }
  const payload = libraryBrowsePayload(query);
  libraryBrowseCache.set(key, { at: Date.now(), payload });
  if (libraryBrowseCache.size > LIBRARY_BROWSE_CACHE_LIMIT) {
    const firstKey = libraryBrowseCache.keys().next().value;
    if (firstKey) libraryBrowseCache.delete(firstKey);
  }
  return payload;
}

function libraryBrowsePayload(query = {}) {
  const sources = db.listPaths().map((source) => {
    let online = source.status !== 'missing';
    try { online = online && fs.existsSync(source.path) && fs.statSync(source.path).isDirectory(); } catch { online = false; }
    return {
      id: source.id,
      name: source.label || path.basename(String(source.path || '').replace(/[\\/]+$/g, '')) || source.path,
      path: source.path,
      online,
      excludePaths: Array.isArray(source.excludePaths) ? source.excludePaths : Array.isArray(source.exclude_paths) ? source.exclude_paths : [],
    };
  });
  const media = listLibraryItems({ limit: 100000 });
  const sourceId = query.sourceId ? String(query.sourceId) : '';
  const currentPath = normalizeRelativePath(query.path || '');

  if (!sourceId) {
    const entries = sources.map((source) => {
      const children = media.filter((item) => String(item.source_id || '') === String(source.id));
      const coverItem = children.find((item) => item.poster || item.backdrop) || children[0] || null;
      const localCover = folderCoverUrl(source, '');
      return {
        type: 'folder',
        sourceId: source.id,
        name: source.name,
        path: '',
        fullPath: source.path,
        count: children.length,
        cover: localCover || coverItem?.backdrop || coverItem?.poster || '',
        online: source.online,
      };
    }).filter((entry) => entry.count > 0 || entry.online !== false);
    return { sourceId: '', path: '', breadcrumbs: [], entries, sources };
  }

  const source = sources.find((row) => String(row.id) === sourceId) || null;
  const folders = new Map();
  const files = [];
  if (source?.online) {
    const root = path.resolve(String(source.path || ''));
    const target = path.resolve(root, currentPath);
    const excluded = sourceExcludeMatcher(source);
    if (isWithinPath(root, target) && !excluded(target)) {
      try {
        for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
          if (!isDirectoryLikeEntry(entry, target) || isHiddenOrSystemEntry(entry.name)) continue;
          const fullPath = path.join(target, entry.name);
          if (excluded(fullPath)) continue;
          const rel = normalizeRelativePath(path.relative(root, fullPath));
          if (!rel) continue;
          folders.set(rel, {
            type: 'folder',
            sourceId,
            name: entry.name,
            path: rel,
            count: 0,
            cover: folderCoverUrl(source, rel),
            online: true,
          });
        }
      } catch {}
    }
  }
  for (const item of media.filter((row) => String(row.source_id || '') === sourceId)) {
    const rel = normalizeRelativePath(item.relative_path || path.basename(item.path || item.title || ''));
    if (!rel) continue;
    if (currentPath && rel !== currentPath && !rel.startsWith(currentPath + '/')) continue;
    const rest = currentPath ? rel.slice(currentPath.length).replace(/^\/+/, '') : rel;
    if (!rest) continue;
    const parts = rest.split('/').filter(Boolean);
    if (parts.length > 1) {
      const folderName = parts[0];
      const folderPath = normalizeRelativePath([currentPath, folderName].filter(Boolean).join('/'));
      const current = folders.get(folderPath) || {
        type: 'folder',
        sourceId,
        name: folderName,
        path: folderPath,
        count: 0,
        cover: folderCoverUrl(source, folderPath),
        online: true,
      };
      current.count += 1;
      if (!current.cover) current.cover = item.backdrop || item.poster || '';
      if (item.online === false) current.online = false;
      folders.set(folderPath, current);
    } else {
      files.push({
        type: 'media',
        sourceId,
        name: item.title || parts[0] || path.basename(item.path || ''),
        path: rel,
        media: item,
        cover: item.poster || item.backdrop || '',
        online: item.online !== false,
      });
    }
  }

  const crumbs = [];
  const crumbParts = currentPath ? currentPath.split('/').filter(Boolean) : [];
  for (let i = 0; i < crumbParts.length; i += 1) {
    crumbs.push({ name: crumbParts[i], path: crumbParts.slice(0, i + 1).join('/') });
  }
  return {
    sourceId,
    source,
    path: currentPath,
    breadcrumbs: crumbs,
    entries: [...Array.from(folders.values()).sort((a, b) => a.name.localeCompare(b.name)), ...files.sort((a, b) => a.name.localeCompare(b.name))],
    sources,
  };
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
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// UTF-8 byte-order mark. Excel on Windows opens a BOM-less UTF-8 file with the
// legacy ANSI code page, which turns Arabic report text into mojibake. Prefixing
// the BOM makes Excel, LibreOffice, and Numbers detect UTF-8 correctly.
const CSV_BOM = '\uFEFF';

function reportCsv(rows) {
  const header = ['time', 'action', 'ip', 'targetType', 'targetId', 'targetName', 'bytes', 'status'];
  // CRLF line endings are the CSV standard and what Windows/Excel expect.
  const body = [header.join(',')]
    .concat((rows || []).map((row) => header.map((key) => csvEscape(key === 'time' ? new Date(row.at).toISOString() : row[key])).join(',')))
    .join('\r\n');
  return CSV_BOM + body + '\r\n';
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

function serviceHealth(options = {}) {
  const state = typeof options.getSetupState === 'function' ? options.getSetupState() : {};
  const mediaStats = (() => { try { return db.mediaStats(); } catch { return null; } })();
  const iptvStatus = (() => { try { return iptv.status(); } catch { return {}; } })();
  return {
    ok: true,
    ready: true,
    app: 'WIVA',
    version: state.version || '',
    setupCompleted: !!state.setupCompleted,
    uptimeSeconds: Math.round(process.uptime()),
    ports: state.ports || {},
    urls: state.urls || {},
    services: {
      agent: { status: 'running' },
      library: { status: 'running', totalItems: mediaStats?.total ?? 0 },
      iptv: { status: 'ready', activeStreams: Object.keys(iptvStatus || {}).length },
    },
    update: state.update || {},
    subscription: state.subscription ? {
      state: state.subscription.state,
      online: !!state.subscription.online,
      checkedAt: state.subscription.checkedAt,
      error: state.subscription.error || '',
    } : null,
    checkedAt: new Date().toISOString(),
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
  send(res, 403, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>البث غير متاح</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d1f;color:#e5e7eb;font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;text-align:center;padding:24px}main{max-width:520px}h1{font-size:24px;margin:0 0 10px}p{color:#cbd5e1;line-height:1.7}</style></head><body><main><h1>البث غير متاح حالياً</h1><p>${escapeHtml(db.blockedMessage())}</p></main></body></html>`, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  return true;
}

function safeCloudIptvList(options = {}) {
  try {
    if (typeof options.getCloudIptv === 'function') return options.getCloudIptv() || [];
    if (typeof options.getCloudIptvChannels === 'function') return options.getCloudIptvChannels() || [];
    return cloudIptv.list();
  }
  catch { return []; }
}

function normalizeCloudIptvId(id) {
  return String(id || '').replace(/^cloud-/i, '');
}

function findCloudIptvChannel(rawId, options = {}) {
  const id = String(rawId || '');
  const normalized = normalizeCloudIptvId(id);
  const candidates = [id, normalized, `cloud-${normalized}`].filter(Boolean);
  if (typeof options.getCloudIptvChannel === 'function') {
    for (const candidate of candidates) {
      try {
        const channel = options.getCloudIptvChannel(candidate);
        if (channel) return channel;
      } catch {}
    }
  }
  for (const channel of safeCloudIptvList(options)) {
    const channelId = String(channel?.id || '');
    const channelNormalized = normalizeCloudIptvId(channelId);
    if (candidates.includes(channelId) || candidates.includes(channelNormalized) || candidates.includes(`cloud-${channelNormalized}`)) {
      return channel;
    }
  }
  try { return cloudIptv.getById(normalized); }
  catch { return null; }
}

function channelEnabled(ch) {
  const value = ch?.enabled;
  if (value === false || value === 0) return false;
  const text = String(value ?? 'true').trim().toLowerCase();
  return !['false', '0', 'off', 'disabled', 'no'].includes(text);
}

function liveChannelsPayload(options = {}) {
  const broadcastAllowed = featureAllowed(options, 'channels');
  const iptvAllowed = featureAllowed(options, 'iptv');
  const broadcast = broadcastAllowed && typeof options.getBroadcastChannels === 'function'
    ? options.getBroadcastChannels()
    : [];
  const iptv = iptvAllowed && typeof options.getIptvChannels === 'function'
    ? options.getIptvChannels()
    : [];
  const safeBroadcast = (Array.isArray(broadcast) ? broadcast : [])
    .filter((ch) => ch && channelEnabled(ch))
    .map((ch) => ({
      ...ch,
      id: String(ch.id),
      type: ch.type || 'broadcast',
      group: ch.group || ch.category || 'البث المحلي',
      enabled: true,
      playUrl: `/watch?ch=${encodeURIComponent(String(ch.id))}`,
    }));
  const safeIptv = (Array.isArray(iptv) ? iptv : [])
    .filter((ch) => ch && channelEnabled(ch))
    .map((ch) => ({
      ...ch,
      id: String(ch.id),
      type: 'iptv',
      group: ch.group || ch.category || 'IPTV',
      enabled: true,
      url: undefined,
      headers: undefined,
      playUrl: `/iptv/${encodeURIComponent(String(ch.id))}/index.m3u8`,
    }));
  return { broadcast: safeBroadcast, iptv: safeIptv, channels: [...safeBroadcast, ...safeIptv] };
}

function platformStatus(options = {}) {
  try {
    return typeof options.getPlatformStatus === 'function' ? options.getPlatformStatus() : null;
  } catch {
    return null;
  }
}

function featureAllowed(options = {}, feature) {
  if (typeof options.getPlatformStatus !== 'function') return true;
  const status = platformStatus(options);
  if (!status) return false;
  if (status.state === 'active' && status.features?.[feature]) return true;
  return false;
}

function platformGateMessage(status, feature) {
  const label = {
    channels: 'القنوات',
    iptv: 'IPTV',
    media: 'مكتبة الوسائط',
    webAdmin: 'إدارة الشبكة',
    analytics: 'التقارير',
    branding: 'التخصيص',
  }[feature] || feature;
  if (!status || status.state === 'unregistered') return `ميزة ${label} غير مفعلة بعد.`;
  if (status.state === 'pending') return `ميزة ${label} بانتظار موافقة مالك المنصة.`;
  if (status.state === 'expired') return `ميزة ${label} غير متاحة لأن الاشتراك منتهي.`;
  if (status.state === 'suspended') return `ميزة ${label} متوقفة مؤقتاً.`;
  return `ميزة ${label} غير موجودة في خطة الاشتراك الحالية.`;
}

function denyFeature(req, res, options, feature) {
  const status = platformStatus(options);
  const message = platformGateMessage(status, feature);
  if (String(req.headers.accept || '').includes('text/html')) {
    send(res, 402, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الميزة غير متاحة</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d1f;color:#e5e7eb;font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;text-align:center;padding:24px}main{max-width:560px}h1{font-size:24px;margin:0 0 10px}p{color:#cbd5e1;line-height:1.7}</style></head><body><main><h1>الميزة غير متاحة حالياً</h1><p>${escapeHtml(message)}</p></main></body></html>`, {
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
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const u = { pathname: parsedUrl.pathname, query: Object.fromEntries(parsedUrl.searchParams.entries()) };
    const configuredAdminPath = '/' + String(typeof options.getAdminPath === 'function' ? options.getAdminPath() : 'admin')
      .replace(/^\/+|\/+$/g, '')
      .replace(/[^\w\-./]/g, '');
    const adminBase = configuredAdminPath === '/' ? '/admin' : configuredAdminPath;
    const adminRouteBases = [...new Set(['/admin', adminBase])];
    const isAdminBase = adminRouteBases.some((base) => u.pathname === base || u.pathname.startsWith(`${base}/`));
    const isAdminLogin = u.pathname === '/admin/login' || u.pathname === `${adminBase}/login`;
    const isAdminLogout = u.pathname === '/admin/logout' || u.pathname === `${adminBase}/logout`;
    setSecurityHeaders(res);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (u.pathname === '/favicon.ico' || u.pathname === '/wiva-logo.png') {
      const asset = path.join(__dirname, '..', 'assets', u.pathname === '/favicon.ico' ? 'icon.png' : 'wiva.png');
      try {
        if (fs.existsSync(asset)) {
          return send(res, 200, fs.readFileSync(asset), {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
          });
        }
      } catch {}
      return send(res, 204, '', { 'Cache-Control': 'public, max-age=86400' });
    }
    if (u.pathname === '/hls.min.js') {
      const asset = path.join(__dirname, '..', 'renderer', 'hls.min.js');
      try {
        if (fs.existsSync(asset)) {
          return send(res, 200, fs.readFileSync(asset), {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          });
        }
      } catch {}
      return send(res, 404, 'hls.js not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    let assetMatch = /^\/library-assets\/([a-z0-9_.-]+)$/.exec(u.pathname);
    if (assetMatch) {
      const asset = path.join(__dirname, '..', 'assets', 'library', assetMatch[1]);
      try {
        if (fs.existsSync(asset) && fs.statSync(asset).isFile()) {
          return send(res, 200, fs.readFileSync(asset), {
            'Content-Type': bundledAssetMime(asset),
            'Cache-Control': 'public, max-age=604800',
          });
        }
      } catch {}
      return send(res, 404, 'Asset not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    // Modern web UI: serve hashed static assets (JS/CSS/fonts) from webui/dist.
    if ((req.method === 'GET' || req.method === 'HEAD') && webui.isAvailable() && webui.serveStatic(req, res, u.pathname)) {
      return;
    }
    // Live status stream (Server-Sent Events) for the web UI.
    if (u.pathname === '/api/live') {
      return webui.liveHandler(req, res);
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      });
      res.end();
      return;
    }
    if (u.pathname === '/health' || u.pathname === '/ready' || u.pathname === '/api/agent/health') {
      return sendJson(res, 200, serviceHealth(options));
    }
    if (u.pathname === '/setup' || u.pathname === '/agent' || u.pathname.startsWith('/setup/')) {
      const state = typeof options.getSetupState === 'function' ? options.getSetupState() : {};
      // Once setup is complete, the setup entry point redirects to admin.
      if (state.setupCompleted && (u.pathname === '/setup' || u.pathname === '/agent')) {
        return send(res, 302, '', {
          Location: adminBase,
          'Cache-Control': 'no-store',
        });
      }
      // Modern setup wizard (single-page app).
      if ((req.method === 'GET' || req.method === 'HEAD') && webui.isAvailable() && webui.serveApp(req, res)) {
        return;
      }
      return uiUnavailable(res);
    }
    if (u.pathname === '/api/agent/state' || u.pathname === '/api/setup/state') {
      const state = typeof options.getSetupState === 'function' ? options.getSetupState() : {};
      return sendJson(res, 200, state);
    }
    if (u.pathname === '/api/platform/activation' && req.method === 'POST') {
      try {
        if (typeof options.requestPlatformActivation !== 'function') {
          return sendJson(res, 503, { ok: false, error: 'platform_activation_unavailable', message: 'Platform activation is not available in this build.' });
        }
        const body = await parseJsonBody(req);
        const status = await options.requestPlatformActivation(body);
        return sendJson(res, 200, { ok: true, subscription: status });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: e.message || 'activation_failed' });
      }
    }
    if (u.pathname === '/api/platform/refresh' && (req.method === 'POST' || req.method === 'GET')) {
      try {
        const status = typeof options.refreshPlatformStatus === 'function'
          ? await options.refreshPlatformStatus()
          : platformStatus(options);
        return sendJson(res, 200, { ok: true, subscription: status || null });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message || 'platform_refresh_failed' });
      }
    }
    if (u.pathname === '/api/setup/port-check') {
      const result = typeof options.checkPort === 'function'
        ? options.checkPort(u.query.port)
        : { ok: false, available: false, message: 'Port check is not available.' };
      return sendJson(res, 200, result);
    }
    if (u.pathname === '/api/setup/save' && req.method === 'POST') {
      try {
        const state = typeof options.getSetupState === 'function' ? options.getSetupState() : {};
        if (state.setupCompleted && !requireAdmin(req, res, options, adminBase)) return;
        const body = await parseJsonBody(req);
        if (!body.networkName && !body.brandName) return sendJson(res, 400, { ok: false, error: 'networkName is required' });
        const next = typeof options.applySetup === 'function' ? await options.applySetup(body) : state;
        return sendJson(res, 200, { ok: true, state: next });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: e.message });
      }
    }
    if (isAdminLogin && typeof options.getPlatformStatus === 'function') {
      const status = platformStatus(options);
      if (!status || status.state !== 'active') {
        if ((req.method === 'GET' || req.method === 'HEAD') && webui.isAvailable() && webui.serveApp(req, res)) return;
        return sendJson(res, 403, {
          error: 'registration_required',
          message: platformGateMessage(status, 'webAdmin'),
          platform: status ? { state: status.state, activationId: status.activationId || '' } : null,
        });
      }
    }
    if (isAdminLogin && req.method === 'GET') {
      return send(res, 200, adminLoginPage('', adminBase), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (isAdminLogout) {
      const cookieToken = parseCookies(req).manara_admin || '';
      if (cookieToken && typeof options.clearAdminSession === 'function') options.clearAdminSession(cookieToken);
      return send(res, 302, '', {
        'Location': `${adminBase}/login`,
        'Set-Cookie': 'manara_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      });
    }
    if (isAdminLogin && req.method === 'POST') {
      const rate = adminRateStatus(req);
      if (rate.locked) {
        const minutes = Math.max(1, Math.ceil(rate.retryAfterMs / 60000));
        return send(res, 429, adminLoginPage(`تم إيقاف محاولات الدخول مؤقتاً. حاول مرة أخرى بعد ${minutes} دقيقة.`, adminBase), {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)),
        });
      }
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const username = String(params.get('username') || '');
      const password = String(params.get('password') || '');
      if (verifyAdminCredentials(options, username, password)) {
        recordAdminLogin(req, true);
        const token = typeof options.issueAdminSession === 'function'
          ? options.issueAdminSession({ username })
          : Buffer.from(`${username}:${password}`).toString('base64');
        return send(res, 302, '', {
          'Location': adminBase,
          'Set-Cookie': `manara_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
        });
      }
      recordAdminLogin(req, false);
      return send(res, 401, adminLoginPage('اسم المستخدم أو كلمة المرور غير صحيحة.', adminBase), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    // Modern admin web app: official UI for /admin and every /admin/* route.
    const isAdminNav = isAdminBase
      || u.pathname.startsWith('/admin/')
      || u.pathname.startsWith(`${adminBase}/`);
    if (isAdminNav && (req.method === 'GET' || req.method === 'HEAD') && !u.pathname.startsWith('/api/')) {
      if (!requireAdmin(req, res, options, adminBase)) return;
      if (!featureAllowed(options, 'webAdmin')) return denyFeature(req, res, options, 'webAdmin');
      if (webui.isAvailable() && webui.serveApp(req, res)) return;
      return uiUnavailable(res);
    }
    if (/^\/api\/admin\//.test(u.pathname) && !featureAllowed(options, 'webAdmin')) {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return denyFeature(req, res, options, 'webAdmin');
    }
    if (u.pathname === '/live' || u.pathname.startsWith('/live/') || u.pathname.startsWith('/watch/channel/')) {
      if (!featureAllowed(options, 'channels') && !featureAllowed(options, 'iptv')) return denyFeature(req, res, options, 'iptv');
      if ((req.method === 'GET' || req.method === 'HEAD') && webui.isAvailable() && webui.serveApp(req, res)) {
        return;
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        return uiUnavailable(res);
      }
    }
    if (u.pathname === '/library' || u.pathname.startsWith('/library/')
        || u.pathname.startsWith('/watch/media/') || u.pathname === '/search'
        || u.pathname === '/favorites' || u.pathname === '/account') {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      if ((req.method === 'GET' || req.method === 'HEAD') && webui.isAvailable() && webui.serveApp(req, res)) {
        return;
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        return uiUnavailable(res);
      }
    }
    if (u.pathname === '/api/library') {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      const media = listLibraryItems(u.query);
      return sendJson(res, 200, {
        media,
        items: media,
        sections: librarySections(media),
        theme: db.mediaTheme(),
        viewer: db.viewerState(getViewerId(req, res)),
      });
    }
    if (u.pathname === '/api/library/browse') {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      res.setHeader('Cache-Control', 'private, max-age=15');
      return sendJson(res, 200, cachedLibraryBrowsePayload(u.query));
    }
    // --- Modern web UI admin API: library sources ---
    if (u.pathname === '/api/admin/library/sources' && req.method === 'GET') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, { sources: librarySourcesPayload() });
    }
    if (u.pathname === '/api/admin/library/sources' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        const validation = validateLibraryPath(body.path);
        if (!validation.ok) return sendJson(res, 400, { error: 'invalid_path', message: validation.message });
        db.addPath(validation.path, body.kind || 'movies', 0, {
          excludePaths: normalizeExcludePaths(body.excludePaths || body.exclude_paths || [], validation.path),
        });
        const cfg = typeof options.getLibraryConfig === 'function' ? options.getLibraryConfig() : {};
        const result = await scanner.scanAll({ tmdbKey: cfg.tmdbKey || '', tmdbLang: cfg.tmdbLang || 'ar', thumbnailDir: cfg.thumbnailDir || '' });
        invalidateLibraryBrowseCache();
        webui.broadcast('library', { path: validation.path, scanned: true });
        return sendJson(res, 200, { ok: true, ...result, sources: librarySourcesPayload() });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    let sourceMatch = /^\/api\/admin\/library\/sources\/(\d+)$/.exec(u.pathname);
    if (sourceMatch && req.method === 'PUT') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const id = parseInt(sourceMatch[1], 10);
        const current = db.listPaths().find((row) => String(row.id) === String(id));
        if (!current) return sendJson(res, 404, { error: 'not_found', message: 'مصدر المكتبة غير موجود.' });
        const body = await parseJsonBody(req);
        const updated = db.updatePath(id, {
          kind: body.kind || current.kind,
          label: body.label,
          excludePaths: body.excludePaths !== undefined || body.exclude_paths !== undefined
            ? normalizeExcludePaths(body.excludePaths || body.exclude_paths || [], current.path)
            : current.exclude_paths,
        });
        invalidateLibraryBrowseCache();
        webui.broadcast('library', { sourceId: id, updated: true });
        return sendJson(res, 200, { ok: true, source: updated, sources: librarySourcesPayload() });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    sourceMatch = /^\/api\/admin\/library\/sources\/(\d+)$/.exec(u.pathname);
    if (sourceMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const id = parseInt(sourceMatch[1], 10);
        const current = db.listPaths().find((row) => String(row.id) === String(id));
        if (!current) return sendJson(res, 404, { error: 'not_found', message: 'مصدر المكتبة غير موجود.' });
        if (Number(current.locked || 0)) return sendJson(res, 403, { error: 'locked_source', message: 'لا يمكن حذف هذا المصدر.' });
        db.deleteMissingForSource(id, []);
        db.removePath(id);
        invalidateLibraryBrowseCache();
        webui.broadcast('library', { sourceId: id, deleted: true });
        return sendJson(res, 200, { ok: true, sources: librarySourcesPayload() });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    sourceMatch = /^\/api\/admin\/library\/sources\/(\d+)\/excludes$/.exec(u.pathname);
    if (sourceMatch && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const id = parseInt(sourceMatch[1], 10);
        const current = db.listPaths().find((row) => String(row.id) === String(id));
        if (!current) return sendJson(res, 404, { error: 'not_found', message: 'مصدر المكتبة غير موجود.' });
        const body = await parseJsonBody(req);
        const excludePath = normalizeExcludePaths([body.path || body.excludePath], current.path)[0];
        if (!excludePath) return sendJson(res, 400, { error: 'invalid_path', message: 'اختر مساراً لاستثنائه.' });
        const updated = db.addPathExclude(id, excludePath);
        const cfg = typeof options.getLibraryConfig === 'function' ? options.getLibraryConfig() : {};
        const result = await scanner.scanAll({ tmdbKey: cfg.tmdbKey || '', tmdbLang: cfg.tmdbLang || 'ar', thumbnailDir: cfg.thumbnailDir || '' });
        invalidateLibraryBrowseCache();
        webui.broadcast('library', { sourceId: id, excluded: true });
        return sendJson(res, 200, { ok: true, ...result, source: updated, sources: librarySourcesPayload() });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    if (sourceMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const id = parseInt(sourceMatch[1], 10);
        const current = db.listPaths().find((row) => String(row.id) === String(id));
        if (!current) return sendJson(res, 404, { error: 'not_found', message: 'مصدر المكتبة غير موجود.' });
        const excludePath = normalizeExcludePaths([u.query.path || ''], current.path)[0];
        if (!excludePath) return sendJson(res, 400, { error: 'invalid_path', message: 'اختر مساراً لحذف الاستثناء.' });
        const updated = db.removePathExclude(id, excludePath);
        const cfg = typeof options.getLibraryConfig === 'function' ? options.getLibraryConfig() : {};
        const result = await scanner.scanAll({ tmdbKey: cfg.tmdbKey || '', tmdbLang: cfg.tmdbLang || 'ar', thumbnailDir: cfg.thumbnailDir || '' });
        invalidateLibraryBrowseCache();
        webui.broadcast('library', { sourceId: id, included: true });
        return sendJson(res, 200, { ok: true, ...result, source: updated, sources: librarySourcesPayload() });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    sourceMatch = /^\/api\/admin\/library\/sources\/(\d+)\/rescan$/.exec(u.pathname);
    if (sourceMatch && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const cfg = typeof options.getLibraryConfig === 'function' ? options.getLibraryConfig() : {};
        const result = await scanner.scanAll({ tmdbKey: cfg.tmdbKey || '', tmdbLang: cfg.tmdbLang || 'ar', thumbnailDir: cfg.thumbnailDir || '' });
        invalidateLibraryBrowseCache();
        webui.broadcast('library', { sourceId: Number(sourceMatch[1]) });
        return sendJson(res, 200, { ok: true, ...result, sources: librarySourcesPayload() });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    sourceMatch = /^\/api\/admin\/library\/sources\/(\d+)\/relink$/.exec(u.pathname);
    if (sourceMatch && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        const validation = validateLibraryPath(body.path);
        if (!validation.ok) return sendJson(res, 400, { error: 'invalid_path', message: validation.message });
        const id = parseInt(sourceMatch[1], 10);
        const existing = db.listPaths().find((row) => String(row.id) === String(id));
        const samePath = existing && String(existing.path) === String(body.path);
        if (samePath) {
          // Same drive came back online — just mark it connected again.
          db.updatePathStatus(id, { status: 'connected' });
        } else {
          // Drive re-mounted at a new location: repoint without deleting media.
          const kind = existing ? existing.kind : 'movies';
          db.deleteMissingForSource(id, []);
          db.removePath(id);
          db.addPath(body.path, kind || 'movies', 0);
        }
        invalidateLibraryBrowseCache();
        webui.broadcast('library', { sourceId: id, relinked: true });
        return sendJson(res, 200, { ok: true, sources: librarySourcesPayload() });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    // --- Modern web UI admin API: IPTV list + two-phase import ---
    if (u.pathname === '/api/admin/iptv' && req.method === 'GET') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      let cloud = [];
      try {
        cloud = safeCloudIptvList(options);
      } catch { cloud = []; }
      const local = db.listIptv().map((ch) => ({ ...ch, sourceKind: 'local' }));
      return sendJson(res, 200, { channels: [...cloud, ...local] });
    }
    if (u.pathname === '/api/admin/iptv/import/preview' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        let content = body.content || '';
        if (!content && body.url) {
          const resp = await fetch(String(body.url), { redirect: 'follow' });
          if (!resp.ok) return sendJson(res, 400, { error: 'fetch_failed', message: `تعذر جلب القائمة (${resp.status}).` });
          content = await resp.text();
        }
        const channels = parseM3U(content);
        return sendJson(res, 200, { channels, count: channels.length });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/admin/iptv/import/commit' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        const channels = Array.isArray(body.channels) ? body.channels : [];
        let added = 0;
        for (const ch of channels) {
          if (!ch || !ch.url) continue;
          db.addIptv({ name: ch.name || 'قناة', url: ch.url, category: ch.group || ch.category || '', logo: ch.logo || '', enabled: true });
          added += 1;
        }
        if (options.onChannelsChanged) options.onChannelsChanged();
        webui.broadcast('iptv', { added });
        return sendJson(res, 200, { ok: true, added });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    // --- Modern web UI admin API: viewers / messages / reports / diagnostics ---
    if (u.pathname === '/api/admin/viewers' && req.method === 'GET') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      const viewers = typeof db.listViewerAccounts === 'function' ? db.listViewerAccounts() : [];
      const sessions = typeof db.listSessions === 'function' ? db.listSessions() : [];
      return sendJson(res, 200, { viewers, sessions });
    }
    if (u.pathname === '/api/admin/messages' && req.method === 'GET') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      const messages = typeof db.listViewerMessages === 'function' ? db.listViewerMessages() : [];
      return sendJson(res, 200, { messages });
    }
    if (u.pathname === '/api/admin/reports' && req.method === 'GET') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      const stats = typeof db.mediaStats === 'function' ? db.mediaStats() : {};
      const sessions = typeof db.listSessions === 'function' ? db.listSessions() : [];
      const viewers = typeof db.listViewerAccounts === 'function' ? db.listViewerAccounts() : [];
      const logs = typeof db.listAccessLogs === 'function' ? db.listAccessLogs(1000) : [];
      const iptvRows = Object.values(iptv.status() || {});
      const iptvTotals = iptvRows.reduce((acc, row) => {
        acc.activeIptvViewers += Number(row.viewers) || 0;
        acc.peakIptvViewers = Math.max(acc.peakIptvViewers, Number(row.peakViewers) || 0);
        acc.iptvUpstreamBytes += Number(row.totalUpstreamBytes) || 0;
        acc.iptvDownstreamBytes += Number(row.totalDownstreamBytes) || 0;
        acc.iptvProviderRequests += Number(row.upstreamRequests) || 0;
        acc.iptvErrors += Number(row.errors) || 0;
        acc.iptvCacheHits += Number(row.cacheHits) || 0;
        acc.iptvCacheMisses += Number(row.cacheMisses) || 0;
        return acc;
      }, {
        activeIptvViewers: 0,
        peakIptvViewers: 0,
        iptvUpstreamBytes: 0,
        iptvDownstreamBytes: 0,
        iptvProviderRequests: 0,
        iptvErrors: 0,
        iptvCacheHits: 0,
        iptvCacheMisses: 0,
      });
      const cacheTotal = iptvTotals.iptvCacheHits + iptvTotals.iptvCacheMisses;
      return sendJson(res, 200, {
        totalMedia: stats.total || stats.count || 0,
        totalMovies: stats.movies || 0,
        totalEpisodes: stats.episodes || 0,
        totalViewers: viewers.length,
        activeSessions: sessions.length,
        totalRequests: logs.length,
        sources: librarySourcesPayload().length,
        ...iptvTotals,
        iptvCacheHitRate: cacheTotal ? Math.round((iptvTotals.iptvCacheHits / cacheTotal) * 100) : 0,
        stats,
        iptv: iptvRows,
      });
    }
    if (u.pathname === '/api/admin/diagnostics' && req.method === 'GET') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, diagnosticsPayload(options));
    }
    let m = /^\/media-art\/(\d+)\/poster$/.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      const item = db.getMedia(parseInt(m[1], 10));
      const art = findArtworkFile(item);
      if (!art) return send(res, 404, 'Artwork not found', { 'Content-Type': 'text/plain; charset=utf-8' });
      return send(res, 200, fs.readFileSync(art), {
        'Content-Type': artworkMime(art),
        'Cache-Control': 'public, max-age=86400',
      });
    }
    m = /^\/media-thumb\/([a-f0-9]{40}\.jpg)$/.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      const cfg = typeof options.getLibraryConfig === 'function' ? options.getLibraryConfig() : {};
      const thumbnailDir = String(cfg.thumbnailDir || '');
      const thumb = thumbnailDir ? path.join(thumbnailDir, m[1]) : '';
      try {
        if (!thumb || !fs.existsSync(thumb) || !fs.statSync(thumb).isFile()) {
          return send(res, 404, 'Thumbnail not found', { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        return send(res, 200, fs.readFileSync(thumb), {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=604800',
        });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    }
    m = /^\/folder-art\/(\d+)$/.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      const source = db.listPaths().find((row) => String(row.id) === String(m[1]));
      const art = folderArtworkPathForSource(source, u.query.path || '');
      if (!art) return send(res, 404, 'Folder artwork not found', { 'Content-Type': 'text/plain; charset=utf-8' });
      return send(res, 200, fs.readFileSync(art), {
        'Content-Type': artworkMime(art),
        'Cache-Control': 'public, max-age=86400',
      });
    }
    m = /^\/player\/(\d+)$/.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      // Legacy player URL: redirect to the modern SPA watch route.
      return send(res, 302, '', {
        Location: `/watch/media/${m[1]}`,
        'Cache-Control': 'no-store',
      });
    }
    if (u.pathname === '/api/admin/state') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, {
        broadcast: db.listBroadcastChannels(),
        iptv: db.listIptv(),
        cloudIptv: safeCloudIptvList(options),
        iptvPolicy: typeof options.getIptvPolicy === 'function' ? options.getIptvPolicy() : {},
        cloudIptvStatus: cloudIptv.status(),
        iptvStatus: iptv.status(),
        media: db.listMedia({ limit: 500 }),
        mediaStats: db.mediaStats(),
        sessions: db.listSessions(),
        viewerAccounts: db.listViewerAccounts(),
        viewerMessages: db.listViewerMessages(200),
        blocks: db.listBlocks(),
        logs: db.listAccessLogs(200),
        blockedMessage: db.blockedMessage(),
      });
    }
    if (u.pathname === '/api/admin/capture-sources' || u.pathname === '/api/admin/capture/devices' || u.pathname === '/api/admin/capture/screens' || u.pathname === '/api/admin/capture/windows' || u.pathname === '/api/admin/capture/audio-devices') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const sources = typeof options.listCaptureSources === 'function'
          ? await options.listCaptureSources()
          : {};
        const payload = {
          screens: Array.isArray(sources.screens) ? sources.screens : [],
          windows: Array.isArray(sources.windows) ? sources.windows : [],
          videoDevices: Array.isArray(sources.videoDevices) ? sources.videoDevices : [],
          audioDevices: Array.isArray(sources.audioDevices) ? sources.audioDevices : [],
          message: sources.message || '',
        };
        if (u.pathname === '/api/admin/capture/screens') return sendJson(res, 200, { screens: payload.screens });
        if (u.pathname === '/api/admin/capture/windows') return sendJson(res, 200, { windows: payload.windows });
        if (u.pathname === '/api/admin/capture/audio-devices') return sendJson(res, 200, { audioDevices: payload.audioDevices });
        return sendJson(res, 200, payload);
      } catch (e) {
        return sendJson(res, 200, { screens: [], windows: [], videoDevices: [], audioDevices: [], message: e.message || 'تعذر قراءة الأجهزة.' });
      }
    }
    if (u.pathname === '/api/admin/capture/probe' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        if (typeof options.probeCaptureSource === 'function') {
          const result = await options.probeCaptureSource(body);
          return sendJson(res, 200, { ok: result.ok !== false, message: result.message || '', ...result });
        }
        // Fallback: validate that a source selection was provided.
        const hasSelection = !!(body.deviceId || body.screenId || body.windowId || body.source || body.kind);
        return sendJson(res, 200, {
          ok: hasSelection,
          message: hasSelection ? 'المصدر جاهز للمعاينة.' : 'اختر مصدر التقاط أولاً.',
        });
      } catch (e) { return sendJson(res, 500, { ok: false, message: e.message }); }
    }
    if (u.pathname === '/api/admin/storage/roots' && req.method === 'GET') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      // Disks/drives of the *Agent* machine (not the browser device), so the
      // in-app file browser can list sources without a manual path. An
      // unreadable drive is reported as offline instead of being hidden.
      const roots = storageRoots().map((r) => ({ ...r, online: r.readable !== false }));
      return sendJson(res, 200, { roots });
    }
    if (u.pathname === '/api/admin/storage/browse' || u.pathname === '/api/admin/files') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, browseStoragePath(u.query.path || ''));
    }
    if (u.pathname === '/api/admin/storage/validate' || u.pathname === '/api/admin/files/validate') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      const pathFromBody = req.method === 'POST' ? (await parseJsonBody(req)).path : u.query.path;
      return sendJson(res, 200, validateLibraryPath(pathFromBody || ''));
    }
    if (u.pathname === '/api/admin/iptv' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        if (!body.name || !body.url) return sendJson(res, 400, { error: 'name and url are required' });
        const id = db.addIptv({ ...body, enabled: true });
        if (options.onChannelsChanged) options.onChannelsChanged();
        return sendJson(res, 200, db.getIptv(id));
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/admin/iptv-policy' && req.method === 'PUT') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        const current = typeof options.getIptvPolicy === 'function' ? options.getIptvPolicy() : {};
        const fallback = {
          iptvGlobalLimitBytes: Math.max(0, Number(body.iptvGlobalLimitBytes ?? current.iptvGlobalLimitBytes ?? 0) || 0),
          cloudIptvRefreshMinutes: Math.max(1, Math.min(1440, Number(body.cloudIptvRefreshMinutes ?? current.cloudIptvRefreshMinutes ?? 3) || 3)),
        };
        const policy = typeof options.updateIptvPolicy === 'function' ? options.updateIptvPolicy(fallback) : fallback;
        return sendJson(res, 200, { ok: true, policy, cloudIptvStatus: cloudIptv.status() });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    let adminMatch = /^\/api\/admin\/iptv\/(\d+)(?:\/toggle)?$/.exec(u.pathname);
    if (adminMatch && (req.method === 'PUT' || req.method === 'PATCH')) {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const ch = db.getIptv(adminMatch[1]);
        if (!ch) return sendJson(res, 404, { error: 'not found' });
        const body = await parseJsonBody(req);
        const updated = db.updateIptv(adminMatch[1], {
          ...ch,
          ...body,
          name: String(body.name ?? ch.name ?? '').trim() || ch.name,
          url: String(body.url ?? ch.url ?? '').trim() || ch.url,
          category: String(body.category ?? ch.category ?? '').trim(),
          logo: String(body.logo ?? ch.logo ?? '').trim(),
          enabled: body.enabled == null ? ch.enabled : body.enabled,
        });
        if (options.onChannelsChanged) options.onChannelsChanged();
        webui.broadcast('iptv', { updated: adminMatch[1] });
        return sendJson(res, 200, updated);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      db.removeIptv(adminMatch[1]);
      if (options.onChannelsChanged) options.onChannelsChanged();
      return sendJson(res, 200, { ok: true });
    }
    adminMatch = /^\/api\/admin\/iptv\/(\d+)\/toggle$/.exec(u.pathname);
    if (adminMatch && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      const ch = db.getIptv(adminMatch[1]);
      if (!ch) return sendJson(res, 404, { error: 'not found' });
      const updated = db.updateIptv(adminMatch[1], { ...ch, enabled: !ch.enabled });
      if (options.onChannelsChanged) options.onChannelsChanged();
      return sendJson(res, 200, updated);
    }
    adminMatch = /^\/api\/admin\/iptv\/(cloud-[^/]+)\/toggle$/i.exec(u.pathname);
    if (adminMatch && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const current = safeCloudIptvList(options).find((ch) => String(ch.id) === String(adminMatch[1]));
        if (!current) return sendJson(res, 404, { error: 'not found' });
        if (typeof options.setCloudIptvEnabled !== 'function') {
          return sendJson(res, 501, { error: 'cloud_iptv_toggle_unavailable' });
        }
        const updated = options.setCloudIptvEnabled(adminMatch[1], current.enabled === false || current.enabled === 0);
        if (options.onChannelsChanged) options.onChannelsChanged();
        return sendJson(res, 200, updated);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    const broadcastApiPaths = ['/api/admin/broadcast', '/api/admin/channels', '/api/admin/broadcast-channels'];
    if (broadcastApiPaths.includes(u.pathname) && req.method === 'GET') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, { channels: db.listBroadcastChannels() });
    }
    if (broadcastApiPaths.includes(u.pathname) && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      // Add a single broadcast channel. The modern "add channel" wizard sends a
      // flat payload (captureKind + sourceId + audioId); a pre-built `source`
      // object is also accepted. This avoids the client having to replace the
      // whole channel list (PUT) just to append one channel.
      try {
        const body = await parseJsonBody(req);
        const name = String(body.name || '').trim();
        if (!name) return sendJson(res, 400, { error: 'name_required', message: 'أدخل اسم القناة قبل الحفظ.' });
        let source = body.source && typeof body.source === 'object' ? body.source : null;
        if (!source) {
          const type = String(body.captureKind || body.sourceType || 'screen').trim();
          const sourceId = String(body.sourceId || '').trim();
          const sourceName = String(body.sourceName || '').trim();
          source = type === 'url'
            ? { type: 'url', url: sourceId, name: sourceName, matchName: sourceName }
            : { type, id: sourceId, name: sourceName, matchName: sourceName };
        } else {
          source = {
            ...source,
            matchName: String(source.matchName || source.name || body.sourceName || '').trim(),
          };
        }
        const channel = db.upsertBroadcastChannel({
          id: body.id || ('ch_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex')),
          name,
          description: body.description || '',
          source,
          audioDeviceId: String(body.audioId || body.audioDeviceId || 'none').trim() || 'none',
          audioDeviceName: String(body.audioName || body.audioDeviceName || '').trim(),
          audioDeviceMatchName: String(body.audioDeviceMatchName || body.audioName || body.audioDeviceName || '').trim(),
          resolution: body.resolution || '1920x1080',
          fps: body.fps || 30,
          bitrateKbps: body.bitrateKbps || 8000,
          audioBitrateKbps: body.audioBitrateKbps || 256,
          audioMode: body.audioMode || 'cinema',
          audioGain: body.audioGain || 1.05,
          autoStart: !!body.autoStart,
          enabled: body.enabled !== false,
        });
        if (options.onChannelsChanged) options.onChannelsChanged();
        webui.broadcast('channels', { added: channel.id });
        return sendJson(res, 200, channel);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (broadcastApiPaths.includes(u.pathname) && req.method === 'PUT') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        let nextChannels = Array.isArray(body.channels) ? body.channels : null;
        if (!nextChannels && (body.channel || body.name)) {
          const existing = db.listBroadcastChannels();
          nextChannels = [...existing, body.channel || body];
        }
        if (!Array.isArray(nextChannels)) return sendJson(res, 400, { error: 'channels must be an array' });
        const channels = db.setBroadcastChannels(nextChannels);
        if (options.onChannelsChanged) options.onChannelsChanged();
        return sendJson(res, 200, { channels });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    adminMatch = /^\/api\/admin\/(?:broadcast|channels|broadcast-channels)\/([^/]+)$/.exec(u.pathname);
    if (adminMatch && (req.method === 'PUT' || req.method === 'PATCH')) {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const id = decodeURIComponent(adminMatch[1]);
        const current = db.listBroadcastChannels().find((ch) => String(ch.id) === String(id));
        if (!current) return sendJson(res, 404, { error: 'not found' });
        const body = await parseJsonBody(req);
        let source = body.source && typeof body.source === 'object' ? body.source : current.source || {};
        if (body.sourceId || body.captureKind || body.sourceName) {
          const type = String(body.captureKind || body.sourceType || source.type || 'screen').trim();
          source = {
            ...source,
            type,
            id: String(body.sourceId || source.id || '').trim(),
            name: String(body.sourceName || source.name || '').trim(),
            matchName: String(body.sourceMatchName || body.sourceName || source.matchName || source.name || '').trim(),
          };
        }
        const channel = db.upsertBroadcastChannel({
          ...current,
          ...body,
          id,
          name: String(body.name ?? current.name ?? '').trim() || current.name,
          description: body.description ?? current.description ?? '',
          source,
          audioDeviceId: String(body.audioId ?? body.audioDeviceId ?? current.audioDeviceId ?? 'none').trim() || 'none',
          audioDeviceName: String(body.audioName ?? body.audioDeviceName ?? current.audioDeviceName ?? '').trim(),
          audioDeviceMatchName: String(body.audioDeviceMatchName ?? body.audioName ?? body.audioDeviceName ?? current.audioDeviceMatchName ?? current.audioDeviceName ?? '').trim(),
          enabled: body.enabled == null ? current.enabled !== false : body.enabled !== false && body.enabled !== 0,
        });
        if (options.onChannelsChanged) options.onChannelsChanged();
        webui.broadcast('channels', { updated: channel.id });
        return sendJson(res, 200, channel);
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      const id = decodeURIComponent(adminMatch[1]);
      const channels = db.setBroadcastChannels(db.listBroadcastChannels().filter((ch) => String(ch.id) !== String(id)));
      if (options.onChannelsChanged) options.onChannelsChanged();
      return sendJson(res, 200, { channels });
    }
    if (u.pathname === '/api/admin/blocklist' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        if (!body.identifier) return sendJson(res, 400, { error: 'identifier is required' });
        const block = db.addBlock(body);
        return sendJson(res, 200, { block });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    adminMatch = /^\/api\/admin\/blocklist\/([^/]+)$/.exec(u.pathname);
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      db.removeBlock(decodeURIComponent(adminMatch[1]));
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/admin/block-message' && req.method === 'PUT') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        return sendJson(res, 200, { message: db.setBlockedMessage(body.message) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    adminMatch = /^\/api\/admin\/viewer-messages\/([^/]+)\/status$/.exec(u.pathname);
    if (adminMatch && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        const message = db.updateViewerMessageStatus(decodeURIComponent(adminMatch[1]), body.status);
        if (!message) return sendJson(res, 404, { error: 'not found' });
        return sendJson(res, 200, { message });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    adminMatch = /^\/api\/admin\/media\/(\d+)$/.exec(u.pathname);
    if (adminMatch && req.method === 'PUT') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        const media = db.updateMedia(parseInt(adminMatch[1], 10), body);
        if (!media) return sendJson(res, 404, { error: 'not found' });
        return sendJson(res, 200, { media });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        db.removeMedia(parseInt(adminMatch[1], 10), { deleteFile: u.query.deleteFile === '1' });
        return sendJson(res, 200, { ok: true });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/admin/media-stats') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, db.mediaStats());
    }
    if (u.pathname === '/api/admin/health') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, healthDiagnostics());
    }
    if (u.pathname === '/api/admin/iptv-analytics') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, { status: iptv.status() });
    }
    if (u.pathname === '/api/admin/reports/views.json') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, { stats: db.mediaStats(), logs: db.listAccessLogs(600) });
    }
    if (u.pathname === '/api/admin/reports/views.csv') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return send(res, 200, reportCsv(db.listAccessLogs(600)), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="manara-media-report.csv"',
      });
    }
    if (u.pathname === '/api/admin/media-theme' && req.method === 'PUT') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        return sendJson(res, 200, { theme: db.setMediaTheme(body) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/admin/library-paths' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        const validation = validateLibraryPath(body.path);
        if (!validation.ok) return sendJson(res, 400, { error: 'invalid_path', message: validation.message });
        db.addPath(body.path, body.kind || 'movies', 0);
        invalidateLibraryBrowseCache();
        webui.broadcast('library', { path: validation.path, added: true });
        return sendJson(res, 200, { paths: db.listPaths() });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    adminMatch = /^\/api\/admin\/library-paths\/(\d+)$/.exec(u.pathname);
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      const id = parseInt(adminMatch[1], 10);
      const current = db.listPaths().find((row) => String(row.id) === String(id));
      if (current && Number(current.locked || 0)) return sendJson(res, 403, { error: 'locked_source', message: 'لا يمكن حذف هذا المصدر.' });
      db.deleteMissingForSource(id, []);
      db.removePath(id);
      invalidateLibraryBrowseCache();
      webui.broadcast('library', { sourceId: id, deleted: true });
      return sendJson(res, 200, { paths: db.listPaths() });
    }
    if (u.pathname === '/api/admin/scan' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const cfg = typeof options.getLibraryConfig === 'function' ? options.getLibraryConfig() : {};
        const result = await scanner.scanAll({ tmdbKey: cfg.tmdbKey || '', tmdbLang: cfg.tmdbLang || 'ar', thumbnailDir: cfg.thumbnailDir || '' });
        invalidateLibraryBrowseCache();
        webui.broadcast('library', { scanned: true });
        return sendJson(res, 200, { ok: true, ...result });
      } catch (e) { return sendJson(res, 500, { ok: false, error: e.message }); }
    }
    if (u.pathname === '/api/admin/upload' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
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
          section: 'المرفوعات',
          folder: 'المرفوعات',
        });
        return sendJson(res, 200, { ok: true, media: db.getMedia(id) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/viewer/state') {
      const ctx = getViewerContext(req, res);
      return sendJson(res, 200, { ...db.viewerState(ctx.viewerId), ...liveChannelsPayload(options), account: ctx.account });
    }
    if (u.pathname === '/api/viewer/signup' && req.method === 'POST') {
      try {
        const anonymousViewerId = getViewerId(req, res);
        const body = await parseJsonBody(req);
        const session = db.authenticateViewerProfile({ ...body, fromViewerId: anonymousViewerId });
        setViewerAccountCookies(res, session.token, session.account.viewerId);
        return sendJson(res, 200, { ok: true, account: session.account, viewer: db.viewerState(session.account.viewerId) });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: e.message, message: viewerAuthErrorMessage(e.message) });
      }
    }
    if (u.pathname === '/api/viewer/signin' && req.method === 'POST') {
      try {
        const anonymousViewerId = getViewerId(req, res);
        const body = await parseJsonBody(req);
        const session = db.authenticateViewerProfile({ ...body, fromViewerId: anonymousViewerId });
        setViewerAccountCookies(res, session.token, session.account.viewerId);
        return sendJson(res, 200, { ok: true, account: session.account, viewer: db.viewerState(session.account.viewerId) });
      } catch (e) {
        return sendJson(res, 401, { ok: false, error: e.message, message: viewerAuthErrorMessage(e.message) });
      }
    }
    if (u.pathname === '/api/viewer/logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      db.clearViewerAccountSession(cookies.manara_user || '');
      appendCookie(res, 'manara_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/viewer/message' && req.method === 'POST') {
      try {
        const ctx = getViewerContext(req, res);
        const body = await parseJsonBody(req);
        const msg = db.addViewerMessage(ctx.viewerId, {
          ...body,
          name: body.name || ctx.account?.name || '',
          phone: body.phone || ctx.account?.phone || '',
          email: body.email || ctx.account?.email || '',
        });
        return sendJson(res, 200, { ok: true, message: msg });
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: e.message, message: viewerAuthErrorMessage(e.message) });
      }
    }
    if (u.pathname === '/api/viewer/list' && req.method === 'POST') {
      try {
        const viewerId = getViewerContext(req, res).viewerId;
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
        const ctx = getViewerContext(req, res);
        db.setProgress(item.id, body.position, body.duration);
        db.recordViewerHistory(ctx.viewerId, item.id, body);
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
      const item = mediaPayload(db.getMedia(parseInt(m[1], 10)));
      if (!item) return sendJson(res, 404, { error: 'not found' });
      return sendJson(res, 200, { ...item, subtitles: db.listSubtitles(item.id) });
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
    // IPTV proxy: /iptv/:id  (local numeric or cloud-safe id)
    m = /^\/iptv\/([A-Za-z0-9._~-]+)(?:\/([^?]+))?$/i.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'iptv')) return denyFeature(req, res, options, 'iptv');
      try {
        const rawId = decodeURIComponent(m[1]);
        const sub = (m[2] || '').replace(/^\/+|\/+$/g, '');
        let ch = null;
        if (rawId.startsWith('cloud-')) {
          const cc = findCloudIptvChannel(rawId, options);
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
        return iptv.handleRequest(ch, sub === 'index.m3u8' || sub === 'index' ? '' : sub, u.query, req, res, baseProxyUrl, policy);
      } catch (e) {
        const message = `Local IPTV proxy failed: ${e.message}`;
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Manara-Error': encodeURIComponent(message) });
        res.end(message);
        return;
      }
    }
    // Single-page-app fallback: any unmatched navigational GET returns the web
    // UI shell so client-side routing (deep links, refresh) works. API, media
    // and stream paths are excluded above and must never reach here as HTML.
    if ((req.method === 'GET' || req.method === 'HEAD')
        && !u.pathname.startsWith('/api/')
        && !u.pathname.startsWith('/media/')
        && !u.pathname.startsWith('/stream/')
        && !u.pathname.startsWith('/iptv/')
        && !u.pathname.startsWith('/sub/')
        && webui.isAvailable() && webui.serveApp(req, res)) {
      return;
    }
    res.writeHead(404); res.end('WIVA media');
  };
}

function start(port = 8788, options = {}) {
  const server = http.createServer(createHandler(options));
  server.on('error', (e) => console.error('[media-server]', e.message));
  // Bind to 0.0.0.0 so LAN viewers can pull IPTV through this PC
  server.listen(port, '0.0.0.0');
  return { server, port, close: () => new Promise(r => server.close(r)) };
}

module.exports = { start, createHandler };
