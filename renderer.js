// TeraNet Broadcaster — renderer (multi-channel)
const $ = (id) => document.getElementById(id);

let settings = { channels: [] };
let serverInfo = { port: 8080, ips: [] };
let videoDevices = [];
let audioDevices = [];
const runtime = new Map(); // channelId -> { stream, ws, peers:Map, status:'idle'|'starting'|'live'|'error', err? }

function uid(){return 'c_'+Math.random().toString(36).slice(2,10)}
function toast(msg, kind=''){const d=document.createElement('div');d.className='toast '+kind;d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2200)}

// ================= TABS =================
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $('tab-' + t.dataset.tab).classList.add('active');
    if (t.dataset.tab === 'share') renderShare();
  });
});

// ================= Devices =================
async function loadDevices() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() => null);
    if (tmp) tmp.getTracks().forEach(t => t.stop());
  } catch {}
  const devices = await navigator.mediaDevices.enumerateDevices();
  videoDevices = devices.filter(d => d.kind === 'videoinput');
  audioDevices = devices.filter(d => d.kind === 'audioinput');
}

// ================= Settings load/save =================
async function loadSettings() {
  settings = await window.broadcaster.getSettings();
  serverInfo = await window.broadcaster.getServerInfo();
  applyBrand();
  hydrateBrandingForm();
  hydrateSettingsForm();
  renderChannels();
}
async function persistSettings(patch) {
  // Send ONLY the intended patch to the main process. Sending the whole
  // renderer copy of settings could overwrite the persisted DB with a stale
  // or empty channels array when saving unrelated options/branding.
  settings = await window.broadcaster.saveSettings(patch || {});
  applyBrand();
}

function applyBrand() {
  document.documentElement.style.setProperty('--accent', settings.accent || '#3b82f6');
  document.documentElement.style.setProperty('--accent2', settings.accent2 || '#8b5cf6');
  $('brandTitle').textContent = (settings.brandName || 'TeraNet') + ' Broadcaster';
  $('brandSub').textContent = settings.brandTagline || '';
  $('logoDot').textContent = (settings.brandName || 'T').trim().charAt(0).toUpperCase();
  document.title = (settings.brandName || 'TeraNet') + ' Broadcaster';
}

function hydrateBrandingForm() {
  $('brandName').value = settings.brandName || '';
  $('brandTagline').value = settings.brandTagline || '';
  $('accent').value = settings.accent || '#3b82f6';
  $('accent2').value = settings.accent2 || '#8b5cf6';
}
function hydrateSettingsForm() {
  $('autoStartOnBoot').checked = !!settings.autoStartOnBoot;
  $('startMinimized').checked = !!settings.startMinimized;
  $('autoStartChannels').checked = settings.autoStartChannels !== false;
  $('port').value = settings.port || 8080;
}

$('saveBrandBtn').onclick = async () => {
  await persistSettings({
    brandName: $('brandName').value.trim() || 'TeraNet',
    brandTagline: $('brandTagline').value.trim(),
    accent: $('accent').value,
    accent2: $('accent2').value,
  });
  toast('تم حفظ العلامة التجارية', 'ok');
};
$('saveSettingsBtn').onclick = async () => {
  await persistSettings({
    autoStartOnBoot: $('autoStartOnBoot').checked,
    startMinimized: $('startMinimized').checked,
    autoStartChannels: $('autoStartChannels').checked,
    port: Number($('port').value) || 8080,
  });
  toast('تم حفظ الإعدادات', 'ok');
};
$('restartServerBtn').onclick = async () => {
  const port = Number($('port').value) || 8080;
  await persistSettings({ port });
  // stop all running channels first
  for (const id of [...runtime.keys()]) stopChannel(id, true);
  const info = await window.broadcaster.restartServer(port);
  serverInfo = await window.broadcaster.getServerInfo();
  toast('أعيد تشغيل الخادم على المنفذ ' + info.port, 'ok');
  renderShare();
};

