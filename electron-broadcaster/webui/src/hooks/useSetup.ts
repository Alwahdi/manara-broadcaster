import { useSyncExternalStore } from "react";

export interface SetupData {
  networkName?: string;
  country?: string;
  city?: string;
  timezone?: string;
  adminUsername?: string;
  adminPassword?: string;
  brandName?: string;
  networkLogoDataUrl?: string;
  livePort?: string;
  adminPort?: string;
  experienceLayout?: string;
  adminPath?: string;
}

const KEY = "wiva.setup.draft";
let state: SetupData = load();
const listeners = new Set<() => void>();

function load(): SetupData {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "{}");
    // Old setup drafts collected content without importing it; retain only core setup.
    const clean = { ...saved, adminPassword: undefined, libraryPath: undefined, iptvUrl: undefined };
    sessionStorage.setItem(KEY, JSON.stringify(clean));
    return clean;
  } catch {
    return {};
  }
}

function persist() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...state, adminPassword: undefined }));
  } catch {
    /* ignore storage errors on locked-down devices */
  }
}

export function setSetup(patch: Partial<SetupData>) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((l) => l());
}

export function clearSetup() {
  state = {};
  persist();
  listeners.forEach((l) => l());
}

export function useSetup(): SetupData {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
