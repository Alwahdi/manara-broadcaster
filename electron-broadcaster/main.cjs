// Manara Broadcaster — Electron main process
// - Persistent settings (brand, channels, port, auto-start)
// - Windows auto-start at boot via app.setLoginItemSettings
// - Embedded HTTP + WebSocket signaling server (multi-channel)
// - License verification (online + 30-day offline grace) with 7-day trial
// - Auto-update via electron-updater from Manara cloud releases bucket

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, desktopCapturer, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { startSignalingServer } = require('./server/signaling.cjs');
const { verifyLicense, getHardwareId } = require('./licensing/verify.cjs');
const { autoUpdater } = require('electron-updater');
const libraryDb = require('./library/db.cjs');
const libraryScanner = require('./library/scanner.cjs');
const libraryServer = require('./library/media-server.cjs');
const iptv = require('./library/iptv.cjs');
const cloudIptv = require('./library/cloud-iptv.cjs');
const deviceState = require('./library/device-state.cjs');

// Force a single stable app-data directory across ZIP/installer/autostart/update
// launches. This is the real source of truth for all local data.
try {
  app.setName('Manara');
  app.setPath('userData', path.join(app.getPath('appData'), 'Manara'));
} catch (e) {
  console.warn('[Manara] could not force userData path:', e?.message || e);
}

// Single-instance lock: prevents concurrent writes to settings/channels JSON
// when the user (or autostart) launches the app while it's already running.
// Two instances racing to write the same JSON file is the #1 cause of
// "my channels disappeared after restart".
const __gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!__gotSingleInstanceLock) {
  console.warn('[Manara] another instance is already running — exiting this one');
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    try {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    } catch {}
  });
}

// Persistent settings: ALWAYS store under userData (%APPDATA%\Manara on Windows).
// This survives auto-updates (NSIS wipes the install dir on update), reboots,
// uninstall+reinstall, and works regardless of the exec path used to launch
// the app (autostart shortcut, start menu, updater stub, etc.).
// We also migrate any legacy portable file that lived next to the .exe.
function settingsPath() {
  const userDataDir = app.getPath('userData');
  try { fs.mkdirSync(userDataDir, { recursive: true }); } catch {}
  const target = path.join(userDataDir, 'settings.json');

  // One-time migration from legacy portable locations (next to .exe and __dirname).
  if (!fs.existsSync(target)) {
    const legacyCandidates = [
      path.join(path.dirname(process.execPath), 'teranet-settings.json'),
      path.join(__dirname, 'teranet-settings.json'),
    ];
    for (const legacy of legacyCandidates) {
      try {
        if (fs.existsSync(legacy)) {
          fs.copyFileSync(legacy, target);
          console.log('[Manara] migrated legacy settings:', legacy, '→', target);
          break;
        }
      } catch (e) {
        console.warn('[Manara] migration check failed for', legacy, e?.message);
      }
    }
  }
  return target;
}
const SETTINGS_FILE = settingsPath();
console.log('[Manara] settings file:', SETTINGS_FILE);
let lastSettingsSaveError = '';