// ================= Channels list rendering =================
function renderChannels() {
  const list = $('channelsList');
  const empty = $('channelsEmpty');
  list.innerHTML = '';
  if (!settings.channels || !settings.channels.length) { empty.style.display = 'block'; updateGlobalStatus(); return; }
  empty.style.display = 'none';
  for (const c of settings.channels) {
    const r = runtime.get(c.id);
    const live = r && r.status === 'live';
    const starting = r && r.status === 'starting';
    const viewers = r ? r.peers.size : 0;
    const card = document.createElement('div');
    card.className = 'ch-card';
    card.innerHTML = `
      <div class="ch-preview">
        <video id="prev_${c.id}" autoplay playsinline muted style="${live?'':'display:none'}"></video>
        ${!live?`<div class="placeholder">📺</div>`:''}
        ${live?'<span class="badge-live"><span class="dot"></span>LIVE</span>':starting?'<span class="badge-off">يبدأ…</span>':'<span class="badge-off">متوقفة</span>'}
        ${live?`<span class="viewers">👁 ${viewers}</span>`:''}
      </div>
      <div class="ch-body">
        <h3>${escapeHtml(c.name)}</h3>
        <p class="desc">${escapeHtml(c.description || '—')}</p>
        <div class="ch-meta">
          <span class="pill">${sourceLabel(c)}</span>
          <span class="pill">${c.resolution || '720p'}</span>
          <span class="pill">${c.fps || 30} FPS</span>
          <span class="pill">${(c.bitrateKbps||2500)} kbps</span>
          ${c.autoStart?'<span class="pill" style="background:color-mix(in oklab,var(--accent) 18%, transparent);border-color:color-mix(in oklab,var(--accent) 40%, transparent)">⚡ بدء تلقائي</span>':''}
        </div>
        <div class="ch-actions">
          ${live||starting
            ?`<button class="btn live" data-act="stop" data-id="${c.id}">إيقاف البث</button>`
            :`<button class="btn primary" data-act="start" data-id="${c.id}">بدء البث</button>`}
          <button class="icon-btn" data-act="edit" data-id="${c.id}" title="تعديل">✏️</button>
          <button class="icon-btn danger" data-act="delete" data-id="${c.id}" title="حذف">🗑</button>
        </div>
      </div>
    `;
    list.appendChild(card);
    // attach preview stream if live
    if (live && r.stream) {
      const v = card.querySelector('#prev_' + c.id);
      if (v) v.srcObject = r.stream;
    }
  }
  list.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id, act = btn.dataset.act;
      if (act === 'start') startChannel(id);
      else if (act === 'stop') stopChannel(id);
      else if (act === 'edit') openEditor(id);
      else if (act === 'delete') {
        if (confirm('حذف القناة؟')) {
          stopChannel(id);
          settings.channels = settings.channels.filter(c => c.id !== id);
          persistSettings({ channels: settings.channels });
          renderChannels();
        }
      }
    };
  });
  updateGlobalStatus();
}
function sourceLabel(c) {
  const k = c.source?.kind;
  if (k === 'screen') return '🖥 شاشة';
  if (k === 'url') return '🔗 URL';
  if (k === 'cam') return '📷 كاميرا';
  return '—';
}
function updateGlobalStatus() {
  const liveCount = [...runtime.values()].filter(r => r.status === 'live').length;
  const totalViewers = [...runtime.values()].reduce((a,r) => a + (r.peers?.size||0), 0);
  if (liveCount) $('globalStatus').innerHTML = `<span class="led live"></span> ${liveCount} قناة على الهواء • 👁 ${totalViewers}`;
  else $('globalStatus').innerHTML = '<span class="led off"></span> جاهز';
}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

