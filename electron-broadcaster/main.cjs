// WIVA Agent — Electron main process
// - Persistent settings (brand, channels, port, auto-start)
// - Windows auto-start at boot via app.setLoginItemSettings
// - Embedded HTTP + WebSocket signaling server (multi-channel)
// - License verification (online + 30-day offline grace) with 7-day trial
// - Auto-update via electron-updater from WIVA cloud releases bucket

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, desktopCapturer, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const childProcess = require('child_process');
const crypto = require('crypto');
const { loadLocalEnv } = require('./library/env.cjs');
const loadedEnvFiles = loadLocalEnv(__dirname);
const { startSignalingServer } = require('./server/signaling.cjs');
const { verifyLicense, getHardwareId } = require('./licensing/verify.cjs');
const { autoUpdater } = require('electron-updater');
const QRCode = require('qrcode');
const libraryDb = require('./library/db.cjs');
const libraryScanner = require('./library/scanner.cjs');
const libraryServer = require('./library/media-server.cjs');
const iptv = require('./library/iptv.cjs');
const cloudIptv = require('./library/cloud-iptv.cjs');
const deviceState = require('./library/device-state.cjs');
const platform = require('./library/platform.cjs');
let runtimeConfig = {};
try { runtimeConfig = require('./library/cloud-runtime.cjs'); } catch {}
if (!process.env.MANARA_NEON_DATABASE_URL && !runtimeConfig.neonDatabaseUrl && !app.isPackaged) {
  console.warn('[WIVA] dev mode has no MANARA_NEON_DATABASE_URL. Add it to .env.local for Neon cloud IPTV/platform tests.');
}
if (loadedEnvFiles.length) console.log('[WIVA] loaded local env files:', loadedEnvFiles.join(', '));

const APP_NAME = 'WIVA';
const APP_DATA_DIR = 'WIVA';
const LEGACY_APP_DATA_DIR = 'Manara';
const DEFAULT_AGENT_PORT = 8787;
const DEFAULT_LIBRARY_PORT = 8788;
const ADMIN_HASH_PREFIX = 'scrypt';
const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const adminSessions = new Map();

function initSentry() {
  const dsn = process.env.SENTRY_DSN || runtimeConfig.sentryDsn || '';
  if (!dsn) return;
  try {
    const Sentry = require('@sentry/electron/main');
    Sentry.init({
      dsn,
      release: `wiva-agent@${app.getVersion()}`,
      environment: app.isPackaged ? 'production' : 'development',
      tracesSampleRate: 0.05,
    });
    process.on('uncaughtException', (error) => {
      Sentry.captureException(error);
      console.error('[WIVA] uncaught exception:', error);
    });
    process.on('unhandledRejection', (reason) => {
      Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
      console.error('[WIVA] unhandled rejection:', reason);
    });
    console.log('[WIVA] Sentry error tracking enabled');
  } catch (e) {
    console.warn('[WIVA] Sentry init failed:', e?.message || e);
  }
}

initSentry();

// Force a single stable app-data directory across ZIP/installer/autostart/update
// launches. This is the real source of truth for all local data.
try {
  app.setName(APP_NAME);
  app.setPath('userData', path.join(app.getPath('appData'), APP_DATA_DIR));
} catch (e) {
  console.warn('[WIVA] could not force userData path:', e?.message || e);
}

// Single-instance lock: prevents concurrent writes to settings/channels JSON
// when the user (or autostart) launches the app while it's already running.
// Two instances racing to write the same JSON file is the #1 cause of
// "my channels disappeared after restart".
const __gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!__gotSingleInstanceLock) {
  console.warn('[WIVA] another instance is already running — exiting this one');
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

// Persistent settings: ALWAYS store under userData (%APPDATA%\WIVA on Windows).
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
    const legacyUserData = path.join(app.getPath('appData'), LEGACY_APP_DATA_DIR, 'settings.json');
    const legacyCandidates = [
      legacyUserData,
      path.join(path.dirname(process.execPath), 'teranet-settings.json'),
      path.join(__dirname, 'teranet-settings.json'),
    ];
    for (const legacy of legacyCandidates) {
      try {
        if (fs.existsSync(legacy)) {
          fs.copyFileSync(legacy, target);
          console.log('[WIVA] migrated legacy settings:', legacy, '→', target);
          break;
        }
      } catch (e) {
        console.warn('[WIVA] migration check failed for', legacy, e?.message);
      }
    }
  }
  return target;
}
const SETTINGS_FILE = settingsPath();
console.log('[WIVA] settings file:', SETTINGS_FILE);
let lastSettingsSaveError = '';
const DEFAULT_BRAND_TAGLINE = 'خدمة مشاهدة داخل الشبكة';
const LEGACY_DEFAULT_BRAND_TAGLINES = new Set([
  'بث محلي عبر شبكة Wi-Fi — بدون إنترنت',
  'بث محلي عبر شبكة Wi-Fi',
  'بث محلي عبر Wi-Fi',
]);

