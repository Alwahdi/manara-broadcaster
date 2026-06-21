const { contextBridge, ipcRenderer } = require('electron');

let storageReady = false;
const storageWaiters = [];
ipcRenderer.on('storage-ready', () => {
  storageReady = true;
  while (storageWaiters.length) storageWaiters.shift()();
});

function waitForStorage() {
  if (storageReady) return Promise.resolve();
  return new Promise((resolve) => storageWaiters.push(resolve));
}

contextBridge.exposeInMainWorld('broadcaster', {
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  getLocalIPs: () => ipcRenderer.invoke('get-local-ips'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  getBroadcastChannels: () => ipcRenderer.invoke('broadcast-list'),
  saveBroadcastChannels: (channels) => ipcRenderer.invoke('broadcast-save-all', channels),
  removeBroadcastChannel: (id) => ipcRenderer.invoke('broadcast-remove', id),
  waitForStorage,
  restartServer: (port) => ipcRenderer.invoke('restart-server', port),
  launchedAtBoot: () => ipcRenderer.invoke('launched-at-boot'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  storageDiagnostics: () => ipcRenderer.invoke('storage-diagnostics'),
  onLocalStateUpdated: (cb) => {
    const h = () => cb();
    ipcRenderer.on('local-state-updated', h);
    return () => ipcRenderer.removeListener('local-state-updated', h);
  },
  onStorageReady: (cb) => {
    const h = () => cb();
    ipcRenderer.on('storage-ready', h);
    if (storageReady) setTimeout(h, 0);
    return () => ipcRenderer.removeListener('storage-ready', h);
  },

  // License
  licenseStatus: () => ipcRenderer.invoke('license-status'),
  licenseActivate: (key) => ipcRenderer.invoke('license-activate', key),
  licenseHardwareId: () => ipcRenderer.invoke('license-hardware-id'),
  onLicenseStatus: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on('license-status', h);
    return () => ipcRenderer.removeListener('license-status', h);
  },

  // Platform subscription / activation
  platformStatus: () => ipcRenderer.invoke('platform-status'),
  platformRefresh: () => ipcRenderer.invoke('platform-refresh'),
  platformFeatureAllowed: (feature) => ipcRenderer.invoke('platform-feature-allowed', feature),
  platformRequestActivation: (payload) => ipcRenderer.invoke('platform-request-activation', payload),
  onPlatformStatus: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on('platform-status', h);
    return () => ipcRenderer.removeListener('platform-status', h);
  },

  // Auto-update
  updateStatus: () => ipcRenderer.invoke('update-status'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdateStatus: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on('update-status', h);
    return () => ipcRenderer.removeListener('update-status', h);
  },

  // Library
  libraryPaths: () => ipcRenderer.invoke('library-paths'),
  libraryAddPath: (kind) => ipcRenderer.invoke('library-add-path', kind),
  libraryRemovePath: (id) => ipcRenderer.invoke('library-remove-path', id),
  libraryScan: () => ipcRenderer.invoke('library-scan'),
  libraryList: (opts) => ipcRenderer.invoke('library-list', opts),
  libraryGet: (id) => ipcRenderer.invoke('library-get', id),
  libraryProgress: (data) => ipcRenderer.invoke('library-progress', data),
  libraryPort: () => ipcRenderer.invoke('library-port'),
  onLibraryScan: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on('library-scan-progress', h);
    return () => ipcRenderer.removeListener('library-scan-progress', h);
  },

  // IPTV
  iptvList: () => ipcRenderer.invoke('iptv-list'),
  iptvAdd: (payload) => ipcRenderer.invoke('iptv-add', payload),
  iptvUpdate: (id, patch) => ipcRenderer.invoke('iptv-update', { id, patch }),
  iptvRemove: (id) => ipcRenderer.invoke('iptv-remove', id),
  iptvProbe: (url, headers) => ipcRenderer.invoke('iptv-probe', { url, headers }),
  iptvStatus: () => ipcRenderer.invoke('iptv-status'),
  iptvStreamUrl: (id) => ipcRenderer.invoke('iptv-stream-url', id),
  cloudIptvSetEnabled: (id, enabled, transferLimitBytes) => ipcRenderer.invoke('cloud-iptv-set-enabled', { id, enabled, transferLimitBytes }),
  cloudIptvSetAllEnabled: (enabled) => ipcRenderer.invoke('cloud-iptv-set-all-enabled', enabled),
  cloudIptvRefresh: () => ipcRenderer.invoke('cloud-iptv-refresh'),
  cloudIptvStatus: () => ipcRenderer.invoke('cloud-iptv-status'),
  onCloudIptvUpdated: (cb) => {
    const h = () => cb();
    ipcRenderer.on('cloud-iptv-updated', h);
    return () => ipcRenderer.removeListener('cloud-iptv-updated', h);
  },
});
