import { invoke } from "@tauri-apps/api/core";

import { useLibraryStore } from "../store/library-store";

import {
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