function hashAdminPassword(password, salt = crypto.randomBytes(16).toString('base64')) {
  const normalized = String(password || '');
  const hash = crypto.scryptSync(normalized, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64');
  return `${ADMIN_HASH_PREFIX}$16384$8$1$${salt}$${hash}`;
}

function timingSafeEqualString(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function verifyAdminPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 6 || parts[0] !== ADMIN_HASH_PREFIX) return false;
  const [, n, r, p, salt, expected] = parts;
  try {
    const hash = crypto.scryptSync(String(password || ''), salt, 64, {
      N: Number(n) || 16384,
      r: Number(r) || 8,
      p: Number(p) || 1,
    }).toString('base64');
    return timingSafeEqualString(hash, expected);
  } catch {
    return false;
  }
}

function issueAdminSession(username) {
  const token = crypto.randomBytes(32).toString('base64url');
  adminSessions.set(token, {
    username: String(username || 'admin'),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  return token;
}

function verifyAdminSession(token) {
  const clean = String(token || '');
  const sessionInfo = adminSessions.get(clean);
  if (!sessionInfo) return false;
  if (Date.now() - Number(sessionInfo.createdAt || 0) > ADMIN_SESSION_TTL_MS) {
    adminSessions.delete(clean);
    return false;
  }
  sessionInfo.lastSeenAt = Date.now();
  return true;
}

function clearAdminSession(token) {
  adminSessions.delete(String(token || ''));
}

function defaultSettings() {
  return {
    schemaVersion: 6,
    setupCompleted: false,
    setupCompletedAt: '',
    brandName: 'WIVA',
    brandTagline: DEFAULT_BRAND_TAGLINE,
    networkName: '',
    networkNumber: '',
    networkLocation: '',
    networkCountry: '',
    networkRegion: '',
    networkCity: '',
    networkTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Aden',
    networkLogoDataUrl: '',
    experienceLayout: 'unified',
    liveTheme: 'cinema',
    libraryTheme: 'cinema',
    adminPath: 'admin',
    accent: '#2563eb',
    accent2: '#14b8a6',
    port: DEFAULT_AGENT_PORT,
    autoStartOnBoot: true,
    startMinimized: true,
    autoStartChannels: true,
    autoCheckUpdates: true,
    licenseKey: '',
    tmdbKey: '',
    tmdbLang: 'ar',
    libraryPort: DEFAULT_LIBRARY_PORT,
    adminUsername: 'admin',
    adminPassword: '',
    adminPasswordHash: hashAdminPassword('admin'),
    neonDatabaseUrl: '',
    platformTenantName: '',
    platformContactEmail: '',
    platformContactPhone: '',
    platformChannel: 'stable',
    iptvGlobalLimitBytes: 0,
    cloudIptvRefreshMinutes: 3,
    cloudIptvOverrides: {},
    channels: [],
    localIptvChannels: [],
  };
}

function normalizeSettings(parsed) {
  const merged = { ...defaultSettings(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  if (merged.adminPassword && !merged.adminPasswordHash) {
    merged.adminPasswordHash = hashAdminPassword(merged.adminPassword);
  }
  merged.adminPassword = '';
  if (!merged.brandName || merged.brandName === 'Manara') merged.brandName = 'WIVA';
  if (!merged.port || Number(merged.port) === 8080) merged.port = DEFAULT_AGENT_PORT;
  if (!merged.libraryPort || Number(merged.libraryPort) === 8420) merged.libraryPort = DEFAULT_LIBRARY_PORT;
  merged.adminPath = String(merged.adminPath || 'admin').replace(/^\/+|\/+$/g, '').replace(/[^\w\-./]/g, '') || 'admin';
  merged.experienceLayout = merged.experienceLayout === 'separate' ? 'separate' : 'unified';
  if (LEGACY_DEFAULT_BRAND_TAGLINES.has(String(merged.brandTagline || '').trim())) {
    merged.brandTagline = DEFAULT_BRAND_TAGLINE;
  }
  if (merged.accent === '#3b82f6' && merged.accent2 === '#8b5cf6') {
    merged.accent = '#2563eb';
    merged.accent2 = '#14b8a6';
  }
  return merged;
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeSettings(parsed);
  } catch (e) {
    console.warn('[WIVA] settings load fallback:', e?.message || e);
    try {
      const backup = SETTINGS_FILE + '.bak';
      if (fs.existsSync(backup)) {
        const parsed = JSON.parse(fs.readFileSync(backup, 'utf8'));
        console.warn('[WIVA] settings recovered from backup:', backup);
        return normalizeSettings(parsed);
      }
    } catch (backupError) {
      console.warn('[WIVA] settings backup recovery failed:', backupError?.message || backupError);
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
    port: serverInfo?.port || settings.port || DEFAULT_AGENT_PORT,
    ips: getLocalIPs(),
  };
}

function publicSettings() {
  const clone = JSON.parse(JSON.stringify(settings));
  delete clone.neonDatabaseUrl;
  delete clone.adminPassword;
  delete clone.adminPasswordHash;
  delete clone.licenseKey;
  return clone;
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

function runShell(command) {
  try {
    return childProcess.execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1800 });
  } catch {
    return '';
  }
}

function lookupPortOwner(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return null;
  if (process.platform === 'win32') {
    const lines = runShell(`netstat -ano -p tcp | findstr ":${p}"`).split(/\r?\n/).filter(Boolean);
    const match = lines.find((line) => /\bLISTENING\b/i.test(line));
    const pid = match ? match.trim().split(/\s+/).pop() : '';
    if (!pid) return null;
    const name = runShell(`powershell -NoProfile -Command "try { (Get-Process -Id ${pid}).ProcessName } catch {}"`).trim();
    return { pid, processName: name || `PID ${pid}` };
  }
  const line = runShell(`lsof -nP -iTCP:${p} -sTCP:LISTEN -FpPc | tr '\\n' ' '`).trim();
  const pid = (line.match(/\bp(\d+)/) || [])[1] || '';
  const processName = (line.match(/\bc([^ ]+)/) || [])[1] || '';
  return pid ? { pid, processName: processName || `PID ${pid}` } : null;
}

function findSuggestedPort(start) {
  const base = Math.max(1024, Math.min(65500, Number(start) || DEFAULT_AGENT_PORT));
  for (let p = base; p < Math.min(65535, base + 80); p += 1) {
    const owner = lookupPortOwner(p);
    if (!owner) return p;
  }
  return base + 100;
}

function checkPortAvailability(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) {
    return { ok: false, available: false, port, message: 'Port must be a number between 1 and 65535.' };
  }
  const owner = lookupPortOwner(p);
  if (owner) {
    return {
      ok: true,
      available: false,
      port: p,
      processName: owner.processName,
      pid: owner.pid,
      suggestedPort: findSuggestedPort(p + 1),
      message: `Port ${p} is already used by ${owner.processName || 'another application'}.`,
    };
  }
  return { ok: true, available: true, port: p, message: `Port ${p} is available.` };
}

function windowsAvDevices() {
  if (process.platform !== 'win32') return { videoDevices: [], audioDevices: [] };
  const script = "Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -in @('Camera','Image','MEDIA','AudioEndpoint') } | Select-Object Name,PNPClass,DeviceID | ConvertTo-Json -Compress";
  const raw = runShell(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`).trim();
  if (!raw) return { videoDevices: [], audioDevices: [] };
  try {
    const rows = JSON.parse(raw);
    const list = Array.isArray(rows) ? rows : [rows];
    const videoDevices = [];
    const audioDevices = [];
    for (const row of list) {
      const name = String(row.Name || '').trim();
      const cls = String(row.PNPClass || '').toLowerCase();
      const id = String(row.DeviceID || name || '').trim();
      if (!name) continue;
      const item = { id, name, type: cls || 'device' };
      if (cls === 'audioendpoint' || /audio|sound|microphone|speaker/i.test(name)) audioDevices.push(item);
      else if (cls === 'camera' || cls === 'image' || /camera|capture|usb|hdmi|video/i.test(name)) videoDevices.push(item);
    }
    return { videoDevices, audioDevices };
  } catch {
    return { videoDevices: [], audioDevices: [] };
  }
}

async function listCaptureSourcesForAdmin() {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
  const screens = sources
    .filter((source) => String(source.id || '').startsWith('screen:'))
    .map((source, index) => ({ id: source.id, name: source.name || `شاشة ${index + 1}`, type: 'screen' }));
  const windows = sources
    .filter((source) => String(source.id || '').startsWith('window:'))
    .slice(0, 80)
    .map((source) => ({ id: source.id, name: source.name || source.id, type: 'window' }));
  const platformDevices = windowsAvDevices();
  return {
    screens,
    windows,
    videoDevices: platformDevices.videoDevices,
    audioDevices: platformDevices.audioDevices,
  };
}

function agentUrls() {
  const livePort = serverInfo?.port || settings.port || DEFAULT_AGENT_PORT;
  const libraryPort = libraryServerInfo?.port || settings.libraryPort || DEFAULT_LIBRARY_PORT;
  const ips = getLocalIPs();
  const adminPath = String(settings.adminPath || 'admin').replace(/^\/+|\/+$/g, '') || 'admin';
  return {
    liveLocal: `http://127.0.0.1:${livePort}`,
    libraryLocal: `http://127.0.0.1:${libraryPort}/library`,
    setupLocal: `http://127.0.0.1:${libraryPort}/setup`,
    adminLocal: `http://127.0.0.1:${libraryPort}/${adminPath}`,
    liveLan: ips.map((ip) => `http://${ip}:${livePort}`),
    libraryLan: ips.map((ip) => `http://${ip}:${libraryPort}/library`),
    setupLan: ips.map((ip) => `http://${ip}:${libraryPort}/setup`),
    adminLan: ips.map((ip) => `http://${ip}:${libraryPort}/${adminPath}`),
  };
}

function agentState() {
  const status = serverInfo?.getStats ? serverInfo.getStats() : { channels: [] };
  return {
    appName: APP_NAME,
    version: app.getVersion(),
    setupCompleted: !!settings.setupCompleted,
    launchedAtBoot,
    uptimeSeconds: Math.round(process.uptime()),
    platform: process.platform,
    ports: {
      live: serverInfo?.port || settings.port || DEFAULT_AGENT_PORT,
      library: libraryServerInfo?.port || settings.libraryPort || DEFAULT_LIBRARY_PORT,
    },
    urls: agentUrls(),
    settings: publicSettings(),
    status,
    update: updateState,
    subscription: platform.status(),
    libraryReady,
    storage: {
      settingsPath: SETTINGS_FILE,
      userDataDir: app.getPath('userData'),
      lastSettingsSaveError,
    },
  };
}

let settings = loadSettings();
let serverInfo = null;
let mainWindow = null;
let tray = null;
let libraryReady = false;
let lastDeviceSync = { state: 'idle', at: null, error: '' };
const launchedAtBoot = process.argv.includes('--autostart') || process.argv.includes('--hidden');

function cloudSafeSettings() {
  const { channels: _channels, localIptvChannels: _localIptvChannels, licenseKey: _licenseKey, neonDatabaseUrl: _neonDatabaseUrl, ...rest } = settings;
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
    console.error('[WIVA] settings channel mirror failed:', e.message);
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
    console.warn('[WIVA] device-state push skipped:', e.message);
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
      console.log('[WIVA] restored device state from cloud backup:', settings.channels.length, remoteIptv.length);
      notifyStorageReady();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('local-state-updated');
    }
    lastDeviceSync = { state: 'pulled', at: new Date().toISOString(), error: '' };
  } catch (e) {
    lastDeviceSync = { state: 'offline', at: new Date().toISOString(), error: e.message };
    console.warn('[WIVA] device-state pull skipped:', e.message);
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
      console.log('[WIVA] migrated broadcast channels from settings to DB:', settings.channels.length);
    } else {
      settings.channels = dbChannels || [];
    }
    try { settings.localIptvChannels = libraryDb.listIptv(); } catch {}
    if (persist) saveSettingsAndBackup('broadcast-sync');
  } catch (e) {
    console.error('[WIVA] broadcast channel DB sync failed:', e.message);
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
    if (process.platform === 'darwin' && !app.isPackaged) {
      console.log('[WIVA] skipping macOS login item setup in npm start dev mode');
      return;
    }
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
    appName: APP_NAME,
    getAdminAuth: () => ({
      username: settings.adminUsername || 'admin',
      passwordHash: settings.adminPasswordHash || '',
    }),
    verifyAdminCredentials: ({ username, password }) => (
      String(username || '') === String(settings.adminUsername || 'admin')
      && verifyAdminPassword(password, settings.adminPasswordHash)
    ),
    issueAdminSession: ({ username }) => issueAdminSession(username || settings.adminUsername || 'admin'),
    verifyAdminSession: (token) => verifyAdminSession(token),
    clearAdminSession: (token) => clearAdminSession(token),
    getAdminPath: () => settings.adminPath || 'admin',
    getSetupState: () => agentState(),
    checkPort: (port) => checkPortAvailability(port),
    listCaptureSources: () => listCaptureSourcesForAdmin(),
    applySetup: async (patch = {}) => {
      const currentLivePort = Number(settings.port) || DEFAULT_AGENT_PORT;
      const currentLibraryPort = Number(settings.libraryPort) || DEFAULT_LIBRARY_PORT;
      const clean = patch && typeof patch === 'object' ? patch : {};
      const next = {
        setupCompleted: clean.setupCompleted !== false,
        setupCompletedAt: new Date().toISOString(),
        brandName: String(clean.brandName || clean.networkName || settings.brandName || 'WIVA').trim() || 'WIVA',
        brandTagline: String(clean.brandTagline || settings.brandTagline || DEFAULT_BRAND_TAGLINE).trim() || DEFAULT_BRAND_TAGLINE,
        networkName: String(clean.networkName || '').trim(),
        networkNumber: String(clean.networkNumber || '').trim(),
        networkLocation: String(clean.networkLocation || '').trim(),
        networkCountry: String(clean.networkCountry || '').trim(),
        networkRegion: String(clean.networkRegion || '').trim(),
        networkCity: String(clean.networkCity || '').trim(),
        networkTimezone: String(clean.networkTimezone || settings.networkTimezone || 'Asia/Aden').trim(),
        networkLogoDataUrl: /^data:image\/png;base64,/i.test(String(clean.networkLogoDataUrl || '')) ? clean.networkLogoDataUrl : settings.networkLogoDataUrl,
        experienceLayout: clean.experienceLayout === 'separate' ? 'separate' : 'unified',
        liveTheme: String(clean.liveTheme || settings.liveTheme || 'cinema').trim(),
        libraryTheme: String(clean.libraryTheme || settings.libraryTheme || 'cinema').trim(),
        adminPath: String(clean.adminPath || settings.adminPath || 'admin').replace(/^\/+|\/+$/g, '').replace(/[^\w\-./]/g, '') || 'admin',
        adminUsername: String(clean.adminUsername || settings.adminUsername || 'admin').trim() || 'admin',
        port: Math.max(1, Math.min(65535, Number(clean.port || settings.port || DEFAULT_AGENT_PORT))),
        libraryPort: Math.max(1, Math.min(65535, Number(clean.libraryPort || settings.libraryPort || DEFAULT_LIBRARY_PORT))),
      };
      const nextPassword = String(clean.adminPassword || '').trim();
      if (nextPassword) next.adminPasswordHash = hashAdminPassword(nextPassword);
      next.adminPassword = '';
      settings = { ...settings, ...next };
      saveSettingsAndBackup('web-setup');
      applyLoginItem();
      if (libraryReady) {
        try {
          libraryDb.setMediaTheme({
            brandName: settings.brandName,
            tagline: settings.brandTagline,
            logoUrl: settings.networkLogoDataUrl || '',
            direction: 'rtl',
            accent: settings.accent,
            accent2: settings.accent2,
          });
        } catch (e) {
          console.warn('[WIVA] setup theme sync failed:', e.message);
        }
      }
      if (serverInfo && serverInfo.setBrand) {
        serverInfo.setBrand({
          brandName: settings.brandName,
          brandTagline: settings.brandTagline,
          accent: settings.accent,
          accent2: settings.accent2,
        });
      }
      const shouldRestartLive = Number(settings.port) !== currentLivePort;
      const shouldRestartLibrary = Number(settings.libraryPort) !== currentLibraryPort;
      if (shouldRestartLive || shouldRestartLibrary) {
        setTimeout(async () => {
          try {
            if (shouldRestartLive) await restartLiveServer(settings.port);
            if (shouldRestartLibrary && libraryServerInfo?.close) {
              await libraryServerInfo.close();
              libraryServerInfo = libraryServer.start(settings.libraryPort || DEFAULT_LIBRARY_PORT, mediaServerOptions());
            }
          } catch (e) {
            console.error('[WIVA] setup port restart failed:', e.message);
          }
        }, 700);
      }
      return agentState();
    },
    getIptvPolicy: () => ({
      iptvGlobalLimitBytes: Number(settings.iptvGlobalLimitBytes) || 0,
      cloudIptvRefreshMinutes: Math.max(1, Number(settings.cloudIptvRefreshMinutes) || 3),
    }),
    updateIptvPolicy: (patch = {}) => {
      settings = {
        ...settings,
        iptvGlobalLimitBytes: Math.max(0, Number(patch.iptvGlobalLimitBytes ?? settings.iptvGlobalLimitBytes) || 0),
        cloudIptvRefreshMinutes: Math.max(1, Math.min(1440, Number(patch.cloudIptvRefreshMinutes ?? settings.cloudIptvRefreshMinutes) || 3)),
      };
      saveSettingsAndBackup('web-admin-iptv-policy');
      cloudIptv.startAutoRefresh(() => settings.licenseKey || '', settings.cloudIptvRefreshMinutes * 60 * 1000);
      return {
        iptvGlobalLimitBytes: settings.iptvGlobalLimitBytes,
        cloudIptvRefreshMinutes: settings.cloudIptvRefreshMinutes,
      };
    },
    getCloudIptvChannel: (id) => {
      const ch = cloudIptv.getById(normalizeCloudId(id));
      return ch ? applyCloudIptvOverride(ch) : null;
    },
    getLibraryConfig: () => ({
      tmdbKey: settings.tmdbKey || '',
      tmdbLang: settings.tmdbLang || 'ar',
    }),
    getPlatformStatus: () => platform.status(),
    requestPlatformActivation,
    refreshPlatformStatus,
    onChannelsChanged: () => refreshSettingsChannelMirror('lan-admin'),
  };
}

