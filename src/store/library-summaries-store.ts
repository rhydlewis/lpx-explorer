import { create } from "zustand";

import { parseProject } from "../lib/parse";
import type { ProjectSummary } from "../lib/types";

/**
 * In-session cache of `ProjectSummary` keyed by `.logicx` path. Used by
 * the cross-project rollup view (lpx-explorer-185) to aggregate plug-in
 * usage across the user's entire library without re-parsing on every
 * scope toggle.
 *
 * Persistence across launches is intentionally out of scope for v1 — the
 * cache rebuilds on first use after each launch. Lazy-on-demand: callers
 * call `getOrParse(path)`, which returns the cached summary or parses
 * exactly once and caches the result. Concurrent calls for the same
 * path collapse to a single in-flight invocation.
 */
export interface LibrarySummariesState {
  readonly summaries: ReadonlyMap<string, ProjectSummary>;
  readonly errors: ReadonlyMap<string, string>;
  has: (path: string) => boolean;
  getOrParse: (path: string) => Promise<ProjectSummary | null>;
  clear: () => void;
}

interface InternalState extends LibrarySummariesState {
  // Mutable inner Maps — Zustand's setState replaces by reference, so we
  // keep these privately and re-emit shallow copies on each change.
  _summariesInner: Map<string, ProjectSummary>;
  _errorsInner: Map<string, string>;
  _inflight: Map<string, Promise<ProjectSummary | null>>;
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export const useLibrarySummariesStore = create<LibrarySummariesState>(
  (set, get) => {
    const state: InternalState = {
      summaries: new Map(),
      errors: new Map(),
      _summariesInner: new Map(),
      _errorsInner: new Map(),
      _inflight: new Map(),
      has: (path: string) => {
        const s = get() as InternalState;
        return s._summariesInner.has(path);
      },
      getOrParse: async (path: string) => {
        const s = get() as InternalState;
        const cached = s._summariesInner.get(path);
        if (cached !== undefined) {
          return cached;
        }
        const inflight = s._inflight.get(path);
        if (inflight !== undefined) {
          return inflight;
        }
        const promise = (async () => {
          try {
            const summary = await parseProject(path);
            const cur = get() as InternalState;
            cur._summariesInner.set(path, summary);
            cur._errorsInner.delete(path);
            cur._inflight.delete(path);
            set({
              summaries: new Map(cur._summariesInner),
              errors: new Map(cur._errorsInner),
            });
            return summary;
          } catch (e) {
            const cur = get() as InternalState;
            cur._errorsInner.set(path, messageOf(e));
            cur._inflight.delete(path);
            set({
              errors: new Map(cur._errorsInner),
            });
            return null;
          }
        })();
        s._inflight.set(path, promise);
        return promise;
      },
      clear: () => {
        const s = get() as InternalState;
        s._summariesInner.clear();
        s._errorsInner.clear();
        s._inflight.clear();
        set({
          summaries: new Map(),
          errors: new Map(),
        });
      },
    };
    return state;
  },
);