function defaultSettings() {
  return {
    schemaVersion: 5,
    brandName: 'Manara',
    brandTagline: 'بث محلي عبر شبكة Wi-Fi — بدون إنترنت',
    accent: '#3b82f6',
    accent2: '#8b5cf6',
    port: 8080,
    autoStartOnBoot: false,
    startMinimized: false,
    autoStartChannels: true,
    autoCheckUpdates: true,
    licenseKey: '',
    tmdbKey: '',
    tmdbLang: 'ar',
    libraryPort: 8420,
    adminUsername: 'admin',
    adminPassword: 'admin',
    neonDatabaseUrl: '',
    channels: [],
    localIptvChannels: [],
  };
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultSettings(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (e) {
    console.warn('[Manara] settings load fallback:', e?.message || e);
    try {
      const backup = SETTINGS_FILE + '.bak';
      if (fs.existsSync(backup)) {
        const parsed = JSON.parse(fs.readFileSync(backup, 'utf8'));
        console.warn('[Manara] settings recovered from backup:', backup);
        return { ...defaultSettings(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
      }
    } catch (backupError) {
      console.warn('[Manara] settings backup recovery failed:', backupError?.message || backupError);
    }
    return defaultSettings();
  }
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    // Atomic write: write to temp then rename — prevents corruption / empty file
    // if the app is killed or the machine loses power mid-write.
    if (fs.existsSync(SETTINGS_FILE)) {
      try { fs.copyFileSync(SETTINGS_FILE, SETTINGS_FILE + '.bak'); } catch {}
    }
    const tmp = SETTINGS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, SETTINGS_FILE);
    lastSettingsSaveError = '';
    return true;
  } catch (e) {
    lastSettingsSaveError = e.message;
    console.error('saveSettings failed', e);
    return false;
  }
}

function publicServerInfo() {
  return {
    port: serverInfo?.port || settings.port || 8080,
    ips: getLocalIPs(),
  };
}

function publicSettings() {
  return JSON.parse(JSON.stringify(settings));
}

function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

let settings = loadSettings();
let serverInfo = null;
let mainWindow = null;
let tray = null;
let libraryReady = false;
let lastDeviceSync = { state: 'idle', at: null, error: '' };
const launchedAtBoot = process.argv.includes('--autostart') || process.argv.includes('--hidden');

function cloudSafeSettings() {
  const { channels: _channels, localIptvChannels: _localIptvChannels, licenseKey: _licenseKey, ...rest } = settings;
  return rest;
}

function localStatePayload() {
  let exported = { broadcast: settings.channels || [], iptv: [] };
  try { if (libraryReady) exported = libraryDb.exportChannels(); } catch {}
  return {
    settings: cloudSafeSettings(),
    broadcast_channels: exported.broadcast || [],
    local_iptv_channels: exported.iptv || [],
  };
}

function saveSettingsAndBackup(reason = 'manual') {
  const ok = saveSettings(settings);
  if (ok) scheduleDeviceStatePush(reason);
  return ok;
}

function refreshSettingsChannelMirror(reason = 'mirror') {
  if (!libraryReady) return;
  try {
    const exported = libraryDb.exportChannels();
    settings.channels = Array.isArray(exported.broadcast) ? exported.broadcast : [];
    settings.localIptvChannels = Array.isArray(exported.iptv) ? exported.iptv : [];
    saveSettingsAndBackup(reason);
  } catch (e) {
    console.error('[Manara] settings channel mirror failed:', e.message);
  }
}

let syncTimer = null;
function scheduleDeviceStatePush(reason = 'change') {
  if (!settings.licenseKey || !libraryReady) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushDeviceState(reason).catch(() => {}), 1200);
}

async function pushDeviceState(reason = 'change') {
  if (!settings.licenseKey || !libraryReady) return null;
  try {
    const hardwareId = getHardwareId();
    const state = await deviceState.merge({
      key: settings.licenseKey,
      hardwareId,
      appVersion: app.getVersion(),
      state: localStatePayload(),
    });
    lastDeviceSync = { state: 'synced', at: new Date().toISOString(), error: '', reason };
    return state;
  } catch (e) {
    lastDeviceSync = { state: 'offline', at: new Date().toISOString(), error: e.message, reason };
    console.warn('[Manara] device-state push skipped:', e.message);
    return null;
  }
}