function appPlatformInfo() {
  return {
    appVersion: app.getVersion(),
    channel: settings.platformChannel || 'stable',
  };
}

async function refreshPlatformStatus() {
  const s = await platform.refresh(appPlatformInfo());
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('platform-status', s);
  }
  return s;
}

function platformFeatureAllowed(feature) {
  const status = platform.status();
  if (!status) return false;
  return status.state === 'active' && !!status.features?.[feature];
}

async function requestPlatformActivation(payload = {}) {
  const clean = payload && typeof payload === 'object' ? payload : {};
  settings = {
    ...settings,
    platformTenantName: String(clean.tenantName || clean.organizationName || clean.networkName || '').trim(),
    platformContactEmail: String(clean.contactEmail || clean.email || '').trim().toLowerCase(),
    platformContactPhone: String(clean.contactPhone || clean.phone || '').trim(),
    platformChannel: String(clean.channel || settings.platformChannel || 'stable').trim() || 'stable',
  };
  saveSettingsAndBackup('platform-activation-request');
  const status = await platform.requestActivation({
    tenantName: settings.platformTenantName,
    contactEmail: settings.platformContactEmail,
    contactPhone: settings.platformContactPhone,
  }, appPlatformInfo());
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('platform-status', status);
  }
  return status;
}

