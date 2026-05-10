import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";

import type { ProjectSummary, RecentEntry } from "./types";

const STORE_FILE = "library.json";
const PARSE_CACHE_FILE = "parse-cache.json";
const KEY_RECENT = "recent";
const KEY_RECENT_FOLDERS = "recentFolders";
const KEY_FOLDERS = "folders";
const KEY_TEXT_ZOOM = "textZoom";
const KEY_SHOW_FINGERPRINTS = "pluginRailShowFingerprints";
const KEY_THEME = "theme";

const THEME_MODES = ["system", "light", "dark"] as const;
type PersistedThemeMode = (typeof THEME_MODES)[number];

interface PersistedLibrary {
  recent: ReadonlyArray<RecentEntry>;
  recentFolders: ReadonlyArray<RecentEntry>;
}

let storePromise: ReturnType<typeof load> | null = null;
let parseCacheStorePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (storePromise === null) {
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

function getParseCacheStore() {
  if (parseCacheStorePromise === null) {
    parseCacheStorePromise = load(PARSE_CACHE_FILE);
  }
  return parseCacheStorePromise;
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
 * Read the persisted "show fingerprints" preference for the plug-in
 * rail (lpx-explorer-4l1). Returns `null` when nothing has been saved
 * yet — caller falls back to the ui-store default of `false`.
 */
export async function loadShowFingerprints(): Promise<boolean | null> {
  const store = await getStore();
  const raw = await store.get(KEY_SHOW_FINGERPRINTS);
  if (typeof raw !== "boolean") return null;
  return raw;
}

export async function persistShowFingerprints(show: boolean): Promise<void> {
  const store = await getStore();
  await store.set(KEY_SHOW_FINGERPRINTS, show);
  await store.save();
}

/**
 * Read the persisted theme preference (lpx-explorer-6zn). Returns
 * `null` when nothing has been saved yet (first launch) or the stored
 * value isn't one of `system | light | dark` — caller falls back to
 * the ui-store default of `'system'`.
 */
export async function loadThemePreference(): Promise<PersistedThemeMode | null> {
  const store = await getStore();
  const raw = await store.get(KEY_THEME);
  if (typeof raw !== "string") return null;
  if (!THEME_MODES.includes(raw as PersistedThemeMode)) return null;
  return raw as PersistedThemeMode;
}

export async function persistThemePreference(
  mode: PersistedThemeMode,
): Promise<void> {
  const store = await getStore();
  await store.set(KEY_THEME, mode);
  await store.save();
}

/**
 * Persisted parse cache (lpx-explorer-aay). One entry per .logicx
 * bundle path, keyed by ProjectData mtime + size — the only inputs
 * whose change can alter parse output. Stored in a dedicated
 * `parse-cache.json` (separate from `library.json`) because it grows
 * with library size; keeping the small/static prefs file untouched
 * avoids churn on every parse.
 *
 * Entries also carry a `parser_version` (lpx-explorer-ttb). When the
 * Rust parser changes its output for inputs we can't detect via stat
 * (e.g. the strip_id-based registry-name pairing), we bump
 * CURRENT_PARSER_VERSION so older entries are treated as cache
 * misses and re-parsed against the new code. Same disk file, no
 * cleanup required — orphans are inert.
 */
const CURRENT_PARSER_VERSION = 3;

export interface ParseCacheEntry {
  readonly parser_version: number;
  readonly mtime_unix: number;
  readonly size_bytes: number;
  readonly summary: ProjectSummary;
}

function isParseCacheEntry(value: unknown): value is ParseCacheEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.parser_version === "number" &&
    v.parser_version === CURRENT_PARSER_VERSION &&
    typeof v.mtime_unix === "number" &&
    typeof v.size_bytes === "number" &&
    typeof v.summary === "object" &&
    v.summary !== null
  );
}

export async function loadParseCache(): Promise<
  ReadonlyMap<string, ParseCacheEntry>
> {
  const store = await getParseCacheStore();
  const out = new Map<string, ParseCacheEntry>();
  for (const path of await store.keys()) {
    const raw = await store.get(path);
    if (isParseCacheEntry(raw)) {
      out.set(path, raw);
    }
  }
  return out;
}

/**
 * Write a parse-cache entry. Crucially does NOT call store.save() —
 * tauri-plugin-store-2.4.3 has auto_save = 100ms by default, and
 * during a fresh library scan persistParseCacheEntry fires once per
 * project (121× back-to-back on the user's library). 121 explicit
 * save() calls queued through the plugin's write loop blocked
 * shutdown — Cmd-Q wedged the app behind the drain (lpx-explorer-w6g).
 * Auto-save coalesces the burst into a single disk write ~100ms after
 * the last set. Worst-case loss on a hard quit is ~100ms of cache —
 * benign, since the cache is reproducible from disk.
 *
 * Callers pass a version-less entry; this function stamps
 * `parser_version: CURRENT_PARSER_VERSION` so callsites don't need
 * to import the constant.
 */
export async function persistParseCacheEntry(
  path: string,
  entry: Omit<ParseCacheEntry, "parser_version">,
): Promise<void> {
  const store = await getParseCacheStore();
  await store.set(path, { ...entry, parser_version: CURRENT_PARSER_VERSION });
}

export async function deleteParseCacheEntry(path: string): Promise<void> {
  const store = await getParseCacheStore();
  await store.delete(path);
}

/**
 * Push the active theme to the native View menu (lpx-explorer-3x8).
 * The Rust side rebuilds the menu with a checkmark on the matching
 * item and stores the value so subsequent `set_recent_menu` rebuilds
 * preserve the checkmark.
 */
export async function setThemeMenu(theme: PersistedThemeMode): Promise<void> {
  await invoke("set_theme_menu", { theme });
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