async function pullDeviceStateIfEmpty() {
  if (!settings.licenseKey || !libraryReady) return;
  try { libraryDb.reloadChannelsFromDisk(); } catch {}
  const hasLocalBroadcast = libraryDb.listBroadcastChannels().length > 0;
  const hasLocalIptv = libraryDb.listIptv().length > 0;
  if (hasLocalBroadcast || hasLocalIptv) {
    syncBroadcastChannelsFromDb({ persist: true });
    await pushDeviceState('startup-local-wins');
    return;
  }
  try {
    const remote = await deviceState.pull({ key: settings.licenseKey, hardwareId: getHardwareId(), appVersion: app.getVersion() });
    if (!remote) { await pushDeviceState('startup-seed'); return; }
    const remoteBroadcast = Array.isArray(remote.broadcast_channels) ? remote.broadcast_channels : [];
    const remoteIptv = Array.isArray(remote.local_iptv_channels) ? remote.local_iptv_channels : [];
    if (remote.settings && typeof remote.settings === 'object') {
      settings = { ...settings, ...remote.settings, licenseKey: settings.licenseKey };
    }
    if (remoteBroadcast.length || remoteIptv.length) {
      const restored = libraryDb.replaceAllChannels({ broadcast: remoteBroadcast, iptv: remoteIptv });
      settings.channels = restored.broadcast;
      settings.localIptvChannels = restored.iptv;
      saveSettings(settings);
      console.log('[Manara] restored device state from cloud backup:', settings.channels.length, remoteIptv.length);
      notifyStorageReady();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('local-state-updated');
    }
    lastDeviceSync = { state: 'pulled', at: new Date().toISOString(), error: '' };
  } catch (e) {
    lastDeviceSync = { state: 'offline', at: new Date().toISOString(), error: e.message };
    console.warn('[Manara] device-state pull skipped:', e.message);
  }
}

function syncBroadcastChannelsFromDb({ persist = true } = {}) {
  if (!libraryReady) return settings.channels || [];
  try {
    // Always re-read the channels file so in-memory state cannot drift from disk
    // after restarts or concurrent writes.
    libraryDb.reloadChannelsFromDisk();
    const dbChannels = libraryDb.listBroadcastChannels();
    if ((!dbChannels || dbChannels.length === 0) && Array.isArray(settings.channels) && settings.channels.length) {
      settings.channels = libraryDb.setBroadcastChannels(settings.channels);
      console.log('[Manara] migrated broadcast channels from settings to DB:', settings.channels.length);
    } else {
      settings.channels = dbChannels || [];
    }
    try { settings.localIptvChannels = libraryDb.listIptv(); } catch {}
    if (persist) saveSettingsAndBackup('broadcast-sync');
  } catch (e) {
    console.error('[Manara] broadcast channel DB sync failed:', e.message);
  }
  return settings.channels || [];
}

function notifyStorageReady() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('storage-ready');
  }
}

function applyLoginItem() {
  try {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: !!settings.autoStartOnBoot,
        openAsHidden: !!settings.startMinimized,
        path: process.execPath,
        args: ['--autostart', ...(settings.startMinimized ? ['--hidden'] : [])],
      });
    }
  } catch (e) { console.error('login item failed', e); }
}

function mediaServerOptions() {
  return {
    getAdminAuth: () => ({
      username: settings.adminUsername || 'admin',
      password: settings.adminPassword || 'admin',
    }),
    onChannelsChanged: () => refreshSettingsChannelMirror('lan-admin'),
  };
}

function createMediaHandler() {
  return libraryServer.createHandler(mediaServerOptions());
}

function publicIptvChannels() {
  const rows = [];
  try {
    rows.push(...cloudIptv.list());
  } catch {}
  try {
    rows.push(...libraryDb.listIptv().map((c) => ({ ...c, source: 'local' })));
  } catch {}
  return rows
    .filter((c) => c && c.url && c.enabled !== false && c.enabled !== 0)
    .map((c) => ({
      id: String(c.id),
      type: 'iptv',
      name: c.name || 'IPTV',
      description: c.category ? `IPTV - ${c.category}` : 'IPTV عند الطلب',
      viewers: 0,
      live: true,
      source: c.source || 'local',
    }));
}