// ================= Editor modal =================
let editingId = null;
function openEditor(id) {
  editingId = id;
  const c = id ? settings.channels.find(x => x.id === id) : null;
  $('modalTitle').textContent = c ? 'تعديل قناة' : 'قناة جديدة';
  // Build set of devices already in use by live channels (so we can label them
  // — but they remain SELECTABLE because streamCache shares the same MediaStream
  // across multiple channels without re-opening the OS device).
  const inUseVideo = new Set();
  const inUseAudio = new Set();
  for (const [chId, st] of runtime.entries()) {
    if (st.status !== 'live' && st.status !== 'starting') continue;
    const ch = settings.channels.find(x => x.id === chId);
    if (!ch) continue;
    if (ch.source?.kind === 'cam' && ch.source.deviceId) inUseVideo.add(ch.source.deviceId);
    if (ch.audioDeviceId && ch.audioDeviceId !== 'none') inUseAudio.add(ch.audioDeviceId);
  }
  const cleanLabel = (s) => String(s || '').replace(/\s*\((in use|قيد الاستخدام)\)\s*/gi, '').trim();
  // populate device options
  const usb = $('chUsbGroup'); const mic = $('chMicGroup');
  usb.innerHTML = ''; mic.innerHTML = '';
  videoDevices.forEach((d,i)=>{
    const o=document.createElement('option');
    o.value='cam:'+d.deviceId;
    const base = cleanLabel(d.label) || ('كاميرا '+(i+1));
    o.textContent = inUseVideo.has(d.deviceId) ? `${base} — قيد الاستخدام (قابل للمشاركة)` : base;
    o.disabled = false; // always selectable: streams are shared via streamCache
    usb.appendChild(o);
  });
  audioDevices.forEach((d,i)=>{
    const o=document.createElement('option');
    o.value=d.deviceId;
    const base = cleanLabel(d.label) || ('ميكروفون '+(i+1));
    o.textContent = inUseAudio.has(d.deviceId) ? `${base} — قيد الاستخدام (قابل للمشاركة)` : base;
    o.disabled = false;
    mic.appendChild(o);
  });

  $('chName').value = c?.name || '';
  $('chDesc').value = c?.description || '';
  const src = c?.source;
  if (src?.kind === 'screen') $('chVideoSource').value = '__screen__';
  else if (src?.kind === 'url') { $('chVideoSource').value = '__url__'; $('chVideoUrl').value = src.url || ''; }
  else if (src?.kind === 'cam') $('chVideoSource').value = 'cam:'+(src.deviceId||'');
  else $('chVideoSource').value = '';
  $('chUrlField').style.display = ($('chVideoSource').value === '__url__') ? 'block' : 'none';
  $('chVideoUrl').value = src?.url || '';
  $('chAudioSource').value = c?.audioDeviceId || 'none';
  $('chResolution').value = c?.resolution || '1280x720';
  $('chFps').value = String(c?.fps || 30);
  $('chBitrate').value = String(c?.bitrateKbps || 2500);
  $('chAutoStart').checked = !!c?.autoStart;
  $('channelModal').style.display = 'grid';
}
$('addChannelBtn').onclick = () => openEditor(null);
$('modalCloseBtn').onclick = $('modalCancelBtn').onclick = () => { $('channelModal').style.display = 'none'; editingId = null; };
$('chVideoSource').onchange = () => { $('chUrlField').style.display = $('chVideoSource').value === '__url__' ? 'block' : 'none'; };
$('modalSaveBtn').onclick = async () => {
  const name = $('chName').value.trim();
  if (!name) { toast('أدخل اسم القناة', 'err'); return; }
  const v = $('chVideoSource').value;
  let source;
  if (v === '__screen__') source = { kind: 'screen' };
  else if (v === '__url__') {
    const url = $('chVideoUrl').value.trim();
    if (!url) { toast('أدخل رابط URL', 'err'); return; }
    source = { kind: 'url', url };
  } else if (v.startsWith('cam:')) source = { kind: 'cam', deviceId: v.slice(4) };
  else { toast('اختر مصدر الفيديو', 'err'); return; }

  const ch = {
    id: editingId || uid(),
    name, description: $('chDesc').value.trim(),
    source,
    audioDeviceId: $('chAudioSource').value,
    resolution: $('chResolution').value,
    fps: Number($('chFps').value),
    bitrateKbps: Number($('chBitrate').value),
    autoStart: $('chAutoStart').checked,
    enabled: true,
  };
  if (editingId) settings.channels = settings.channels.map(c => c.id === editingId ? ch : c);
  else settings.channels = [...(settings.channels||[]), ch];
  await persistSettings({ channels: settings.channels });
  $('channelModal').style.display = 'none';
  editingId = null;
  renderChannels();
  toast('تم الحفظ', 'ok');
};

// ================= Capture =================
// Cache streams per source key so the SAME camera/screen/url can power multiple
// channels at once without "device in use" errors from the OS.
const streamCache = new Map(); // key -> { stream, refs:Set<channelId> }

function streamKey(c) {
  if (c.source.kind === 'screen') return 'screen';
  if (c.source.kind === 'url') return 'url:' + c.source.url;
  return `cam:${c.source.deviceId}|${c.resolution}|${c.fps}|${c.audioDeviceId || 'none'}`;
}

async function rawCapture(c) {
  const [w, h] = (c.resolution||'1280x720').split('x').map(Number);
  const fps = c.fps || 30;
  const audioConstraint = (c.audioDeviceId && c.audioDeviceId !== 'none')
    ? { deviceId: { exact: c.audioDeviceId } } : false;
  if (c.source.kind === 'screen') {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps } },
      audio: true,
    });
  }
  if (c.source.kind === 'url') {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = false; v.playsInline = true; v.loop = true; v.src = c.source.url;
    await v.play();
    return v.captureStream();
  }
  return await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: c.source.deviceId }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps } },
    audio: audioConstraint,
  });
}

