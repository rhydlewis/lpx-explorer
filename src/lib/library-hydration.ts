import { invoke } from "@tauri-apps/api/core";

import { useLibraryStore } from "../store/library-store";
import { useUIStore } from "../store/ui-store";

import {
  loadPersistedFolderPaths,
  loadPersistedLibrary,
  persistFolderPaths,
  persistLibrary,
  setRecentMenu,
} from "./persistence";

/**
 * Subscribe to LibraryStore changes and persist the deltas — recents,
 * recent folders, and the active-folder paths. Extracted from App.tsx's
 * hydration effect so the effect itself stays under the cognitive-
 * complexity / line-count budget.
 */
export function subscribeLibraryPersistence(persisted: {
  recent: ReadonlyArray<{ readonly path: string }>;
  recentFolders: ReadonlyArray<{ readonly path: string }>;
}): () => void {
  let prevRecent = persisted.recent;
  let prevRecentFolders = persisted.recentFolders;
  let prevFolderPaths = useLibraryStore
    .getState()
    .folders.map((f) => f.path);
  return useLibraryStore.subscribe((state) => {
    if (
      state.recent !== prevRecent ||
      state.recentFolders !== prevRecentFolders
    ) {
      prevRecent = state.recent;
      prevRecentFolders = state.recentFolders;
      void persistLibrary(state.recent, state.recentFolders);
      void setRecentMenu(state.recent, state.recentFolders);
    }
    const nextFolderPaths = state.folders.map((f) => f.path);
    if (folderPathsDiffer(prevFolderPaths, nextFolderPaths)) {
      prevFolderPaths = nextFolderPaths;
      void persistFolderPaths(nextFolderPaths);
    }
  });
}

export function folderPathsDiffer(
  prev: ReadonlyArray<string>,
  next: ReadonlyArray<string>,
): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) return true;
  }
  return false;
}

/**
 * Run the full library-hydration sequence on App mount: load persisted
 * recents/folders from disk, push them into the library store, rebuild
 * the native macOS Recent menu, kick off folder scans, auto-add the
 * default library on first launch, and register the persistence
 * subscriber. Returns a cleanup thunk that cancels in-flight async
 * work and unsubscribes the store listener.
 */
export function runLibraryHydration(): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    console.info("[hydrate] start");
    const persisted = await loadPersistedLibrary();
    console.info(
      `[hydrate] loaded recents=${persisted.recent.length} recentFolders=${persisted.recentFolders.length}`,
    );
    if (cancelled) return;
    useLibraryStore.getState().hydrate(persisted);
    await setRecentMenu(persisted.recent, persisted.recentFolders);
    if (cancelled) return;

    const persistedFolderPaths = await loadPersistedFolderPaths();
    console.info(
      `[hydrate] persistedFolderPaths=${persistedFolderPaths.length} ${JSON.stringify(persistedFolderPaths)}`,
    );
    if (cancelled) return;
    for (const path of persistedFolderPaths) {
      if (cancelled) return;
      console.info(`[hydrate] addFolder begin ${path}`);
      await useLibraryStore.getState().addFolder(path);
      console.info(`[hydrate] addFolder done ${path}`);
    }

    const isFirstLaunch =
      persisted.recent.length === 0 && persisted.recentFolders.length === 0;
    console.info(`[hydrate] isFirstLaunch=${isFirstLaunch}`);
    if (isFirstLaunch) {
      await maybeAutoAddDefaultLibrary(() => cancelled);
    }
    if (cancelled) return;

    // If exactly one folder is in the rail (auto-added or restored),
    // surface its tile grid by default. Multiple folders means the
    // user has organised their library — let them pick which one.
    const initialFolders = useLibraryStore.getState().folders;
    console.info(`[hydrate] initialFolders=${initialFolders.length}`);
    if (initialFolders.length === 1) {
      useUIStore.getState().setSelectedLibraryFolder(initialFolders[0]!.path);
    }

    unsubscribe = subscribeLibraryPersistence(persisted);
    // Persist folder additions made during hydration — chiefly the
    // ~/Music/Logic auto-add, which mutates the store before the
    // subscriber above is registered. Idempotent.
    const finalPaths = initialFolders.map((f) => f.path);
    if (folderPathsDiffer(persistedFolderPaths, finalPaths)) {
      void persistFolderPaths(finalPaths);
    }
    console.info("[hydrate] complete");
  })();

  return () => {
    cancelled = true;
    if (unsubscribe !== null) unsubscribe();
  };
}

/**
 * If `~/Music/Logic` exists, register it as a library folder. Used on
 * truly-first launch only (gated upstream by recents + recentFolders
 * both empty). The `isCancelled` thunk lets the caller abort if the
 * App component unmounts mid-flight.
 */
export async function maybeAutoAddDefaultLibrary(
  isCancelled: () => boolean,
): Promise<void> {
  const home = await invoke<string | null>("home_dir");
  if (home === null || isCancelled()) return;
  const defaultLib = `${home}/Music/Logic`;
  const exists = await invoke<boolean>("is_dir", { path: defaultLib });
  if (!exists || isCancelled()) return;
  await useLibraryStore.getState().addFolder(defaultLib);
}