function createAppIcon() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  try {
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) return icon;
    }
  } catch {}
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#101936"/>
  <path d="M14 42V22l18-10 18 10v20L32 52 14 42z" fill="#2563eb"/>
  <path d="M24 23v18l17-9-17-9z" fill="#fff"/>
</svg>`;
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#070b1e',
    title: settings.brandName + ' Broadcaster',
    icon: createAppIcon(),
    autoHideMenuBar: true,
    show: !(launchedAtBoot && settings.startMinimized),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => {
    syncBroadcastChannelsFromDb({ persist: false });
    notifyStorageReady();
  });
  mainWindow.on('close', (e) => {
    if (!app.isQuitting && settings.autoStartOnBoot) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const icon = createAppIcon();
    tray = new Tray(icon);
    tray.setToolTip(settings.brandName + ' Broadcaster');
    const menu = Menu.buildFromTemplate([
      { label: 'فتح اللوحة', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { type: 'separator' },
      { label: 'إيقاف وخروج', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  } catch (e) { /* tray unsupported */ }
}

// ---------- IPC ----------
ipcMain.handle('get-server-info', () => publicServerInfo());
ipcMain.handle('get-local-ips', () => getLocalIPs());
ipcMain.handle('get-settings', () => {
  syncBroadcastChannelsFromDb({ persist: false });
  return publicSettings();
});
ipcMain.handle('broadcast-list', () => {
  syncBroadcastChannelsFromDb({ persist: false });
  return Array.isArray(settings.channels) ? settings.channels : [];
});
ipcMain.handle('broadcast-save-all', (_e, channels) => {
  if (!Array.isArray(channels)) return Array.isArray(settings.channels) ? settings.channels : [];
  if (!libraryReady) {
    settings.channels = channels;
    saveSettingsAndBackup('broadcast-save-before-library-ready');
    return settings.channels;
  }
  // Guard against a stale/empty renderer list wiping persisted channels.
  syncBroadcastChannelsFromDb({ persist: false });
  const existing = libraryDb.listBroadcastChannels();
  if (existing.length > 0 && channels.length === 0) {
    console.warn('[Manara] refused empty channel save that would wipe', existing.length, 'channels');
    settings.channels = existing;
    return settings.channels;
  }
  let next = channels;
  if (existing.length > 0 && channels.length > 0 && channels.length < existing.length) {
    const byId = new Map(existing.map((c) => [c.id, c]));
    for (const c of channels) byId.set(c.id, c);
    next = [...byId.values()];
    console.warn('[Manara] merged partial channel save:', channels.length, '→', next.length);
  }
  settings.channels = libraryDb.setBroadcastChannels(next);
  try { settings.localIptvChannels = libraryDb.listIptv(); } catch {}
  saveSettingsAndBackup('broadcast-save-all');
  scheduleDeviceStatePush('broadcast-save-all');
  return settings.channels;
});
ipcMain.handle('save-settings', (_e, next) => {
  try {
    const patch = (next && typeof next === 'object') ? { ...next } : {};
    const hasChannels = Object.prototype.hasOwnProperty.call(patch, 'channels');
    if (hasChannels && !Array.isArray(patch.channels)) {
      console.warn('[Manara] ignored invalid channels save payload');
      delete patch.channels;
    }
    // Sync channels from disk BEFORE applying patches so we never write a stale
    // empty settings.channels mirror over good persisted data.
    if (libraryReady) syncBroadcastChannelsFromDb({ persist: false });

    const { channels: channelPatch, ...rest } = patch;
    settings = { ...settings, ...rest };

    if (hasChannels && Array.isArray(channelPatch) && libraryReady) {
      try {
        settings.channels = libraryDb.setBroadcastChannels(channelPatch);
        try { settings.localIptvChannels = libraryDb.listIptv(); } catch {}
        console.log('[Manara] broadcast channels persisted:', settings.channels.length);
      } catch (e) {
        console.error('[Manara] broadcast channel persistence FAILED:', e.message);
      }
    } else if (hasChannels && Array.isArray(channelPatch)) {
      settings.channels = channelPatch;
    } else if (libraryReady) {
      settings.channels = libraryDb.listBroadcastChannels();
      try { settings.localIptvChannels = libraryDb.listIptv(); } catch {}
    }

    saveSettingsAndBackup('settings');
    try { cloudIptv.setNeonDatabaseUrl(settings.neonDatabaseUrl || ''); } catch {}
    console.log('[Manara] settings saved — keys:', Object.keys(rest).join(',') || '(none)');
    applyLoginItem();
    if (serverInfo && serverInfo.setBrand) {
      serverInfo.setBrand({
        brandName: settings.brandName,
        brandTagline: settings.brandTagline,
        accent: settings.accent,
        accent2: settings.accent2,
      });
    }
    return publicSettings();
  } catch (e) {
    console.error('[Manara] save-settings handler crashed:', e.message);
    return publicSettings();
  }
});
ipcMain.handle('restart-server', async (_e, port) => {
  if (serverInfo && serverInfo.close) await serverInfo.close();
  serverInfo = startSignalingServer({ port: port || settings.port, mediaHandler: createMediaHandler(), getIptvChannels: publicIptvChannels });
  serverInfo.setBrand({
    brandName: settings.brandName, brandTagline: settings.brandTagline,
    accent: settings.accent, accent2: settings.accent2,
  });
  return { port: serverInfo.port };
});
ipcMain.handle('launched-at-boot', () => launchedAtBoot);
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
ipcMain.handle('storage-diagnostics', () => {
  let diag = {};
  try { diag = libraryDb.diagnostics(); } catch (e) { diag = { error: e.message }; }
  return {
    settingsPath: SETTINGS_FILE,
    settingsExists: fs.existsSync(SETTINGS_FILE),
    settingsSaveError: lastSettingsSaveError,
    userDataDir: app.getPath('userData'),
    libraryReady,
    deviceSync: lastDeviceSync,
    ...diag,
  };
});

// ---------- License IPC ----------
function licensePaths() {
  const base = app.getPath('userData');
  return {
    cache: path.join(base, 'license-cache.json'),
    firstRun: path.join(base, 'first-run.json'),
  };
}
let lastLicenseStatus = null;
async function refreshLicense() {
  const { cache, firstRun } = licensePaths();
  lastLicenseStatus = await verifyLicense({
    key: settings.licenseKey || '',
    cachePath: cache,
    firstRunPath: firstRun,
    appVersion: app.getVersion(),
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('license-status', lastLicenseStatus);
  }
  return lastLicenseStatus;
}
ipcMain.handle('license-status', async () => lastLicenseStatus || refreshLicense());
ipcMain.handle('license-activate', async (_e, key) => {
  settings = { ...settings, licenseKey: String(key || '').trim() };
  saveSettingsAndBackup('license-activate');
  const status = await refreshLicense();
  if (status?.state === 'licensed' || status?.state === 'offline_grace') {
    await pullDeviceStateIfEmpty();
    await pushDeviceState('license-activate');
  }
  return status;
});
ipcMain.handle('license-hardware-id', () => getHardwareId());

// ---------- Auto-update IPC ----------
let updateState = { state: 'idle' };
function broadcastUpdate(s) {
  updateState = s;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', s);
  }
}
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('checking-for-update', () => broadcastUpdate({ state: 'checking' }));
autoUpdater.on('update-available', (info) => broadcastUpdate({ state: 'available', version: info?.version }));
autoUpdater.on('update-not-available', () => broadcastUpdate({ state: 'none' }));
autoUpdater.on('error', (err) => broadcastUpdate({ state: 'error', message: String(err?.message || err) }));
autoUpdater.on('download-progress', (p) => broadcastUpdate({ state: 'downloading', percent: Math.round(p.percent || 0) }));
autoUpdater.on('update-downloaded', (info) => broadcastUpdate({ state: 'ready', version: info?.version }));
ipcMain.handle('update-status', () => updateState);
ipcMain.handle('update-check', async () => {
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('update-install', () => { autoUpdater.quitAndInstall(false, true); });

// ---------- Library IPC ----------
let libraryServerInfo = null;
ipcMain.handle('library-paths', () => libraryDb.listPaths());
ipcMain.handle('library-add-path', async (_e, kind) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'اختر مجلد المكتبة',
  });
  if (r.canceled || !r.filePaths[0]) return null;
  libraryDb.addPath(r.filePaths[0], kind || 'movies', 0);
  return libraryDb.listPaths();
});
ipcMain.handle('library-remove-path', (_e, id) => {
  libraryDb.removePath(id);
  return libraryDb.listPaths();
});
let scanInProgress = false;
ipcMain.handle('library-scan', async () => {
  if (scanInProgress) return { ok: false, error: 'scan in progress' };
  scanInProgress = true;
  try {
    const r = await libraryScanner.scanAll(
      { tmdbKey: settings.tmdbKey || '', tmdbLang: settings.tmdbLang || 'ar' },
      (p) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('library-scan-progress', p);
        }
      }
    );
    return { ok: true, ...r };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
  finally { scanInProgress = false; }
});
ipcMain.handle('library-list', (_e, opts) => libraryDb.listMedia(opts || {}));
ipcMain.handle('library-get', (_e, id) => {
  const item = libraryDb.getMedia(id);
  if (!item) return null;
  const subs = libraryDb.listSubtitles(id);
  return { ...item, subtitles: subs, streamUrl: `http://127.0.0.1:${serverInfo?.port || settings.port || 8080}/media/${id}` };
});
ipcMain.handle('library-progress', (_e, { id, position, duration }) => {
  libraryDb.setProgress(id, position, duration);
  return true;
});
ipcMain.handle('library-port', () => libraryServerInfo?.port || settings.libraryPort);

