import { create } from "zustand";

import { projectNameOf } from "../lib/path-utils";
import type { RecentEntry } from "../lib/types";

export const RECENT_LIMIT = 8;

export interface LibraryState {
  recent: ReadonlyArray<RecentEntry>;
  addRecent: (path: string, nowMs?: number) => void;
  removeRecent: (path: string) => void;
  clear: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  recent: [],

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

  clear: () => {
    set({ recent: [] });
  },
}));
