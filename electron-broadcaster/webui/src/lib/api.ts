// Typed client for the WIVA Agent REST API.
// All calls are same-origin (the Agent serves this app), so they work offline on the LAN.

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
      ...init,
    });
  } catch (e) {
    throw new ApiError(
      "تعذّر الاتصال بالوكيل المحلي. تأكد من أن الخدمة تعمل على الشبكة.",
      0,
      e,
    );
  }
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "") ||
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "") || `فشل الطلب (${res.status})`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/* ---------------- Types ---------------- */

export interface AgentState {
  version?: string;
  setupCompleted?: boolean;
  brandName?: string;
  brandTagline?: string;
  networkName?: string;
  networkLogoDataUrl?: string;
  urls?: Record<string, string>;
  ports?: { live?: number; library?: number; [k: string]: unknown };
  autoStart?: {
    afterLogin?: boolean;
    afterLoginRegistered?: boolean;
    afterLoginStatus?: string;
    beforeLogin?: boolean;
    beforeLoginSupported?: boolean;
    beforeLoginInstalled?: boolean;
    beforeLoginTaskName?: string;
    beforeLoginTaskState?: string;
    error?: string;
  };
  settings?: Record<string, unknown>;
  subscription?: PlatformStatus;
  update?: UpdateStatus;
  [k: string]: unknown;
}

export interface UpdateStatus {
  state?: "idle" | "checking" | "available" | "none" | "downloading" | "ready" | "installing" | "error" | string;
  version?: string;
  currentVersion?: string;
  percent?: number;
  message?: string;
  error?: string;
  supported?: boolean;
  automatic?: boolean;
}

export interface PlatformInstance {
  id?: string;
  state?: string;
  status?: string;
  tenantName?: string;
  contactEmail?: string;
  contactPhone?: string;
  plan?: string;
  features?: Record<string, boolean>;
  subscriptionExpiresAt?: string | null;
  supportNote?: string;
  [k: string]: unknown;
}

export interface PlatformStatus {
  state?: "active" | "pending" | "expired" | "suspended" | "unregistered" | "offline" | "cached" | string;
  online?: boolean;
  instance?: PlatformInstance | null;
  features?: Record<string, boolean>;
  activationId?: string;
  checkedAt?: string | null;
  error?: string;
  [k: string]: unknown;
}

export interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  kind?: string;
  format?: string;
  category?: string;
  folder?: string;
  poster?: string;
  durationSec?: number;
  sourceId?: number;
  online?: boolean;
  [k: string]: unknown;
}

export interface LibraryScanStatus {
  state: "idle" | "running" | "complete" | "error" | "cancelled" | string;
  active: boolean;
  queued?: boolean;
  stage?: string;
  done?: number;
  total?: number;
  percent?: number;
  message?: string;
  sourceId?: number | string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
  error?: string;
  result?: {
    addedOrUpdated?: number;
    unchanged?: number;
    removedMissing?: number;
    books?: number;
    documents?: number;
    [k: string]: unknown;
  } | null;
}

export interface Channel {
  id: number | string;
  name: string;
  url?: string;
  playUrl?: string;
  enabled?: boolean | number;
  kind?: string;
  type?: string;
  logo?: string;
  group?: string;
  category?: string;
  description?: string;
  source?: Record<string, unknown> | string;
  audioDeviceId?: string;
  audioDeviceName?: string;
  resolution?: string;
  fps?: number;
  bitrateKbps?: number;
  audioBitrateKbps?: number;
  audioMode?: string;
  audioGain?: number;
  transferLimitBytes?: number;
  qualities?: { id: string | number; label?: string; name?: string }[];
  [k: string]: unknown;
}

export interface CaptureSources {
  screens: CaptureSource[];
  windows: CaptureSource[];
  videoDevices: CaptureSource[];
  audioDevices: CaptureSource[];
  message?: string;
}
export interface CaptureSource {
  id: string;
  name: string;
  thumbnail?: string;
  [k: string]: unknown;
}

export interface StorageRoot {
  path: string;
  label?: string;
  type?: string;
  free?: number;
  total?: number;
  online?: boolean;
}
export interface StorageEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
}
export interface StorageListing {
  path: string;
  parent?: string | null;
  entries: StorageEntry[];
  error?: string;
}