// ---------- IPTV IPC ----------
ipcMain.handle('iptv-list', () => {
  let local = [];
  try {
    local = libraryDb.listIptv().map((c) => ({ ...c, source: 'local' }));
  } catch (e) {
    console.error('[Manara] iptv-list local read failed:', e.message);
  }
  let cloud = [];
  try { cloud = cloudIptv.list(); } catch (e) { console.error('[Manara] iptv-list cloud read failed:', e.message); }
  return [...cloud, ...local];
});
ipcMain.handle('iptv-add', (_e, payload) => {
  try {
    const id = libraryDb.addIptv(payload || {});
    const row = libraryDb.getIptv(id);
    refreshSettingsChannelMirror('iptv-add');
    scheduleDeviceStatePush('iptv-add');
    console.log('[Manara] iptv-add ok id=' + id + ' name=' + (row?.name || ''));
    return { ...row, source: 'local' };
  } catch (e) {
    console.error('[Manara] iptv-add FAILED:', e.message);
    throw e;
  }
});
ipcMain.handle('iptv-update', (_e, { id, patch }) => {
  const updated = libraryDb.updateIptv(id, patch || {});
  refreshSettingsChannelMirror('iptv-update');
  scheduleDeviceStatePush('iptv-update');
  return updated;
});
ipcMain.handle('iptv-remove', (_e, id) => {
  libraryDb.removeIptv(id);
  refreshSettingsChannelMirror('iptv-remove');
  scheduleDeviceStatePush('iptv-remove');
  return true;
});
ipcMain.handle('iptv-probe', async (_e, url) => iptv.probe(url));
ipcMain.handle('iptv-status', () => iptv.status());
ipcMain.handle('iptv-stream-url', (_e, id) => {
  const port = serverInfo?.port || settings.port || 8080;
  return { url: `http://127.0.0.1:${port}/iptv/${id}`, lanIps: getLocalIPs().map((ip) => `http://${ip}:${port}/iptv/${id}`) };
});
ipcMain.handle('cloud-iptv-refresh', async () => {
  const channels = await cloudIptv.refresh(settings.licenseKey || '');
  return { channels, status: cloudIptv.status() };
});
ipcMain.handle('cloud-iptv-status', () => cloudIptv.status());

