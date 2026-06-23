const api = window.broadcaster;
let state = null;

const el = (id) => document.getElementById(id);

function toast(message) {
  const box = el('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, 2600);
}

async function copy(text) {
  await navigator.clipboard.writeText(text);
  toast('تم النسخ');
}

function linkRow(label, href) {
  const row = document.createElement('div');
  row.className = 'link-row';
  row.innerHTML = `<span>${label}</span><code>${href}</code>`;
  const open = document.createElement('button');
  open.textContent = 'فتح';
  open.onclick = () => api.openExternal(href);
  const cp = document.createElement('button');
  cp.textContent = 'نسخ';
  cp.onclick = () => copy(href);
  row.append(open, cp);
  return row;
}

function renderLinks() {
  const local = el('localLinks');
  const lan = el('lanLinks');
  local.innerHTML = '';
  lan.innerHTML = '';
  const urls = state.urls || {};
  [
    ['الإعداد', urls.setupLocal],
    ['الإدارة', urls.adminLocal],
    ['المكتبة', urls.libraryLocal],
    ['البث', urls.liveLocal],
  ].filter((x) => x[1]).forEach(([label, href]) => local.appendChild(linkRow(label, href)));
  const rows = [];
  (urls.setupLan || []).forEach((href) => rows.push(['الإعداد', href]));
  (urls.adminLan || []).forEach((href) => rows.push(['الإدارة', href]));
  (urls.libraryLan || []).forEach((href) => rows.push(['المكتبة', href]));
  (urls.liveLan || []).forEach((href) => rows.push(['البث', href]));
  if (!rows.length) {
    lan.innerHTML = '<p class="muted">لم يتم العثور على عنوان شبكة محلية بعد. تأكد أن الجهاز متصل بالشبكة.</p>';
  } else {
    rows.forEach(([label, href]) => lan.appendChild(linkRow(label, href)));
  }
}

function updateText(s) {
  const labels = {
    idle: 'جاهز للفحص.',
    checking: 'جاري فحص التحديثات...',
    none: 'لا يوجد تحديث جديد.',
    available: `يوجد تحديث جديد${s.version ? `: ${s.version}` : ''}. سيتم تنزيله تلقائياً.`,
    downloading: `جاري تنزيل التحديث ${s.percent || 0}%`,
    ready: `التحديث جاهز للتثبيت${s.version ? `: ${s.version}` : ''}.`,
    error: `تعذر فحص التحديث: ${s.message || ''}`,
  };
  return labels[s.state] || 'حالة التحديث غير معروفة.';
}

function render() {
  const led = el('stateLed');
  led.classList.toggle('ok', !!state.libraryReady);
  const ports = state.ports || {};
  const subscription = state.subscription || {};
  el('statusList').innerHTML = `
    <div><dt>الإصدار</dt><dd>${state.version || '-'}</dd></div>
    <div><dt>البث</dt><dd>${ports.live || '-'}</dd></div>
    <div><dt>الإدارة</dt><dd>${ports.library || '-'}</dd></div>
    <div><dt>الإعداد</dt><dd>${state.setupCompleted ? 'مكتمل' : 'ينتظر الإعداد'}</dd></div>
    <div><dt>الاشتراك</dt><dd>${subscription.state || 'offline'}</dd></div>
    <div><dt>التشغيل</dt><dd>${state.launchedAtBoot ? 'بدأ مع الجهاز' : 'تشغيل يدوي'}</dd></div>
  `;
  renderLinks();
  el('updateText').textContent = updateText(state.update || { state: 'idle' });
  el('installUpdateBtn').hidden = (state.update || {}).state !== 'ready';
  el('diagnostics').textContent = JSON.stringify({
    app: state.appName,
    version: state.version,
    ports: state.ports,
    setupCompleted: state.setupCompleted,
    storage: state.storage,
  }, null, 2);
}

async function refresh() {
  state = await api.agentState();
  render();
}

el('openSetupBtn').onclick = () => api.openExternal((state.urls || {}).setupLocal);
el('openAdminBtn').onclick = () => api.openExternal((state.urls || {}).adminLocal);
el('refreshBtn').onclick = refresh;
el('copyAllBtn').onclick = () => {
  const urls = state.urls || {};
  const lines = [
    ...(urls.setupLan || []),
    ...(urls.adminLan || []),
    ...(urls.libraryLan || []),
    ...(urls.liveLan || []),
  ];
  copy(lines.join('\n') || urls.setupLocal || '');
};
el('restartBtn').onclick = async () => {
  await api.restartServer((state.ports || {}).live);
  toast('تمت إعادة تشغيل خادم البث');
  await refresh();
};
el('checkUpdateBtn').onclick = async () => {
  await api.updateCheck();
  toast('بدأ فحص التحديثات');
  setTimeout(refresh, 1200);
};
el('installUpdateBtn').onclick = () => api.updateInstall();

api.onUpdateStatus((s) => {
  state.update = s;
  render();
});

api.onPlatformStatus((s) => {
  state.subscription = s;
  render();
});

refresh().catch((error) => {
  el('diagnostics').textContent = String(error && error.message ? error.message : error);
});