export interface LibrarySource {
  id: number;
  name?: string;
  label?: string;
  path: string;
  online?: boolean;
  mediaCount?: number;
  lastScan?: string | number | null;
  excludePaths?: string[];
  exclude_paths?: string[];
  hideEmptyFolders?: boolean;
  hide_empty_folders?: number;
  [k: string]: unknown;
}

export interface LibraryBrowseEntry {
  type: "folder" | "media";
  sourceId?: number | string;
  name: string;
  path: string;
  fullPath?: string;
  count?: number;
  cover?: string;
  online?: boolean;
  media?: MediaItem;
}

export interface LibraryBrowsePayload {
  sourceId?: number | string;
  source?: LibrarySource | null;
  path: string;
  breadcrumbs: { name: string; path: string }[];
  entries: LibraryBrowseEntry[];
  sources?: LibrarySource[];
  search?: string;
}

export interface ViewerAccount {
  id: number | string;
  viewerId?: string;
  name?: string;
  username?: string;
  phone?: string;
  email?: string;
  online?: boolean;
  lastSeen?: string | number | null;
  lastSeenAt?: string | number | null;
  [k: string]: unknown;
}

export interface ViewerMessage {
  id: number | string;
  from?: string;
  name?: string;
  phone?: string;
  email?: string;
  body?: string;
  message?: string;
  context?: string;
  status?: string;
  createdAt?: string | number;
  [k: string]: unknown;
}

export interface AdminSession {
  ip?: string;
  userAgent?: string;
  path?: string;
  targetType?: string;
  targetName?: string;
  requests?: number;
  bytes?: number;
  firstSeenAt?: string | number;
  lastSeenAt?: string | number;
  [k: string]: unknown;
}

export interface ViewerState {
  account?: ViewerAccount | null;
  signedIn?: boolean;
  favorites?: MediaItem[];
  favoriteIds?: string[];
  watchLater?: MediaItem[];
  watchLaterIds?: string[];
  history?: Array<{ mediaId: string; media?: MediaItem; position?: number; duration?: number; completed?: boolean }>;
  permissions?: { manageLibrary?: boolean };
  libraryPolicy?: LibraryPolicy;
  broadcast?: Channel[];
  iptv?: Channel[];
  channels?: Channel[];
  [k: string]: unknown;
}

export interface LibraryPolicy {
  downloadsEnabled: boolean;
  downloadRateBytesPerSecond: number;
}

export interface Diagnostics {
  health?: Record<string, unknown>;
  system?: Record<string, unknown>;
  services?: { name: string; ok: boolean; detail?: string }[];
  [k: string]: unknown;
}

export interface AdminState {
  broadcast?: Channel[];
  iptv?: Channel[];
  cloudIptv?: Channel[];
  iptvPolicy?: { iptvGlobalLimitBytes?: number; cloudIptvRefreshMinutes?: number };
  media?: MediaItem[];
  mediaStats?: Record<string, number>;
  sessions?: AdminSession[];
  viewerAccounts?: ViewerAccount[];
  viewerMessages?: ViewerMessage[];
  blocks?: unknown[];
  logs?: unknown[];
  [k: string]: unknown;
}

/* ---------------- Endpoints ---------------- */