async function captureForChannel(c) {
  const key = streamKey(c);
  const cached = streamCache.get(key);
  if (cached && cached.stream.active) {
    cached.refs.add(c.id);
    // Clone so each channel has its own MediaStream wrapper sharing the same tracks.
    return cached.stream.clone();
  }
  const stream = await rawCapture(c);
  streamCache.set(key, { stream, refs: new Set([c.id]) });
  return stream.clone();
}

function releaseStream(c) {
  const key = streamKey(c);
  const entry = streamCache.get(key);
  if (!entry) return;
  entry.refs.delete(c.id);
  if (entry.refs.size === 0) {
    try { entry.stream.getTracks().forEach((t) => t.stop()); } catch {}
    streamCache.delete(key);
  }
}

// ================= Per-channel signaling =================
function wsUrl() { return `ws://127.0.0.1:${serverInfo.port || settings.port || 8080}/ws`; }

async function startChannel(id) {
  const c = settings.channels.find(x => x.id === id);
  if (!c) return;
  if (runtime.has(id)) return;
  const state = { stream: null, ws: null, peers: new Map(), status: 'starting' };
  runtime.set(id, state);
  renderChannels();
  try {
    state.stream = await captureForChannel(c);
    state.stream.getVideoTracks().forEach(t => t.contentHint = 'motion');
    const ws = new WebSocket(wsUrl());
    state.ws = ws;
    await new Promise((res, rej) => {
      ws.onopen = () => { ws.send(JSON.stringify({ type:'register-broadcaster', channelId: c.id, name: c.name, description: c.description })); res(); };
      ws.onerror = rej;
      setTimeout(() => ws.readyState === 1 ? res() : rej(new Error('ws timeout')), 4000);
    });
    ws.onmessage = (e) => handleSignal(c, JSON.parse(e.data));
    ws.onclose = () => { state.status = 'idle'; renderChannels(); };
    state.status = 'live';
    toast(`📡 ${c.name} على الهواء`, 'ok');
    renderChannels();
  } catch (e) {
    console.error(e);
    toast('فشل بدء البث: ' + (e.message||e), 'err');
    stopChannel(id, true);
  }
}

async function handleSignal(c, msg) {
  const s = runtime.get(c.id); if (!s) return;
  if (msg.type === 'viewer-joined') await offerToViewer(c, msg.id);
  else if (msg.type === 'viewer-left') {
    const pc = s.peers.get(msg.id); if (pc) { pc.close(); s.peers.delete(msg.id); }
    renderChannels();
  } else if (msg.type === 'answer') {
    const pc = s.peers.get(msg.from); if (pc) await pc.setRemoteDescription({ type:'answer', sdp: msg.sdp });
  } else if (msg.type === 'ice') {
    const pc = s.peers.get(msg.from); if (pc) try { await pc.addIceCandidate(msg.candidate); } catch {}
  }
}

async function offerToViewer(c, viewerId) {
  const s = runtime.get(c.id); if (!s || !s.stream) return;
  const pc = new RTCPeerConnection({ iceServers: [] });
  s.peers.set(viewerId, pc);
  s.stream.getTracks().forEach(t => pc.addTrack(t, s.stream));
  pc.onicecandidate = ev => { if (ev.candidate) s.ws.send(JSON.stringify({ type:'ice', to:viewerId, candidate: ev.candidate })); };
  pc.onconnectionstatechange = () => { if (['failed','closed','disconnected'].includes(pc.connectionState)) { s.peers.delete(viewerId); renderChannels(); } };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  // Apply bitrate cap
  const sender = pc.getSenders().find(x => x.track && x.track.kind === 'video');
  if (sender) {
    const params = sender.getParameters();
    params.encodings = params.encodings && params.encodings.length ? params.encodings : [{}];
    params.encodings[0].maxBitrate = (c.bitrateKbps || 2500) * 1000;
    params.encodings[0].maxFramerate = c.fps || 30;
    try { await sender.setParameters(params); } catch {}
  }
  s.ws.send(JSON.stringify({ type:'offer', to: viewerId, sdp: offer.sdp }));
  renderChannels();
}

function stopChannel(id, silent=false) {
  const s = runtime.get(id); if (!s) return;
  const c = settings.channels.find(x => x.id === id);
  for (const pc of s.peers.values()) try { pc.close(); } catch {}
  // Stop the cloned wrapper tracks; release shared cache only when last user leaves.
  if (s.stream) { try { s.stream.getTracks().forEach(t => t.stop()); } catch {} }
  if (c) releaseStream(c);
  if (s.ws) { try { s.ws.send(JSON.stringify({type:'unregister-broadcaster'})); } catch {} try { s.ws.close(); } catch {} }
  runtime.delete(id);
  if (!silent) toast('تم إيقاف البث');
  renderChannels();
}

