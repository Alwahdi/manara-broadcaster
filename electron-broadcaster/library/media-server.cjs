// WIVA — local HTTP media server with Range support + IPTV proxy
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');
const db = require('./db.cjs');
const iptv = require('./iptv.cjs');
const cloudIptv = require('./cloud-iptv.cjs');
const scanner = require('./scanner.cjs');
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
  const getAdminAuth = options.getAdminAuth;
  const auth = typeof getAdminAuth === 'function' ? getAdminAuth() : {};
  const username = auth.username || 'admin';
  const header = req.headers.authorization || '';
  const token = header.startsWith('Basic ') ? header.slice(6) : '';
  const cookieToken = parseCookies(req).manara_admin || '';
  let provided = '';
  try { provided = Buffer.from(token, 'base64').toString('utf8'); } catch {}
  const sep = provided.indexOf(':');
  const basicOk = sep > -1 && verifyAdminCredentials(options, provided.slice(0, sep), provided.slice(sep + 1));
  const sessionOk = cookieToken && typeof options.verifyAdminSession === 'function' && options.verifyAdminSession(cookieToken);
  const legacyCookieOk = cookieToken === Buffer.from(`${username}:${auth.password || 'admin'}`).toString('base64') && verifyAdminCredentials(options, username, auth.password || 'admin');
  if (basicOk || sessionOk || legacyCookieOk) return true;
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
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دخول إدارة WIVA</title><style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap');:root{color-scheme:dark;--bg:#07090f;--panel:#111827;--line:rgba(226,232,240,.14);--text:#f8fafc;--muted:#9ca3af;--accent:#2563eb;--accent2:#14b8a6}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top right,rgba(37,99,235,.24),transparent 34%),linear-gradient(180deg,#080a12,#0b1020);color:var(--text);font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;padding:22px}.login{width:min(430px,100%)}.mark{display:flex;align-items:center;gap:12px;margin-bottom:14px}.mark img{height:38px;max-width:120px;object-fit:contain}.brand b{display:block;font-size:16px}.brand span{display:block;color:var(--muted);font-size:12px;margin-top:2px}.card{border:1px solid var(--line);background:rgba(16,24,39,.92);border-radius:8px;padding:22px;box-shadow:0 26px 80px rgba(0,0,0,.36)}h1{font-size:23px;margin:0 0 7px;letter-spacing:0}.lead{color:#cbd5e1;line-height:1.7;margin:0 0 18px;font-size:13px}label{display:block;color:#dbeafe;font-size:12px;font-weight:900;margin-top:12px}input{width:100%;margin:7px 0 2px;padding:13px 14px;border-radius:8px;border:1px solid rgba(148,163,184,.24);background:#0b1220;color:#fff;font:inherit;outline:none}input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.18)}button{width:100%;min-height:46px;padding:12px;border:0;border-radius:8px;background:linear-gradient(135deg,var(--accent),#1d4ed8);color:#fff;font-weight:900;margin-top:16px;cursor:pointer;font:inherit}.err{color:#fecaca;background:rgba(127,29,29,.26);border:1px solid rgba(248,113,113,.34);border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.6}.note{margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.7;text-align:center}</style></head><body><main class="login"><div class="mark"><img src="/wiva-logo.png" alt="WIVA"><div class="brand"><b>WIVA</b><span>إدارة الشبكة المحلية</span></div></div><form class="card" method="post" action="${escapeHtml(basePath)}/login"><h1>تسجيل الدخول</h1><p class="lead">ادخل ببيانات الإدارة لإدارة القنوات، IPTV، المكتبة، المشاهدين، والتقارير.</p>${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}<label>اسم المستخدم<input name="username" autocomplete="username" placeholder="admin" required autofocus></label><label>كلمة المرور<input name="password" type="password" autocomplete="current-password" placeholder="كلمة المرور" required></label><button>دخول إلى اللوحة</button><p class="note">الجلسة محفوظة على هذا الجهاز لمدة أسبوع.</p></form></main></body></html>`;
}

