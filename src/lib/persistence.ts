import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";

import type { RecentEntry } from "./types";

const STORE_FILE = "library.json";
const KEY_RECENT = "recent";
const KEY_RECENT_FOLDERS = "recentFolders";
const KEY_FOLDERS = "folders";
const KEY_TEXT_ZOOM = "textZoom";

interface PersistedLibrary {
  recent: ReadonlyArray<RecentEntry>;
  recentFolders: ReadonlyArray<RecentEntry>;
}

let storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (storePromise === null) {
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

function isRecentEntry(value: unknown): value is RecentEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecentEntry).path === "string" &&
    typeof (value as RecentEntry).name === "string" &&
    typeof (value as RecentEntry).lastLoadedMs === "number"
  );
}

function isRecentEntryArray(value: unknown): value is ReadonlyArray<RecentEntry> {
  return Array.isArray(value) && value.every(isRecentEntry);
}

async function isDir(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>("is_dir", { path });
  } catch {
    return false;
  }
}

async function filterExisting(
  entries: ReadonlyArray<RecentEntry>,
): Promise<ReadonlyArray<RecentEntry>> {
  const checks = await Promise.all(entries.map((e) => isDir(e.path)));
  return entries.filter((_, i) => checks[i] === true);
}

/**
 * Read persisted library state from disk and drop paths whose targets
 * no longer exist (renamed / deleted folders, vanished `.logicx`
 * bundles). Both `.logicx` projects and library folders live as
 * directories on macOS, so a single `is_dir` check suffices for both.
 */
export async function loadPersistedLibrary(): Promise<PersistedLibrary> {
  const store = await getStore();
  const recentRaw = await store.get(KEY_RECENT);
  const foldersRaw = await store.get(KEY_RECENT_FOLDERS);

  const recent = isRecentEntryArray(recentRaw) ? recentRaw : [];
  const recentFolders = isRecentEntryArray(foldersRaw) ? foldersRaw : [];

  const [existingRecent, existingFolders] = await Promise.all([
    filterExisting(recent),
    filterExisting(recentFolders),
  ]);

  return { recent: existingRecent, recentFolders: existingFolders };
}

export async function persistLibrary(
  recent: ReadonlyArray<RecentEntry>,
  recentFolders: ReadonlyArray<RecentEntry>,
): Promise<void> {
  const store = await getStore();
  await store.set(KEY_RECENT, recent);
  await store.set(KEY_RECENT_FOLDERS, recentFolders);
  await store.save();
}

/**
 * Read the persisted active-folders list. The `folders` slice on
 * `useLibraryStore` carries scan status and a project array — those
 * are derived (rescanned on hydration), so persistence stores only the
 * folder paths. Filters non-string entries AND paths whose targets no
 * longer exist on disk (renamed / deleted between launches). Per
 * lpx-explorer-vn5.
 */
export async function loadPersistedFolderPaths(): Promise<ReadonlyArray<string>> {
  const store = await getStore();
  const raw = await store.get(KEY_FOLDERS);
  if (!Array.isArray(raw)) return [];
  const stringPaths = raw.filter((p): p is string => typeof p === "string");
  const checks = await Promise.all(stringPaths.map((p) => isDir(p)));
  return stringPaths.filter((_, i) => checks[i] === true);
}

export async function persistFolderPaths(
  paths: ReadonlyArray<string>,
): Promise<void> {
  const store = await getStore();
  await store.set(KEY_FOLDERS, paths);
  await store.save();
}

/**
 * Read the persisted text-zoom multiplier. Returns `null` when nothing
 * has been saved yet (first launch) or the stored value is malformed
 * — caller falls back to the ui-store default.
 */
export async function loadTextZoom(): Promise<number | null> {
  const store = await getStore();
  const raw = await store.get(KEY_TEXT_ZOOM);
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  return raw;
}

export async function persistTextZoom(zoom: number): Promise<void> {
  const store = await getStore();
  await store.set(KEY_TEXT_ZOOM, zoom);
  await store.save();
}

/**
 * Push the recent lists to the native menu. The Rust side rebuilds the
 * "Open Recent Project" / "Open Recent Folder" submenus from the
 * supplied path + display-name pairs.
 */
export async function setRecentMenu(
  recent: ReadonlyArray<RecentEntry>,
  recentFolders: ReadonlyArray<RecentEntry>,
): Promise<void> {
  const toMenuItem = (e: RecentEntry) => ({ path: e.path, name: e.name });
  await invoke("set_recent_menu", {
    recentProjects: recent.map(toMenuItem),
    recentFolders: recentFolders.map(toMenuItem),
  });
}