// ================= Share =================
function renderShare() {
  const ips = (serverInfo.ips || []);
  const list = $('ipList'); list.innerHTML = '';
  if (!ips.length) { list.innerHTML = '<div class="hint">لم يتم اكتشاف شبكة Wi-Fi. تحقق من اتصالك.</div>'; return; }
  for (const ip of ips) {
    const url = `http://${ip}:${serverInfo.port}`;
    const d = document.createElement('div'); d.className = 'ip-item';
    d.innerHTML = `<span>🌐</span><code>${url}</code><button>نسخ</button>`;
    d.querySelector('button').onclick = () => {
      navigator.clipboard.writeText(url);
      const b = d.querySelector('button'); b.textContent = '✓ تم'; setTimeout(()=>{b.textContent='نسخ'},1200);
    };
    list.appendChild(d);
  }
}

// ================= Init =================
(async () => {
  await loadDevices();
  await loadSettings();
  renderShare();
  navigator.mediaDevices.addEventListener?.('devicechange', loadDevices);
  // Refresh viewer counts every 1.5s
  setInterval(renderChannels, 1500);
  // Auto-start any channel marked autoStart on EVERY launch (not only at boot),
  // so saved settings actually apply when reopening the app or restarting Windows.
  if (settings.autoStartChannels !== false) {
    for (const c of (settings.channels || [])) {
      if (c.autoStart) {
        // tiny stagger so devices/screens initialize cleanly
        setTimeout(() => startChannel(c.id), 400);
      }
    }
  }

  // ===== License =====
  initLicense();
  // ===== Auto-update =====
  initUpdates();
})();

// ================= License =================
function fmtLicenseStatus(s) {
  if (!s) return 'جارٍ التحقق…';
  switch (s.state) {
    case 'licensed': return `✅ مرخّص — خطة ${s.license?.plan || ''} ${s.license?.billingCycle === 'lifetime' ? '(مدى الحياة)' : ''}`;
    case 'offline_grace': return `🟡 مرخّص (وضع غير متصل) — آخر تحقّق ${new Date(s.license?.verifiedAt || 0).toLocaleString('ar')}`;
    case 'trial': {
      const days = Math.max(0, Math.ceil((new Date(s.trialEndsAt) - new Date()) / 86400000));
      return `⏳ تجربة مجانية — متبقي ${days} يوم`;
    }
    case 'expired': return '⚠️ انتهت الفترة التجريبية. أدخل مفتاح ترخيص للمتابعة.';
    case 'invalid': return `❌ المفتاح غير صالح (${s.reason || ''})`;
    case 'mismatch': return '❌ هذا المفتاح مرتبط بجهاز آخر. اتصل بالدعم لإعادة التعيين.';
    default: return 'حالة غير معروفة';
  }
}
async function initLicense() {
  try {
    const hwId = await window.broadcaster.licenseHardwareId();
    document.getElementById('hardwareIdRow').textContent = 'معرّف الجهاز: ' + hwId;
    document.getElementById('licenseKey').value = settings.licenseKey || '';
    const refresh = (s) => { document.getElementById('licenseStatusBox').textContent = fmtLicenseStatus(s); };
    refresh(await window.broadcaster.licenseStatus());
    window.broadcaster.onLicenseStatus(refresh);
    document.getElementById('activateLicenseBtn').addEventListener('click', async () => {
      const key = document.getElementById('licenseKey').value.trim();
      document.getElementById('licenseStatusBox').textContent = 'جارٍ التحقق…';
      const s = await window.broadcaster.licenseActivate(key);
      refresh(s);
      toast(s.state === 'licensed' ? 'تم تفعيل الترخيص' : 'تعذّر التفعيل', s.state === 'licensed' ? 'ok' : 'err');
    });
  } catch (e) { console.error(e); }
}