function createMediaHandler() {
  return libraryServer.createHandler(mediaServerOptions());
}

async function restartLiveServer(port) {
  if (serverInfo && serverInfo.close) await serverInfo.close();
  serverInfo = startSignalingServer({
    port: port || settings.port || DEFAULT_AGENT_PORT,
    mediaHandler: createMediaHandler(),
    getIptvChannels: publicIptvChannels,
    getBroadcastChannels: () => syncBroadcastChannelsFromDb({ persist: false }),
    getFeatureAllowed: platformFeatureAllowed,
  });
  serverInfo.setBrand({
    brandName: settings.brandName,
    brandTagline: settings.brandTagline,
    accent: settings.accent,
    accent2: settings.accent2,
  });
  return { port: serverInfo.port };
}

function publicIptvChannels() {
  if (!platformFeatureAllowed('iptv')) return [];
  const rows = [];
  try {
    rows.push(...cloudIptv.list().map(applyCloudIptvOverride));
  } catch {}
  try {
    rows.push(...libraryDb.listIptv().map((c) => ({ ...c, source: 'local' })));
  } catch {}
  const playable = rows
    .filter((c) => c && c.url && c.enabled !== false && c.enabled !== 0)
    .map((c) => ({
      id: String(c.id),
      type: 'iptv',
      name: c.name || 'IPTV',
      description: c.category ? `IPTV - ${c.category}` : 'IPTV عند الطلب',
      viewers: 0,
      live: true,
      source: c.source || 'local',
      logo: c.logo || c.logo_url || '',
      quality: parseIptvQuality(c.name || ''),
      groupName: parseIptvGroupName(c.name || 'IPTV'),
      category: c.category || '',
    }));
  const grouped = new Map();
  for (const ch of playable) {
    const key = `${ch.category || ''}|${ch.groupName || ch.name}`.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...ch,
        id: ch.id,
        name: ch.groupName || ch.name,
        description: ch.category ? `IPTV - ${ch.category}` : 'IPTV عند الطلب',
        qualities: [],
      });
    }
    grouped.get(key).qualities.push({
      id: ch.id,
      label: ch.quality,
      name: ch.name,
      source: ch.source,
      logo: ch.logo || '',
    });
  }
  return [...grouped.values()].map((group) => {
    group.qualities.sort((a, b) => iptvQualityRank(a.label) - iptvQualityRank(b.label) || a.name.localeCompare(b.name));
    const first = group.qualities[0] || {};
    return {
      ...group,
      id: first.id || group.id,
      quality: first.label || group.quality,
      description: `${group.description}${group.qualities.length > 1 ? ` - ${group.qualities.map((q) => q.label).join(' / ')}` : ''}`,
    };
  });
}