function setupPage(options = {}) {
  const state = typeof options.getSetupState === 'function' ? options.getSetupState() : {};
  const payload = jsonForScript(state);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>إعداد WIVA</title><style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap');
:root{color-scheme:dark;--bg:#07090f;--panel:#111827;--panel2:#0f172a;--line:rgba(226,232,240,.12);--text:#f8fafc;--muted:#9ca3af;--accent:#2563eb;--accent2:#14b8a6;--good:#22c55e;--warn:#f59e0b;--danger:#ef4444}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,rgba(37,99,235,.24),transparent 30%),linear-gradient(180deg,#080a12,#0a0f1d 55%,#07090f);color:var(--text);font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;-webkit-font-smoothing:antialiased}main{width:min(1180px,100%);margin:auto;padding:24px}.hero{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:20px;align-items:end;margin-bottom:18px}.brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}.brand img{height:46px;max-width:150px;object-fit:contain}.eyebrow{display:inline-flex;margin-bottom:10px;border:1px solid rgba(20,184,166,.28);background:rgba(20,184,166,.1);color:#ccfbf1;border-radius:8px;padding:6px 9px;font-size:12px;font-weight:900}h1{font-size:clamp(32px,6vw,64px);line-height:1;margin:0 0 10px;letter-spacing:0}.lead{color:#d1d5db;line-height:1.8;margin:0;max-width:760px}.status{border:1px solid var(--line);background:rgba(17,24,39,.72);border-radius:8px;padding:16px;display:grid;gap:9px}.status div{display:flex;justify-content:space-between;gap:8px;color:#cbd5e1;font-size:13px}.status b{color:#fff;direction:ltr}.shell{display:grid;grid-template-columns:240px minmax(0,1fr);gap:16px}.steps{position:sticky;top:14px;align-self:start;border:1px solid var(--line);background:rgba(17,24,39,.72);border-radius:8px;padding:10px}.step{width:100%;min-height:44px;border:0;border-radius:8px;background:transparent;color:#cbd5e1;font:inherit;font-weight:850;text-align:start;padding:10px;cursor:pointer}.step.active{background:rgba(37,99,235,.18);color:#fff}.card{display:none;border:1px solid var(--line);background:rgba(17,24,39,.78);border-radius:8px;padding:20px;box-shadow:0 22px 70px rgba(0,0,0,.22)}.card.active{display:block}.card h2{font-size:23px;margin:0 0 6px}.card p{color:#aebacd;line-height:1.75;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}label{display:block;color:#dbeafe;font-size:12px;font-weight:900;margin:0 0 6px}input,select{width:100%;min-height:46px;border:1px solid rgba(148,163,184,.22);background:#0b1220;color:#fff;border-radius:8px;padding:12px;font:inherit;outline:none}input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.16)}.choice-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.choice{border:1px solid rgba(148,163,184,.22);background:rgba(255,255,255,.045);border-radius:8px;padding:14px;cursor:pointer}.choice input{display:none}.choice:has(input:checked){border-color:rgba(20,184,166,.7);background:rgba(20,184,166,.12)}.choice strong{display:block}.choice span{display:block;color:#9ca3af;font-size:12px;line-height:1.6;margin-top:4px}.port-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.hint{font-size:12px;color:#aebacd;margin-top:7px;line-height:1.6}.ok{color:#86efac}.bad{color:#fca5a5}.actions{display:flex;justify-content:space-between;gap:10px;margin-top:18px}.btn{min-height:44px;border:0;border-radius:8px;padding:11px 16px;color:#fff;font:inherit;font-weight:900;cursor:pointer;background:rgba(255,255,255,.08);border:1px solid var(--line)}.btn.primary{background:linear-gradient(135deg,var(--accent),#1d4ed8);border-color:transparent}.btn:disabled{opacity:.55;cursor:not-allowed}.preview{border:1px solid var(--line);background:rgba(0,0,0,.22);border-radius:8px;padding:14px;margin-top:12px;display:flex;align-items:center;gap:12px}.preview img{max-height:52px;max-width:140px;object-fit:contain}.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);border:1px solid var(--line);background:#101827;color:#fff;border-radius:8px;padding:11px 16px;font-weight:850;box-shadow:0 18px 44px rgba(0,0,0,.34)}@media(max-width:880px){main{padding:14px}.hero,.shell{grid-template-columns:1fr}.steps{position:static;display:grid;grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.status{display:none}}
</style></head><body><main><script id="state" type="application/json">${payload}</script><section class="hero"><div><div class="brand"><img src="/wiva-logo.png" alt="WIVA"><strong>WIVA Agent</strong></div><span class="eyebrow">إعداد الشبكة</span><h1>جهّز تجربة المشاهدة داخل شبكتك</h1><p class="lead">خطوات قصيرة لتسجيل الشبكة، اختيار المنافذ، تخصيص الهوية، وتشغيل الإدارة من المتصفح على نفس الشبكة.</p></div><aside class="status" id="agentStatus"></aside></section><section class="shell"><nav class="steps" id="steps"></nav><form id="setupForm"><section class="card active" data-step="0"><h2>الحساب</h2><p>سجّل بيانات مالك الشبكة. ربط Neon Auth/Google يحتاج مفاتيح المشروع النهائية؛ هذه النسخة تحفظ الإعداد المحلي وتجهّز الواجهة له.</p><div class="grid"><div><label>البريد الإلكتروني</label><input name="ownerEmail" type="email" autocomplete="email" placeholder="owner@example.com"></div><div><label>كلمة المرور</label><input name="ownerPassword" type="password" autocomplete="new-password" placeholder="••••••••"></div></div><div class="hint">زر Google يظهر في الواجهة النهائية عند ضبط مفاتيح Neon Auth و OAuth redirects.</div></section><section class="card" data-step="1"><h2>بيانات الشبكة</h2><p>هذه البيانات تساعدك في الإدارة والاشتراك والتقارير.</p><div class="grid"><div><label>اسم الشبكة</label><input name="networkName" required></div><div><label>رقم/كود الشبكة</label><input name="networkNumber"></div><div><label>المدينة</label><input name="networkCity" placeholder="Sana'a"></div><div><label>الدولة</label><input name="networkCountry" placeholder="Yemen"></div><div><label>العنوان أو المنطقة</label><input name="networkLocation"></div><div><label>المنطقة الزمنية</label><input name="networkTimezone" placeholder="Asia/Aden"></div></div></section><section class="card" data-step="2"><h2>الهوية والشعار</h2><p>استخدم شعار الشبكة واسمها في صفحات المشاهدة والمكتبة.</p><div class="grid"><div><label>اسم الواجهة</label><input name="brandName" required></div><div><label>الوصف القصير</label><input name="brandTagline"></div></div><label>رفع شعار PNG</label><input id="logoInput" type="file" accept="image/png"><input type="hidden" name="networkLogoDataUrl"><div class="preview"><img id="logoPreview" src="/wiva-logo.png" alt="logo"><span>سيتم ضغط الشعار وحفظه محلياً. إزالة الخلفية التلقائية تحتاج خدمة صور خارجية، لذلك الواجهة تحفظ PNG الشفاف بأفضل جودة متاحة الآن.</span></div></section><section class="card" data-step="3"><h2>طريقة العرض</h2><p>اختر هل تكون القنوات والمكتبة على نفس التجربة أو منفصلتين.</p><div class="choice-grid"><label class="choice"><input type="radio" name="experienceLayout" value="unified" checked><strong>واجهة واحدة</strong><span>القنوات والمكتبة من نفس تجربة WIVA.</span></label><label class="choice"><input type="radio" name="experienceLayout" value="separate"><strong>منافذ منفصلة</strong><span>منفذ مباشر ومنفذ مستقل للمكتبة والإدارة.</span></label></div></section><section class="card" data-step="4"><h2>المنافذ</h2><p>افحص المنافذ قبل التشغيل حتى تعرف إن كان هناك برنامج آخر يستخدمها.</p><div class="grid"><div><label>منفذ البث المباشر</label><div class="port-row"><input name="port" type="number" min="1" max="65535" required><button class="btn" type="button" data-check="port">فحص</button></div><div class="hint" id="portHint"></div></div><div><label>منفذ الإدارة والمكتبة</label><div class="port-row"><input name="libraryPort" type="number" min="1" max="65535" required><button class="btn" type="button" data-check="libraryPort">فحص</button></div><div class="hint" id="libraryPortHint"></div></div></div></section><section class="card" data-step="5"><h2>الثيم</h2><p>اختر مظهراً هادئاً وواضحاً للمشاهدين والإدارة.</p><div class="grid"><div><label>ثيم القنوات</label><select name="liveTheme"><option value="cinema">Cinema</option><option value="broadcast">Broadcast</option><option value="minimal">Minimal</option></select></div><div><label>ثيم المكتبة</label><select name="libraryTheme"><option value="cinema">Cinema</option><option value="gallery">Gallery</option><option value="minimal">Minimal</option></select></div></div></section><section class="card" data-step="6"><h2>الإدارة</h2><p>اختر رابطاً مخصصاً وبيانات دخول للوحة الإدارة على الشبكة. اترك كلمة المرور فارغة عند التعديل إذا لا تريد تغييرها.</p><div class="grid"><div><label>رابط الإدارة</label><input name="adminPath" placeholder="admin"></div><div><label>اسم المستخدم</label><input name="adminUsername" autocomplete="username" required></div><div><label>كلمة المرور</label><input name="adminPassword" type="password" autocomplete="new-password"></div></div></section><section class="card" data-step="7"><h2>المراجعة والتشغيل</h2><p>بعد الحفظ ستظهر روابط الإعداد والإدارة والمكتبة والقنوات. إذا تغيّر المنفذ ستحتاج فتح الرابط الجديد.</p><div id="review" class="status"></div></section><div class="actions"><button class="btn" type="button" id="prevBtn">السابق</button><button class="btn primary" type="button" id="nextBtn">التالي</button><button class="btn primary" type="submit" id="saveBtn" hidden>حفظ وتشغيل</button></div></form></section></main><script>
const initial = JSON.parse(document.getElementById('state').textContent || '{}');
const fields = ['networkName','networkNumber','networkLocation','networkCountry','networkCity','networkTimezone','brandName','brandTagline','experienceLayout','liveTheme','libraryTheme','adminPath','adminUsername','port','libraryPort'];
const form = document.getElementById('setupForm'); const steps = ['الحساب','الشبكة','الهوية','العرض','المنافذ','الثيم','الإدارة','التشغيل']; let idx=0;
function fill(){ const s=initial.settings||{}; for(const k of fields){ const el=form.elements[k]; if(el && s[k]!=null){ if(el.length){ [...el].forEach(x=>x.checked=x.value===String(s[k])); } else el.value=s[k]; } } if(!form.elements.brandName.value) form.elements.brandName.value=s.brandName||s.networkName||'WIVA'; if(!form.elements.adminUsername.value) form.elements.adminUsername.value='admin'; if(!form.elements.adminPassword.value && !initial.setupCompleted) form.elements.adminPassword.value='admin'; if(!form.elements.port.value) form.elements.port.value=(initial.ports&&initial.ports.live)||8787; if(!form.elements.libraryPort.value) form.elements.libraryPort.value=(initial.ports&&initial.ports.library)||8788; }
function renderSteps(){ steps.forEach((name,i)=>{ const b=document.createElement('button'); b.type='button'; b.className='step'+(i===idx?' active':''); b.textContent=(i+1)+'. '+name; b.onclick=()=>{idx=i; render();}; stepsEl.appendChild(b); }); }
const stepsEl=document.getElementById('steps'); function render(){ stepsEl.innerHTML=''; renderSteps(); document.querySelectorAll('.card').forEach(c=>c.classList.toggle('active', Number(c.dataset.step)===idx)); prevBtn.disabled=idx===0; nextBtn.hidden=idx===steps.length-1; saveBtn.hidden=idx!==steps.length-1; document.getElementById('review').innerHTML = '<div><span>البث</span><b>:'+form.elements.port.value+'</b></div><div><span>المكتبة/الإدارة</span><b>:'+form.elements.libraryPort.value+'</b></div><div><span>الإدارة</span><b>/'+(form.elements.adminPath.value||'admin')+'</b></div>'; }
function status(){ const u=initial.urls||{}; document.getElementById('agentStatus').innerHTML='<div><span>الإصدار</span><b>'+ (initial.version||'-') +'</b></div><div><span>البث</span><b>'+((initial.ports&&initial.ports.live)||'-')+'</b></div><div><span>الإدارة</span><b>'+((initial.ports&&initial.ports.library)||'-')+'</b></div><div><span>الرابط المحلي</span><b>'+((u.setupLocal)||location.href)+'</b></div>'; }
async function checkPort(name){ const port=form.elements[name].value; const box=document.getElementById(name+'Hint'); box.textContent='جاري الفحص...'; const r=await fetch('/api/setup/port-check?port='+encodeURIComponent(port)).then(r=>r.json()); box.className='hint '+(r.available?'ok':'bad'); box.textContent=r.available ? 'المنفذ متاح.' : (r.message + (r.suggestedPort ? ' المنفذ المقترح: '+r.suggestedPort : '')); }
document.querySelectorAll('[data-check]').forEach(b=>b.onclick=()=>checkPort(b.dataset.check));
logoInput.onchange=async()=>{ const file=logoInput.files&&logoInput.files[0]; if(!file) return; if(file.type!=='image/png'){ alert('الشعار يجب أن يكون PNG.'); return; } const data=await new Promise(r=>{const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(file);}); form.elements.networkLogoDataUrl.value=data; logoPreview.src=data; };
prevBtn.onclick=()=>{idx=Math.max(0,idx-1);render();}; nextBtn.onclick=()=>{idx=Math.min(steps.length-1,idx+1);render();};
form.onsubmit=async(e)=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(form).entries()); data.setupCompleted=true; const r=await fetch('/api/setup/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const j=await r.json(); const t=document.createElement('div'); t.className='toast'; t.textContent=j.ok?'تم حفظ إعداد WIVA. افتح الروابط الجديدة من شاشة الوكيل.':(j.error||'تعذر الحفظ'); document.body.appendChild(t); setTimeout(()=>t.remove(),4200); if(j.ok && j.state && j.state.urls){ setTimeout(()=>location.href=j.state.urls.adminLocal||'/admin',900); } };
fill(); status(); render();
</script></body></html>`;
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

const ARTWORK_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const FOLDER_ARTWORK_NAMES = ['poster', 'cover', 'folder', 'thumbnail', 'thumb'];

function artworkMime(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
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

function mediaPosterUrl(item) {
  if (item?.poster_url) return item.poster_url;
  return findArtworkFile(item) ? `/media-art/${item.id}/poster` : '';
}

function mediaBackdropUrl(item) {
  if (item?.backdrop_url) return item.backdrop_url;
  return findArtworkFile(item) ? `/media-art/${item.id}/poster` : '';
}

function listLibraryItems(query = {}) {
  return db.listMedia({
    q: query.q || '',
    kind: query.kind || '',
    limit: Math.min(2000, Math.max(1, Number(query.limit) || 800)),
  });
}

function sourceLabelFromPath(sourcePath) {
  return path.basename(String(sourcePath || '').replace(/[\\/]+$/, '')) || sourcePath || 'مصدر المكتبة';
}

function sourceInfoForItem(item, sources = db.listPaths()) {
  const storedSource = item.source_path || '';
  const byId = item.source_id ? sources.find((source) => String(source.id) === String(item.source_id)) : null;
  const byStoredPath = storedSource ? sources.find((source) => String(source.path) === String(storedSource)) : null;
  const byPrefix = sources
    .slice()
    .sort((a, b) => String(b.path || '').length - String(a.path || '').length)
    .find((source) => {
      const sourcePath = String(source.path || '');
      return sourcePath && String(item.path || '').startsWith(sourcePath);
    });
  const source = byId || byStoredPath || byPrefix || null;
  const sourcePath = source?.path || item.source_path || '';
  const label = source?.label || item.source_label || sourceLabelFromPath(sourcePath) || 'مصدر المكتبة';
  const relativePath = item.relative_path || (sourcePath && item.path && String(item.path).startsWith(sourcePath)
    ? path.relative(sourcePath, item.path)
    : path.basename(item.path || ''));
  const folder = item.folder || (relativePath ? path.dirname(relativePath) : '');
  return {
    id: source?.id || item.source_id || '',
    path: sourcePath,
    label,
    status: source?.status || 'connected',
    relativePath,
    folder: folder && folder !== '.' ? folder : '',
  };
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
      return {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'folder' : 'file',
        readable: !!childStat,
        size: childStat?.size || 0,
        modifiedAt: childStat?.mtimeMs || 0,
      };
    }).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'folder' ? -1 : 1));
  } catch {
    return { ok: false, path: target, message: 'لا توجد صلاحية لقراءة هذا المجلد.' };
  }
  return {
    ok: true,
    path: target,
    parent: path.dirname(target) !== target ? path.dirname(target) : '',
    entries: rows,
    folders: rows.filter((entry) => entry.type === 'folder').length,
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
  send(res, 403, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>البث غير متاح</title><style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap');body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d1f;color:#e5e7eb;font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;text-align:center;padding:24px}main{max-width:520px}h1{font-size:24px;margin:0 0 10px}p{color:#cbd5e1;line-height:1.7}</style></head><body><main><h1>البث غير متاح حالياً</h1><p>${escapeHtml(db.blockedMessage())}</p></main></body></html>`, {
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
    send(res, 402, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الميزة غير متاحة</title><style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap');body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080d1f;color:#e5e7eb;font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;text-align:center;padding:24px}main{max-width:560px}h1{font-size:24px;margin:0 0 10px}p{color:#cbd5e1;line-height:1.7}</style></head><body><main><h1>الميزة غير متاحة حالياً</h1><p>${escapeHtml(message)}</p></main></body></html>`, {
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
  const adminPath = '/' + String(typeof options.getAdminPath === 'function' ? options.getAdminPath() : 'admin').replace(/^\/+|\/+$/g, '').replace(/[^\w\-./]/g, '');
  const adminBase = adminPath === '/' ? '/admin' : adminPath;
  const broadcastChannels = db.listBroadcastChannels();
  const broadcastJson = escapeHtml(JSON.stringify(broadcastChannels, null, 2));
  const iptvPolicy = typeof options.getIptvPolicy === 'function' ? options.getIptvPolicy() : {};
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
  const activeStreamsCount = Object.values(status).filter((s) => Number(s.viewers || 0) > 0).length;
  const broadcastRows = broadcastChannels.map((ch) => `
    <tr data-broadcast-row="${escapeHtml(ch.id || '')}">
      <td><input name="name" value="${escapeHtml(ch.name || '')}" placeholder="اسم القناة"></td>
      <td><select name="sourceType"><option value="screen" ${ch.source?.type === 'screen' ? 'selected' : ''}>شاشة</option><option value="window" ${ch.source?.type === 'window' ? 'selected' : ''}>نافذة</option><option value="device" ${ch.source?.type === 'device' ? 'selected' : ''}>USB / HDMI</option><option value="url" ${ch.source?.type === 'url' ? 'selected' : ''}>رابط</option></select></td>
      <td><input name="sourceId" value="${escapeHtml(ch.source?.id || ch.source?.url || '')}" placeholder="معرف الجهاز أو الرابط"></td>
      <td><input name="audioDeviceId" value="${escapeHtml(ch.audioDeviceId || 'none')}" placeholder="none أو معرف الصوت"></td>
      <td><input name="resolution" value="${escapeHtml(ch.resolution || '1280x720')}"></td>
      <td><input name="fps" type="number" min="1" max="120" value="${Number(ch.fps || 30)}"></td>
      <td><input name="bitrateKbps" type="number" min="250" step="250" value="${Number(ch.bitrateKbps || 2500)}"></td>
      <td><label class="check"><input name="autoStart" type="checkbox" ${ch.autoStart ? 'checked' : ''}> تلقائي</label><label class="check"><input name="enabled" type="checkbox" ${ch.enabled !== false ? 'checked' : ''}> مفعل</label></td>
      <td><button data-save-broadcast="${escapeHtml(ch.id || '')}">حفظ</button><button class="danger" data-remove-broadcast="${escapeHtml(ch.id || '')}">حذف</button></td>
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
      <td class="url">${escapeHtml(account.phone || '')}</td>
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
      <td>${escapeHtml(msg.name || '')}<br><span class="muted">${escapeHtml([msg.phone, msg.email].filter(Boolean).join(' · '))}</span></td>
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
  const pathRows = libraryPaths.map((p) => {
    const status = libraryPathStatus(p);
    const statusLabel = status.status === 'connected' ? 'متصل' : 'غير متصل';
    const scanLabel = status.lastScanAt ? new Date(status.lastScanAt).toLocaleString() : 'لم يتم الفحص بعد';
    return `
    <tr>
      <td class="url">${escapeHtml(p.path)}</td>
      <td>${escapeHtml(mediaKindLabel(p.kind))}</td>
      <td><span class="status-dot ${status.status === 'connected' ? 'ok' : 'bad'}"></span>${statusLabel}<br><span class="muted">${escapeHtml(status.message)}</span></td>
      <td>${Number(status.fileCount || 0)}</td>
      <td>${escapeHtml(scanLabel)}</td>
      <td>${p.locked ? 'مثبت' : `<button data-path-del="${p.id}">إزالة من WIVA</button>`}<button data-browse-path="${escapeHtml(p.path)}" type="button" class="secondary">استعراض</button></td>
    </tr>`;
  }).join('');
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
<title>لوحة إدارة WIVA</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap');
:root{color-scheme:dark;--bg:#07090f;--panel:#111827;--panel2:#0b1220;--line:rgba(226,232,240,.12);--line2:rgba(148,163,184,.2);--text:#f8fafc;--muted:#9ca3af;--accent:#2563eb;--accent2:#14b8a6;--good:#22c55e;--warn:#f59e0b;--danger:#ef4444;--radius:14px;--radius2:20px}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;margin:0;background:radial-gradient(circle at top right,rgba(37,99,235,.2),transparent 34%),linear-gradient(180deg,#080a12,#0a0f1d 58%,#07090f);color:var(--text);-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(37,99,235,.06),transparent 42%,rgba(20,184,166,.05));z-index:-1}
main{max-width:1440px;margin:auto;padding:22px}
h1{font-size:28px;margin:0 0 7px;letter-spacing:0}h2{font-size:18px;margin:0 0 12px}h3{font-size:15px;margin:20px 0 9px;color:#dbeafe}.lead{color:#b6c2d6;line-height:1.7;margin:0}
.eyebrow{display:inline-flex;margin-bottom:8px;padding:5px 8px;border:1px solid rgba(20,184,166,.26);background:rgba(20,184,166,.1);border-radius:7px;color:#ccfbf1;font-size:11px;font-weight:900}
.shell-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px}.brand-row{display:flex;align-items:center;gap:13px;margin-bottom:12px}.brand-row img{height:44px;max-width:150px;object-fit:contain}.head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.head-actions a,.admin-nav a{color:#e0f2fe;text-decoration:none;font-size:12px;font-weight:900;border:1px solid var(--line);background:rgba(255,255,255,.06);border-radius:var(--radius);padding:9px 12px;min-height:40px;display:inline-flex;align-items:center;transition:background .16s,border-color .16s,transform .16s}.head-actions a:hover,.admin-nav a:hover{background:rgba(255,255,255,.1);border-color:rgba(20,184,166,.32);transform:translateY(-1px)}.head-actions a.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;color:#fff}
.admin-nav{position:sticky;top:0;z-index:5;display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;padding:12px;background:rgba(7,11,22,.78);border:1px solid rgba(226,232,240,.08);border-radius:var(--radius2);backdrop-filter:blur(18px)}
section{border:1px solid var(--line);background:linear-gradient(180deg,rgba(16,24,39,.9),rgba(15,23,42,.74));border-radius:var(--radius2);padding:18px;margin-bottom:16px;box-shadow:0 20px 60px rgba(0,0,0,.22)}
.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
label{display:block;font-size:12px;color:#dbeafe;font-weight:850;margin:10px 0 6px}
input,textarea,select{width:100%;box-sizing:border-box;border:1px solid var(--line2);border-radius:var(--radius);padding:11px 12px;background:var(--panel2);color:#fff;font:inherit;outline:none}input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.16)}
.check{display:flex;align-items:center;gap:6px;margin:3px 0;color:#dbeafe}.check input{width:auto;min-height:0}.mini-form{border:1px solid rgba(148,163,184,.16);background:rgba(255,255,255,.035);border-radius:var(--radius2);padding:14px;margin:10px 0 14px}.admin-tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end}.tabs-note{color:#bfdbfe;background:rgba(20,184,166,.08);border:1px solid rgba(20,184,166,.2);border-radius:var(--radius);padding:10px 12px;margin:0 0 14px;font-size:12px;line-height:1.7}.theme-presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:8px 0 12px}.theme-preset{border:1px solid var(--line);background:linear-gradient(135deg,var(--preset-a),var(--preset-b));border-radius:var(--radius);min-height:72px;padding:11px;color:#fff;text-align:start;box-shadow:0 14px 36px rgba(0,0,0,.22)}.theme-preset strong{display:block;font-size:13px}.theme-preset span{display:block;font-size:11px;color:rgba(255,255,255,.82);margin-top:3px}
textarea{min-height:220px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;direction:ltr;text-align:left;line-height:1.55}
button{border:0;border-radius:var(--radius);padding:9px 12px;background:linear-gradient(135deg,var(--accent),#1d4ed8);color:#fff;font-weight:850;cursor:pointer;margin:4px 4px 4px 0;font-family:inherit}button:hover{filter:brightness(1.08)}button.secondary{background:#334155}button.danger{background:#dc2626}
table{width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;font-size:13px;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:var(--radius)}
thead th{position:sticky;top:0;background:rgba(15,23,42,.96);color:#dbeafe;font-size:11px;text-transform:none;z-index:1}td,th{border-bottom:1px solid rgba(255,255,255,.075);padding:10px;text-align:right;vertical-align:top}tbody tr:hover{background:rgba(255,255,255,.035)}tbody tr:last-child td{border-bottom:0}
a{color:#93c5fd}.url{word-break:break-all;color:#bfdbfe;direction:ltr;text-align:left}.msg{color:#86efac;font-size:13px;margin-top:8px}.muted{color:var(--muted);font-size:12px;line-height:1.7}
.statcards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:10px 0 12px}.statcard{border:1px solid var(--line);background:rgba(0,0,0,.2);border-radius:var(--radius);padding:13px}.statcard b{display:block;font-size:24px;line-height:1.1}.statcard span{font-size:12px;color:var(--muted);font-weight:800}
	.table-wrap{width:100%;overflow:auto}.section-note{display:flex;gap:8px;align-items:center;color:#bfdbfe;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.22);border-radius:var(--radius);padding:10px 12px;margin:10px 0;font-size:12px;line-height:1.7}.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:rgba(255,255,255,.055);border-radius:999px;padding:4px 8px;color:#dbeafe;font-size:11px;font-weight:900}
	.wizard-card{border:1px solid rgba(248,197,28,.24);background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.028));border-radius:var(--radius2);padding:16px;margin:10px 0 14px}.wizard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.wizard-head h3{margin:0 0 4px}.wizard-head p{margin:0;color:var(--muted);font-size:12px;line-height:1.7}.wizard-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.source-preview,.folder-preview{border:1px solid rgba(148,163,184,.18);background:rgba(0,0,0,.22);border-radius:var(--radius);padding:11px 12px;margin-top:10px;color:#dbeafe;font-size:12px;line-height:1.7}.advanced{border:1px solid rgba(148,163,184,.16);border-radius:var(--radius);padding:10px 12px;background:rgba(0,0,0,.18);margin-top:10px}.advanced summary{cursor:pointer;color:#fde68a;font-weight:900}.folder-browser{display:grid;grid-template-columns:260px minmax(0,1fr);gap:12px;margin-top:12px}.browser-pane{border:1px solid rgba(148,163,184,.16);background:rgba(0,0,0,.18);border-radius:var(--radius);padding:10px;min-height:260px}.browser-list{display:grid;gap:6px;max-height:330px;overflow:auto}.browser-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:start;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#fff;padding:9px 10px}.browser-item small{color:var(--muted);direction:ltr}.browser-path{direction:ltr;text-align:left;color:#bfdbfe;word-break:break-all;margin:0 0 8px;font-size:12px}.status-dot{display:inline-block;width:8px;height:8px;border-radius:999px;margin-left:6px}.status-dot.ok{background:var(--good);box-shadow:0 0 0 4px rgba(34,197,94,.12)}.status-dot.bad{background:var(--danger);box-shadow:0 0 0 4px rgba(239,68,68,.12)}
.modal-host{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(3,7,18,.72);padding:18px;backdrop-filter:blur(14px)}.modal-host[hidden]{display:none}.modal-card{width:min(520px,100%);border:1px solid var(--line);background:#101827;border-radius:var(--radius2);box-shadow:0 28px 90px rgba(0,0,0,.5);padding:18px}.modal-card h3{margin:0 0 8px;font-size:18px}.modal-card p{color:#cbd5e1;line-height:1.75;margin:0 0 14px}.modal-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.modal-danger{background:#dc2626}.modal-fields{display:grid;gap:10px;margin:12px 0}.modal-fields textarea{min-height:100px;direction:rtl;text-align:right;font-family:inherit}
	@media (max-width:980px){.grid{grid-template-columns:1fr}.shell-head{align-items:flex-start;flex-direction:column}.head-actions{justify-content:flex-start}table{display:block;overflow:auto}.admin-nav{position:static}.folder-browser{grid-template-columns:1fr}}
@media (max-width:720px){main{padding:14px}.statcards{grid-template-columns:1fr 1fr}.head-actions a,.admin-nav a{flex:1;text-align:center}.shell-head h1{font-size:24px}}
@media (max-width:720px){body{padding-bottom:74px}.shell-head{gap:12px}.brand-row img{height:34px;max-width:112px}.lead{font-size:12px}.head-actions{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:7px}.head-actions a{justify-content:center;min-height:42px;padding:9px 8px}.admin-nav{position:fixed;right:10px;left:10px;bottom:10px;top:auto;z-index:50;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(92px,1fr);overflow-x:auto;flex-wrap:nowrap;margin:0;padding:8px;border-radius:18px;background:rgba(7,11,22,.92);box-shadow:0 18px 46px rgba(0,0,0,.42)}.admin-nav a{justify-content:center;min-width:92px;padding:9px 8px;font-size:11px;border-radius:13px;white-space:nowrap}.statcards{grid-template-columns:1fr 1fr;gap:8px}.statcard{padding:11px;border-radius:12px}.statcard b{font-size:20px}section{padding:14px;border-radius:16px;margin-bottom:12px}.form-grid,.admin-tools{grid-template-columns:1fr}.table-wrap{margin-inline:-6px}.table-wrap table{min-width:760px}td,th{padding:8px;font-size:12px}.wizard-card{padding:13px}.wizard-head{display:grid}.modal-host{align-items:end;padding:10px}.modal-card{border-radius:18px 18px 10px 10px;max-height:86vh;overflow:auto}.folder-browser{grid-template-columns:1fr}.browser-pane{min-height:180px}}
</style>
</head>
<body><main>
<div class="shell-head"><div><div class="brand-row"><img src="/wiva-logo.png" alt="WIVA"><span class="eyebrow">WIVA LAN Admin</span></div><h1>لوحة إدارة WIVA</h1><p class="lead">تحكم واضح في المشاهدة داخل الشبكة: القنوات، IPTV، مكتبة الوسائط، المشاهدين، التقارير، والتخصيص.</p></div><div class="head-actions"><a class="primary" href="/">فتح صفحة المشاهدة</a><a href="/library">فتح المكتبة</a><a href="/setup">الإعداد</a><a href="${escapeHtml(adminBase)}/logout">تسجيل الخروج</a></div></div>
<nav class="admin-nav"><a href="#dashboard">Dashboard</a><a href="#viewers">المستخدمون</a><a href="#broadcast">قنوات البث</a><a href="#iptv">IPTV</a><a href="#media">المكتبة</a><a href="#security">الحظر</a><a href="#logs">السجل</a></nav>
<script id="mediaAdminPayload" type="application/json">${mediaPayload}</script>
<section id="dashboard">
  <h2>Dashboard</h2>
  <p class="tabs-note">ملخص سريع لحالة WIVA داخل الشبكة. إذا ظهرت تنبيهات هنا، ابدأ من فحص الصحة قبل تعديل القنوات.</p>
  <div class="statcards">
    <div class="statcard"><b>${sessions.length}</b><span>أجهزة نشطة الآن</span></div>
    <div class="statcard"><b>${activeStreamsCount}</b><span>بث IPTV نشط</span></div>
    <div class="statcard"><b>${cloudRows.length + localRows.length}</b><span>قنوات IPTV</span></div>
    <div class="statcard"><b>${mediaStats.total}</b><span>عناصر المكتبة</span></div>
  </div>
  <div class="statcards">
    <div class="statcard"><b>${broadcastChannels.length}</b><span>قنوات بث محلية</span></div>
    <div class="statcard"><b>${viewerAccounts.length}</b><span>حسابات مشاهدين</span></div>
    <div class="statcard"><b>${health.missingFiles.length + health.unsupportedFormats.length + health.brokenSubtitles.length}</b><span>تنبيهات مكتبة</span></div>
    <div class="statcard"><b>${Math.max(1, Number(iptvPolicy.cloudIptvRefreshMinutes || 3))}m</b><span>تحديث IPTV السحابي</span></div>
  </div>
  <div class="admin-tools">
    <a class="pill" href="/api/admin/health">فحص الصحة</a>
    <a class="pill" href="/api/admin/reports/views.csv">تصدير CSV</a>
    <a class="pill" href="/api/admin/reports/views.json">تصدير JSON</a>
    <a class="pill" href="/setup">الإعداد</a>
  </div>
</section>
<section id="viewers">
  <h2>المستخدمون والمشاهدون</h2>
  <p class="tabs-note">هنا تظهر الأجهزة النشطة، حسابات المشاهدين، ورسائلهم للإدارة.</p>
  <h3>المشاهدون النشطون</h3>
  <div class="table-wrap"><table><thead><tr><th>IP</th><th>يشاهد</th><th>البيانات المنقولة</th><th>الطلبات</th><th>الجهاز</th><th>الإجراء</th></tr></thead><tbody>${sessionRows || '<tr><td colspan="6">لا يوجد مشاهدون نشطون حالياً.</td></tr>'}</tbody></table></div>
  <h3>حسابات المشاهدين</h3>
  <div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الرقم / الغرفة</th><th>البريد</th><th>المفضلة</th><th>لاحقاً</th><th>السجل</th><th>آخر ظهور</th></tr></thead><tbody>${accountRows || '<tr><td colspan="7">لا توجد حسابات مشاهدين بعد.</td></tr>'}</tbody></table></div>
  <h3>رسائل المشاهدين</h3>
  <div class="table-wrap"><table><thead><tr><th>الوقت</th><th>المشاهد</th><th>الرسالة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${messageRows || '<tr><td colspan="5">لا توجد رسائل حتى الآن.</td></tr>'}</tbody></table></div>
</section>
<section id="broadcast">
  <h2>قنوات البث وأجهزة الالتقاط</h2>
  <p class="tabs-note">أضف قناة بخطوات واضحة: اختر المصدر، افحصه، اضبط الجودة، ثم احفظ. الإدخال اليدوي موجود فقط في الخيارات المتقدمة.</p>
  <form id="broadcastForm" class="wizard-card">
    <div class="wizard-head">
      <div><h3>إضافة قناة جديدة</h3><p>WIVA يحاول قراءة الشاشات والنوافذ وأجهزة الالتقاط المتاحة. إذا لم يظهر جهازك، استخدم إعادة الفحص أو الإدخال المتقدم.</p></div>
      <div class="wizard-actions"><button type="button" class="secondary" id="refreshCaptureSources">إعادة فحص الأجهزة</button><button type="button" id="testCaptureSource">اختبار المصدر</button></div>
    </div>
    <div class="form-grid">
      <label>اسم القناة<input name="name" required placeholder="القناة الرئيسية"></label>
      <label>نوع المصدر<select name="sourceType" id="sourceType"><option value="screen">شاشة</option><option value="window">نافذة</option><option value="device">USB / HDMI</option><option value="url">رابط مباشر</option></select></label>
      <label id="sourcePickerLabel">المصدر المتاح<select id="sourcePicker"></select></label>
      <label id="sourceUrlLabel" hidden>رابط المصدر<input id="sourceUrl" placeholder="https://... أو rtsp://..."></label>
      <input name="sourceId" id="sourceId" type="hidden">
      <label>مصدر الصوت<select name="audioDeviceId" id="audioPicker"><option value="none">بدون صوت منفصل</option></select></label>
      <label>الدقة<select name="resolution"><option value="854x480">480p خفيف</option><option value="1280x720" selected>720p متوازن</option><option value="1920x1080">1080p واضح</option></select></label>
      <label>FPS<input name="fps" type="number" min="1" max="120" value="30"></label>
      <label>Bitrate Kbps<input name="bitrateKbps" type="number" min="250" step="250" value="2500"></label>
      <label class="check"><input name="autoStart" type="checkbox" checked> تشغيل تلقائي</label>
      <label class="check"><input name="enabled" type="checkbox" checked> مفعل</label>
    </div>
    <div class="source-preview" id="sourcePreview">جاري قراءة المصادر المتاحة...</div>
    <details class="advanced">
      <summary>إدخال متقدم</summary>
      <div class="form-grid">
        <label>معرف مصدر يدوي<input id="manualSourceId" placeholder="اتركه فارغاً للشاشة الافتراضية"></label>
        <label>معرف صوت يدوي<input id="manualAudioId" placeholder="none"></label>
      </div>
    </details>
    <div class="wizard-actions"><button>حفظ القناة</button></div>
  </form>
  <textarea id="broadcastJson" hidden>${broadcastJson}</textarea>
  <div class="table-wrap"><table><thead><tr><th>الاسم</th><th>المصدر</th><th>معرف المصدر</th><th>الصوت</th><th>الدقة</th><th>FPS</th><th>Bitrate</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody id="broadcastRows">${broadcastRows || '<tr><td colspan="9">لا توجد قنوات بث محفوظة.</td></tr>'}</tbody></table></div>
</section>
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
  <form id="pathForm" class="wizard-card">
    <div class="wizard-head">
      <div><h3>إضافة مجلد أو هارد</h3><p>اختر القرص ثم المجلد كما في متصفح الملفات. بعد الاختيار تستطيع المعاينة والإضافة بدون كتابة المسار يدوياً.</p></div>
      <div class="wizard-actions"><button type="button" class="secondary" id="refreshStorageRoots">إعادة فحص الأقراص</button><button type="button" id="scanNowBtn">فحص الآن</button></div>
    </div>
    <div class="form-grid">
      <label>المجلد المختار<input name="path" id="selectedLibraryPath" required readonly placeholder="اختر مجلداً من المتصفح أدناه"></label>
      <label>النوع<select name="kind"><option value="movies">أفلام</option><option value="tv">مسلسلات / حلقات</option><option value="audio">صوتيات</option></select></label>
    </div>
    <div class="folder-browser">
      <div class="browser-pane">
        <strong>الأقراص والمواقع</strong>
        <div class="browser-list" id="storageRoots"></div>
      </div>
      <div class="browser-pane">
        <p class="browser-path" id="currentBrowsePath">اختر قرصاً أو مجلداً للبدء.</p>
        <div class="wizard-actions"><button type="button" class="secondary" id="browseParent" disabled>رجوع للمجلد السابق</button><button type="button" id="chooseCurrentFolder" disabled>اختيار هذا المجلد</button></div>
        <div class="browser-list" id="storageEntries"></div>
      </div>
    </div>
    <div class="folder-preview" id="folderPreview">لم يتم اختيار مجلد بعد.</div>
    <details class="advanced">
      <summary>كتابة مسار يدوي متقدم</summary>
      <label>مسار يدوي<input id="manualLibraryPath" placeholder="C:\\Media\\Movies أو /Users/name/Movies"></label>
      <button type="button" class="secondary" id="useManualLibraryPath">استخدام هذا المسار</button>
    </details>
    <div class="wizard-actions"><button>إضافة المجلد</button></div>
  </form>
  <div class="table-wrap"><table><thead><tr><th>المسار</th><th>النوع</th><th>الحالة</th><th>العناصر</th><th>آخر فحص</th><th>الإجراء</th></tr></thead><tbody>${pathRows || '<tr><td colspan="6">لم تتم إضافة أي مجلدات بعد.</td></tr>'}</tbody></table></div>
  <h3>التخصيص</h3>
  <div class="theme-presets" aria-label="ثيمات جاهزة">
    <button type="button" class="theme-preset" style="--preset-a:#2563eb;--preset-b:#14b8a6" data-theme-preset="cinema"><strong>WIVA Cinema</strong><span>أزرق وتركواز واضح</span></button>
    <button type="button" class="theme-preset" style="--preset-a:#f59e0b;--preset-b:#ef4444" data-theme-preset="gold"><strong>ليالي ذهبية</strong><span>دافئ للأفلام والعروض</span></button>
    <button type="button" class="theme-preset" style="--preset-a:#8b5cf6;--preset-b:#06b6d4" data-theme-preset="nebula"><strong>نيبولا</strong><span>عصري ولامع للشاشات</span></button>
    <button type="button" class="theme-preset" style="--preset-a:#16a34a;--preset-b:#0f766e" data-theme-preset="forest"><strong>هادئ</strong><span>مريح للمشاهدة الطويلة</span></button>
  </div>
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
<section id="iptv">
  <h2>قنوات IPTV</h2>
  <form id="iptvPolicyForm" class="mini-form">
    <div class="admin-tools">
      <label>تحديث IPTV السحابي كل (دقيقة)<input name="cloudIptvRefreshMinutes" type="number" min="1" max="1440" value="${Math.max(1, Number(iptvPolicy.cloudIptvRefreshMinutes || (status.refreshMs ? status.refreshMs / 60000 : 3)))}"></label>
      <label>حد كل IPTV إجمالي MB<input name="iptvGlobalLimitMb" type="number" min="0" step="1" value="${Math.round((Number(iptvPolicy.iptvGlobalLimitBytes || 0) || 0) / 1024 / 1024)}"></label>
      <div><button>حفظ سياسة IPTV</button></div>
    </div>
  </form>
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
<div id="msg" class="msg"></div>
<div class="modal-host" id="modalHost" hidden></div>
<script>
const msg = document.getElementById('msg');
const modalHost = document.getElementById('modalHost');
async function api(path, opts) {
  const r = await fetch(path, opts);
  const text = await r.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!r.ok) throw new Error(body.message || body.error || text || 'تعذر تنفيذ الطلب');
  return body;
}
function closeModal(){ modalHost.hidden = true; modalHost.innerHTML = ''; }
function confirmAction({ title, body, okText = 'تأكيد', danger = false }){
  return new Promise((resolve) => {
    modalHost.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true"><h3>'+escapeHtmlClient(title)+'</h3><p>'+escapeHtmlClient(body)+'</p><div class="modal-actions"><button class="secondary" data-modal-cancel>إلغاء</button><button class="'+(danger?'modal-danger':'')+'" data-modal-ok>'+escapeHtmlClient(okText)+'</button></div></div>';
    modalHost.hidden = false;
    modalHost.querySelector('[data-modal-cancel]').onclick = () => { closeModal(); resolve(false); };
    modalHost.querySelector('[data-modal-ok]').onclick = () => { closeModal(); resolve(true); };
  });
}
function escapeHtmlClient(value){ return String(value || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function openMediaEditor(item){
  return new Promise((resolve) => {
    modalHost.innerHTML = '<form class="modal-card" id="mediaEditForm" role="dialog" aria-modal="true"><h3>تعديل الوسائط</h3><div class="modal-fields"><label>العنوان<input name="title" required></label><label>النوع<select name="kind"><option value="movie">فيلم</option><option value="episode">حلقة</option><option value="audio">صوتيات</option></select></label><label>السنة<input name="year"></label><label>الوصف<textarea name="overview"></textarea></label></div><div class="modal-actions"><button type="button" class="secondary" data-modal-cancel>إلغاء</button><button>حفظ</button></div></form>';
    modalHost.hidden = false;
    const form = modalHost.querySelector('#mediaEditForm');
    form.elements.title.value = item.title || '';
    form.elements.kind.value = item.kind || 'movie';
    form.elements.year.value = item.year || '';
    form.elements.overview.value = item.overview || '';
    form.querySelector('[data-modal-cancel]').onclick = () => { closeModal(); resolve(null); };
    form.onsubmit = (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      closeModal();
      resolve(data);
    };
  });
}
function parseJsonSafe(text) {
  if (!String(text || '').trim()) return {};
  try { return JSON.parse(text); } catch { return {}; }
}
let captureSources = { screens: [], windows: [], videoDevices: [], audioDevices: [] };
function sourceRowsFor(type) {
  if (type === 'screen') return captureSources.screens || [];
  if (type === 'window') return captureSources.windows || [];
  if (type === 'device') return captureSources.videoDevices || [];
  return [];
}
function syncSourceControls() {
  const type = document.getElementById('sourceType').value;
  const picker = document.getElementById('sourcePicker');
  const pickerLabel = document.getElementById('sourcePickerLabel');
  const urlLabel = document.getElementById('sourceUrlLabel');
  const sourceId = document.getElementById('sourceId');
  const manualSource = document.getElementById('manualSourceId').value.trim();
  const manualAudio = document.getElementById('manualAudioId').value.trim();
  pickerLabel.hidden = type === 'url';
  urlLabel.hidden = type !== 'url';
  if (type === 'url') {
    sourceId.value = manualSource || document.getElementById('sourceUrl').value.trim();
  } else {
    const rows = sourceRowsFor(type);
    picker.innerHTML = rows.length
      ? rows.map((row) => '<option value="'+escapeHtmlClient(row.id || '')+'">'+escapeHtmlClient(row.name || row.id || '')+'</option>').join('')
      : '<option value="">'+(type === 'device' ? 'لم يتم العثور على جهاز USB/HDMI' : 'استخدم المصدر الافتراضي')+'</option>';
    sourceId.value = manualSource || picker.value || '';
  }
  if (manualAudio) document.getElementById('audioPicker').value = manualAudio;
}
async function loadCaptureSources() {
  const preview = document.getElementById('sourcePreview');
  preview.textContent = 'جاري قراءة المصادر المتاحة...';
  try {
    captureSources = await api('/api/admin/capture-sources');
    const audio = captureSources.audioDevices || [];
    document.getElementById('audioPicker').innerHTML = '<option value="none">بدون صوت منفصل</option>' + audio.map((row) => '<option value="'+escapeHtmlClient(row.id || '')+'">'+escapeHtmlClient(row.name || row.id || '')+'</option>').join('');
    syncSourceControls();
    const total = (captureSources.screens || []).length + (captureSources.windows || []).length + (captureSources.videoDevices || []).length;
    preview.textContent = total ? 'تم العثور على ' + total + ' مصدر. اختر المصدر ثم اضغط اختبار المصدر قبل الحفظ.' : 'لم تظهر مصادر تلقائية. يمكنك استخدام الشاشة الافتراضية أو الإدخال المتقدم.';
  } catch (e) {
    preview.textContent = 'تعذر قراءة الأجهزة الآن. استخدم الإدخال المتقدم أو حاول إعادة الفحص.';
  }
}
document.getElementById('sourceType').addEventListener('change', syncSourceControls);
document.getElementById('sourcePicker').addEventListener('change', syncSourceControls);
document.getElementById('sourceUrl').addEventListener('input', syncSourceControls);
document.getElementById('manualSourceId').addEventListener('input', syncSourceControls);
document.getElementById('manualAudioId').addEventListener('input', syncSourceControls);
document.getElementById('refreshCaptureSources').onclick = loadCaptureSources;
document.getElementById('testCaptureSource').onclick = () => {
  syncSourceControls();
  const type = document.getElementById('sourceType').value;
  const id = document.getElementById('sourceId').value;
  const label = type === 'url' ? 'الرابط' : (document.getElementById('sourcePicker').selectedOptions[0]?.textContent || 'المصدر الافتراضي');
  document.getElementById('sourcePreview').textContent = id || type === 'screen'
    ? 'المصدر جاهز للحفظ: ' + label + '.'
    : 'اختر مصدراً واضحاً أو اكتب المعرف يدوياً من الخيارات المتقدمة.';
};
let currentBrowse = { path: '', parent: '' };
function renderRoots(rows) {
  document.getElementById('storageRoots').innerHTML = rows.length ? rows.map((row) => '<button class="browser-item" type="button" data-root-path="'+escapeHtmlClient(row.path)+'"><span>'+escapeHtmlClient(row.label || row.path)+'</span><small>'+escapeHtmlClient(row.path)+'</small></button>').join('') : '<div class="muted">لم تظهر أقراص قابلة للقراءة.</div>';
  document.querySelectorAll('[data-root-path]').forEach((btn) => btn.onclick = () => browsePath(btn.dataset.rootPath));
}
function renderEntries(data) {
  currentBrowse = { path: data.path || '', parent: data.parent || '' };
  document.getElementById('currentBrowsePath').textContent = data.path || '';
  document.getElementById('browseParent').disabled = !data.parent;
  document.getElementById('chooseCurrentFolder').disabled = !data.path || !data.ok;
  document.getElementById('storageEntries').innerHTML = data.ok
    ? (data.entries || []).map((entry) => '<button class="browser-item" type="button" '+(entry.type === 'folder' ? 'data-folder-path="'+escapeHtmlClient(entry.path)+'"' : 'disabled')+'><span>'+(entry.type === 'folder' ? 'مجلد ' : 'ملف ') + escapeHtmlClient(entry.name)+'</span><small>'+escapeHtmlClient(entry.type === 'folder' ? 'مجلد' : '')+'</small></button>').join('') || '<div class="muted">هذا المجلد فارغ.</div>'
    : '<div class="muted">'+escapeHtmlClient(data.message || 'تعذر فتح المجلد.')+'</div>';
  document.querySelectorAll('[data-folder-path]').forEach((btn) => btn.onclick = () => browsePath(btn.dataset.folderPath));
}
async function browsePath(target) {
  const data = await api('/api/admin/storage/browse?path=' + encodeURIComponent(target || ''));
  renderEntries(data);
}
async function validateSelectedPath(target) {
  const data = await api('/api/admin/storage/validate?path=' + encodeURIComponent(target || ''));
  document.getElementById('folderPreview').textContent = data.ok
    ? data.message + ' يحتوي الآن على ' + data.files + ' ملف و ' + data.folders + ' مجلد.'
    : data.message;
  return data.ok;
}
async function chooseLibraryPath(target) {
  document.getElementById('selectedLibraryPath').value = target || '';
  await validateSelectedPath(target);
}
async function loadStorageRoots() {
  document.getElementById('storageRoots').innerHTML = '<div class="muted">جاري فحص الأقراص...</div>';
  const data = await api('/api/admin/storage/roots');
  renderRoots(data.roots || []);
}
document.getElementById('refreshStorageRoots').onclick = loadStorageRoots;
document.getElementById('browseParent').onclick = () => currentBrowse.parent && browsePath(currentBrowse.parent);
document.getElementById('chooseCurrentFolder').onclick = () => chooseLibraryPath(currentBrowse.path);
document.getElementById('useManualLibraryPath').onclick = () => chooseLibraryPath(document.getElementById('manualLibraryPath').value.trim());
document.querySelectorAll('[data-browse-path]').forEach((btn) => btn.onclick = async () => {
  await browsePath(btn.dataset.browsePath);
  await chooseLibraryPath(btn.dataset.browsePath);
  document.getElementById('pathForm').scrollIntoView({ behavior:'smooth', block:'start' });
});
loadCaptureSources();
loadStorageRoots();
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
  if (!await confirmAction({ title:'حذف قناة IPTV؟', body:'سيتم حذف القناة اليدوية من هذه النسخة. القنوات السحابية لا تحذف من هنا.', okText:'حذف', danger:true })) return;
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
function readBroadcastChannels(){ try { return JSON.parse(document.getElementById('broadcastJson').value || '[]'); } catch { return []; } }
function formDataFromContainer(container){
  const data = {};
  container.querySelectorAll('input,select,textarea').forEach((el) => {
    if (!el.name) return;
    data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return data;
}
function channelFromForm(form, id){
  if (form instanceof HTMLFormElement && form.id === 'broadcastForm') syncSourceControls();
  const data = form instanceof HTMLFormElement ? Object.fromEntries(new FormData(form).entries()) : formDataFromContainer(form);
  if (form instanceof HTMLFormElement && form.id === 'broadcastForm') {
    const manualAudio = document.getElementById('manualAudioId').value.trim();
    if (manualAudio) data.audioDeviceId = manualAudio;
  }
  const sourceType = data.sourceType || 'screen';
  const sourceId = String(data.sourceId || '').trim();
  return {
    id: id || ('ch_' + Date.now().toString(36)),
    name: String(data.name || '').trim(),
    description: '',
    source: sourceType === 'url' ? { type: 'url', url: sourceId } : { type: sourceType, id: sourceId },
    audioDeviceId: String(data.audioDeviceId || 'none').trim() || 'none',
    resolution: String(data.resolution || '1280x720').trim(),
    fps: Math.max(1, Number(data.fps || 30) || 30),
    bitrateKbps: Math.max(250, Number(data.bitrateKbps || 2500) || 2500),
    autoStart: !!data.autoStart,
    enabled: !!data.enabled,
  };
}
async function saveBroadcastChannels(channels){
  document.getElementById('broadcastJson').value = JSON.stringify(channels, null, 2);
  await api('/api/admin/broadcast', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ channels }) });
  msg.textContent = 'تم الحفظ.';
}
document.getElementById('broadcastForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const channels = readBroadcastChannels();
  channels.push(channelFromForm(e.target));
  await saveBroadcastChannels(channels);
  location.reload();
});
document.querySelectorAll('[data-save-broadcast]').forEach((b) => b.onclick = async () => {
  const row = b.closest('[data-broadcast-row]');
  const id = b.dataset.saveBroadcast;
  const channels = readBroadcastChannels().map((ch) => String(ch.id) === String(id) ? channelFromForm(row, id) : ch);
  await saveBroadcastChannels(channels);
  location.reload();
});
document.querySelectorAll('[data-remove-broadcast]').forEach((b) => b.onclick = async () => {
  if (!await confirmAction({ title:'حذف قناة البث؟', body:'سيتم حذف قناة البث المحلية من إعدادات هذا الجهاز.', okText:'حذف', danger:true })) return;
  const channels = readBroadcastChannels().filter((ch) => String(ch.id) !== String(b.dataset.removeBroadcast));
  await saveBroadcastChannels(channels);
  location.reload();
});
document.getElementById('iptvPolicyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  await api('/api/admin/iptv-policy', {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      cloudIptvRefreshMinutes: Math.max(1, Number(data.cloudIptvRefreshMinutes || 3) || 3),
      iptvGlobalLimitBytes: Math.max(0, Number(data.iptvGlobalLimitMb || 0) || 0) * 1024 * 1024
    })
  });
  msg.textContent = 'تم حفظ سياسة IPTV.';
});
document.getElementById('pathForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/library-paths', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries())) });
    location.reload();
  } catch (err) {
    msg.textContent = String(err.message || '') || 'تعذر إضافة المجلد. تأكد أن القرص متصل وأن المجلد قابل للقراءة.';
    document.getElementById('folderPreview').textContent = msg.textContent;
  }
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
const themePresets = {
  cinema: { accent:'#2563eb', accent2:'#14b8a6' },
  gold: { accent:'#f59e0b', accent2:'#ef4444' },
  nebula: { accent:'#8b5cf6', accent2:'#06b6d4' },
  forest: { accent:'#16a34a', accent2:'#0f766e' },
};
document.querySelectorAll('[data-theme-preset]').forEach((button) => button.onclick = () => {
  const preset = themePresets[button.dataset.themePreset];
  if (!preset) return;
  const form = document.getElementById('themeForm');
  form.elements.accent.value = preset.accent;
  form.elements.accent2.value = preset.accent2;
  msg.textContent = 'تم اختيار الثيم. اضغط حفظ التخصيص لتطبيقه.';
});
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
  const patch = await openMediaEditor(item);
  if (!patch) return;
  await api('/api/admin/media/' + item.id, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ ...item, ...patch })
  });
  location.reload();
});
document.querySelectorAll('[data-delete-media]').forEach((b) => b.onclick = async () => {
  if (!await confirmAction({ title:'إزالة عنصر من المكتبة؟', body:'سيتم حذف العنصر من فهرس المكتبة فقط، وسيبقى الملف الأصلي على القرص.', okText:'إزالة', danger:true })) return;
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
  const sources = db.listPaths();
  const movies = items.filter((item) => item.kind === 'movie');
  const episodes = items.filter((item) => item.kind === 'episode');
  const audio = items.filter((item) => item.kind === 'audio');
  const continueRows = items
    .filter((item) => Number(item.position || 0) > 20 && Number(item.wp_duration || 0) > Number(item.position || 0) + 20)
    .sort((a, b) => Number(b.position || 0) - Number(a.position || 0))
    .slice(0, 18);
  const payload = jsonForScript(items.map((item) => {
    const source = sourceInfoForItem(item, sources);
    const folderSegments = [source.label].concat(String(source.folder || '').split(/[\\/]+/).filter(Boolean));
    return {
      id: item.id,
      title: mediaTitle(item),
      baseTitle: item.title || '',
      kind: item.kind || 'movie',
      year: item.year || '',
      rating: item.rating || '',
      overview: item.overview || '',
      poster: mediaPosterUrl(item),
      backdrop: mediaBackdropUrl(item),
      size: item.size || 0,
      position: item.position || 0,
      duration: item.wp_duration || item.duration || 0,
      addedAt: item.added_at || item.scanned_at || 0,
      file: path.basename(item.path || ''),
      section: source.label,
      folder: source.folder,
      source,
      relativePath: source.relativePath,
      folderSegments,
    };
  }));
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
    pageTitle: 'مكتبة WIVA',
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
    accountHint: 'الدخول اختياري لحفظ المفضلة والمشاهدة لاحقاً ومراسلة الإدارة.',
    signedInAs: 'متصل باسم',
    signIn: 'دخول',
    signUp: 'إنشاء حساب',
    signOut: 'خروج',
    name: 'الاسم',
    phone: 'رقم الهاتف أو الغرفة',
    email: 'البريد الإلكتروني (اختياري)',
    messageAdmin: 'مراسلة الإدارة',
    messagePlaceholder: 'اكتب ملاحظة أو طلباً للإدارة...',
    sendMessage: 'إرسال الرسالة',
    folders: 'المجلدات',
    folderHint: 'تصفح سريع حسب الأقسام والمجلدات',
    quickFilters: 'تصفية سريعة',
    latest: 'الأحدث',
    openAccount: 'حسابي',
    openMessage: 'رسالة',
    liveUrl: 'البث المباشر',
    close: 'إغلاق',
    accountSaved: 'تم الحفظ.',
    accountError: 'تعذر تنفيذ الطلب. تأكد من البيانات وحاول مرة أخرى.',
    folderTreeTitle: 'تصفح الملفات والمجلدات',
    folderTreeHint: 'نفس ترتيب الهارد: مجلدات، ثم ملفات داخل كل مجلد',
    folderRoot: 'الرئيسية',
    openFolder: 'فتح المجلد',
    files: 'ملفات',
    gridView: 'شبكة',
    listView: 'قائمة',
    back: 'رجوع',
    disconnected: 'غير متصل',
  } : {
    pageTitle: 'WIVA Media Library',
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
    accountHint: 'Optional sign-in for favorites, watch later, history, and messages.',
    signedInAs: 'Signed in as',
    signIn: 'Sign in',
    signUp: 'Create account',
    signOut: 'Sign out',
    name: 'Name',
    phone: 'Phone or room number',
    email: 'Email (optional)',
    messageAdmin: 'Message admin',
    messagePlaceholder: 'Write a note or request for the admin...',
    sendMessage: 'Send message',
    folders: 'Folders',
    folderHint: 'Browse sections and folders quickly',
    quickFilters: 'Quick filters',
    latest: 'Latest',
    openAccount: 'Account',
    openMessage: 'Message',
    liveUrl: 'Live',
    close: 'Close',
    accountSaved: 'Saved.',
    accountError: 'Could not complete the request. Check the details and try again.',
    folderTreeTitle: 'Browse files and folders',
    folderTreeHint: 'The same drive structure: folders first, then files inside each folder',
    folderRoot: 'Home',
    openFolder: 'Open folder',
    files: 'Files',
    gridView: 'Grid',
    listView: 'List',
    back: 'Back',
    disconnected: 'Disconnected',
  };
  const textPayload = jsonForScript(text);
  return `<!doctype html>
<html lang="${theme.direction === 'rtl' ? 'ar' : 'en'}" dir="${theme.direction}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(text.pageTitle)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap');
:root{color-scheme:dark;--bg:#07090f;--bg2:#0b1020;--panel:#111827;--panel2:#151f35;--surface:rgba(17,24,39,.78);--glass:rgba(255,255,255,.055);--line:rgba(226,232,240,.12);--line2:rgba(148,163,184,.22);--text:#f8fafc;--muted:#a7b3cf;--soft:#dbeafe;--accent:${escapeHtml(theme.accent)};--accent2:${escapeHtml(theme.accent2)};--danger:#ef4444;--radius:14px;--radius2:20px}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-height:100vh;background:radial-gradient(circle at 88% 0,rgba(37,99,235,.18),transparent 32%),linear-gradient(180deg,var(--bg),var(--bg2) 48%,#07090f);color:var(--text);font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(180deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:86px 86px;mask-image:linear-gradient(180deg,rgba(0,0,0,.9),transparent 70%);z-index:-1}
button,input,select{font:inherit}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent2);outline-offset:3px}.hide{display:none!important}
.hero{min-height:62vh;padding:24px;background:linear-gradient(90deg,rgba(7,9,15,.98),rgba(7,9,15,.76) 48%,rgba(7,9,15,.22)),var(--hero,url('/library-assets/hero-library.png'));background-size:cover;background-position:center;display:flex;align-items:flex-end;box-shadow:inset 0 -170px 150px rgba(7,9,15,.92)}
.hero-inner{width:100%;max-width:1440px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:clamp(34px,7vh,76px)}.brand{display:flex;align-items:center;gap:11px;font-weight:950;font-size:19px;letter-spacing:0}.brand img{max-height:42px;max-width:150px;object-fit:contain}.brand-text{display:grid;gap:2px}.brand-text small{color:var(--muted);font-size:11px;font-weight:800}.nav{display:flex;gap:8px;flex-wrap:wrap}.nav a,.btn{border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff;text-decoration:none;border-radius:var(--radius);padding:10px 14px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.btn.primary,.nav a.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;box-shadow:0 18px 40px rgba(37,99,235,.22)}.btn.ghost{background:rgba(255,255,255,.06)}
.eyebrow{display:inline-flex;margin-bottom:12px;color:#ccfbf1;background:rgba(20,184,166,.12);border:1px solid rgba(20,184,166,.28);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:950}.hero h1{font-size:clamp(36px,6.5vw,78px);line-height:.98;margin:0 0 14px;letter-spacing:0;max-width:940px}.hero p{max-width:780px;color:#d7def0;line-height:1.75;margin:0 0 20px}.hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}.stats{display:grid;grid-template-columns:repeat(4,minmax(92px,132px));gap:10px}.stat{border:1px solid var(--line);background:rgba(0,0,0,.32);backdrop-filter:blur(12px);border-radius:var(--radius);padding:11px 13px}.stat b{display:block;font-size:20px}.stat span{font-size:12px;color:var(--muted);font-weight:800}.hero-preview-strip{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(150px,190px);gap:10px;max-width:min(980px,100%);overflow-x:auto;overscroll-behavior-x:contain;padding:14px 2px 2px;margin-top:4px;scrollbar-width:thin}.hero-thumb{display:grid;grid-template-columns:44px minmax(0,1fr);gap:9px;align-items:center;text-align:start;color:#fff;border:1px solid rgba(226,232,240,.14);background:rgba(0,0,0,.34);border-radius:14px;padding:8px;cursor:pointer;min-height:62px;backdrop-filter:blur(12px);transition:transform .18s,border-color .18s,background .18s}.hero-thumb:hover,.hero-thumb.active{transform:translateY(-2px);border-color:rgba(20,184,166,.56);background:rgba(20,184,166,.16)}.hero-thumb img{width:44px;height:44px;object-fit:cover;border-radius:11px;background:#111827}.hero-thumb strong{font-size:11px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hero-thumb span{display:block;color:#cbd5e1;font-size:10px;font-weight:800;margin-top:2px}
main.library-shell{max-width:1440px;margin:auto;padding:18px 22px 52px}.tools{position:sticky;top:0;z-index:8;display:grid;grid-template-columns:minmax(260px,1.55fr) repeat(5,minmax(126px,1fr));gap:10px;margin:0 0 22px;padding:12px;background:rgba(7,9,15,.82);border:1px solid rgba(226,232,240,.1);border-radius:var(--radius2);backdrop-filter:blur(18px)}
input,select{width:100%;border:1px solid var(--line2);background:#0b1220;color:#fff;border-radius:var(--radius);padding:12px 13px;min-height:46px;outline:none}input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.18)}select option{background:#0b1220;color:#fff}
.quick-filter-row{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 22px}.chip-btn{border:1px solid var(--line);background:var(--glass);color:#e5edff;border-radius:999px;padding:8px 12px;font-weight:900;cursor:pointer}.chip-btn.active{background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;color:#fff}
.account-panel{display:none;grid-template-columns:minmax(0,1fr) minmax(320px,1.35fr);gap:14px;align-items:center;border:1px solid var(--line);background:linear-gradient(180deg,rgba(17,24,39,.9),rgba(15,23,42,.78));border-radius:var(--radius2);padding:16px;margin:0 0 24px}.account-panel.open{display:grid}.account-panel h2{margin:0 0 4px;font-size:19px}.account-panel p{margin:0;color:var(--muted);line-height:1.7;font-size:13px}.account-forms form,.account-signed{display:grid;gap:8px}.account-forms form{grid-template-columns:repeat(3,minmax(0,1fr)) auto}.account-signed{grid-template-columns:auto minmax(180px,1fr) auto;align-items:center}.account-signed form{display:grid;grid-template-columns:minmax(160px,1fr) auto;gap:8px}.account-chip{display:grid;gap:2px;border:1px solid var(--line);background:rgba(255,255,255,.055);border-radius:var(--radius);padding:9px 11px}.account-chip span{color:var(--muted);font-size:11px}.account-chip strong{font-size:13px}.account-status{grid-column:1/-1;color:#bfdbfe;font-size:12px;min-height:1em}
.section{margin:34px 0}.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}.section h2{font-size:clamp(20px,3vw,28px);margin:0;letter-spacing:0}.section small{color:var(--muted)}.section-line{height:1px;flex:1;background:linear-gradient(90deg,rgba(148,163,184,.35),transparent);margin:0 10px 8px}
.rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(176px,214px);gap:14px;overflow-x:auto;overscroll-behavior-x:contain;padding:2px 2px 12px;scrollbar-width:thin}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:16px}.grid.compact{grid-template-columns:1fr}
.section-card{position:relative;overflow:hidden;border:1px solid var(--line);background:linear-gradient(160deg,rgba(17,24,39,.9),rgba(15,23,42,.58));border-radius:var(--radius2);padding:15px;text-align:start;color:#fff;min-height:150px;transition:transform .18s,border-color .18s,box-shadow .18s}.section-card.has-cover{background-image:linear-gradient(180deg,rgba(7,9,15,.26),rgba(7,9,15,.9)),var(--folder-cover);background-size:cover;background-position:center}.section-card::before{content:"";position:absolute;inset:auto -20% -42% -20%;height:90px;background:radial-gradient(circle,rgba(20,184,166,.2),transparent 62%)}.section-card:hover{transform:translateY(-4px);border-color:rgba(20,184,166,.5);box-shadow:0 18px 42px rgba(0,0,0,.28)}.section-main{width:100%;border:0;background:transparent;color:#fff;text-align:start;padding:0;font:inherit;cursor:pointer;position:relative;z-index:1}.section-main strong{display:block;font-size:16px}.section-main span{display:block;color:#dbeafe;font-size:12px;margin-top:5px}.folder-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px;position:relative;z-index:1}.folder-row button{border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.34);color:#dbeafe;border-radius:999px;padding:6px 9px;font:inherit;font-size:11px;font-weight:900;cursor:pointer;backdrop-filter:blur(8px)}
.folder-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.folder-toolbar-actions{display:flex;gap:8px;flex-wrap:wrap}.breadcrumb{display:flex;gap:7px;flex-wrap:wrap}.breadcrumb button{border:1px solid var(--line);background:rgba(255,255,255,.06);color:#e5edff;border-radius:999px;padding:7px 10px;font:inherit;font-size:12px;font-weight:900;cursor:pointer}.folder-tree-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}.folder-tree-grid.list{grid-template-columns:1fr}.folder-card{border:1px solid var(--line);background:linear-gradient(150deg,rgba(17,24,39,.94),rgba(15,23,42,.66));border-radius:var(--radius2);min-height:136px;padding:14px;text-align:start;color:#fff;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s;position:relative;overflow:hidden;box-shadow:0 12px 34px rgba(0,0,0,.18)}.folder-card::after{content:"";position:absolute;inset:auto -35% -45% -35%;height:95px;background:radial-gradient(circle,rgba(248,197,28,.18),transparent 64%);pointer-events:none}.folder-card.has-cover{background-size:cover;background-position:center}.folder-card:hover{transform:translateY(-3px);border-color:rgba(248,197,28,.5);box-shadow:0 18px 46px rgba(0,0,0,.3)}.folder-card-head{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.folder-symbol{width:52px;height:52px;display:grid!important;place-items:center;border-radius:18px;background:rgba(248,197,28,.13);border:1px solid rgba(248,197,28,.24);color:var(--accent)!important;box-shadow:0 12px 34px rgba(0,0,0,.18)}.folder-symbol svg{width:27px;height:27px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.folder-chip{display:inline-flex!important;align-items:center;gap:5px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.34);color:#dbeafe!important;border-radius:999px;padding:5px 9px;font-size:10px!important;font-weight:950;backdrop-filter:blur(8px)}.folder-copy{position:relative;z-index:1}.folder-card b{display:block;font-size:15px;margin-bottom:7px}.folder-card span{display:block;color:var(--muted);font-size:12px;line-height:1.7}.folder-card small{display:inline-flex;margin-top:8px;border:1px solid rgba(248,113,113,.25);background:rgba(127,29,29,.28);color:#fecaca;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950}.folder-card.file{cursor:default}.folder-card.file .folder-symbol{background:rgba(59,130,246,.12);border-color:rgba(147,197,253,.22);color:#bfdbfe!important}.folder-card.file a{display:inline-flex;margin-top:10px;color:#fde68a;text-decoration:none;font-weight:950}.folder-tree-grid.list .folder-card{min-height:82px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center}.folder-tree-grid.list .folder-card .folder-card-head{margin:0}.folder-tree-grid.list .folder-card a{margin-top:0}
.folder-symbol{overflow:hidden}.folder-symbol img{width:100%;height:100%;object-fit:cover}.folder-card.asset-cover{background-size:cover;background-position:center}.poster.asset-poster{background-size:cover;background-position:center}.poster.asset-poster::before,.folder-card.asset-cover::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,9,15,.04),rgba(7,9,15,.68));pointer-events:none}.mobile-actionbar{display:none}
.tile{position:relative;display:block;min-width:0;text-decoration:none;color:#fff;background:rgba(17,24,39,.78);border:1px solid var(--line);border-radius:var(--radius2);overflow:hidden;transition:transform .18s,border-color .18s,background .18s,box-shadow .18s;outline:none;box-shadow:0 12px 34px rgba(0,0,0,.2)}.tile:hover,.tile:focus-visible{transform:translateY(-5px);border-color:rgba(20,184,166,.58);background:rgba(17,24,39,.96);box-shadow:0 22px 52px rgba(0,0,0,.34)}
.poster{aspect-ratio:2/3;background:#1f2937 center/cover no-repeat;display:grid;place-items:center;color:rgba(255,255,255,.38);font-size:40px;font-weight:900;position:relative;overflow:hidden}.poster::after{content:"";position:absolute;inset:auto 0 0 0;height:48%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.86))}.poster.audio{aspect-ratio:1;background:linear-gradient(135deg,#1f2937,#0f3d42)}.kind-badge{position:absolute;bottom:9px;left:9px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.62);backdrop-filter:blur(8px);border-radius:999px;padding:5px 8px;font-size:10px;font-weight:950;color:#e5e7eb;z-index:1}.status-badges{position:absolute;top:9px;left:9px;display:flex;gap:5px;flex-wrap:wrap;z-index:2}.status-badge{border:1px solid rgba(255,255,255,.18);background:rgba(20,184,166,.86);color:#042f2e;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:950}.status-badge.progressed{background:rgba(37,99,235,.88);color:#eff6ff}.meta{padding:11px 12px 13px}.title{font-size:13px;font-weight:950;line-height:1.35;min-height:36px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sub{font-size:11px;color:var(--muted);margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.overview{display:none;color:#cbd5e1;font-size:12px;line-height:1.55;margin-top:8px}
.progress{height:4px;background:rgba(255,255,255,.12)}.progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}.quick{position:absolute;top:9px;right:9px;display:flex;gap:6px;z-index:2;opacity:0;transform:translateY(-4px);transition:.18s}.tile:hover .quick,.tile:focus-within .quick{opacity:1;transform:none}.quick button{width:34px;height:34px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.58);color:#fff;border-radius:999px;cursor:pointer;font-weight:950;backdrop-filter:blur(8px)}.quick button.on{background:rgba(239,68,68,.92)}
.grid.compact .tile{display:grid;grid-template-columns:98px minmax(0,1fr);min-height:126px}.grid.compact .poster{aspect-ratio:2/3;height:126px}.grid.compact .meta{padding:13px 15px}.grid.compact .title{font-size:15px;min-height:0}.grid.compact .overview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.grid.compact .progress{position:absolute;left:98px;right:0;bottom:0}
.empty{border:1px dashed var(--line);background:rgba(255,255,255,.045);border-radius:var(--radius2);padding:34px;color:var(--muted);line-height:1.8;text-align:center}.empty strong{display:block;color:#fff;margin-bottom:4px}
@media(max-width:1100px){.tools{position:static;grid-template-columns:1fr 1fr 1fr}.hero{min-height:56vh}.top{margin-bottom:38px}.account-panel,.account-signed{grid-template-columns:1fr}.account-signed form{grid-template-columns:1fr}.stats{grid-template-columns:repeat(4,minmax(82px,1fr))}}
@media(max-width:700px){.hero{min-height:54vh;padding:16px}.top{align-items:flex-start;margin-bottom:30px}.nav a,.btn{padding:9px 11px}.hero h1{font-size:36px}.stats{grid-template-columns:1fr 1fr}.tools{grid-template-columns:1fr;padding:10px;border-radius:16px}.quick-filter-row{overflow:auto;flex-wrap:nowrap}.account-forms,.account-forms form{grid-template-columns:1fr}.rail{grid-auto-columns:minmax(164px,210px)}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}main.library-shell{padding:14px 12px 34px}.section{margin:28px 0}.quick{opacity:1;transform:none}.grid.compact .tile{grid-template-columns:86px minmax(0,1fr)}.grid.compact .poster{height:114px}.grid.compact .progress{left:86px}}
@media(max-width:700px){body{background-attachment:scroll}.hero{min-height:68vh;padding:14px 12px 22px;align-items:flex-end}.top{gap:10px;align-items:center;margin-bottom:clamp(32px,8vh,56px)}.brand img{max-height:34px;max-width:112px}.brand-text strong{font-size:14px}.brand-text small{font-size:10px}.nav{margin-inline-start:auto;gap:6px}.nav a,.nav button{min-height:38px;border-radius:12px;padding:8px 10px;font-size:11px}.hero h1{font-size:clamp(30px,11vw,44px);line-height:1.08}.hero p{font-size:13px;line-height:1.8}.hero-actions{gap:8px}.hero-actions .btn{flex:1;min-width:136px}.stats{gap:8px}.stat{padding:9px 10px;border-radius:12px}.stat b{font-size:18px}.hero-preview-strip{grid-auto-columns:minmax(142px,70vw);margin-inline:-2px;padding-top:10px}.hero-thumb{min-height:58px;border-radius:13px}.tools{position:sticky;top:8px;z-index:30;margin-inline:-2px;background:rgba(7,9,15,.9);box-shadow:0 12px 34px rgba(0,0,0,.28)}.quick-filter-row{margin-inline:-12px;padding:0 12px 8px;scroll-snap-type:x proximity}.quick-filter-row .chip-btn{scroll-snap-align:start;flex:0 0 auto}.folder-toolbar{align-items:flex-start}.folder-toolbar-actions{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:7px}.folder-toolbar-actions .chip-btn{width:100%;justify-content:center}.breadcrumb{width:100%;overflow:auto;flex-wrap:nowrap;padding-bottom:3px}.breadcrumb button{flex:0 0 auto}.folder-tree-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.folder-card{min-height:146px;border-radius:18px;padding:12px}.folder-symbol{width:46px;height:46px;border-radius:15px}.folder-card b{font-size:13px;line-height:1.35}.folder-card span{font-size:11px}.folder-chip{font-size:9px!important;padding:4px 7px}.folder-tree-grid.list .folder-card{grid-template-columns:auto minmax(0,1fr);gap:10px}.folder-tree-grid.list .folder-chip{display:none!important}.rail{grid-auto-columns:minmax(148px,68vw);padding-bottom:16px}.tile{border-radius:18px}.title{font-size:12px;min-height:32px}.sub{font-size:10px}.poster{font-size:32px}.account-panel{border-radius:18px;padding:13px}.empty{padding:24px 16px}.section-head{align-items:flex-start}.section h2{font-size:21px}.section-line{display:none}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
</style>
</head>
<body>
<script id="mediaPayload" type="application/json">${payload}</script>
<script id="viewerPayload" type="application/json">${viewerPayload}</script>
<script id="sectionPayload" type="application/json">${sectionPayload}</script>
<script id="textPayload" type="application/json">${textPayload}</script>
<section class="hero" id="hero">
  <div class="hero-inner">
    <div class="top">
      <div class="brand">${theme.logoUrl ? `<img src="${escapeHtml(theme.logoUrl)}" alt="">` : '<img src="/wiva-logo.png" alt="">'}<span class="brand-text"><strong>${escapeHtml(theme.brandName)}</strong><small>${escapeHtml(theme.tagline || '')}</small></span></div>
      <nav class="nav"><a href="/" class="primary">${escapeHtml(text.liveUrl)}</a><button class="btn ghost" id="messageToggle" type="button">${escapeHtml(text.openMessage)}</button><button class="btn ghost" id="accountToggle" type="button">${escapeHtml(text.openAccount)}</button></nav>
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
    <div class="hero-preview-strip" id="heroStrip"></div>
  </div>
</section>
<main class="library-shell">
  <div class="tools">
    <input id="search" placeholder="${escapeHtml(text.search)}" autocomplete="off">
    <select id="kind"><option value="">${escapeHtml(text.allMedia)}</option><option value="movie">${escapeHtml(text.movies)}</option><option value="episode">${escapeHtml(text.episodes)}</option><option value="audio">${escapeHtml(text.audio)}</option></select>
    <select id="view"><option value="all">${escapeHtml(text.all)}</option><option value="favorites">${escapeHtml(text.favorites)}</option><option value="watchLater">${escapeHtml(text.watchLater)}</option><option value="continue">${escapeHtml(text.continue)}</option></select>
    <select id="sort"><option value="recent">${escapeHtml(text.sortRecent)}</option><option value="title">${escapeHtml(text.sortTitle)}</option><option value="year">${escapeHtml(text.sortYear)}</option><option value="rating">${escapeHtml(text.sortRating)}</option><option value="progress">${escapeHtml(text.sortProgress)}</option></select>
    <select id="layout"><option value="poster">${escapeHtml(text.viewPoster)}</option><option value="compact">${escapeHtml(text.viewCompact)}</option></select>
    <select id="sectionFilter"><option value="">${escapeHtml(text.allSections)}</option></select>
  </div>
  <div class="quick-filter-row" aria-label="${escapeHtml(text.quickFilters)}">
    <button class="chip-btn" type="button" data-quick-view="all" data-quick-kind="" data-quick-sort="recent">${escapeHtml(text.latest)}</button>
    <button class="chip-btn" type="button" data-quick-view="continue">${escapeHtml(text.continue)}</button>
    <button class="chip-btn" type="button" data-quick-view="favorites">${escapeHtml(text.favorites)}</button>
    <button class="chip-btn" type="button" data-quick-view="watchLater">${escapeHtml(text.watchLater)}</button>
    <button class="chip-btn" type="button" data-quick-view="all" data-quick-kind="movie">${escapeHtml(text.movies)}</button>
    <button class="chip-btn" type="button" data-quick-view="all" data-quick-kind="episode">${escapeHtml(text.episodes)}</button>
    <button class="chip-btn" type="button" data-quick-view="all" data-quick-kind="audio">${escapeHtml(text.audio)}</button>
  </div>
  <section class="account-panel" id="accountPanel">
    <div>
      <h2>${escapeHtml(text.accountTitle)}</h2>
      <p>${escapeHtml(text.accountHint)}</p>
    </div>
    <div class="account-forms" id="guestAccount">
      <form id="signinForm">
        <input name="name" autocomplete="name" placeholder="${escapeHtml(text.name)}" required>
        <input name="phone" inputmode="tel" autocomplete="tel" placeholder="${escapeHtml(text.phone)}" required>
        <input name="email" type="email" autocomplete="email" placeholder="${escapeHtml(text.email)}">
        <button class="btn primary">${escapeHtml(text.signIn)} / ${escapeHtml(text.signUp)}</button>
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
  <section class="section" id="folderTreeSection"><div class="section-head"><div><h2>${escapeHtml(text.folderTreeTitle)}</h2><small>${escapeHtml(text.folderTreeHint)}</small></div><i class="section-line"></i></div><div class="folder-toolbar"><div class="breadcrumb" id="folderBreadcrumb"></div><div class="folder-toolbar-actions"><button class="chip-btn" type="button" id="folderBackBtn">${escapeHtml(text.back)}</button><button class="chip-btn" type="button" id="resetFolderTree">${escapeHtml(text.folderRoot)}</button><button class="chip-btn active" type="button" id="folderGridBtn">${escapeHtml(text.gridView)}</button><button class="chip-btn" type="button" id="folderListBtn">${escapeHtml(text.listView)}</button></div></div><div class="folder-tree-grid" id="folderTreeGrid"></div></section>
  <section class="section" id="sectionBrowser"><div class="section-head"><div><h2>${escapeHtml(text.folders)}</h2><small>${escapeHtml(text.folderHint)}</small></div><i class="section-line"></i></div><div class="rail" id="sectionRail"></div></section>
  <section class="section" id="continueSection"><div class="section-head"><div><h2>${escapeHtml(text.continue)}</h2><small>${escapeHtml(text.continueHint)}</small></div><i class="section-line"></i></div><div class="rail" id="continueRail"></div></section>
  <section class="section" id="favoritesSection"><div class="section-head"><div><h2>${escapeHtml(text.favorites)}</h2><small>${escapeHtml(text.favoritesHint)}</small></div><i class="section-line"></i></div><div class="rail" id="favoritesRail"></div></section>
  <section class="section" id="recentSection"><div class="section-head"><div><h2>${escapeHtml(text.recentlyAdded)}</h2><small>${escapeHtml(text.recentlyHint)}</small></div><i class="section-line"></i></div><div class="rail" id="recentRail"></div></section>
  <section class="section"><div class="section-head"><div><h2>${escapeHtml(text.library)}</h2><small id="countLabel"></small></div><i class="section-line"></i></div><div class="grid" id="grid"></div><div class="empty" id="empty">${escapeHtml(text.empty)}</div></section>
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
  if (account) name.textContent = [account.name, account.phone].filter(Boolean).join(' · ') || account.email || '';
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
function stamp(value){ const n=Number(value); if(Number.isFinite(n) && n>0) return n; const d=Date.parse(value || ''); return Number.isFinite(d) ? d : 0; }
function durationText(seconds){ seconds=Math.round(Number(seconds)||0); if(!seconds) return ''; const h=Math.floor(seconds/3600); const m=Math.floor((seconds%3600)/60); return h ? h+'h '+String(m).padStart(2,'0')+'m' : (m || 1)+'m'; }
function kindLabel(kind){ return kind === 'episode' ? (text.episode || 'Episode') : kind === 'audio' ? (text.audioItem || 'Audio') : (text.movie || 'Movie'); }
function itemSearchBlob(item){ return [item.title,item.baseTitle,item.file,item.section,item.folder,item.overview,item.year].join(' ').toLowerCase(); }
function card(item){
  const p = pct(item);
  const icon = item.kind === 'audio' ? '♪' : '▶';
  const poster = item.poster || mediaAsset(item);
  const metaBits = [kindLabel(item.kind), item.year, item.rating ? ('★ '+Number(item.rating).toFixed(1)) : '', durationText(item.duration), bytes(item.size)].filter(Boolean);
  const summary = item.overview || item.folder || item.section || item.file || '';
  const fresh = stamp(item.addedAt) > Date.now() - (1000 * 60 * 60 * 24 * 14);
  const badges = [fresh ? (text.latest || 'Latest') : '', p > 2 ? Math.round(p)+'%' : ''].filter(Boolean);
  return '<a class="tile" href="/player/'+item.id+'" data-title="'+esc(item.title).toLowerCase()+'" data-kind="'+esc(item.kind)+'">'+
    '<div class="quick"><button type="button" title="'+esc(text.favoriteTitle || 'Favorite')+'" class="'+(storage.has('favorites',item.id)?'on':'')+'" data-fav="'+item.id+'">♥</button><button type="button" title="'+esc(text.watchTitle || 'Watch later')+'" class="'+(storage.has('watchLater',item.id)?'on':'')+'" data-watch="'+item.id+'">◷</button></div>'+
    '<div class="poster asset-poster '+(item.kind==='audio'?'audio':'')+'" style="background-image:url(\\''+esc(poster)+'\\')">'+(badges.length?'<span class="status-badges">'+badges.map((badge,i)=>'<span class="status-badge '+(i?'progressed':'')+'">'+esc(badge)+'</span>').join('')+'</span>':'')+(item.poster?'':icon)+'<span class="kind-badge">'+esc(kindLabel(item.kind))+'</span></div>'+
    '<div class="meta"><div class="title">'+esc(item.title)+'</div><div class="sub">'+esc(metaBits.join(' · '))+'</div><div class="overview">'+esc(summary)+'</div></div>'+
    (p?'<div class="progress"><i style="width:'+p+'%"></i></div>':'')+'</a>';
}
function renderList(el, list, emptyText){ el.innerHTML = list.length ? list.map(card).join('') : '<div class="empty">'+emptyText+'</div>'; bindQuick(el); }
function bindQuick(root){ root.querySelectorAll('[data-fav],[data-watch]').forEach(btn=>btn.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); storage.toggle(btn.dataset.fav?'favorites':'watchLater', btn.dataset.fav || btn.dataset.watch); }); }
let folderPath = [];
let folderLayout = 'grid';
function samePrefix(segments, prefix) {
  return prefix.every((part, index) => segments[index] === part);
}
function folderItemsAt(prefix) {
  const dirs = new Map();
  const files = [];
  for (const item of media) {
    const segments = Array.isArray(item.folderSegments) ? item.folderSegments : [];
    if (!samePrefix(segments, prefix)) continue;
    if (segments.length > prefix.length) {
      const name = segments[prefix.length];
      const current = dirs.get(name) || { name, count: 0, cover: '', sourceStatus: '', sourceLabel: '' };
      current.count += 1;
      if (!current.cover) current.cover = item.poster || item.backdrop || '';
      if (prefix.length === 0 && item.source) {
        current.sourceStatus = item.source.status || 'connected';
        current.sourceLabel = item.source.label || name;
      }
      dirs.set(name, current);
    } else {
      files.push(item);
    }
  }
  return { dirs: Array.from(dirs.values()).sort((a,b)=>a.name.localeCompare(b.name, undefined, { numeric:true })), files: sorted(files) };
}
function iconSvg(type) {
  const map = {
    source: '<path d="M4 7.5A3.5 3.5 0 0 1 7.5 4h9A3.5 3.5 0 0 1 20 7.5v9a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h4"/>',
    folder: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5v6A3.5 3.5 0 0 1 17 19H7a3.5 3.5 0 0 1-3.5-3.5z"/>',
    video: '<path d="M5 5h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5z"/><path d="m18 10 3-2v8l-3-2z"/><path d="m9.5 9 4 3-4 3z"/>',
    audio: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 13h6"/><path d="M10 17h4"/>',
    off: '<path d="M4 7.5A3.5 3.5 0 0 1 7.5 4h9A3.5 3.5 0 0 1 20 7.5v9a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5z"/><path d="m4 4 16 16"/><path d="M8 8h2"/><path d="M13 12h3"/>',
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (map[type] || map.file) + '</svg>';
}
function fileIconType(item) {
  if (item.kind === 'audio') return 'audio';
  if (item.kind === 'movie' || item.kind === 'episode') return 'video';
  return 'file';
}
function assetUrl(name) {
  return '/library-assets/' + name + '.png';
}
function folderAsset(prefix) {
  return prefix.length === 0 ? assetUrl('source') : assetUrl('folder');
}
function mediaAsset(item) {
  const file = String(item.file || item.path || item.title || '').toLowerCase();
  if (item.kind === 'audio') return assetUrl('audio');
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) return assetUrl('image');
  if (/\.pdf$/i.test(file)) return assetUrl('pdf');
  if (/\.apk$/i.test(file)) return assetUrl('apk');
  if (/\.exe$/i.test(file)) return assetUrl('exe');
  if (/\.url$/i.test(file) || /^https?:/i.test(file)) return assetUrl('link');
  return assetUrl('video');
}
function renderFolderTree() {
  const grid = document.getElementById('folderTreeGrid');
  const crumb = document.getElementById('folderBreadcrumb');
  const tree = folderItemsAt(folderPath);
  grid.classList.toggle('list', folderLayout === 'list');
  document.getElementById('folderBackBtn').disabled = folderPath.length === 0;
  document.getElementById('folderGridBtn').classList.toggle('active', folderLayout === 'grid');
  document.getElementById('folderListBtn').classList.toggle('active', folderLayout === 'list');
  const crumbs = [{ label:text.folderRoot || 'Home', index:0 }].concat(folderPath.map((part, index) => ({ label:part, index:index + 1 })));
  crumb.innerHTML = crumbs.map((row) => '<button type="button" data-crumb-index="'+row.index+'">'+esc(row.label)+'</button>').join('');
  crumb.querySelectorAll('[data-crumb-index]').forEach((btn) => btn.onclick = () => { folderPath = folderPath.slice(0, Number(btn.dataset.crumbIndex)); renderFolderTree(); });
  const folderCards = tree.dirs.map((dir) => {
    const disconnected = dir.sourceStatus && dir.sourceStatus !== 'connected' && folderPath.length === 0;
    const status = disconnected ? '<small>'+esc(text.disconnected || 'Disconnected')+'</small>' : '';
    const iconType = disconnected ? 'off' : (folderPath.length === 0 ? 'source' : 'folder');
    const cover = dir.cover || folderAsset(folderPath);
    return '<button class="folder-card has-cover asset-cover" type="button" data-folder-open="'+esc(dir.name)+'" style="background-image:linear-gradient(180deg,rgba(7,9,15,.28),rgba(7,9,15,.88)),url(\\''+esc(cover)+'\\')"><span class="folder-card-head"><span class="folder-symbol"><img src="'+esc(cover)+'" alt="">'+(dir.cover?'':iconSvg(iconType))+'</span><span class="folder-chip">'+dir.count+' '+(text.items || '')+'</span></span><span class="folder-copy"><b>'+esc(dir.name)+'</b><span>'+esc(folderPath.length === 0 ? (dir.sourceLabel || text.openFolder || '') : (text.openFolder || ''))+'</span>'+status+'</span></button>';
  });
  const fileCards = tree.files.map((item) => {
    const cover = item.poster || item.backdrop || mediaAsset(item);
    return '<div class="folder-card file has-cover asset-cover" style="background-image:linear-gradient(180deg,rgba(7,9,15,.32),rgba(7,9,15,.9)),url(\\''+esc(cover)+'\\')"><span class="folder-card-head"><span class="folder-symbol"><img src="'+esc(cover)+'" alt=""></span><span class="folder-chip">'+esc(kindLabel(item.kind))+'</span></span><span class="folder-copy"><b>'+esc(item.file || item.title)+'</b><span>'+esc([item.title !== item.file ? item.title : '', durationText(item.duration), bytes(item.size)].filter(Boolean).join(' · '))+'</span><a href="/player/'+item.id+'">'+esc(text.playNow || 'Play')+'</a></span></div>';
  });
  grid.innerHTML = folderCards.concat(fileCards).join('') || '<div class="empty">'+esc(text.empty || '')+'</div>';
  grid.querySelectorAll('[data-folder-open]').forEach((btn) => btn.onclick = () => { folderPath = folderPath.concat(btn.dataset.folderOpen); renderFolderTree(); document.getElementById('folderTreeSection').scrollIntoView({ behavior:'smooth', block:'start' }); });
}
function sorted(list){
  const mode = document.getElementById('sort').value;
  return list.slice().sort((a,b)=>{
    if(mode === 'title') return String(a.title||'').localeCompare(String(b.title||''), undefined, { numeric:true, sensitivity:'base' });
    if(mode === 'year') return (Number(b.year)||0) - (Number(a.year)||0) || stamp(b.addedAt) - stamp(a.addedAt);
    if(mode === 'rating') return (Number(b.rating)||0) - (Number(a.rating)||0) || String(a.title||'').localeCompare(String(b.title||''));
    if(mode === 'progress') return pct(b) - pct(a) || stamp(b.addedAt) - stamp(a.addedAt);
    return stamp(b.addedAt) - stamp(a.addedAt);
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
let heroIndex = 0;
let heroTimer = 0;
function heroCandidates(){
  const current = filtered();
  const base = current.length ? current : media;
  const rich = base.filter((item) => item.backdrop || item.poster || pct(item) > 2);
  return (rich.length ? rich : base).slice(0, 10);
}
function renderHeroStrip(candidates){
  const strip = document.getElementById('heroStrip');
  if(!strip) return;
  strip.innerHTML = candidates.map((item, index) => {
    const cover = item.poster || item.backdrop || mediaAsset(item);
    return '<button class="hero-thumb '+(index === heroIndex ? 'active' : '')+'" type="button" data-hero-index="'+index+'"><img src="'+esc(cover)+'" alt=""><span><strong>'+esc(item.title)+'</strong><span>'+esc([kindLabel(item.kind), item.year || '', durationText(item.duration)].filter(Boolean).join(' · '))+'</span></span></button>';
  }).join('');
  strip.querySelectorAll('[data-hero-index]').forEach((btn) => btn.onclick = () => {
    heroIndex = Number(btn.dataset.heroIndex) || 0;
    updateHero();
    startHeroAuto();
  });
}
function updateHero(){
  const candidates = heroCandidates();
  if (heroIndex >= candidates.length) heroIndex = 0;
  const heroItem = candidates[heroIndex] || media.find(item => pct(item) > 2) || media.find(x=>x.backdrop) || media[0];
  const hero = document.getElementById('hero');
  const play = document.getElementById('heroPlay');
  const later = document.getElementById('heroLater');
  renderHeroStrip(candidates);
  if(!heroItem){
    document.getElementById('heroKind').textContent = text.featured || 'Featured';
    document.getElementById('heroTitle').textContent = document.querySelector('.brand')?.textContent?.trim() || 'WIVA';
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
function startHeroAuto(){
  clearInterval(heroTimer);
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const candidates = heroCandidates();
  if(candidates.length < 2) return;
  heroTimer = setInterval(() => {
    const next = heroCandidates();
    if(!next.length) return;
    heroIndex = (heroIndex + 1) % next.length;
    updateHero();
  }, 7000);
}
function syncQuickFilters(){
  const currentView = document.getElementById('view').value;
  const currentKind = document.getElementById('kind').value;
  document.querySelectorAll('[data-quick-view]').forEach(btn => {
    const targetView = btn.dataset.quickView || currentView;
    const targetKind = btn.dataset.quickKind;
    const viewOk = targetView === currentView;
    const kindOk = targetKind === undefined || targetKind === currentKind;
    btn.classList.toggle('active', viewOk && kindOk);
  });
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
  renderFolderTree();
  updateHero();
  startHeroAuto();
  syncQuickFilters();
}
const accountToggle = document.getElementById('accountToggle');
const messageToggle = document.getElementById('messageToggle');
const accountPanel = document.getElementById('accountPanel');
function openAccountPanel(forceOpen) {
  const open = forceOpen === true ? true : !accountPanel.classList.contains('open');
  accountPanel.classList.toggle('open', open);
  accountToggle.textContent = open ? (text.close || 'Close') : (text.openAccount || 'Account');
  if (open) accountPanel.scrollIntoView({ behavior:'smooth', block:'start' });
}
accountToggle.addEventListener('click', () => openAccountPanel());
messageToggle.addEventListener('click', () => {
  openAccountPanel(true);
  const input = document.querySelector('#messageForm input[name="message"], #signinForm input[name="name"]');
  if (input) input.focus();
});
document.getElementById('signinForm').addEventListener('submit', (e)=>{ e.preventDefault(); handleAccountForm(e.target, '/api/viewer/signin'); });
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
const folderCards = sections.flatMap(sec => (sec.folders || []).map(folder => ({
  name: folder.name || sec.name,
  section: sec.name,
  count: folder.count || 0,
  cover: folder.cover || sec.cover || ''
})));
document.getElementById('sectionRail').innerHTML = (folderCards.length ? folderCards : sections).map(row => '<div class="section-card '+(row.cover?'has-cover':'')+'" '+(row.cover?'style="--folder-cover:url(\\''+esc(row.cover)+'\\')"':'')+'><button class="section-main" data-folder="'+esc(row.name)+'" data-section-fallback="'+esc(row.section || row.name)+'"><strong>'+esc(row.name)+'</strong><span>'+esc([row.section && row.section !== row.name ? row.section : '', row.count + ' ' + (text.items || '')].filter(Boolean).join(' · '))+'</span></button></div>').join('');
document.querySelectorAll('[data-section],[data-folder]').forEach(btn=>btn.onclick=()=>{ sectionFilter.value=btn.dataset.section || btn.dataset.folder; render(); });
document.querySelectorAll('[data-quick-view]').forEach(btn => btn.onclick = () => {
  const kind = document.getElementById('kind');
  const view = document.getElementById('view');
  const sort = document.getElementById('sort');
  view.value = btn.dataset.quickView || 'all';
  if (btn.dataset.quickKind !== undefined) kind.value = btn.dataset.quickKind;
  if (btn.dataset.quickSort) sort.value = btn.dataset.quickSort;
  render();
  document.getElementById('grid').scrollIntoView({ behavior:'smooth', block:'start' });
});
document.getElementById('resetFolderTree').onclick = () => { folderPath = []; renderFolderTree(); };
document.getElementById('folderBackBtn').onclick = () => { folderPath = folderPath.slice(0, -1); renderFolderTree(); };
document.getElementById('folderGridBtn').onclick = () => { folderLayout = 'grid'; renderFolderTree(); };
document.getElementById('folderListBtn').onclick = () => { folderLayout = 'list'; renderFolderTree(); };
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
<title>${escapeHtml(title)} - WIVA</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap');
:root{color-scheme:dark;--bg:#07090f;--panel:#10182f;--line:rgba(226,232,240,.12);--text:#eef2ff;--muted:#a7b3cf;--accent:${escapeHtml(theme.accent)};--accent2:${escapeHtml(theme.accent2 || theme.accent)};--radius:18px}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(90deg,rgba(7,9,15,.99),rgba(7,9,15,.78)),url('${escapeHtml(poster)}');background-size:cover;background-position:center;color:var(--text);font-family:"Cairo",system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(7,9,15,.92) 72%);z-index:-1}.wrap{max-width:1440px;margin:auto;padding:18px 22px 46px}.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}.bar a,.btn{border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff;text-decoration:none;border-radius:14px;padding:10px 13px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-height:42px}.bar a:hover,.btn:hover{background:rgba(255,255,255,.13)}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px}.player{background:#000;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;box-shadow:0 28px 90px rgba(0,0,0,.5);position:relative}
video,audio{width:100%;display:block;background:#000}video{aspect-ratio:16/9;max-height:76vh}.audioBox{min-height:400px;display:grid;place-items:center;background:radial-gradient(circle at 50% 38%,rgba(20,184,166,.22),transparent 36%),linear-gradient(135deg,#111936,#123c4a)}.audioBox audio{max-width:620px;padding:0 18px}
.logo{position:absolute;top:18px;right:18px;background:rgba(0,0,0,.42);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:8px 10px;font-weight:950;pointer-events:none;backdrop-filter:blur(10px)}
.info{padding:18px 2px}.info h1{font-size:clamp(26px,4.6vw,54px);line-height:1.02;margin:0 0 12px;letter-spacing:0}.info p{color:#dbeafe;line-height:1.78;max-width:960px}.chips{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 12px}.chips span{border:1px solid var(--line);background:rgba(0,0,0,.28);border-radius:999px;padding:6px 9px;color:#d1d5db;font-size:12px;font-weight:900}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.actions .btn:first-child{background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent}
.side{background:rgba(16,24,47,.86);border:1px solid var(--line);border-radius:var(--radius);padding:12px;max-height:84vh;overflow:auto;backdrop-filter:blur(16px)}.side h2{font-size:17px;margin:0 0 10px}.track{display:grid;grid-template-columns:28px 58px minmax(0,1fr);gap:10px;align-items:center;color:#fff;text-decoration:none;border-radius:14px;padding:8px;transition:background .16s,transform .16s}.track:hover,.track.current{background:rgba(59,130,246,.18);transform:translateX(-2px)}.track span{color:var(--muted);font-size:12px}.track b{height:46px;background:#1a2544 center/cover no-repeat;border-radius:11px;display:grid;place-items:center;color:#93c5fd}.track strong{font-size:12px;line-height:1.35}
.unsupported{aspect-ratio:16/9;display:grid;place-items:center;background:#121826;padding:22px;text-align:center}.unsupported h2{margin:0 0 8px}.unsupported p{color:var(--muted)}.notice{margin:12px 0 0;border:1px solid rgba(248,113,113,.38);background:rgba(127,29,29,.24);border-radius:14px;padding:12px 14px;color:#fecaca}
.watch{position:fixed;inset:0;display:none;place-items:center;background:rgba(3,7,18,.78);padding:18px;z-index:5;backdrop-filter:blur(8px)}.watch>div{max-width:430px;background:#101936;border:1px solid var(--line);border-radius:18px;padding:22px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.42)}.watch p{color:var(--muted);line-height:1.7}
body.theater .wrap{max-width:1680px}body.theater .layout{grid-template-columns:1fr}body.theater .side{display:none}body.theater video{max-height:84vh}
@media(max-width:980px){.wrap{padding:14px 12px 34px}.layout{grid-template-columns:1fr}.side{max-height:none}.bar{flex-wrap:wrap}.bar>a{flex:1}.actions .btn{flex:1 1 142px}}
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
mxBtn.onclick=()=>{ location.href='intent:'+full+'#Intent;package=com.mxtech.videoplayer.ad;S.title='+encodeURIComponent(meta.title||'WIVA')+';end'; };
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
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const u = { pathname: parsedUrl.pathname, query: Object.fromEntries(parsedUrl.searchParams.entries()) };
    const configuredAdminPath = '/' + String(typeof options.getAdminPath === 'function' ? options.getAdminPath() : 'admin')
      .replace(/^\/+|\/+$/g, '')
      .replace(/[^\w\-./]/g, '');
    const adminBase = configuredAdminPath === '/' ? '/admin' : configuredAdminPath;
    const isAdminBase = u.pathname === '/admin' || u.pathname === adminBase;
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
    if (u.pathname === '/setup' || u.pathname === '/agent') {
      return send(res, 200, setupPage(options), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (u.pathname === '/api/agent/state' || u.pathname === '/api/setup/state') {
      const state = typeof options.getSetupState === 'function' ? options.getSetupState() : {};
      return sendJson(res, 200, state);
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
    if (isAdminBase) {
      if (!requireAdmin(req, res, options, adminBase)) return;
      if (!featureAllowed(options, 'webAdmin')) return denyFeature(req, res, options, 'webAdmin');
      return send(res, 200, adminPage(options), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (/^\/api\/admin\//.test(u.pathname) && !featureAllowed(options, 'webAdmin')) {
      if (!requireAdmin(req, res, options, adminBase)) return;
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
    m = /^\/player\/(\d+)$/.exec(u.pathname);
    if (m) {
      if (!featureAllowed(options, 'media')) return denyFeature(req, res, options, 'media');
      const html = playerPage(m[1], req, res);
      if (!html) return send(res, 404, 'Media not found', { 'Content-Type': 'text/plain; charset=utf-8' });
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (u.pathname === '/api/admin/state') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, {
        broadcast: db.listBroadcastChannels(),
        iptv: db.listIptv(),
        cloudIptv: safeCloudIptvList(),
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
    if (u.pathname === '/api/admin/storage/roots' || u.pathname === '/api/admin/system/drives') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      return sendJson(res, 200, { roots: storageRoots() });
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
        const fallback = {
          iptvGlobalLimitBytes: Math.max(0, Number(body.iptvGlobalLimitBytes || 0) || 0),
          cloudIptvRefreshMinutes: Math.max(1, Math.min(1440, Number(body.cloudIptvRefreshMinutes || 3) || 3)),
        };
        const policy = typeof options.updateIptvPolicy === 'function' ? options.updateIptvPolicy(fallback) : fallback;
        return sendJson(res, 200, { ok: true, policy, cloudIptvStatus: cloudIptv.status() });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    let adminMatch = /^\/api\/admin\/iptv\/(\d+)(?:\/toggle)?$/.exec(u.pathname);
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
    if (u.pathname === '/api/admin/broadcast' && req.method === 'PUT') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const body = await parseJsonBody(req);
        if (!Array.isArray(body.channels)) return sendJson(res, 400, { error: 'channels must be an array' });
        const channels = db.setBroadcastChannels(body.channels);
        if (options.onChannelsChanged) options.onChannelsChanged();
        return sendJson(res, 200, { channels });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
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
        return sendJson(res, 200, { paths: db.listPaths() });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    adminMatch = /^\/api\/admin\/library-paths\/(\d+)$/.exec(u.pathname);
    if (adminMatch && req.method === 'DELETE') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      db.removePath(parseInt(adminMatch[1], 10));
      return sendJson(res, 200, { paths: db.listPaths() });
    }
    if (u.pathname === '/api/admin/scan' && req.method === 'POST') {
      if (!requireAdmin(req, res, options, adminBase)) return;
      try {
        const cfg = typeof options.getLibraryConfig === 'function' ? options.getLibraryConfig() : {};
        const result = await scanner.scanAll({ tmdbKey: cfg.tmdbKey || '', tmdbLang: cfg.tmdbLang || 'ar' });
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
      return sendJson(res, 200, { ...db.viewerState(ctx.viewerId), account: ctx.account });
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