// ================= Auto-update =================
function fmtUpdate(s) {
  if (!s) return '';
  switch (s.state) {
    case 'checking': return 'جارٍ فحص التحديثات…';
    case 'available': return `تحديث متوفر: الإصدار ${s.version} — جارٍ التنزيل…`;
    case 'downloading': return `جارٍ التنزيل: ${s.percent || 0}%`;
    case 'ready': return `✅ التحديث ${s.version} جاهز — اضغط "تطبيق التحديث"`;
    case 'none': return 'أنت تستخدم أحدث إصدار.';
    case 'error': return `خطأ: ${s.message}`;
    default: return '';
  }
}
async function initUpdates() {
  try {
    const refresh = (s) => {
      document.getElementById('updateStatusBox').textContent = `${fmtUpdate(s) || 'جاهز'}`;
      document.getElementById('installUpdateBtn').style.display = s?.state === 'ready' ? '' : 'none';
    };
    refresh(await window.broadcaster.updateStatus());
    window.broadcaster.onUpdateStatus(refresh);
    document.getElementById('checkUpdateBtn').addEventListener('click', async () => {
      document.getElementById('updateStatusBox').textContent = 'جارٍ فحص التحديثات…';
      await window.broadcaster.updateCheck();
    });
    document.getElementById('installUpdateBtn').addEventListener('click', () => window.broadcaster.updateInstall());
  } catch (e) { console.error(e); }
}

// ================= Library =================
let libraryPort = 8420;
let libraryItems = [];