function parseIptvQuality(name = '') {
  const text = String(name).toUpperCase();
  if (/\b(4K|UHD|2160P)\b/.test(text)) return '4K';
  if (/\b(FHD|FULL\s*HD|1080P)\b/.test(text)) return 'FHD';
  if (/\b(HD|720P)\b/.test(text)) return 'HD';
  if (/\b(SD|480P|360P)\b/.test(text)) return 'SD';
  return 'AUTO';
}

function iptvQualityRank(label = '') {
  return ({ SD: 1, HD: 2, FHD: 3, '4K': 4, AUTO: 5 })[String(label).toUpperCase()] || 9;
}

function parseIptvGroupName(name = '') {
  return String(name || 'IPTV')
    .replace(/\b(4K|UHD|2160P|FHD|FULL\s*HD|1080P|HD|720P|SD|480P|360P|LOW|AUTO)\b/gi, '')
    .replace(/\s*[-_()[\]]+\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || String(name || 'IPTV').trim() || 'IPTV';
}

function normalizeCloudId(id) {
  return String(id || '').replace(/^cloud-/i, '');
}

function getCloudIptvOverride(id) {
  const key = normalizeCloudId(id);
  const overrides = settings.cloudIptvOverrides && typeof settings.cloudIptvOverrides === 'object'
    ? settings.cloudIptvOverrides
    : {};
  return overrides[key] || null;
}

function applyCloudIptvOverride(channel) {
  const rawId = normalizeCloudId(channel.id);
  const override = getCloudIptvOverride(rawId);
  return {
    ...channel,
    id: String(channel.id).startsWith('cloud-') ? channel.id : `cloud-${rawId}`,
    enabled: override ? !!override.enabled : false,
    ownerEnabled: override ? !!override.enabled : false,
    transferLimitBytes: Math.max(0, Number(override?.transferLimitBytes ?? channel.transferLimitBytes) || 0),
  };
}

function updateCloudIptvOverride(id, patch = {}) {
  const rawId = normalizeCloudId(id);
  if (!rawId) throw new Error('Missing cloud IPTV id');
  const current = getCloudIptvOverride(rawId) || {};
  const next = {
    ...current,
    enabled: patch.enabled == null ? !!current.enabled : !!patch.enabled,
  };
  if (patch.transferLimitBytes != null) {
    next.transferLimitBytes = Math.max(0, Number(patch.transferLimitBytes) || 0);
  }
  settings = {
    ...settings,
    cloudIptvOverrides: {
      ...(settings.cloudIptvOverrides || {}),
      [rawId]: next,
    },
  };
  saveSettingsAndBackup('cloud-iptv-override');
  scheduleDeviceStatePush('cloud-iptv-override');
  return applyCloudIptvOverride(cloudIptv.getById(rawId) || { id: rawId, name: rawId, url: '', source: 'cloud' });
}

function setAllCloudIptvEnabled(enabled = true) {
  const channels = cloudIptv.list();
  const overrides = { ...(settings.cloudIptvOverrides || {}) };
  for (const ch of channels) {
    const rawId = normalizeCloudId(ch.id);
    if (!rawId) continue;
    overrides[rawId] = {
      ...(overrides[rawId] || {}),
      enabled: !!enabled,
      transferLimitBytes: Math.max(0, Number(overrides[rawId]?.transferLimitBytes ?? ch.transferLimitBytes) || 0),
    };
  }
  settings = { ...settings, cloudIptvOverrides: overrides };
  saveSettingsAndBackup('cloud-iptv-enable-all');
  scheduleDeviceStatePush('cloud-iptv-enable-all');
  return cloudIptv.list().map(applyCloudIptvOverride);
}

function createAppIcon() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, 'assets', 'icon.ico')
    : path.join(__dirname, 'assets', 'icon.png');
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
    width: 920,
    height: 720,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: '#07090f',
    title: APP_NAME + ' Agent',
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
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const icon = createAppIcon();
    tray = new Tray(icon);
    tray.setToolTip(APP_NAME + ' Agent');
    const menu = Menu.buildFromTemplate([
      { label: 'فتح WIVA Agent', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { label: 'فتح الإعداد / الإدارة', click: () => shell.openExternal(settings.setupCompleted ? agentUrls().adminLocal : agentUrls().setupLocal) },
      { label: 'فتح الإدارة', click: () => shell.openExternal(agentUrls().adminLocal) },
      { type: 'separator' },
      { label: 'إيقاف وخروج', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
  } catch (e) { /* tray unsupported */ }
}

// ---------- IPC ----------
ipcMain.handle('get-server-info', () => publicServerInfo());
ipcMain.handle('agent-state', () => agentState());
ipcMain.handle('port-check', (_e, port) => checkPortAvailability(port));
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
  // The renderer and LAN admin send the intended full replacement list.
  // Older merge protection made real deletions come back after saving.
  syncBroadcastChannelsFromDb({ persist: false });
  settings.channels = libraryDb.setBroadcastChannels(channels);
  try { settings.localIptvChannels = libraryDb.listIptv(); } catch {}
  saveSettingsAndBackup('broadcast-save-all');
  scheduleDeviceStatePush('broadcast-save-all');
  return settings.channels;
});
ipcMain.handle('broadcast-remove', (_e, id) => {
  if (!id) return Array.isArray(settings.channels) ? settings.channels : [];
  if (!libraryReady) {
    settings.channels = (settings.channels || []).filter((c) => c.id !== id);
    saveSettingsAndBackup('broadcast-remove-before-library-ready');
    return settings.channels;
  }
  libraryDb.removeBroadcastChannel(id);
  settings.channels = libraryDb.listBroadcastChannels();
  try { settings.localIptvChannels = libraryDb.listIptv(); } catch {}
  saveSettingsAndBackup('broadcast-remove');
  scheduleDeviceStatePush('broadcast-remove');
  return settings.channels;
});
ipcMain.handle('save-settings', async (_e, next) => {
  try {
    const previousLivePort = Number(settings.port) || DEFAULT_AGENT_PORT;
    const previousLibraryPort = Number(settings.libraryPort) || DEFAULT_LIBRARY_PORT;
    const patch = (next && typeof next === 'object') ? { ...next } : {};
    const hasAdminPasswordPatch = Object.prototype.hasOwnProperty.call(patch, 'adminPassword');
    if (Object.prototype.hasOwnProperty.call(patch, 'adminPassword')) {
      const password = String(patch.adminPassword || '').trim();
      if (password) patch.adminPasswordHash = hashAdminPassword(password);
      delete patch.adminPassword;
    }
    if (!hasAdminPasswordPatch) delete patch.adminPasswordHash;
    if (Object.prototype.hasOwnProperty.call(patch, 'neonDatabaseUrl')) {
      delete patch.neonDatabaseUrl;
      console.warn('[WIVA] ignored customer-side Neon URL edit; cloud database is owner controlled');
    }
    const hasChannels = Object.prototype.hasOwnProperty.call(patch, 'channels');
    if (hasChannels && !Array.isArray(patch.channels)) {
      console.warn('[WIVA] ignored invalid channels save payload');
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
        console.log('[WIVA] broadcast channels persisted:', settings.channels.length);
      } catch (e) {
        console.error('[WIVA] broadcast channel persistence FAILED:', e.message);
      }
    } else if (hasChannels && Array.isArray(channelPatch)) {
      settings.channels = channelPatch;
    } else if (libraryReady) {
      settings.channels = libraryDb.listBroadcastChannels();
      try { settings.localIptvChannels = libraryDb.listIptv(); } catch {}
    }

    saveSettingsAndBackup('settings');
    try { cloudIptv.setNeonDatabaseUrl(settings.neonDatabaseUrl || ''); } catch {}
    console.log('[WIVA] settings saved — keys:', Object.keys(rest).join(',') || '(none)');
    applyLoginItem();
    if (serverInfo && serverInfo.setBrand) {
      serverInfo.setBrand({
        brandName: settings.brandName,
        brandTagline: settings.brandTagline,
        accent: settings.accent,
        accent2: settings.accent2,
      });
    }
    const nextLivePort = Number(settings.port) || DEFAULT_AGENT_PORT;
    const nextLibraryPort = Number(settings.libraryPort) || DEFAULT_LIBRARY_PORT;
    if (nextLivePort !== previousLivePort) {
      await restartLiveServer(nextLivePort);
    }
    if (nextLibraryPort !== previousLibraryPort && libraryServerInfo?.close) {
      await libraryServerInfo.close();
      libraryServerInfo = libraryServer.start(nextLibraryPort, mediaServerOptions());
    }
    return publicSettings();
  } catch (e) {
    console.error('[WIVA] save-settings handler crashed:', e.message);
    return publicSettings();
  }
});
ipcMain.handle('restart-server', async (_e, port) => {
  return restartLiveServer(port);
});
ipcMain.handle('launched-at-boot', () => launchedAtBoot);
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
ipcMain.handle('qr-data-url', async (_e, target) => {
  const text = String(target || '').trim();
  if (!text) return '';
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 168,
    color: { dark: '#07101f', light: '#ffffff' },
  });
});
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

