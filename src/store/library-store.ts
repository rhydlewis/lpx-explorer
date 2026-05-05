import { create } from "zustand";

import { scanFolder } from "../lib/library";
import { projectNameOf } from "../lib/path-utils";
import type { FolderEntry, RecentEntry, ScanStatus } from "../lib/types";

export const RECENT_LIMIT = 8;

export interface LibraryState {
  recent: ReadonlyArray<RecentEntry>;
  folders: ReadonlyArray<FolderEntry>;
  query: string;
  addRecent: (path: string, nowMs?: number) => void;
  removeRecent: (path: string) => void;
  addFolder: (path: string) => Promise<void>;
  removeFolder: (path: string) => void;
  startScan: (path: string) => Promise<void>;
  cancelScan: (path: string) => void;
  setQuery: (q: string) => void;
  clear: () => void;
}

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

function updateFolderStatus(
  folders: ReadonlyArray<FolderEntry>,
  path: string,
  status: ScanStatus,
): ReadonlyArray<FolderEntry> {
  return folders.map((f) => (f.path === path ? { ...f, status } : f));
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  recent: [],
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

  removeRecent: (path: string) => {
    set((state) => ({
      recent: state.recent.filter((r) => r.path !== path),
    }));
  },

  addFolder: async (path: string) => {
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
    set((state) => ({
      folders: state.folders.filter((f) => f.path !== path),
    }));
  },

  startScan: async (path: string) => {
    set((state) => ({
      folders: updateFolderStatus(state.folders, path, { kind: "scanning" }),
    }));
    try {
      const projects = await scanFolder(path);
      set((state) => ({
        folders: state.folders.map((f) =>
          f.path === path
            ? { path, status: { kind: "done" }, projects }
            : f,
        ),
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
    set({ recent: [], folders: [], query: "" });
  },
}));