app.whenReady().then(() => {
  // Enable Electron's screen sharing: provide the entire-screen source automatically.
  try {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const source = sources.find((s) => s.id.startsWith('screen:')) || sources[0];
        if (!source) return callback({});
        callback({ video: source, audio: 'loopback' });
      } catch (e) {
        console.error('display media handler failed', e);
        callback({});
      }
    }, { useSystemPicker: false });
  } catch (e) { console.error('setDisplayMediaRequestHandler failed', e); }

  serverInfo = startSignalingServer({ port: settings.port, mediaHandler: createMediaHandler(), getIptvChannels: publicIptvChannels });
  serverInfo.setBrand({
    brandName: settings.brandName, brandTagline: settings.brandTagline,
    accent: settings.accent, accent2: settings.accent2,
  });
  applyLoginItem();

  // Initialize local media library DB + channel JSON store + HTTP streaming server
  try {
    const dbPath = path.join(app.getPath('userData'), 'manara-library.db');
    libraryDb.init(dbPath, { broadcast: settings.channels, iptv: settings.localIptvChannels });
    libraryReady = true;
    syncBroadcastChannelsFromDb();
    try {
      const d = libraryDb.diagnostics();
      console.log('[Manara] storage diagnostics:', JSON.stringify(d));
    } catch {}
    console.log('[Manara] persisted broadcast channels on startup:', (settings.channels || []).length);
    try {
      const existing = libraryDb.listIptv();
      console.log('[Manara] persisted local IPTV channels on startup:', existing.length);
    } catch {}
    libraryServerInfo = libraryServer.start(settings.libraryPort || 8420, mediaServerOptions());
    console.log('[Manara] library server on 127.0.0.1:' + libraryServerInfo.port);
  } catch (e) {
    console.error('[Manara] library init failed:', e.message);
  }

  createWindow();
  createTray();

  // Initial license check + device-state recovery + periodic re-verification every 6h
  refreshLicense().then((status) => {
    if (status?.state === 'licensed' || status?.state === 'offline_grace') {
      return pullDeviceStateIfEmpty();
    }
    return null;
  }).catch(() => {});
  setInterval(() => { refreshLicense().catch(() => {}); }, 6 * 60 * 60 * 1000);

  // Cloud IPTV sync (admin-managed channels) — refresh IMMEDIATELY at startup
  try {
    cloudIptv.setCachePath(path.join(app.getPath('userData'), 'cloud-iptv-cache.json'));
    cloudIptv.setNeonDatabaseUrl(settings.neonDatabaseUrl || '');
    // fire and forget immediate fetch so channels appear right after launch
    cloudIptv.refresh(settings.licenseKey || '').then((ch) => {
      console.log('[Manara] initial cloud-iptv fetch:', (ch || []).length, 'channels');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cloud-iptv-updated');
      }
    }).catch((e) => console.error('[Manara] initial cloud-iptv fetch failed:', e.message));
    cloudIptv.startAutoRefresh(() => settings.licenseKey || '');
  } catch (e) { console.error('[Manara] cloud iptv init failed:', e.message); }

  // Check for updates on launch + every 6h (only when packaged)
  if (app.isPackaged && settings.autoCheckUpdates !== false) {
    setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 5000);
    setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 6 * 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  try {
    if (libraryReady) refreshSettingsChannelMirror('before-quit');
    else saveSettings(settings);
  } catch (e) {
    console.warn('[Manara] before-quit flush failed:', e?.message || e);
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !settings.autoStartOnBoot) app.quit();
});