export const api = {
  // Agent + viewer
  agentState: () => http.get<AgentState>("/api/agent/state"),
  adminState: () => http.get<AdminState>("/api/admin/state"),
  viewerState: () => http.get<ViewerState>("/api/viewer/state"),
  viewerSignup: (body: { name: string; phone: string; email?: string }) =>
    http.post<{ ok: boolean; account: ViewerAccount; viewer: ViewerState }>("/api/viewer/signup", body),
  viewerSignin: (body: { name: string; phone: string; email?: string }) =>
    http.post<{ ok: boolean; account: ViewerAccount; viewer: ViewerState }>("/api/viewer/signin", body),
  viewerLogout: () => http.post<{ ok: boolean }>("/api/viewer/logout"),
  viewerMessages: () => http.get<{ messages: ViewerMessage[] }>("/api/viewer/messages"),
  sendViewerMessage: (body: { message: string; context?: string }) =>
    http.post<{ ok: boolean; message: ViewerMessage }>("/api/viewer/message", body),
  updateViewerList: (body: { list: "favorites" | "watchLater"; mediaId: string | number; active: boolean }) =>
    http.post<ViewerState>("/api/viewer/list", body),
  requestActivation: (body: Record<string, unknown>) =>
    http.post<{ ok: boolean; subscription?: PlatformStatus }>("/api/platform/activation", body),
  refreshPlatform: () =>
    http.post<{ ok: boolean; subscription?: PlatformStatus }>("/api/platform/refresh"),

  // Library / media
  library: (params?: Record<string, string>) =>
    http.get<{ items: MediaItem[]; media?: MediaItem[]; folders?: string[] }>(
      "/api/library" + (params ? "?" + new URLSearchParams(params).toString() : ""),
    ),
  libraryBrowse: (params?: Record<string, string>) =>
    http.get<LibraryBrowsePayload>(
      "/api/library/browse" + (params ? "?" + new URLSearchParams(params).toString() : ""),
    ),
  media: (id: number | string) => http.get<MediaItem>(`/api/media/${id}`),
  mediaProgress: (id: number | string, body: { position: number; duration: number; completed?: boolean }) =>
    http.post<{ ok: boolean }>(`/api/media/${id}/progress`, body),

  // Capture wizard
  captureDevices: () => http.get<CaptureSources>("/api/admin/capture/devices"),
  captureScreens: () => http.get<{ screens: CaptureSource[] }>("/api/admin/capture/screens"),
  captureWindows: () => http.get<{ windows: CaptureSource[] }>("/api/admin/capture/windows"),
  captureAudioDevices: () =>
    http.get<{ audioDevices: CaptureSource[] }>("/api/admin/capture/audio-devices"),
  captureProbe: (body: unknown) =>
    http.post<{ ok: boolean; message?: string; preview?: string }>("/api/admin/capture/probe", body),

  // Storage browser
  storageRoots: () => http.get<{ roots: StorageRoot[] }>("/api/admin/storage/roots"),
  storageBrowse: (path: string) =>
    http.get<StorageListing>("/api/admin/storage/browse?path=" + encodeURIComponent(path)),
  storageValidate: (path: string) =>
    http.post<{ ok: boolean; message?: string }>("/api/admin/storage/validate", { path }),

  // Library sources
  librarySources: () => http.get<{ sources: LibrarySource[] }>("/api/admin/library/sources"),
  addLibrarySource: (body: { path: string; kind?: string; excludePaths?: string[]; hideEmptyFolders?: boolean }) =>
    http.post<{ ok: boolean; sources: LibrarySource[]; inserted?: number; updated?: number }>(
      "/api/admin/library/sources",
      body,
    ),
  updateLibrarySource: (id: number | string, body: { label?: string; kind?: string; excludePaths?: string[]; hideEmptyFolders?: boolean }) =>
    http.put<{ ok: boolean; source: LibrarySource; sources: LibrarySource[] }>(
      `/api/admin/library/sources/${id}`,
      body,
    ),
  removeLibrarySource: (id: number | string) =>
    http.del<{ ok: boolean; sources: LibrarySource[] }>(`/api/admin/library/sources/${id}`),
  addLibrarySourceExclude: (id: number | string, path: string) =>
    http.post<{ ok: boolean; source: LibrarySource; sources: LibrarySource[] }>(
      `/api/admin/library/sources/${id}/excludes`,
      { path },
    ),
  removeLibrarySourceExclude: (id: number | string, path: string) =>
    http.del<{ ok: boolean; source: LibrarySource; sources: LibrarySource[] }>(
      `/api/admin/library/sources/${id}/excludes?path=${encodeURIComponent(path)}`,
    ),
  librarySourceRescan: (id: number | string) =>
    http.post<{ ok: boolean }>(`/api/admin/library/sources/${id}/rescan`),
  libraryScanAll: () => http.post<{ ok: boolean }>("/api/admin/scan"),
  libraryScanStatus: () =>
    http.get<{ status: LibraryScanStatus }>("/api/admin/library/scan-status"),
  libraryPolicy: () =>
    http.get<{ policy: LibraryPolicy }>("/api/admin/library/policy"),
  updateLibraryPolicy: (body: Partial<LibraryPolicy>) =>
    http.put<{ ok: boolean; policy: LibraryPolicy }>("/api/admin/library/policy", body),
  cancelLibraryScan: () =>
    http.post<{ ok: boolean; status: LibraryScanStatus }>("/api/admin/library/scan-cancel"),
  librarySourceRelink: (id: number | string, path: string) =>
    http.post<{ ok: boolean }>(`/api/admin/library/sources/${id}/relink`, { path }),
  uploadLibraryFile: (
    sourceId: number | string,
    folderPath: string,
    file: File,
    onProgress?: (percent: number) => void,
  ) => new Promise<{ ok: boolean; name: string; bytes: number; media?: MediaItem | null }>((resolve, reject) => {
    const params = new URLSearchParams({ sourceId: String(sourceId), path: folderPath, name: file.name });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/library/upload?${params.toString()}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError("تعذر الاتصال أثناء رفع الملف.", 0));
    xhr.onload = () => {
      let payload: unknown = undefined;
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : undefined; } catch { payload = xhr.responseText; }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(payload as { ok: boolean; name: string; bytes: number; media?: MediaItem | null });
      const message = payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `تعذر رفع الملف (${xhr.status})`;
      reject(new ApiError(message, xhr.status, payload));
    };
    xhr.send(file);
  }),

  // IPTV
  iptv: () => http.get<{ channels: Channel[] }>("/api/admin/iptv"),
  iptvImportPreview: (body: unknown) =>
    http.post<{ channels: Channel[]; count: number; message?: string }>(
      "/api/admin/iptv/import/preview",
      body,
    ),
  iptvImportCommit: (body: unknown) =>
    http.post<{ ok: boolean; added: number }>("/api/admin/iptv/import/commit", body),
  addIptv: (body: unknown) => http.post<Channel>("/api/admin/iptv", body),
  updateIptv: (id: number | string, body: unknown) => http.put<Channel>(`/api/admin/iptv/${id}`, body),
  deleteIptv: (id: number | string) => http.del<{ ok: boolean }>(`/api/admin/iptv/${id}`),
  toggleIptv: (id: number | string) => http.post<Channel>(`/api/admin/iptv/${id}/toggle`),
  updateIptvPolicy: (body: unknown) => http.put<{ ok: boolean; policy: AdminState["iptvPolicy"] }>("/api/admin/iptv-policy", body),

  // Channels (broadcast / capture)
  addChannel: (body: unknown) => http.post<Channel>("/api/admin/broadcast", body),
  updateChannel: (id: number | string, body: unknown) => http.put<Channel>(`/api/admin/broadcast/${id}`, body),
  deleteChannel: (id: number | string) => http.del<{ channels: Channel[] }>(`/api/admin/broadcast/${id}`),

  // People & messaging
  viewers: () => http.get<{ viewers: ViewerAccount[] }>("/api/admin/viewers"),
  messages: () => http.get<{ messages: ViewerMessage[] }>("/api/admin/messages"),
  updateMessageStatus: (id: number | string, status: "new" | "read" | "done") =>
    http.post<{ message: ViewerMessage }>(`/api/admin/viewer-messages/${id}/status`, { status }),

  // Reports & diagnostics
  reports: () => http.get<Record<string, unknown>>("/api/admin/reports"),
  diagnostics: () => http.get<Diagnostics>("/api/admin/diagnostics"),
  updateStatus: () => http.get<{ ok: boolean; update: UpdateStatus }>("/api/admin/update"),
  checkUpdate: () => http.post<{ ok: boolean; error?: string; state?: string; version?: string }>("/api/admin/update/check"),
  downloadUpdate: () => http.post<{ ok: boolean; error?: string; state?: string; version?: string }>("/api/admin/update/download"),
  installUpdate: () => http.post<{ ok: boolean; error?: string; state?: string; version?: string }>("/api/admin/update/install"),

  // Settings (persisted through the setup pipeline)
  saveSettings: (body: Record<string, unknown>) =>
    http.post<{ ok: boolean; state?: AgentState }>("/api/setup/save", body),
};
