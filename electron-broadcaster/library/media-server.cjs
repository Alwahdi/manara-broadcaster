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
  res.end('تسجيل الدخول مطلوب');
  return false;
}

function adminLoginPage(error = '') {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دخول إدارة منارة</title><style>:root{color-scheme:dark;--bg:#070b16;--panel:#101827;--line:rgba(226,232,240,.14);--text:#f8fafc;--muted:#9ca3af;--accent:#2563eb;--accent2:#14b8a6}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(180deg,rgba(7,11,22,.96),rgba(8,13,24,1)),repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 76px);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;padding:22px}.login{width:min(430px,100%)}.mark{display:flex;align-items:center;gap:10px;margin-bottom:14px}.dot{width:42px;height:42px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;font-weight:900}.brand b{display:block;font-size:16px}.brand span{display:block;color:var(--muted);font-size:12px;margin-top:2px}.card{border:1px solid var(--line);background:rgba(16,24,39,.92);border-radius:8px;padding:22px;box-shadow:0 26px 80px rgba(0,0,0,.36)}h1{font-size:23px;margin:0 0 7px;letter-spacing:0}.lead{color:#cbd5e1;line-height:1.7;margin:0 0 18px;font-size:13px}label{display:block;color:#dbeafe;font-size:12px;font-weight:900;margin-top:12px}input{width:100%;margin:7px 0 2px;padding:13px 14px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:#0b1220;color:#fff;font:inherit;outline:none}input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.18)}button{width:100%;min-height:46px;padding:12px;border:0;border-radius:8px;background:linear-gradient(135deg,var(--accent),#1d4ed8);color:#fff;font-weight:900;margin-top:16px;cursor:pointer;font:inherit}.err{color:#fecaca;background:rgba(127,29,29,.26);border:1px solid rgba(248,113,113,.34);border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.6}.note{margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.7;text-align:center}</style></head><body><main class="login"><div class="mark"><div class="dot">م</div><div class="brand"><b>Manara</b><span>إدارة الشبكة المحلية</span></div></div><form class="card" method="post" action="/admin/login"><h1>تسجيل الدخول</h1><p class="lead">ادخل بكلمة مرور الإدارة لإدارة القنوات، IPTV، المكتبة، والمشاهدين.</p>${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}<label>اسم المستخدم<input name="username" autocomplete="username" placeholder="admin" required autofocus></label><label>كلمة المرور<input name="password" type="password" autocomplete="current-password" placeholder="كلمة المرور" required></label><button>دخول إلى اللوحة</button><p class="note">بعد الدخول ستبقى الجلسة محفوظة على هذا الجهاز لمدة أسبوع.</p></form></main></body></html>`;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return 'بدون حد';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDataBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
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
  return `${item.title || 'بدون عنوان'}${ep}`;
}

function sourceKindLabel(source) {
  return source === 'Cloud' ? 'سحابي' : 'يدوي';
}

function mediaKindLabel(kind) {
  return {
    movie: 'فيلم',
    episode: 'حلقة',
    audio: 'صوتيات',
    movies: 'أفلام',
    tv: 'مسلسلات',
  }[kind] || kind || '';
}

function blockTypeLabel(type) {
  return type === 'userAgent' ? 'جهاز / متصفح' : 'عنوان IP';
}

function accessActionLabel(action) {
  return {
    stream: 'تشغيل',
    blocked: 'محظور',
    request: 'طلب',
    media: 'وسائط',
  }[action] || action || '';
}

function parseHeadersPayload(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
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
    const section = item.section || (item.kind === 'episode' ? 'مسلسلات' : item.kind === 'audio' ? 'صوتيات' : 'أفلام');
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
  send(res, 403, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>البث غير متاح</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d1f;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;text-align:center;padding:24px}main{max-width:520px}h1{font-size:24px;margin:0 0 10px}p{color:#cbd5e1;line-height:1.7}</style></head><body><main><h1>البث غير متاح حالياً</h1><p>${escapeHtml(db.blockedMessage())}</p></main></body></html>`, {
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
    send(res, 402, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الميزة غير متاحة</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d1f;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;text-align:center;padding:24px}main{max-width:560px}h1{font-size:24px;margin:0 0 10px}p{color:#cbd5e1;line-height:1.7}</style></head><body><main><h1>الميزة غير متاحة حالياً</h1><p>${escapeHtml(message)}</p></main></body></html>`, {
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
      <td>${escapeHtml(sourceKindLabel(ch.sourceKind))}</td>
      <td>${escapeHtml(ch.category || '')}</td>
      <td class="url">محفوظ ومخفي عن لوحة الشبكة</td>
      <td>${ch.enabled ? 'مفعل' : 'متوقف'}</td>
      <td>${formatBytes(ch.transferLimitBytes)}</td>
      <td>${status[ch.id]?.viewers || 0}</td>
      <td>${formatDataBytes(status[ch.id]?.totalUpstreamBytes || 0)}</td>
      <td>
        ${ch.readonly ? '<span class="muted">تدار من السحابة</span>' : `<button data-toggle="${ch.id}">${ch.enabled ? 'إيقاف' : 'تفعيل'}</button><button data-del="${ch.id}">حذف</button>`}
      </td>
    </tr>`).join('');
  const iptvAnalyticsRows = Object.values(status).sort((a, b) => String(a.id).localeCompare(String(b.id))).map((s) => `
    <tr>
      <td class="url">${escapeHtml(s.id)}</td>
      <td>${escapeHtml(s.type || '')}</td>
      <td>${Number(s.viewers || 0)} / ${Number(s.peakViewers || 0)}</td>
      <td>${formatDataBytes(s.totalUpstreamBytes)}</td>
      <td>${formatDataBytes(s.totalDownstreamBytes)}</td>
      <td>${Number(s.cacheHitRate || 0)}% (${Number(s.cacheHits || 0)}/${Number(s.cacheMisses || 0)})</td>
      <td>${Number(s.cacheEntries || 0)} · ${formatDataBytes(s.cacheBytes)}</td>
      <td>${Number(s.slowClientsDropped || 0)}</td>
      <td>${Number(s.errors || 0)}${s.lastError ? `<br><span class="muted">${escapeHtml(s.lastError)}</span>` : ''}</td>
    </tr>`).join('');
  const sessions = db.listSessions();
  const viewerAccounts = db.listViewerAccounts();
  const viewerMessages = db.listViewerMessages(120);
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
      <td><button data-block-ip="${escapeHtml(s.ip)}">حظر العنوان</button></td>
    </tr>`).join('');
  const accountRows = viewerAccounts.map((account) => {
    const state = db.viewerState(account.viewerId);
    return `
    <tr>
      <td>${escapeHtml(account.name || '')}</td>
      <td class="url">${escapeHtml(account.email || '')}</td>
      <td>${Number(state.favorites?.length || 0)}</td>
      <td>${Number(state.watchLater?.length || 0)}</td>
      <td>${Number(state.history?.length || 0)}</td>
      <td>${account.lastSeenAt ? new Date(account.lastSeenAt).toLocaleString() : '-'}</td>
    </tr>`;
  }).join('');
  const messageRows = viewerMessages.map((msg) => `
    <tr>
      <td>${new Date(msg.createdAt).toLocaleString()}</td>
      <td>${escapeHtml(msg.name || '')}<br><span class="muted">${escapeHtml(msg.email || '')}</span></td>
      <td>${escapeHtml(msg.message || '')}${msg.context ? `<br><span class="muted">${escapeHtml(msg.context)}</span>` : ''}</td>
      <td><span class="pill">${escapeHtml(msg.status || 'new')}</span></td>
      <td>
        <button data-message-status="${escapeHtml(msg.id)}" data-status-value="read">تمت القراءة</button>
        <button data-message-status="${escapeHtml(msg.id)}" data-status-value="done">تم الحل</button>
      </td>
    </tr>`).join('');
  const blockRows = blocks.map((b) => `
    <tr>
      <td>${escapeHtml(blockTypeLabel(b.type))}</td>
      <td class="url">${escapeHtml(b.identifier)}</td>
      <td>${escapeHtml(b.reason || '')}</td>
      <td><button data-remove-block="${b.id}">إزالة</button></td>
    </tr>`).join('');
  const logRows = logs.map((l) => `
    <tr>
      <td>${new Date(l.at).toLocaleString()}</td>
      <td>${escapeHtml(accessActionLabel(l.action))}</td>
      <td class="url">${escapeHtml(l.ip)}</td>
      <td>${escapeHtml(l.targetName || l.targetId || '')}</td>
      <td>${formatBytes(l.bytes)}</td>
      <td>${escapeHtml(l.status)}</td>
    </tr>`).join('');
  const topMediaRows = mediaStats.top.map((m) => `
    <tr>
      <td>${escapeHtml(m.title)}</td>
      <td>${escapeHtml(mediaKindLabel(m.kind))}</td>
      <td>${Number(m.plays || 0)}</td>
      <td>${formatBytes(m.bytes)}</td>
      <td>${m.lastAt ? new Date(m.lastAt).toLocaleString() : '-'}</td>
    </tr>`).join('');
  const mediaRows = mediaItems.map((item) => `
    <tr>
      <td>${escapeHtml(item.titleText)}</td>
      <td>${escapeHtml(mediaKindLabel(item.kind))}</td>
      <td>${formatBytes(item.size)}</td>
      <td>${formatDuration(item.wp_duration || item.duration)}</td>
      <td class="url">${escapeHtml(path.basename(item.path || ''))}</td>
      <td>
        <button data-edit-media="${item.id}">تعديل</button>
        <button data-delete-media="${item.id}">إزالة</button>
      </td>
    </tr>`).join('');
  const pathRows = libraryPaths.map((p) => `
    <tr><td class="url">${escapeHtml(p.path)}</td><td>${escapeHtml(mediaKindLabel(p.kind))}</td><td>${p.locked ? 'مثبت' : `<button data-path-del="${p.id}">إزالة</button>`}</td></tr>`).join('');
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
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>لوحة إدارة منارة</title>
<style>
:root{color-scheme:dark;--bg:#070b16;--panel:#101827;--panel2:#0b1220;--line:rgba(226,232,240,.12);--line2:rgba(148,163,184,.2);--text:#f8fafc;--muted:#9ca3af;--accent:#2563eb;--accent2:#14b8a6;--good:#22c55e;--warn:#f59e0b;--danger:#ef4444}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;margin:0;background:linear-gradient(180deg,rgba(7,11,22,.96),rgba(8,13,24,1)),repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 76px);color:var(--text)}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(37,99,235,.08),transparent 36%,rgba(20,184,166,.06));z-index:-1}
main{max-width:1440px;margin:auto;padding:22px}
h1{font-size:28px;margin:0 0 7px;letter-spacing:0}h2{font-size:18px;margin:0 0 12px}h3{font-size:15px;margin:20px 0 9px;color:#dbeafe}.lead{color:#b6c2d6;line-height:1.7;margin:0}
.eyebrow{display:inline-flex;margin-bottom:8px;padding:5px 8px;border:1px solid rgba(20,184,166,.26);background:rgba(20,184,166,.1);border-radius:7px;color:#ccfbf1;font-size:11px;font-weight:900}
.shell-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px}.head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.head-actions a,.admin-nav a{color:#e0f2fe;text-decoration:none;font-size:12px;font-weight:900;border:1px solid var(--line);background:rgba(255,255,255,.06);border-radius:8px;padding:9px 11px}.head-actions a.primary{background:var(--accent);border-color:transparent;color:#fff}
.admin-nav{position:sticky;top:0;z-index:5;display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;padding:10px 0;background:linear-gradient(180deg,rgba(7,11,22,.98),rgba(7,11,22,.86));backdrop-filter:blur(16px)}
section{border:1px solid var(--line);background:linear-gradient(180deg,rgba(16,24,39,.88),rgba(15,23,42,.72));border-radius:8px;padding:18px;margin-bottom:16px;box-shadow:0 20px 60px rgba(0,0,0,.22)}
.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
label{display:block;font-size:12px;color:#dbeafe;font-weight:850;margin:10px 0 6px}
input,textarea,select{width:100%;box-sizing:border-box;border:1px solid var(--line2);border-radius:8px;padding:11px 12px;background:var(--panel2);color:#fff;font:inherit;outline:none}input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.16)}
textarea{min-height:220px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;direction:ltr;text-align:left;line-height:1.55}
button{border:0;border-radius:8px;padding:9px 12px;background:var(--accent);color:#fff;font-weight:850;cursor:pointer;margin:4px 4px 4px 0;font-family:inherit}button:hover{filter:brightness(1.08)}button.secondary{background:#334155}button.danger{background:#dc2626}
table{width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;font-size:13px;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:8px}
thead th{position:sticky;top:0;background:rgba(15,23,42,.96);color:#dbeafe;font-size:11px;text-transform:none;z-index:1}td,th{border-bottom:1px solid rgba(255,255,255,.075);padding:10px;text-align:right;vertical-align:top}tbody tr:hover{background:rgba(255,255,255,.035)}tbody tr:last-child td{border-bottom:0}
a{color:#93c5fd}.url{word-break:break-all;color:#bfdbfe;direction:ltr;text-align:left}.msg{color:#86efac;font-size:13px;margin-top:8px}.muted{color:var(--muted);font-size:12px;line-height:1.7}
.statcards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:10px 0 12px}.statcard{border:1px solid var(--line);background:rgba(0,0,0,.2);border-radius:8px;padding:13px}.statcard b{display:block;font-size:24px;line-height:1.1}.statcard span{font-size:12px;color:var(--muted);font-weight:800}
.table-wrap{width:100%;overflow:auto}.section-note{display:flex;gap:8px;align-items:center;color:#bfdbfe;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.22);border-radius:8px;padding:10px 12px;margin:10px 0;font-size:12px;line-height:1.7}.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:rgba(255,255,255,.055);border-radius:7px;padding:4px 8px;color:#dbeafe;font-size:11px;font-weight:900}
@media (max-width:980px){.grid{grid-template-columns:1fr}.shell-head{align-items:flex-start;flex-direction:column}.head-actions{justify-content:flex-start}table{display:block;overflow:auto}.admin-nav{position:static}}
@media (max-width:720px){main{padding:14px}.statcards{grid-template-columns:1fr 1fr}.head-actions a,.admin-nav a{flex:1;text-align:center}.shell-head h1{font-size:24px}}
</style>
</head>
<body><main>
<div class="shell-head"><div><span class="eyebrow">Manara LAN Admin</span><h1>لوحة إدارة منارة</h1><p class="lead">تحكم واضح في المشاهدة داخل الشبكة: القنوات، IPTV، مكتبة الوسائط، المشاهدين، التقارير، والتخصيص.</p></div><div class="head-actions"><a class="primary" href="/">فتح صفحة المشاهدة</a><a href="/library">فتح المكتبة</a><a href="/admin/logout">تسجيل الخروج</a></div></div>
<nav class="admin-nav"><a href="#media">المكتبة</a><a href="#viewers">المشاهدون</a><a href="#iptv">IPTV</a><a href="#security">الحظر</a><a href="#logs">السجل</a><a href="#broadcast">قنوات البث</a></nav>
<script id="mediaAdminPayload" type="application/json">${mediaPayload}</script>
<section id="media">
  <h2>مكتبة الوسائط</h2>
  <div class="statcards">
    <div class="statcard"><b>${mediaStats.total}</b><span>كل المحتوى</span></div>
    <div class="statcard"><b>${formatBytes(mediaStats.totalSize)}</b><span>حجم المكتبة</span></div>
    <div class="statcard"><b>${mediaStats.byKind.movie || 0}</b><span>أفلام</span></div>
    <div class="statcard"><b>${mediaStats.uniqueDevices || 0}</b><span>أجهزة مختلفة</span></div>
  </div>
  <div class="statcards">
    <div class="statcard"><b>${mediaStats.byKind.episode || 0}</b><span>حلقات</span></div>
    <div class="statcard"><b>${mediaStats.byKind.audio || 0}</b><span>صوتيات</span></div>
    <div class="statcard"><b>${mediaStats.completionRate || 0}%</b><span>معدل الإكمال</span></div>
    <div class="statcard"><b>${health.missingFiles.length + health.unsupportedFormats.length + health.brokenSubtitles.length}</b><span>تنبيهات تحتاج مراجعة</span></div>
  </div>
  <h3>المجلدات والفحص</h3>
  <form id="pathForm">
    <label>مسار المجلد على هذا الجهاز</label><input name="path" required placeholder="C:\\Media\\Movies أو /Users/name/Movies">
    <label>النوع</label><select name="kind"><option value="movies">أفلام</option><option value="tv">مسلسلات / حلقات</option><option value="audio">صوتيات</option></select>
    <button>إضافة المجلد</button><button type="button" id="scanNowBtn">فحص الآن</button>
  </form>
  <div class="table-wrap"><table><thead><tr><th>المسار</th><th>النوع</th><th>الإجراء</th></tr></thead><tbody>${pathRows || '<tr><td colspan="3">لم تتم إضافة أي مجلدات بعد.</td></tr>'}</tbody></table></div>
  <h3>التخصيص</h3>
  <form id="themeForm" class="grid">
    <label>اسم الواجهة<input name="brandName" value="${escapeHtml(mediaTheme.brandName)}"></label>
    <label>وصف قصير<input name="tagline" value="${escapeHtml(mediaTheme.tagline)}"></label>
    <label>رابط الشعار<input name="logoUrl" value="${escapeHtml(mediaTheme.logoUrl)}"></label>
    <label>اتجاه الواجهة<select name="direction"><option value="rtl" ${mediaTheme.direction === 'rtl' ? 'selected' : ''}>عربي / من اليمين</option><option value="ltr" ${mediaTheme.direction === 'ltr' ? 'selected' : ''}>إنجليزي / من اليسار</option></select></label>
    <label>اللون الأساسي<input name="accent" type="color" value="${escapeHtml(mediaTheme.accent)}"></label>
    <label>اللون المساعد<input name="accent2" type="color" value="${escapeHtml(mediaTheme.accent2)}"></label>
    <div><button>حفظ التخصيص</button></div>
  </form>
  <h3>رفع أو استيراد وسائط</h3>
  <form id="uploadForm">
    <label>إضافة ملف إلى تخزين المكتبة المحلي</label><input id="uploadFile" type="file" accept="video/*,audio/*,.mkv,.srt,.vtt">
    <label>النوع</label><select name="kind"><option value="movie">فيلم</option><option value="episode">حلقة</option><option value="audio">صوتيات</option></select>
    <button>رفع الملف</button>
  </form>
  <p class="section-note">التقارير جاهزة للتصدير: <a href="/api/admin/reports/views.csv">CSV</a> · <a href="/api/admin/reports/views.json">JSON</a> · <a href="/api/admin/health">فحص الصحة</a></p>
  <p class="muted">الحالة: ${health.missingFiles.length} ملفات مفقودة، ${health.unsupportedFormats.length} صيغ غير مدعومة، ${health.brokenSubtitles.length} مشاكل ترجمة.</p>
  <h3>الأكثر مشاهدة</h3>
  <div class="table-wrap"><table><thead><tr><th>العنوان</th><th>النوع</th><th>مرات التشغيل</th><th>البيانات المنقولة</th><th>آخر مشاهدة</th></tr></thead><tbody>${topMediaRows || '<tr><td colspan="5">لا توجد مشاهدات بعد.</td></tr>'}</tbody></table></div>
  <h3 style="margin-top:18px">محتوى المكتبة</h3>
  <div class="table-wrap"><table><thead><tr><th>العنوان</th><th>النوع</th><th>الحجم</th><th>المدة</th><th>الملف</th><th>الإجراءات</th></tr></thead><tbody>${mediaRows || '<tr><td colspan="6">لم تتم فهرسة أي وسائط بعد. أضف مجلداً ثم شغل الفحص.</td></tr>'}</tbody></table></div>
</section>
<section id="viewers">
  <h2>المشاهدون النشطون</h2>
  <div class="table-wrap"><table><thead><tr><th>IP</th><th>يشاهد</th><th>البيانات المنقولة</th><th>الطلبات</th><th>الجهاز</th><th>الإجراء</th></tr></thead><tbody>${sessionRows || '<tr><td colspan="6">لا يوجد مشاهدون نشطون حالياً.</td></tr>'}</tbody></table></div>
  <h3>حسابات المشاهدين</h3>
  <div class="table-wrap"><table><thead><tr><th>الاسم</th><th>البريد</th><th>المفضلة</th><th>لاحقاً</th><th>السجل</th><th>آخر ظهور</th></tr></thead><tbody>${accountRows || '<tr><td colspan="6">لا توجد حسابات مشاهدين بعد.</td></tr>'}</tbody></table></div>
  <h3>رسائل المشاهدين</h3>
  <div class="table-wrap"><table><thead><tr><th>الوقت</th><th>المشاهد</th><th>الرسالة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${messageRows || '<tr><td colspan="5">لا توجد رسائل حتى الآن.</td></tr>'}</tbody></table></div>
</section>
<section id="iptv">
  <h2>قنوات IPTV</h2>
  <form id="iptvForm">
    <label>اسم القناة</label><input name="name" required>
    <label>الرابط الأصلي</label><input name="url" required placeholder="https://.../playlist.m3u8">
    <label>التصنيف</label><input name="category">
    <label>رابط الشعار</label><input name="logo">
    <label>هيدرز المصدر (JSON اختياري)</label><textarea name="headers" placeholder='{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}'></textarea>
    <label>حد استهلاك الإنترنت (MB، 0 يعني بدون حد)</label><input name="transferLimitMb" type="number" min="0" step="1" value="0">
    <button>إضافة IPTV</button>
  </form>
  <div class="table-wrap"><table><thead><tr><th>الاسم</th><th>المصدر</th><th>التصنيف</th><th>الرابط</th><th>الحالة</th><th>الحد</th><th>المشاهدون</th><th>استهلاك الإنترنت</th><th>الإجراءات</th></tr></thead><tbody>${iptvRows || '<tr><td colspan="9">لا توجد قنوات IPTV مضافة بعد.</td></tr>'}</tbody></table></div>
  <h3>تحليلات IPTV المتقدمة</h3>
  <p class="muted">تقيس الفرق بين سحب الإنترنت والتوزيع داخل الشبكة، ونسبة استفادة الكاش، والأجهزة البطيئة التي تم فصلها لحماية الخادم.</p>
  <div class="table-wrap"><table><thead><tr><th>القناة</th><th>النوع</th><th>الآن / أعلى</th><th>إنترنت</th><th>LAN</th><th>Cache hit</th><th>الكاش</th><th>Slow drops</th><th>الأخطاء</th></tr></thead><tbody>${iptvAnalyticsRows || '<tr><td colspan="9">لا توجد بيانات تشغيل IPTV بعد.</td></tr>'}</tbody></table></div>
</section>
<div class="grid">
<section id="security">
  <h2>الحظر</h2>
  <form id="blockForm">
    <label>النوع</label><select name="type"><option value="ip">عنوان IP</option><option value="userAgent">الجهاز / المتصفح يحتوي على</option></select>
    <label>المعرف</label><input name="identifier" required placeholder="192.168.1.50">
    <label>ملاحظة داخلية</label><input name="reason" placeholder="اختياري">
    <button>إضافة حظر</button>
  </form>
  <label>الرسالة التي تظهر للمشاهد</label><input id="blockedMessage" value="${escapeHtml(db.blockedMessage())}">
  <button id="saveBlockedMessage">حفظ الرسالة</button>
  <div class="table-wrap"><table><thead><tr><th>النوع</th><th>المعرف</th><th>السبب</th><th>الإجراء</th></tr></thead><tbody>${blockRows || '<tr><td colspan="4">لا توجد أجهزة محظورة.</td></tr>'}</tbody></table></div>
</section>
<section id="logs">
  <h2>سجل الوصول</h2>
  <div class="table-wrap"><table><thead><tr><th>الوقت</th><th>الإجراء</th><th>IP</th><th>الهدف</th><th>البيانات</th><th>الحالة</th></tr></thead><tbody>${logRows || '<tr><td colspan="6">لا توجد سجلات حتى الآن.</td></tr>'}</tbody></table></div>
</section>
</div>
<section id="broadcast">
  <h2>قنوات البث المحفوظة</h2>
  <p class="muted">محرر متقدم لقائمة قنوات البث التي يستخدمها تطبيق سطح المكتب.</p>
  <textarea id="broadcastJson">${broadcastJson}</textarea>
  <button id="saveBroadcast">حفظ قنوات البث</button>
  <button class="secondary" onclick="location.reload()">إعادة تحميل</button>
  <div id="msg" class="msg"></div>
</section>
<script>
const msg = document.getElementById('msg');
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
function parseJsonSafe(text) {
  if (!String(text || '').trim()) return {};
  try { return JSON.parse(text); } catch { return {}; }
}
document.getElementById('iptvForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  data.transferLimitBytes = Math.max(0, Number(data.transferLimitMb || 0)) * 1024 * 1024;
  delete data.transferLimitMb;
  data.headers = parseJsonSafe(data.headers || '{}');
  await api('/api/admin/iptv', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  location.reload();
});
document.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
  if (!confirm('حذف قناة IPTV هذه؟')) return;
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
  await api('/api/admin/blocklist', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:'ip', identifier:b.dataset.blockIp, reason:'تم الحظر من قائمة المشاهدين النشطين' }) });
  location.reload();
});
document.querySelectorAll('[data-remove-block]').forEach((b) => b.onclick = async () => {
  await api('/api/admin/blocklist/' + b.dataset.removeBlock, { method:'DELETE' });
  location.reload();
});
document.getElementById('saveBlockedMessage').onclick = async () => {
  await api('/api/admin/block-message', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message:document.getElementById('blockedMessage').value }) });
  msg.textContent = 'تم الحفظ.';
};
document.getElementById('saveBroadcast').onclick = async () => {
  const channels = JSON.parse(document.getElementById('broadcastJson').value);
  await api('/api/admin/broadcast', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ channels }) });
  msg.textContent = 'تم الحفظ.';
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
  msg.textContent = 'جاري الفحص...';
  const r = await api('/api/admin/scan', { method:'POST' });
  msg.textContent = r.ok ? 'اكتمل الفحص: ' + r.done + ' عنصر' : (r.error || 'تعذر إكمال الفحص');
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
  const title = prompt('العنوان', item.title || '');
  if (title == null) return;
  const kind = prompt('النوع: movie أو episode أو audio', item.kind || 'movie');
  if (kind == null) return;
  const year = prompt('السنة', item.year || '');
  if (year == null) return;
  const overview = prompt('الوصف', item.overview || '');
  if (overview == null) return;
  await api('/api/admin/media/' + item.id, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ ...item, title, kind, year, overview })
  });
  location.reload();
});
document.querySelectorAll('[data-delete-media]').forEach((b) => b.onclick = async () => {
  const removeFile = confirm('إزالة هذا العنصر من المكتبة؟ سيتم حذفه من قائمة المكتبة فقط وسيبقى الملف على القرص.');
  if (!removeFile) return;
  await api('/api/admin/media/' + b.dataset.deleteMedia, { method:'DELETE' });
  location.reload();
});
document.querySelectorAll('[data-message-status]').forEach((b) => b.onclick = async () => {
  await api('/api/admin/viewer-messages/' + b.dataset.messageStatus + '/status', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ status:b.dataset.statusValue })
  });
  location.reload();
});
</script>
</main></body></html>`;
}

function libraryPage(req, res) {
  const viewerContext = getViewerContext(req, res);
  const viewerId = viewerContext.viewerId;
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
    addedAt: item.added_at || item.scanned_at || 0,
    file: path.basename(item.path || ''),
    section: item.section || '',
    folder: item.folder || '',
  })));
  const viewerPayload = jsonForScript({
    id: viewer.id,
    account: viewerContext.account,
    favorites: viewer.favorites || [],
    watchLater: viewer.watchLater || [],
    history: viewer.history || [],
  });
  const sectionPayload = jsonForScript(librarySections(items));
  const isRtl = theme.direction === 'rtl';
  const text = isRtl ? {
    pageTitle: 'مكتبة Manara',
    channels: 'القنوات',
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
    featured: 'مقترح للمشاهدة',
    playNow: 'تشغيل الآن',
    saveForLater: 'حفظ لاحقاً',
    browseAll: 'استعراض الكل',
    recentlyAdded: 'أضيف حديثاً',
    recentlyHint: 'أحدث المحتويات في المكتبة',
    continueHint: 'أكمل من آخر نقطة مشاهدة',
    favoritesHint: 'محفوظة لهذا الجهاز',
    library: 'المكتبة',
    empty: 'لا يوجد محتوى متاح حالياً. ستظهر المكتبة هنا عند توفر المحتوى.',
    items: 'عنصر',
    sortRecent: 'الأحدث',
    sortTitle: 'الاسم',
    sortYear: 'السنة',
    sortRating: 'التقييم',
    sortProgress: 'التقدم',
    viewPoster: 'بوسترات',
    viewCompact: 'قائمة',
    duration: 'المدة',
    size: 'الحجم',
    noResume: 'لا توجد مشاهدة غير مكتملة حالياً.',
    noFavorites: 'لا توجد عناصر مفضلة على هذا الجهاز.',
    favoriteTitle: 'إضافة إلى المفضلة',
    watchTitle: 'مشاهدة لاحقاً',
    movie: 'فيلم',
    episode: 'حلقة',
    audioItem: 'صوت',
    accountTitle: 'حساب المشاهد',
    accountHint: 'سجّل الدخول لحفظ المفضلة والمشاهدة لاحقاً والتاريخ على هذا الحساب.',
    signedInAs: 'متصل باسم',
    signIn: 'دخول',
    signUp: 'إنشاء حساب',
    signOut: 'خروج',
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    messageAdmin: 'مراسلة الإدارة',
    messagePlaceholder: 'اكتب ملاحظة أو طلباً للإدارة...',
    sendMessage: 'إرسال الرسالة',
    accountSaved: 'تم الحفظ.',
    accountError: 'تعذر تنفيذ الطلب. تأكد من البيانات وحاول مرة أخرى.',
  } : {
    pageTitle: 'Manara Media Library',
    channels: 'Channels',
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
    featured: 'Featured',
    playNow: 'Play now',
    saveForLater: 'Save for later',
    browseAll: 'Browse all',
    recentlyAdded: 'Recently added',
    recentlyHint: 'Fresh from the library',
    continueHint: 'Resume where you stopped',
    favoritesHint: 'Saved on this device',
    library: 'Library',
    empty: 'No media is available right now. The library will appear here when content is available.',
    items: 'item(s)',
    sortRecent: 'Newest',
    sortTitle: 'Title',
    sortYear: 'Year',
    sortRating: 'Rating',
    sortProgress: 'Progress',
    viewPoster: 'Posters',
    viewCompact: 'List',
    duration: 'Duration',
    size: 'Size',
    noResume: 'Nothing to resume yet.',
    noFavorites: 'No favorites on this device yet.',
    favoriteTitle: 'Favorite',
    watchTitle: 'Watch later',
    movie: 'Movie',
    episode: 'Episode',
    audioItem: 'Audio',
    accountTitle: 'Viewer account',
    accountHint: 'Sign in to keep favorites, watch later, and history on this account.',
    signedInAs: 'Signed in as',
    signIn: 'Sign in',
    signUp: 'Create account',
    signOut: 'Sign out',
    name: 'Name',
    email: 'Email',
    password: 'Password',
    messageAdmin: 'Message admin',
    messagePlaceholder: 'Write a note or request for the admin...',
    sendMessage: 'Send message',
    accountSaved: 'Saved.',
    accountError: 'Could not complete the request. Check the details and try again.',
  };
  const textPayload = jsonForScript(text);
  return `<!doctype html>
