import { create } from "zustand";

import { parseProject } from "../lib/parse";
import type { ProjectSummary } from "../lib/types";

export type ProjectStatus =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "loaded"; path: string; summary: ProjectSummary }
  | { kind: "error"; path: string; message: string };

export interface ProjectState {
  current: ProjectStatus;
  select: (path: string) => Promise<void>;
  clear: () => void;
}

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export const useProjectStore = create<ProjectState>((set) => ({
  current: { kind: "idle" },

  select: async (path: string) => {
    set({ current: { kind: "loading", path } });
    try {
      const summary = await parseProject(path);
      set({ current: { kind: "loaded", path, summary } });
    } catch (e) {
      set({ current: { kind: "error", path, message: messageOf(e) } });
    }
  },

  clear: () => {
    set({ current: { kind: "idle" } });
  },
}));
