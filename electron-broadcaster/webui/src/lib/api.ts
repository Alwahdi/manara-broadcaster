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
  [k: string]: unknown;
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
  category?: string;
  folder?: string;
  poster?: string;
  durationSec?: number;
  sourceId?: number;
  online?: boolean;
  [k: string]: unknown;
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
}

export interface ViewerAccount {
  id: number | string;
  name?: string;
  username?: string;
  online?: boolean;
  lastSeen?: string | number | null;
  [k: string]: unknown;
}

export interface ViewerMessage {
  id: number | string;
  from?: string;
  body?: string;
  status?: string;
  createdAt?: string | number;
  [k: string]: unknown;
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
  sessions?: unknown[];
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
  viewerState: () => http.get<Record<string, unknown>>("/api/viewer/state"),
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
  addLibrarySource: (body: { path: string; kind?: string; excludePaths?: string[] }) =>
    http.post<{ ok: boolean; sources: LibrarySource[]; inserted?: number; updated?: number }>(
      "/api/admin/library/sources",
      body,
    ),
  updateLibrarySource: (id: number | string, body: { label?: string; kind?: string; excludePaths?: string[] }) =>
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
  librarySourceRelink: (id: number | string, path: string) =>
    http.post<{ ok: boolean }>(`/api/admin/library/sources/${id}/relink`, { path }),

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

  // Reports & diagnostics
  reports: () => http.get<Record<string, unknown>>("/api/admin/reports"),
  diagnostics: () => http.get<Diagnostics>("/api/admin/diagnostics"),

  // Settings (persisted through the setup pipeline)
  saveSettings: (body: Record<string, unknown>) =>
    http.post<{ ok: boolean; state?: AgentState }>("/api/setup/save", body),
};
