import { create } from "zustand";

import { scanFolder } from "../lib/library";
import { folderNameOf, projectNameOf } from "../lib/path-utils";
import type { FolderEntry, RecentEntry, ScanStatus } from "../lib/types";
import { useProjectStore } from "./project-store";

/** macOS HIG: ~10 recent items in File menus. */
export const RECENT_LIMIT = 10;

export interface LibraryState {
  recent: ReadonlyArray<RecentEntry>;
  /**
   * Every folder ever scanned, persisted across launches. Distinct from
   * `folders` (which holds only the currently-active scan targets shown
   * in the rail). Removing from the rail does not remove from this list.
   */
  recentFolders: ReadonlyArray<RecentEntry>;
  folders: ReadonlyArray<FolderEntry>;
  query: string;
  addRecent: (path: string, nowMs?: number) => void;
  addRecentFolder: (path: string, nowMs?: number) => void;
  removeRecent: (path: string) => void;
  clearRecent: () => void;
  clearRecentFolders: () => void;
  /**
   * One-shot bulk-set used by the persistence layer at app boot — after
   * loading from `tauri-plugin-store` and dropping paths whose targets
   * no longer exist on disk.
   */
  hydrate: (state: {
    recent: ReadonlyArray<RecentEntry>;
    recentFolders: ReadonlyArray<RecentEntry>;
  }) => void;
  addFolder: (path: string) => Promise<void>;
  removeFolder: (path: string) => void;
  startScan: (path: string) => Promise<void>;
  cancelScan: (path: string) => void;
  setQuery: (q: string) => void;
  clear: () => void;
}

const messageOf = (e: unknown): string => {
  if (e instanceof Error) {
    return e.message;
  }
  // Tauri rejects with a serialized `ScanError`: `{kind, message}`. Pull
  // `.message` out so the inline ErrorCard reads "folder not found: …"
  // instead of `[object Object]`.
  if (typeof e === "object" && e !== null && "message" in e) {
    const msg = (e as { message: unknown }).message;
    if (typeof msg === "string") {
      return msg;
    }
  }
  return String(e);
};

function updateFolderStatus(
  folders: ReadonlyArray<FolderEntry>,
  path: string,
  status: ScanStatus,
): ReadonlyArray<FolderEntry> {
  return folders.map((f) => (f.path === path ? { ...f, status } : f));
}

function appendFolderProject(
  folders: ReadonlyArray<FolderEntry>,
  path: string,
  project: string,
): ReadonlyArray<FolderEntry> {
  return folders.map((f) =>
    f.path === path ? { ...f, projects: [...f.projects, project] } : f,
  );
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  recent: [],
  recentFolders: [],
  folders: [],
  query: "",

  addRecent: (path: string, nowMs?: number) => {
    const lastLoadedMs = nowMs ?? Date.now();
    const entry: RecentEntry = { path, name: projectNameOf(path), lastLoadedMs };
    set((state) => {
      const without = state.recent.filter((r) => r.path !== path);
      return { recent: [entry, ...without].slice(0, RECENT_LIMIT) };
    });
  },

  addRecentFolder: (path: string, nowMs?: number) => {
    const lastLoadedMs = nowMs ?? Date.now();
    const entry: RecentEntry = { path, name: folderNameOf(path), lastLoadedMs };
    set((state) => {
      const without = state.recentFolders.filter((r) => r.path !== path);
      return { recentFolders: [entry, ...without].slice(0, RECENT_LIMIT) };
    });
  },

  removeRecent: (path: string) => {
    set((state) => ({
      recent: state.recent.filter((r) => r.path !== path),
    }));
  },

  clearRecent: () => {
    set({ recent: [] });
  },

  clearRecentFolders: () => {
    set({ recentFolders: [] });
  },

  hydrate: (state) => {
    set({
      recent: state.recent.slice(0, RECENT_LIMIT),
      recentFolders: state.recentFolders.slice(0, RECENT_LIMIT),
    });
  },

  addFolder: async (path: string) => {
    // Always record a recent-folder entry, even if the folder is
    // already in the rail. That way "Open Recent Folder" reflects the
    // most-recent-first ordering by access time.
    get().addRecentFolder(path);
    if (get().folders.some((f) => f.path === path)) {
      return;
    }
    set((state) => ({
      folders: [
        ...state.folders,
        { path, status: { kind: "idle" }, projects: [] },
      ],
    }));
    await get().startScan(path);
  },

  removeFolder: (path: string) => {
    const removed = get().folders.find((f) => f.path === path);
    set((state) => ({
      folders: state.folders.filter((f) => f.path !== path),
    }));
    // Clear the Inspector if the loaded project came from the removed folder.
    const project = useProjectStore.getState().current;
    if (
      removed !== undefined &&
      project.kind !== "idle" &&
      removed.projects.includes(project.path)
    ) {
      useProjectStore.getState().clear();
    }
  },

  startScan: async (path: string) => {
    set((state) => ({
      folders: state.folders.map((f) =>
        f.path === path
          ? { path, status: { kind: "scanning" }, projects: [] }
          : f,
      ),
    }));
    const appendProject = (project: string) => {
      set((state) => ({
        folders: appendFolderProject(state.folders, path, project),
      }));
    };
    try {
      await scanFolder(path, appendProject);
      set((state) => ({
        folders: updateFolderStatus(state.folders, path, { kind: "done" }),
      }));
    } catch (e) {
      set((state) => ({
        folders: updateFolderStatus(state.folders, path, {
          kind: "error",
          message: messageOf(e),
        }),
      }));
    }
  },

  cancelScan: (path: string) => {
    set((state) => ({
      folders: state.folders.map((f) =>
        f.path === path
          ? { path, status: { kind: "idle" }, projects: [] }
          : f,
      ),
    }));
  },

  setQuery: (q: string) => {
    set({ query: q });
  },

  clear: () => {
    set({ recent: [], recentFolders: [], folders: [], query: "" });
  },
}));