async function refreshLibPaths() {
  const paths = await window.broadcaster.libraryPaths();
  const el = $('libPathsList');
  if (!paths || !paths.length) {
    el.innerHTML = '<em>لم تتم إضافة أي مجلدات بعد.</em>';
    return;
  }
  el.innerHTML = paths.map(p => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <span>📁 ${p.path} <small style="opacity:.6">(${p.kind})</small></span>
      ${p.locked ? '<span style="opacity:.5">🔒</span>' :
        `<button class="btn ghost" data-rmpath="${p.id}" style="padding:2px 8px;font-size:12px">إزالة</button>`}
    </div>
  `).join('');
  el.querySelectorAll('[data-rmpath]').forEach(b => {
    b.addEventListener('click', async () => {
      await window.broadcaster.libraryRemovePath(parseInt(b.dataset.rmpath, 10));
      refreshLibPaths();
    });
  });
}

async function refreshLibGrid() {
  const q = $('libSearch')?.value || '';
  const kind = $('libKindFilter')?.value || '';
  libraryItems = await window.broadcaster.libraryList({ q, kind });
  const grid = $('libGrid');
  $('libEmpty').style.display = libraryItems.length ? 'none' : 'block';
  grid.innerHTML = libraryItems.map(it => {
    const pct = it.position && it.wp_duration ? Math.min(100, (it.position / it.wp_duration) * 100) : 0;
    const poster = it.poster_url ? `style="background-image:url('${it.poster_url}')"` : '';
    return `
      <div class="lib-card" data-id="${it.id}">
        <div class="lib-poster" ${poster}>${it.poster_url ? '' : '🎬'}</div>
        <div class="lib-meta">
          <div class="lib-title">${escapeHtml(it.title)}${it.season ? ` S${it.season}E${it.episode}` : ''}</div>
          <div class="lib-sub">${it.year || ''} ${it.rating ? '★ ' + it.rating.toFixed(1) : ''}</div>
        </div>
        ${pct > 0 ? `<div class="lib-progress"><i style="width:${pct}%"></i></div>` : ''}
      </div>`;
  }).join('');
  grid.querySelectorAll('.lib-card').forEach(c => {
    c.addEventListener('click', () => playMedia(parseInt(c.dataset.id, 10)));
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

async function playMedia(id) {
  const item = await window.broadcaster.libraryGet(id);
  if (!item) return;
  $('libPlayerTitle').textContent = item.title + (item.season ? ` — S${item.season}E${item.episode}` : '');
  $('libPlayerOverview').textContent = item.overview || '';
  const v = $('libVideo');
  v.src = item.streamUrl;
  // restore progress
  v.addEventListener('loadedmetadata', () => {
    if (item.position && item.position < v.duration - 5) v.currentTime = item.position;
  }, { once: true });
  // save progress every 5s
  let lastSave = 0;
  v.ontimeupdate = () => {
    const now = Date.now();
    if (now - lastSave > 5000) {
      lastSave = now;
      window.broadcaster.libraryProgress({ id, position: v.currentTime, duration: v.duration || 0 });
    }
  };
  $('libPlayerModal').style.display = 'flex';
  v.play().catch(() => {});
}

function setupLibrary() {
  $('addLibFolderBtn')?.addEventListener('click', async () => {
    await window.broadcaster.libraryAddPath('movies');
    refreshLibPaths();
  });
  $('scanLibBtn')?.addEventListener('click', async () => {
    const box = $('libScanStatus');
    box.style.display = 'block';
    box.textContent = 'جارٍ الفحص…';
    const r = await window.broadcaster.libraryScan();
    box.textContent = r.ok ? `✅ تم فحص ${r.done} ملف` : `⚠️ ${r.error || 'فشل'}`;
    setTimeout(() => { box.style.display = 'none'; }, 4000);
    refreshLibGrid();
  });
  window.broadcaster.onLibraryScan?.((p) => {
    const box = $('libScanStatus');
    box.style.display = 'block';
    box.textContent = `جارٍ الفحص ${p.done}/${p.total}…`;
  });
  $('libSearch')?.addEventListener('input', () => refreshLibGrid());
  $('libKindFilter')?.addEventListener('change', () => refreshLibGrid());
  $('libPlayerCloseBtn')?.addEventListener('click', () => {
    const v = $('libVideo');
    v.pause(); v.removeAttribute('src'); v.load();
    $('libPlayerModal').style.display = 'none';
  });
  // Load when tab opens
  document.querySelector('[data-tab="library"]')?.addEventListener('click', () => {
    refreshLibPaths();
    refreshLibGrid();
  });
}
setupLibrary();

// TMDB settings
$('saveTmdbBtn')?.addEventListener('click', async () => {
  await persistSettings({
    tmdbKey: $('tmdbKey').value.trim(),
    tmdbLang: $('tmdbLang').value,
    libraryPort: parseInt($('libraryPort').value, 10) || 8420,
  });
  toast('تم حفظ إعدادات المكتبة', 'ok');
});
// Hydrate TMDB form when settings load
const _origHydrate = window.hydrateSettingsForm;
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (settings.tmdbKey !== undefined) $('tmdbKey').value = settings.tmdbKey || '';
    if (settings.tmdbLang) $('tmdbLang').value = settings.tmdbLang;
    if (settings.libraryPort) $('libraryPort').value = settings.libraryPort;
  }, 600);
});

// ================= IPTV =================
let _iptvEditingId = null;

function openIptvModal(ch) {
  _iptvEditingId = ch?.id || null;
  $('iptvModalTitle').textContent = ch ? 'تعديل قناة IPTV' : 'قناة IPTV جديدة';
  $('iptvName').value = ch?.name || '';
  $('iptvUrl').value = ch?.url || '';
  $('iptvCategory').value = ch?.category || '';
  $('iptvLogo').value = ch?.logo || '';
  $('iptvProbeBox').style.display = 'none';
  $('iptvModal').style.display = 'flex';
}
function closeIptvModal() { $('iptvModal').style.display = 'none'; _iptvEditingId = null; }

async function refreshIptvList() {
  let list = [];
  try {
    list = await window.broadcaster.iptvList();
  } catch (e) {
    console.error('iptvList failed', e);
    toast('فشل قراءة القنوات: ' + (e?.message || e), 'err');
    return; // do NOT wipe the existing DOM list on error
  }
  if (!Array.isArray(list)) list = [];
  const status = await window.broadcaster.iptvStatus().catch(() => ({}));
  const root = $('iptvList'); root.innerHTML = '';
  $('iptvEmpty').style.display = list.length ? 'none' : 'block';
  list.forEach((ch) => {
    const st = status[ch.id] || { viewers: 0, upstreamOpen: false };
    const card = document.createElement('div');
    card.className = 'channel-card';
    const isCloud = ch.source === 'cloud';
    const cloudBadge = isCloud ? '<span class="badge" style="background:#3b82f6;color:#fff;font-size:10px;padding:2px 6px;border-radius:6px;margin-right:4px">☁️ من الإدارة</span>' : '';
    card.innerHTML = `
      <div class="ch-head">
        <div>
          <div class="ch-name">${cloudBadge}${escapeHtml(ch.name)} ${ch.category ? `<span class="muted small">· ${escapeHtml(ch.category)}</span>` : ''}</div>
          <div class="muted small" style="margin-top:4px;word-break:break-all">${escapeHtml(ch.url)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="led ${st.upstreamOpen ? 'on' : 'off'}"></span>
          <span class="muted small">${st.viewers || 0} مشاهد · ${st.upstreamOpen ? 'متّصل' : 'موقوف'}</span>
        </div>
      </div>
      <div class="ch-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" data-act="play">▶️ تشغيل</button>
        <button class="btn ghost" data-act="copy">📋 نسخ رابط LAN</button>
        ${isCloud ? '' : '<button class="btn ghost" data-act="edit">تعديل</button>'}
        ${isCloud ? '' : '<button class="btn ghost" data-act="del">حذف</button>'}
      </div>
    `;
    card.querySelector('[data-act="play"]').onclick = () => playIptv(ch);
    card.querySelector('[data-act="copy"]').onclick = async () => {
      const info = await window.broadcaster.iptvStreamUrl(ch.id);
      const u = info.lanIps[0] || info.url;
      await navigator.clipboard.writeText(u);
      toast('تم نسخ الرابط: ' + u, 'ok');
    };
    if (!isCloud) {
      card.querySelector('[data-act="edit"]').onclick = () => openIptvModal(ch);
      card.querySelector('[data-act="del"]').onclick = async () => {
        if (!confirm('حذف هذه القناة؟')) return;
        await window.broadcaster.iptvRemove(ch.id);
        refreshIptvList();
      };
    }
    root.appendChild(card);
  });
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let _hls = null;
async function playIptv(ch) {
  const info = await window.broadcaster.iptvStreamUrl(ch.id);
  const proxyUrl = info.url; // local proxy
  $('iptvPlayerTitle').textContent = ch.name;
  $('iptvPlayerInfo').innerHTML = `يتم البث عبر الخادم المحلي — توقف فور إغلاق المشغّل.<br/><span class="muted small">${escapeHtml(proxyUrl)}</span>`;
  const video = $('iptvVideo');
  if (_hls) { try { _hls.destroy(); } catch {} _hls = null; }
  video.removeAttribute('src'); video.load();
  $('iptvPlayerModal').style.display = 'flex';
  // Detect HLS
  if (/\.m3u8/i.test(ch.url) && window.Hls && Hls.isSupported()) {
    _hls = new Hls({ lowLatencyMode: true });
    _hls.loadSource(proxyUrl);
    _hls.attachMedia(video);
    _hls.on(Hls.Events.ERROR, (_e, d) => {
      if (d.fatal) { toast('خطأ في البث: ' + d.type, 'err'); }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = proxyUrl;
  } else {
    // Try direct (raw TS / MP4)
    video.src = proxyUrl;
  }
  video.play().catch(() => {});
}

function closeIptvPlayer() {
  const v = $('iptvVideo');
  try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
  if (_hls) { try { _hls.destroy(); } catch {} _hls = null; }
  $('iptvPlayerModal').style.display = 'none';
  setTimeout(() => refreshIptvList(), 5500); // give grace period to elapse for status
}

function setupIptv() {
  $('addIptvBtn')?.addEventListener('click', () => openIptvModal(null));
  $('iptvModalCloseBtn')?.addEventListener('click', closeIptvModal);
  $('iptvModalCancelBtn')?.addEventListener('click', closeIptvModal);
  $('iptvPlayerCloseBtn')?.addEventListener('click', closeIptvPlayer);

  $('iptvProbeBtn')?.addEventListener('click', async () => {
    const url = $('iptvUrl').value.trim();
    if (!url) { toast('أدخل رابطاً أولاً', 'err'); return; }
    const box = $('iptvProbeBox');
    box.style.display = 'block'; box.textContent = 'جارٍ الاختبار…';
    const r = await window.broadcaster.iptvProbe(url);
    if (r.ok) {
      box.innerHTML = `✅ الرابط يعمل — نوع: ${escapeHtml(r.contentType || (r.hls ? 'HLS' : 'TS'))} · ${r.bytes ? r.bytes + ' bytes' : ''}`;
    } else {
      box.innerHTML = `❌ فشل الاختبار: ${escapeHtml(r.error || ('HTTP ' + (r.status || '?')))}`;
    }
  });

  $('iptvModalSaveBtn')?.addEventListener('click', async () => {
    const payload = {
      name: $('iptvName').value.trim(),
      url: $('iptvUrl').value.trim(),
      category: $('iptvCategory').value.trim(),
      logo: $('iptvLogo').value.trim(),
    };
    if (!payload.name || !payload.url) { toast('الاسم والرابط مطلوبان', 'err'); return; }
    if (_iptvEditingId) {
      await window.broadcaster.iptvUpdate(_iptvEditingId, payload);
    } else {
      await window.broadcaster.iptvAdd(payload);
    }
    closeIptvModal();
    refreshIptvList();
    toast('تم الحفظ', 'ok');
  });

  document.querySelector('[data-tab="iptv"]')?.addEventListener('click', () => refreshIptvList());
  refreshIptvList();
  window.broadcaster.onCloudIptvUpdated?.(() => refreshIptvList());
  // Periodic status refresh while tab visible
  setInterval(() => {
    if ($('tab-iptv')?.classList.contains('active')) refreshIptvList();
  }, 3000);
}
setupIptv();
