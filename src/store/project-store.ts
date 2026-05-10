import { create } from "zustand";

import { listAlternatives, parseAlternative } from "../lib/parse";
import type { Alternative, ProjectSummary } from "../lib/types";

export type ProjectStatus =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | {
      kind: "loaded";
      path: string;
      summary: ProjectSummary;
      /**
       * Every variant of this bundle (lpx-explorer-4qf). Always at
       * least one entry — single-variant projects synthesise
       * `[{ index: 0, ... }]`.
       */
      alternatives: ReadonlyArray<Alternative>;
      /** Index into `alternatives` of the variant whose summary is loaded. */
      activeVariantIndex: number;
    }
  | { kind: "error"; path: string; message: string };

export interface ProjectState {
  current: ProjectStatus;
  select: (path: string) => Promise<void>;
  /**
   * Switch the loaded project to a different alternative. No-op when
   * the project isn't loaded or the index is already active. Re-parses
   * via parse_alternative; preserves the `alternatives` list so a
   * second switch doesn't re-fetch the manifest.
   */
  setActiveVariant: (index: number) => Promise<void>;
  clear: () => void;
}

const messageOf = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  // Tauri rejects with a serialised `ParseError`: `{ kind, message }`.
  if (typeof e === "object" && e !== null && "message" in e) {
    const msg = (e as { message: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return String(e);
};

function pickActiveIndex(alts: ReadonlyArray<Alternative>): number {
  const active = alts.find((a) => a.is_active);
  return active !== undefined ? active.index : 0;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  current: { kind: "idle" },

  select: async (path: string) => {
    set({ current: { kind: "loading", path } });
    try {
      const alternatives = await listAlternatives(path);
      if (alternatives.length === 0) {
        // Bundle has no parseable Alternatives directory — surface
        // the same error parse_project would have produced.
        throw new Error("ProjectData not found inside bundle");
      }
      const activeVariantIndex = pickActiveIndex(alternatives);
      const summary = await parseAlternative(path, activeVariantIndex);
      set({
        current: {
          kind: "loaded",
          path,
          summary,
          alternatives,
          activeVariantIndex,
        },
      });
    } catch (e) {
      set({ current: { kind: "error", path, message: messageOf(e) } });
    }
  },

  setActiveVariant: async (index: number) => {
    const cur = get().current;
    if (cur.kind !== "loaded") return;
    if (cur.activeVariantIndex === index) return;
    if (!cur.alternatives.some((a) => a.index === index)) return;
    // Optimistic: leave summary in place during the parse so the
    // inspector doesn't flicker to 'loading'. Failures roll the
    // active index back.
    try {
      const summary = await parseAlternative(cur.path, index);
      set({
        current: { ...cur, summary, activeVariantIndex: index },
      });
    } catch (e) {
      set({
        current: { kind: "error", path: cur.path, message: messageOf(e) },
      });
    }
  },

  clear: () => {
    set({ current: { kind: "idle" } });
  },
}));