// ---------- Platform subscription IPC ----------
ipcMain.handle('platform-status', async () => platform.status());
ipcMain.handle('platform-refresh', async () => refreshPlatformStatus());
ipcMain.handle('platform-feature-allowed', (_e, feature) => platformFeatureAllowed(String(feature || '')));
ipcMain.handle('platform-request-activation', async (_e, payload) => requestPlatformActivation(payload));

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
  return { ...item, subtitles: subs, streamUrl: `http://127.0.0.1:${serverInfo?.port || settings.port || DEFAULT_AGENT_PORT}/media/${id}` };
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
    console.error('[WIVA] iptv-list local read failed:', e.message);
  }
  let cloud = [];
  try { cloud = cloudIptv.list().map(applyCloudIptvOverride); } catch (e) { console.error('[WIVA] iptv-list cloud read failed:', e.message); }
  return [...cloud, ...local];
});
ipcMain.handle('iptv-add', (_e, payload) => {
  try {
    const id = libraryDb.addIptv(payload || {});
    const row = libraryDb.getIptv(id);
    refreshSettingsChannelMirror('iptv-add');
    scheduleDeviceStatePush('iptv-add');
    console.log('[WIVA] iptv-add ok id=' + id + ' name=' + (row?.name || ''));
    return { ...row, source: 'local' };
  } catch (e) {
    console.error('[WIVA] iptv-add FAILED:', e.message);
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
ipcMain.handle('cloud-iptv-set-enabled', (_e, { id, enabled, transferLimitBytes }) => {
  return updateCloudIptvOverride(id, { enabled, transferLimitBytes });
});
ipcMain.handle('cloud-iptv-set-all-enabled', (_e, enabled) => setAllCloudIptvEnabled(enabled));
ipcMain.handle('iptv-probe', async (_e, payload) => {
  const url = typeof payload === 'string' ? payload : payload?.url;
  const headers = typeof payload === 'string' ? {} : (payload?.headers || {});
  return iptv.probe(url, headers);
});
ipcMain.handle('iptv-status', () => iptv.status());
ipcMain.handle('iptv-stream-url', (_e, id) => {
  const port = serverInfo?.port || settings.port || DEFAULT_AGENT_PORT;
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

  serverInfo = startSignalingServer({
    port: settings.port,
    mediaHandler: createMediaHandler(),
    getIptvChannels: publicIptvChannels,
    getBroadcastChannels: () => syncBroadcastChannelsFromDb({ persist: false }),
    getFeatureAllowed: platformFeatureAllowed,
  });
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
      console.log('[WIVA] storage diagnostics:', JSON.stringify(d));
    } catch {}
    console.log('[WIVA] persisted broadcast channels on startup:', (settings.channels || []).length);
    try {
      const existing = libraryDb.listIptv();
      console.log('[WIVA] persisted local IPTV channels on startup:', existing.length);
    } catch {}
    libraryServerInfo = libraryServer.start(settings.libraryPort || DEFAULT_LIBRARY_PORT, mediaServerOptions());
    console.log('[WIVA] library server on 127.0.0.1:' + libraryServerInfo.port);
  } catch (e) {
    console.error('[WIVA] library init failed:', e.message);
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
      console.log('[WIVA] initial cloud-iptv fetch:', (ch || []).length, 'channels');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cloud-iptv-updated');
      }
    }).catch((e) => console.error('[WIVA] initial cloud-iptv fetch failed:', e.message));
    cloudIptv.startAutoRefresh(() => settings.licenseKey || '', Math.max(1, Number(settings.cloudIptvRefreshMinutes) || 3) * 60 * 1000);
  } catch (e) { console.error('[WIVA] cloud iptv init failed:', e.message); }

  // Platform activation/subscription status. This is owner-controlled from Neon
  // and intentionally does not expose the database URL in the customer UI.
  try {
    platform.setCachePath(path.join(app.getPath('userData'), 'platform-cache.json'));
    platform.setNeonDatabaseUrl(settings.neonDatabaseUrl || '');
    refreshPlatformStatus().catch((e) => console.warn('[WIVA] platform refresh skipped:', e.message));
    setInterval(() => { refreshPlatformStatus().catch(() => {}); }, 60 * 60 * 1000);
  } catch (e) { console.error('[WIVA] platform init failed:', e.message); }

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
    console.warn('[WIVA] before-quit flush failed:', e?.message || e);
  }
});
app.on('window-all-closed', () => {
  if (!app.isQuitting) return;
  if (process.platform !== 'darwin') app.quit();
});