<html lang="${theme.direction === 'rtl' ? 'ar' : 'en'}" dir="${theme.direction}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(text.pageTitle)}</title>
<style>
:root{color-scheme:dark;--bg:#080a12;--panel:#111827;--panel2:#0f172a;--line:rgba(226,232,240,.12);--text:#f8fafc;--muted:#9ca3af;--accent:${escapeHtml(theme.accent)};--accent2:${escapeHtml(theme.accent2)}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(180deg,#080a12,#0b1020 48%,#070a12);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,rgba(255,255,255,.026) 0 1px,transparent 1px 86px);opacity:.8;z-index:-1}
.hero{min-height:56vh;padding:24px;background:linear-gradient(90deg,rgba(8,10,18,.98),rgba(8,10,18,.74) 50%,rgba(8,10,18,.32)),var(--hero,linear-gradient(135deg,#111827,#0f172a));background-size:cover;background-position:center;display:flex;align-items:flex-end;box-shadow:inset 0 -120px 140px rgba(8,10,18,.84)}
.hero-inner{width:100%;max-width:1320px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:50px}.brand{display:flex;align-items:center;gap:10px;font-weight:950;font-size:18px;letter-spacing:0}.brand img{max-height:38px;border-radius:8px}.nav{display:flex;gap:8px;flex-wrap:wrap}.nav a,.btn{border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff;text-decoration:none;border-radius:8px;padding:10px 13px;font-weight:850;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.btn.primary,.nav a.primary{background:var(--accent);border-color:transparent;box-shadow:0 16px 34px rgba(37,99,235,.25)}.btn.ghost{background:rgba(255,255,255,.06)}
.eyebrow{display:inline-flex;margin-bottom:10px;color:#ccfbf1;background:rgba(20,184,166,.12);border:1px solid rgba(20,184,166,.28);border-radius:8px;padding:6px 9px;font-size:12px;font-weight:900}.hero h1{font-size:clamp(34px,6vw,70px);line-height:1;margin:0 0 12px;letter-spacing:0;max-width:900px}.hero p{max-width:760px;color:#d1d5db;line-height:1.75;margin:0 0 18px}.hero-actions{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:18px}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{border:1px solid var(--line);background:rgba(0,0,0,.26);border-radius:8px;padding:10px 12px;min-width:96px}.stat b{display:block;font-size:18px}.stat span{font-size:12px;color:var(--muted)}
main{max-width:1320px;margin:auto;padding:18px 22px 42px}.tools{position:sticky;top:0;z-index:4;display:grid;grid-template-columns:minmax(240px,1.55fr) repeat(5,minmax(126px,1fr));gap:10px;margin:0 0 22px;padding:12px;background:rgba(8,10,18,.76);border:1px solid rgba(226,232,240,.08);border-radius:8px;backdrop-filter:blur(16px)}
input,select{width:100%;border:1px solid var(--line);background:#111827;color:#fff;border-radius:8px;padding:11px 12px;font:inherit;min-height:44px;outline:none}input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.18)}
.account-panel{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,1.3fr);gap:14px;align-items:center;border:1px solid rgba(226,232,240,.1);background:linear-gradient(180deg,rgba(17,24,39,.72),rgba(15,23,42,.62));border-radius:8px;padding:14px;margin:0 0 24px}.account-panel h2{margin:0 0 4px;font-size:18px}.account-panel p{margin:0;color:var(--muted);line-height:1.7;font-size:12px}.account-forms{display:grid;grid-template-columns:1fr 1fr;gap:10px}.account-forms form,.account-signed{display:grid;gap:8px}.account-signed{grid-template-columns:auto minmax(180px,1fr) auto;align-items:center}.account-signed form{display:grid;grid-template-columns:minmax(160px,1fr) auto;gap:8px}.account-chip{display:grid;gap:2px;border:1px solid var(--line);background:rgba(255,255,255,.055);border-radius:8px;padding:8px 10px}.account-chip span{color:var(--muted);font-size:11px}.account-chip strong{font-size:13px}.account-status{grid-column:1/-1;color:#bfdbfe;font-size:12px;min-height:1em}.section-card{border:1px solid var(--line);background:rgba(255,255,255,.055);border-radius:8px;padding:12px;text-align:start;color:#fff;min-height:104px}.section-main{width:100%;border:0;background:transparent;color:#fff;text-align:start;padding:0;font:inherit;cursor:pointer}.section-main strong{display:block;font-size:15px}.section-main span{display:block;color:var(--muted);font-size:12px;margin-top:4px}.folder-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.folder-row button{border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.22);color:#dbeafe;border-radius:7px;padding:5px 8px;font:inherit;font-size:11px;font-weight:850;cursor:pointer}
.section{margin:30px 0}.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.section h2{font-size:21px;margin:0}.section small{color:var(--muted)}
.rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(160px,198px);gap:12px;overflow-x:auto;overscroll-behavior-x:contain;padding-bottom:10px;scrollbar-width:thin}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(164px,1fr));gap:14px}.grid.compact{grid-template-columns:1fr}
.tile{position:relative;display:block;min-width:0;text-decoration:none;color:#fff;background:rgba(17,24,39,.72);border:1px solid var(--line);border-radius:8px;overflow:hidden;transition:transform .16s,border-color .16s,background .16s,box-shadow .16s;outline:none}.tile:hover,.tile:focus-visible{transform:translateY(-3px);border-color:rgba(20,184,166,.58);background:rgba(17,24,39,.94);box-shadow:0 18px 44px rgba(0,0,0,.26)}
.poster{aspect-ratio:2/3;background:#1f2937 center/cover no-repeat;display:grid;place-items:center;color:rgba(255,255,255,.38);font-size:38px;font-weight:900;position:relative}.poster::after{content:"";position:absolute;inset:auto 0 0 0;height:42%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.72))}.poster.audio{aspect-ratio:1;background:linear-gradient(135deg,#1f2937,#0f3d42)}.kind-badge{position:absolute;bottom:8px;left:8px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.58);border-radius:6px;padding:4px 7px;font-size:10px;font-weight:900;color:#e5e7eb;z-index:1}
.meta{padding:10px}.title{font-size:13px;font-weight:900;line-height:1.35;min-height:36px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sub{font-size:11px;color:var(--muted);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.overview{display:none;color:#cbd5e1;font-size:12px;line-height:1.55;margin-top:7px}
.progress{height:4px;background:rgba(255,255,255,.12)}.progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.quick{position:absolute;top:8px;right:8px;display:flex;gap:5px;z-index:2}.quick button{width:32px;height:32px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.58);color:#fff;border-radius:8px;cursor:pointer;font-weight:900}.quick button.on{background:#dc2626}
.grid.compact .tile{display:grid;grid-template-columns:92px minmax(0,1fr);min-height:118px}.grid.compact .poster{aspect-ratio:2/3;height:118px}.grid.compact .meta{padding:12px 14px}.grid.compact .title{font-size:15px;min-height:0}.grid.compact .overview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.grid.compact .progress{position:absolute;left:92px;right:0;bottom:0}
.empty{border:1px dashed var(--line);background:rgba(255,255,255,.045);border-radius:8px;padding:30px;color:var(--muted);line-height:1.8;text-align:center}.empty strong{display:block;color:#fff;margin-bottom:4px}.hide{display:none!important}
@media(max-width:1100px){.tools{position:static;grid-template-columns:1fr 1fr 1fr}.hero{min-height:52vh}.top{margin-bottom:38px}.account-panel{grid-template-columns:1fr}.account-signed{grid-template-columns:1fr}.account-signed form{grid-template-columns:1fr}}
@media(max-width:640px){.hero{min-height:48vh;padding:16px}.top{align-items:flex-start;margin-bottom:30px}.nav a{padding:8px 10px}.hero h1{font-size:34px}.stats{display:grid;grid-template-columns:1fr 1fr}.tools{grid-template-columns:1fr;padding:10px}.account-forms{grid-template-columns:1fr}.rail{grid-auto-columns:minmax(160px,210px)}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}main{padding:14px 12px 30px}.grid.compact .tile{grid-template-columns:82px minmax(0,1fr)}.grid.compact .poster{height:108px}.grid.compact .progress{left:82px}}
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
      <nav class="nav"><a href="/" class="primary">${escapeHtml(text.channels)}</a></nav>
    </div>
    <span class="eyebrow" id="heroKind">${escapeHtml(text.featured)}</span>
    <h1 id="heroTitle">${escapeHtml(theme.brandName)}</h1>
    <p id="heroDesc">${escapeHtml(theme.tagline)}</p>
    <div class="hero-actions">
      <a class="btn primary" id="heroPlay" href="#grid">${escapeHtml(text.browseAll)}</a>
      <button class="btn ghost" id="heroLater" type="button" style="display:none">${escapeHtml(text.saveForLater)}</button>
    </div>
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
    <select id="sort"><option value="recent">${escapeHtml(text.sortRecent)}</option><option value="title">${escapeHtml(text.sortTitle)}</option><option value="year">${escapeHtml(text.sortYear)}</option><option value="rating">${escapeHtml(text.sortRating)}</option><option value="progress">${escapeHtml(text.sortProgress)}</option></select>
    <select id="layout"><option value="poster">${escapeHtml(text.viewPoster)}</option><option value="compact">${escapeHtml(text.viewCompact)}</option></select>
    <select id="sectionFilter"><option value="">${escapeHtml(text.allSections)}</option></select>
  </div>
  <section class="account-panel" id="accountPanel">
    <div>
      <h2>${escapeHtml(text.accountTitle)}</h2>
      <p>${escapeHtml(text.accountHint)}</p>
    </div>
    <div class="account-forms" id="guestAccount">
      <form id="signinForm">
        <input name="email" type="email" autocomplete="email" placeholder="${escapeHtml(text.email)}" required>
        <input name="password" type="password" autocomplete="current-password" placeholder="${escapeHtml(text.password)}" required>
        <button class="btn primary">${escapeHtml(text.signIn)}</button>
      </form>
      <form id="signupForm">
        <input name="name" autocomplete="name" placeholder="${escapeHtml(text.name)}">
        <input name="email" type="email" autocomplete="email" placeholder="${escapeHtml(text.email)}" required>
        <input name="password" type="password" autocomplete="new-password" placeholder="${escapeHtml(text.password)}" required>
        <button class="btn ghost">${escapeHtml(text.signUp)}</button>
      </form>
    </div>
    <div class="account-signed" id="signedAccount" hidden>
      <div class="account-chip"><span>${escapeHtml(text.signedInAs)}</span><strong id="accountName"></strong></div>
      <form id="messageForm">
        <input name="message" placeholder="${escapeHtml(text.messagePlaceholder)}" maxlength="1200" required>
        <button class="btn ghost">${escapeHtml(text.sendMessage)}</button>
      </form>
      <button class="btn ghost" id="signoutBtn" type="button">${escapeHtml(text.signOut)}</button>
    </div>
    <div class="account-status" id="accountStatus"></div>
  </section>
  <section class="section" id="sectionBrowser"><div class="section-head"><div><h2>${escapeHtml(text.sections)}</h2><small>${escapeHtml(text.sectionsHint)}</small></div></div><div class="rail" id="sectionRail"></div></section>
  <section class="section" id="continueSection"><div class="section-head"><div><h2>${escapeHtml(text.continue)}</h2><small>${escapeHtml(text.continueHint)}</small></div></div><div class="rail" id="continueRail"></div></section>
  <section class="section" id="favoritesSection"><div class="section-head"><div><h2>${escapeHtml(text.favorites)}</h2><small>${escapeHtml(text.favoritesHint)}</small></div></div><div class="rail" id="favoritesRail"></div></section>
  <section class="section" id="recentSection"><div class="section-head"><div><h2>${escapeHtml(text.recentlyAdded)}</h2><small>${escapeHtml(text.recentlyHint)}</small></div></div><div class="rail" id="recentRail"></div></section>
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
async function postJson(path, data = {}) {
  const r = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || 'request_failed');
  return j;
}
function setAccountStatus(message, ok = true) {
  const el = document.getElementById('accountStatus');
  el.textContent = message || '';
  el.style.color = ok ? '#bfdbfe' : '#fecaca';
}
function syncAccountUi() {
  const guest = document.getElementById('guestAccount');
  const signed = document.getElementById('signedAccount');
  const name = document.getElementById('accountName');
  const account = viewer.account;
  guest.hidden = !!account;
  signed.hidden = !account;
  if (account) name.textContent = account.name || account.email || '';
}
async function handleAccountForm(form, path) {
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    const r = await postJson(path, data);
    viewer.account = r.account || null;
    if (r.viewer) {
      viewer.favorites = r.viewer.favorites || [];
      viewer.watchLater = r.viewer.watchLater || [];
      viewer.history = r.viewer.history || [];
    }
    form.reset();
    localStorage.removeItem(storeKey);
    syncAccountUi();
    render();
    setAccountStatus(text.accountSaved || 'Saved.');
  } catch {
    setAccountStatus(text.accountError || 'Could not complete the request.', false);
  }
}
function esc(s){ return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function bytes(n){ n=Number(n)||0; if(!n) return ''; if(n<1048576) return (n/1024).toFixed(1)+' KB'; if(n<1073741824) return (n/1048576).toFixed(1)+' MB'; return (n/1073741824).toFixed(2)+' GB'; }
function pct(item){ return item.position && item.duration ? Math.max(0,Math.min(100,(item.position/item.duration)*100)) : 0; }
function durationText(seconds){ seconds=Math.round(Number(seconds)||0); if(!seconds) return ''; const h=Math.floor(seconds/3600); const m=Math.floor((seconds%3600)/60); return h ? h+'h '+String(m).padStart(2,'0')+'m' : (m || 1)+'m'; }
function kindLabel(kind){ return kind === 'episode' ? (text.episode || 'Episode') : kind === 'audio' ? (text.audioItem || 'Audio') : (text.movie || 'Movie'); }
function itemSearchBlob(item){ return [item.title,item.baseTitle,item.file,item.section,item.folder,item.overview,item.year].join(' ').toLowerCase(); }
function card(item){
  const p = pct(item);
  const icon = item.kind === 'audio' ? '♪' : '▶';
  const metaBits = [kindLabel(item.kind), item.year, item.rating ? ('★ '+Number(item.rating).toFixed(1)) : '', durationText(item.duration), bytes(item.size)].filter(Boolean);
  const summary = item.overview || item.folder || item.section || item.file || '';
  return '<a class="tile" href="/player/'+item.id+'" data-title="'+esc(item.title).toLowerCase()+'" data-kind="'+esc(item.kind)+'">'+
    '<div class="quick"><button type="button" title="'+esc(text.favoriteTitle || 'Favorite')+'" class="'+(storage.has('favorites',item.id)?'on':'')+'" data-fav="'+item.id+'">♥</button><button type="button" title="'+esc(text.watchTitle || 'Watch later')+'" class="'+(storage.has('watchLater',item.id)?'on':'')+'" data-watch="'+item.id+'">◷</button></div>'+
    '<div class="poster '+(item.kind==='audio'?'audio':'')+'" '+(item.poster?'style="background-image:url(\\''+esc(item.poster)+'\\')"':'')+'>'+(item.poster?'':icon)+'<span class="kind-badge">'+esc(kindLabel(item.kind))+'</span></div>'+
    '<div class="meta"><div class="title">'+esc(item.title)+'</div><div class="sub">'+esc(metaBits.join(' · '))+'</div><div class="overview">'+esc(summary)+'</div></div>'+
    (p?'<div class="progress"><i style="width:'+p+'%"></i></div>':'')+'</a>';
}
function renderList(el, list, emptyText){ el.innerHTML = list.length ? list.map(card).join('') : '<div class="empty">'+emptyText+'</div>'; bindQuick(el); }
function bindQuick(root){ root.querySelectorAll('[data-fav],[data-watch]').forEach(btn=>btn.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); storage.toggle(btn.dataset.fav?'favorites':'watchLater', btn.dataset.fav || btn.dataset.watch); }); }
function sorted(list){
  const mode = document.getElementById('sort').value;
  return list.slice().sort((a,b)=>{
    if(mode === 'title') return String(a.title||'').localeCompare(String(b.title||''), undefined, { numeric:true, sensitivity:'base' });
    if(mode === 'year') return (Number(b.year)||0) - (Number(a.year)||0) || (Number(b.addedAt)||0) - (Number(a.addedAt)||0);
    if(mode === 'rating') return (Number(b.rating)||0) - (Number(a.rating)||0) || String(a.title||'').localeCompare(String(b.title||''));
    if(mode === 'progress') return pct(b) - pct(a) || (Number(b.addedAt)||0) - (Number(a.addedAt)||0);
    return (Number(b.addedAt)||0) - (Number(a.addedAt)||0);
  });
}
function filtered(){
  const q = document.getElementById('search').value.trim().toLowerCase();
  const kind = document.getElementById('kind').value;
  const view = document.getElementById('view').value;
  const section = document.getElementById('sectionFilter').value;
  return sorted(media.filter(item => !q || itemSearchBlob(item).includes(q))
    .filter(item => !kind || item.kind === kind)
    .filter(item => !section || item.section === section || item.folder === section)
    .filter(item => view !== 'favorites' || storage.has('favorites', item.id))
    .filter(item => view !== 'watchLater' || storage.has('watchLater', item.id))
    .filter(item => view !== 'continue' || pct(item) > 2));
}
function updateHero(){
  const heroItem = media.find(item => pct(item) > 2) || media.find(x=>x.backdrop) || media[0];
  const hero = document.getElementById('hero');
  const play = document.getElementById('heroPlay');
  const later = document.getElementById('heroLater');
  if(!heroItem){
    document.getElementById('heroKind').textContent = text.featured || 'Featured';
    document.getElementById('heroTitle').textContent = document.querySelector('.brand')?.textContent?.trim() || 'Manara';
    document.getElementById('heroDesc').textContent = '';
    play.textContent = text.browseAll || 'Browse all';
    play.href = '#grid';
    later.style.display = 'none';
    return;
  }
  if(heroItem.backdrop || heroItem.poster) hero.style.setProperty('--hero','url('+(heroItem.backdrop || heroItem.poster)+')');
  document.getElementById('heroKind').textContent = kindLabel(heroItem.kind);
  document.getElementById('heroTitle').textContent = heroItem.title;
  document.getElementById('heroDesc').textContent = heroItem.overview || [heroItem.year, heroItem.folder, durationText(heroItem.duration)].filter(Boolean).join(' · ');
  play.textContent = text.playNow || 'Play now';
  play.href = '/player/' + heroItem.id;
  later.style.display = 'inline-flex';
  later.onclick = () => storage.toggle('watchLater', heroItem.id);
}
function render(){
  const list = filtered();
  const grid = document.getElementById('grid');
  grid.classList.toggle('compact', document.getElementById('layout').value === 'compact');
  document.getElementById('countLabel').textContent = list.length + ' ' + (text.items || 'item(s)');
  grid.innerHTML = list.map(card).join('');
  document.getElementById('empty').classList.toggle('hide', list.length > 0);
  bindQuick(grid);
  const cont = sorted(media.filter(item => pct(item) > 2)).slice(0,18);
  document.getElementById('continueSection').classList.toggle('hide', !cont.length);
  renderList(document.getElementById('continueRail'), cont, text.noResume || 'Nothing to resume yet.');
  const favs = sorted(media.filter(item => storage.has('favorites', item.id))).slice(0,18);
  document.getElementById('favoritesSection').classList.toggle('hide', !favs.length);
  renderList(document.getElementById('favoritesRail'), favs, text.noFavorites || 'No favorites on this device yet.');
  const recent = sorted(media).slice(0,18);
  document.getElementById('recentSection').classList.toggle('hide', !recent.length);
  renderList(document.getElementById('recentRail'), recent, text.empty || 'No media is available right now.');
  updateHero();
}
document.getElementById('signinForm').addEventListener('submit', (e)=>{ e.preventDefault(); handleAccountForm(e.target, '/api/viewer/signin'); });
document.getElementById('signupForm').addEventListener('submit', (e)=>{ e.preventDefault(); handleAccountForm(e.target, '/api/viewer/signup'); });
document.getElementById('signoutBtn').onclick = async () => { await postJson('/api/viewer/logout', {}).catch(()=>{}); location.reload(); };
document.getElementById('messageForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(e.target).entries());
    await postJson('/api/viewer/message', { ...data, context: location.pathname });
    e.target.reset();
    setAccountStatus(text.accountSaved || 'Saved.');
  } catch { setAccountStatus(text.accountError || 'Could not complete the request.', false); }
});
const sectionFilter = document.getElementById('sectionFilter');
sections.forEach(sec => {
  const opt=document.createElement('option'); opt.value=sec.name; opt.textContent=sec.name+' ('+sec.count+')'; sectionFilter.appendChild(opt);
  (sec.folders || []).forEach(folder => {
    if (!folder.name || folder.name === sec.name) return;
    const f=document.createElement('option'); f.value=folder.name; f.textContent=sec.name+' / '+folder.name+' ('+folder.count+')'; sectionFilter.appendChild(f);
  });
});
document.getElementById('sectionRail').innerHTML = sections.map(sec => '<div class="section-card"><button class="section-main" data-section="'+esc(sec.name)+'"><strong>'+esc(sec.name)+'</strong><span>'+sec.count+' '+(text.items || '')+'</span></button><div class="folder-row">'+(sec.folders||[]).slice(0,6).map(folder => '<button type="button" data-folder="'+esc(folder.name)+'">'+esc(folder.name)+' · '+folder.count+'</button>').join('')+'</div></div>').join('');
document.querySelectorAll('[data-section],[data-folder]').forEach(btn=>btn.onclick=()=>{ sectionFilter.value=btn.dataset.section || btn.dataset.folder; render(); });
['search','kind','view','sort','layout','sectionFilter'].forEach(id=>document.getElementById(id).addEventListener('input', render));
syncAccountUi();
render();
</script>
</body></html>`;
}

function playerPage(id, req, res) {
  const viewerContext = getViewerContext(req, res);
  const viewerId = viewerContext.viewerId;
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
    theater: 'وضع السينما',
    normalView: 'العرض العادي',
    playbackProblem: 'تعذر تشغيل هذا المحتوى حالياً. جرّب التنزيل أو مشغلاً خارجياً.',
    movie: 'فيلم',
    episode: 'حلقة',
    audioItem: 'صوت',
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
    theater: 'Theater view',
    normalView: 'Normal view',
    playbackProblem: 'This title cannot be played right now. Try downloading it or opening an external player.',
    movie: 'Movie',
    episode: 'Episode',
    audioItem: 'Audio',
    playlist: 'Playlist',
    noPlaylist: 'No playlist items.',
    stillWatching: 'Still watching?',
    stillWatchingBody: 'Playback will stop in',
    secondsSuffix: 'seconds if there is no activity.',
    yes: 'Yes, continue',
    stop: 'Stop now',
  };
  const kindText = item.kind === 'episode' ? text.episode : item.kind === 'audio' ? text.audioItem : text.movie;
  const metaChips = [
    kindText,
    item.year || '',
    item.rating ? `★ ${Number(item.rating).toFixed(1)}` : '',
    formatDuration(item.duration || item.wp_duration || 0),
    formatBytes(item.size || 0),
  ].filter(Boolean);
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
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(90deg,rgba(8,10,18,.98),rgba(8,10,18,.82)),url('${escapeHtml(poster)}');background-size:cover;background-position:center;color:var(--text);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:1280px;margin:auto;padding:18px}.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.bar a,.btn{border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff;text-decoration:none;border-radius:8px;padding:9px 12px;font-weight:800;cursor:pointer}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px}.player{background:#000;border:1px solid var(--line);border-radius:8px;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.42);position:relative}
video,audio{width:100%;display:block;background:#000}video{aspect-ratio:16/9;max-height:72vh}.audioBox{min-height:360px;display:grid;place-items:center;background:linear-gradient(135deg,#111936,#123c4a)}.audioBox audio{max-width:560px}
.logo{position:absolute;top:18px;right:18px;background:rgba(0,0,0,.36);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:8px 10px;font-weight:900;pointer-events:none}
.info{padding:16px 2px}.info h1{font-size:clamp(24px,4vw,44px);line-height:1.05;margin:0 0 10px}.info p{color:#dbeafe;line-height:1.75;max-width:900px}.chips{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 12px}.chips span{border:1px solid var(--line);background:rgba(0,0,0,.24);border-radius:6px;padding:5px 8px;color:#d1d5db;font-size:12px;font-weight:800}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.side{background:rgba(16,24,47,.88);border:1px solid var(--line);border-radius:8px;padding:12px;max-height:82vh;overflow:auto}.side h2{font-size:16px;margin:0 0 10px}.track{display:grid;grid-template-columns:28px 54px minmax(0,1fr);gap:9px;align-items:center;color:#fff;text-decoration:none;border-radius:8px;padding:7px}.track:hover,.track.current{background:rgba(59,130,246,.18)}.track span{color:var(--muted);font-size:12px}.track b{height:42px;background:#1a2544 center/cover no-repeat;border-radius:6px;display:grid;place-items:center;color:#93c5fd}.track strong{font-size:12px;line-height:1.35}
.unsupported{aspect-ratio:16/9;display:grid;place-items:center;background:#121826;padding:22px;text-align:center}.unsupported h2{margin:0 0 8px}.unsupported p{color:var(--muted)}.notice{margin:10px 0 0;border:1px solid rgba(248,113,113,.38);background:rgba(127,29,29,.24);border-radius:8px;padding:11px 12px;color:#fecaca}
.watch{position:fixed;inset:0;display:none;place-items:center;background:rgba(3,7,18,.74);padding:18px;z-index:5}.watch>div{max-width:420px;background:#101936;border:1px solid var(--line);border-radius:8px;padding:20px;text-align:center}.watch p{color:var(--muted);line-height:1.7}
body.theater .wrap{max-width:1600px}body.theater .layout{grid-template-columns:1fr}body.theater .side{display:none}body.theater video{max-height:82vh}
@media(max-width:980px){.layout{grid-template-columns:1fr}.side{max-height:none}.bar{flex-wrap:wrap}}
</style>
</head><body>
<script id="mediaMeta" type="application/json">${metaJson}</script>
<script id="viewerMeta" type="application/json">${viewerPayload}</script>
<script id="textMeta" type="application/json">${textPayload}</script>
<div class="wrap">
  <div class="bar"><a href="/library">${escapeHtml(text.library)}</a><div><a href="/">${escapeHtml(text.channels)}</a></div></div>
  <div class="layout">
    <main>
      <div class="player">
        <div class="logo">${theme.logoUrl ? `<img src="${escapeHtml(theme.logoUrl)}" style="height:28px;vertical-align:middle;margin-inline-end:6px">` : ''}${escapeHtml(theme.brandName)}</div>
        ${type === 'audio' ? `<div class="audioBox"><audio id="media" controls autoplay src="${streamUrl}"></audio></div>` : ''}
        ${type === 'video' ? `<video id="media" controls autoplay playsinline crossorigin="anonymous" poster="${escapeHtml(item.backdrop_url || item.poster_url || '')}"><source src="${streamUrl}" type="${escapeHtml(MIME[path.extname(item.path || '').toLowerCase()] || 'video/mp4')}">${subtitleTracks}</video>` : ''}
        ${type === 'unsupported' ? `<div class="unsupported"><div><h2>${escapeHtml(text.unsupportedTitle)}</h2><p>${escapeHtml(text.unsupportedBody)}</p></div></div>` : ''}
      </div>
      <div class="notice" id="playerNotice" hidden>${escapeHtml(text.playbackProblem)}</div>
      <div class="info">
        <h1>${escapeHtml(title)}</h1>
        <div class="chips">${metaChips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}</div>
        <p>${escapeHtml(item.overview || text.noOverview)}</p>
        <div class="actions">
          <a class="btn" href="${downloadUrl}" download>${escapeHtml(text.download)}</a>
          <button class="btn" id="favBtn">${escapeHtml(text.favorite)}</button>
          <button class="btn" id="watchBtn">${escapeHtml(text.watchLater)}</button>
          <button class="btn" id="theaterBtn">${escapeHtml(text.theater)}</button>
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
theaterBtn.onclick=()=>{ document.body.classList.toggle('theater'); theaterBtn.textContent=document.body.classList.contains('theater')?(text.normalView || 'Normal view'):(text.theater || 'Theater view'); };
if(media){
  media.addEventListener('error',()=>{ const n=document.getElementById('playerNotice'); if(n) n.hidden=false; });
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
    if (u.pathname === '/favicon.ico') {
      res.writeHead(204, { 'Cache-Control': 'public, max-age=86400' });
      res.end();
      return;
    }
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
    if (u.pathname === '/admin/logout') {
      return send(res, 302, '', {
        'Location': '/admin/login',
        'Set-Cookie': 'manara_admin=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0',
      });
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
      return send(res, 401, adminLoginPage('اسم المستخدم أو كلمة المرور غير صحيحة.'), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
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
        viewerAccounts: db.listViewerAccounts(),
        viewerMessages: db.listViewerMessages(200),
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
    adminMatch = /^\/api\/admin\/viewer-messages\/([^/]+)\/status$/.exec(u.pathname);
    if (adminMatch && req.method === 'POST') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      try {
        const body = await parseJsonBody(req);
        const message = db.updateViewerMessageStatus(decodeURIComponent(adminMatch[1]), body.status);
        if (!message) return sendJson(res, 404, { error: 'not found' });
        return sendJson(res, 200, { message });
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
    if (u.pathname === '/api/admin/iptv-analytics') {
      if (!requireAdmin(req, res, options.getAdminAuth)) return;
      return sendJson(res, 200, { status: iptv.status() });
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
          section: 'المرفوعات',
          folder: 'المرفوعات',
        });
        return sendJson(res, 200, { ok: true, media: db.getMedia(id) });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (u.pathname === '/api/viewer/state') {
      const ctx = getViewerContext(req, res);
      return sendJson(res, 200, { ...db.viewerState(ctx.viewerId), account: ctx.account });
    }
    if (u.pathname === '/api/viewer/signup' && req.method === 'POST') {
      try {
        const anonymousViewerId = getViewerId(req, res);
        const body = await parseJsonBody(req);
        db.createViewerAccount({ ...body, fromViewerId: anonymousViewerId });
        const session = db.authenticateViewerAccount({ email: body.email, password: body.password, fromViewerId: anonymousViewerId });
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
        const session = db.authenticateViewerAccount({ ...body, fromViewerId: anonymousViewerId });
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
