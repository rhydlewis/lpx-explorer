import { create } from "zustand";

import {
  listAlternatives,
  parseAlternative,
  parseProject,
  projectDataStat,
} from "../lib/parse";
import {
  deleteParseCacheEntry,
  parseCacheKeyToParts,
  persistParseCacheEntry,
  type ParseCacheEntry,
} from "../lib/persistence";
import type { ProjectSummary } from "../lib/types";

/**
 * Cap on concurrent `parseProject` invocations. Without this, the
 * library-home tile grid spawns N parses on the same frame for an
 * N-project folder, flooding the IPC bridge and freezing the UI thread
 * (lpx-explorer-bh4). Bumped from 4 → 8 after observing ~380ms
 * effective per-parse with cap=4 on a 120-project library — IPC bridge
 * round-trip dominated; the parser itself runs in ms.
 */
export const PARSE_CONCURRENCY = 8;

let inFlightParseCount = 0;
const parseSlotQueue: Array<() => void> = [];
/**
 * Idle gate (lpx-explorer-fz4). When `scanPaused` is true, calls to
 * `acquireSlot` queue without ever running until a pause-release tick
 * drains them. The cap is still PARSE_CONCURRENCY; "paused" simply
 * means no new acquisitions get a slot.
 */
let scanPaused = true;

function acquireSlot(path: string): Promise<void> {
  if (!scanPaused && inFlightParseCount < PARSE_CONCURRENCY) {
    inFlightParseCount += 1;
    console.info(
      `[parse] acquire path=${path} inFlight=${inFlightParseCount} queued=${parseSlotQueue.length}`,
    );
    return Promise.resolve();
  }
  console.info(
    `[parse] queue path=${path} queued=${parseSlotQueue.length + 1} paused=${scanPaused}`,
  );
  return new Promise<void>((resolve) => {
    parseSlotQueue.push(() => {
      inFlightParseCount += 1;
      console.info(
        `[parse] acquire(queued) path=${path} inFlight=${inFlightParseCount} queued=${parseSlotQueue.length}`,
      );
      resolve();
    });
  });
}

function releaseSlot(path: string): void {
  inFlightParseCount -= 1;
  console.info(
    `[parse] release path=${path} inFlight=${inFlightParseCount} queued=${parseSlotQueue.length}`,
  );
  drainSlotQueue();
}

function drainSlotQueue(): void {
  if (scanPaused) return;
  while (
    inFlightParseCount < PARSE_CONCURRENCY &&
    parseSlotQueue.length > 0
  ) {
    const next = parseSlotQueue.shift();
    if (next !== undefined) next();
  }
}

/**
 * Module-level pause toggle. Exported for the App-level idle detector
 * to flip when the user goes idle / active. Kept on the module (not
 * the Zustand state) so it directly gates `acquireSlot` without a
 * subscription dance — the queue resumes synchronously.
 */
export function setScanPaused(paused: boolean): void {
  if (scanPaused === paused) return;
  scanPaused = paused;
  console.info(`[parse] scan ${paused ? "PAUSE" : "RESUME"} queued=${parseSlotQueue.length}`);
  if (!paused) drainSlotQueue();
}

export function isScanPaused(): boolean {
  return scanPaused;
}

export function queuedParseCount(): number {
  return parseSlotQueue.length;
}

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
  /**
   * Per-path summaries merged across every variant of the project
   * (lpx-explorer-bpp). Multi-variant projects: fingerprints are the
   * union of all variants' fingerprints; other fields take variant
   * 0's values (the rollup only reads fingerprints). Single-variant
   * projects: identical to `summaries.get(path)`.
   *
   * Populated lazily via `getOrParseAllVariants(path)`. The library
   * scope of <PluginRail /> uses this so a plug-in only loaded in
   * variant 1 still surfaces in the cross-project rollup.
   */
  readonly mergedSummaries: ReadonlyMap<string, ProjectSummary>;
  readonly errors: ReadonlyMap<string, string>;
  /**
   * Reactive mirror of the module-level `scanPaused` (lpx-explorer-fz4).
   * Components subscribe to this when they need to render pause state
   * (the banner). Module-side gating reads `scanPaused` directly.
   */
  readonly scanPaused: boolean;
  /**
   * Whether the user has explicitly hard-paused the scan via the
   * banner's Pause button. When true, the idle detector's onIdle is
   * suppressed — only an explicit Resume click brings the scan back.
   */
  readonly userPaused: boolean;
  has: (path: string) => boolean;
  getOrParse: (path: string) => Promise<ProjectSummary | null>;
  /**
   * Fetch every variant of the project and update mergedSummaries
   * (lpx-explorer-bpp). Variant 0 reuses the existing
   * path-keyed cache via getOrParse. Variants ≥ 1 are parsed fresh
   * and cached in-memory only — variants change rarely, and the user
   * almost always loads variant 0 anyway, so disk persistence isn't
   * worth the IPC weight today.
   *
   * Single-variant projects collapse to a single getOrParse call.
   * Returns the merged summary or null on parse failure.
   */
  getOrParseAllVariants: (path: string) => Promise<ProjectSummary | null>;
  /**
   * Pre-fill the in-memory summaries from a persisted parse cache
   * (lpx-explorer-aay). Stat-validation is deferred to the first
   * `getOrParse(path)` per session — calling that before the disk
   * stat would block hydration on N IPC calls. Pass the cache map
   * directly; the store keeps a private copy of stats for validation.
   */
  hydrateCache: (entries: ReadonlyMap<string, ParseCacheEntry>) => void;
  /** Set the in-store mirror of the pause state. */
  setScanPausedState: (paused: boolean) => void;
  /** Toggle the user-explicit pause (banner Pause/Resume button). */
  setUserPaused: (paused: boolean) => void;
  clear: () => void;
}

interface InternalState extends LibrarySummariesState {
  // Mutable inner Maps — Zustand's setState replaces by reference, so we
  // keep these privately and re-emit shallow copies on each change.
  _summariesInner: Map<string, ProjectSummary>;
  _errorsInner: Map<string, string>;
  _inflight: Map<string, Promise<ProjectSummary | null>>;
  /** Cached stats from disk; consulted on first getOrParse per path. */
  _cacheStats: Map<string, { mtime_unix: number; size_bytes: number }>;
  /** Paths whose cache entry has been stat-validated this session. */
  _statValidated: Set<string>;
  /** Merged-across-all-variants summaries (lpx-explorer-bpp). */
  _mergedSummariesInner: Map<string, ProjectSummary>;
  /** In-flight merge promises — collapses concurrent calls. */
  _mergeInflight: Map<string, Promise<ProjectSummary | null>>;
}

/**
 * Synthesise a merged ProjectSummary whose `fingerprints` is the
 * union across all variants. The library rollup (aggregateLibrary)
 * only reads fingerprints, so other fields safely take variant 0's
 * values.
 */
function mergeAcrossVariants(
  variants: ReadonlyArray<ProjectSummary>,
): ProjectSummary {
  const base = variants[0];
  if (variants.length === 1) return base;
  const fingerprints = variants.flatMap((v) => v.fingerprints);
  return { ...base, fingerprints };
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  // Tauri rejects with a serialised `ParseError`:
  //   { kind: "ProjectDataMissing", message: "ProjectData not found …" }
  // Pull `.message` out so the failed-list reads the parser's actual
  // explanation instead of `[object Object]`.
  if (typeof e === "object" && e !== null && "message" in e) {
    const msg = (e as { message: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return String(e);
}

export const useLibrarySummariesStore = create<LibrarySummariesState>(
  (set, get) => {
    const state: InternalState = {
      summaries: new Map(),
      mergedSummaries: new Map(),
      errors: new Map(),
      scanPaused: true,
      userPaused: false,
      _summariesInner: new Map(),
      _errorsInner: new Map(),
      _inflight: new Map(),
      _cacheStats: new Map(),
      _statValidated: new Set(),
      _mergedSummariesInner: new Map(),
      _mergeInflight: new Map(),
      has: (path: string) => {
        const s = get() as InternalState;
        return s._summariesInner.has(path);
      },
      setScanPausedState: (paused) => {
        setScanPaused(paused);
        set({ scanPaused: paused });
      },
      setUserPaused: (paused) => {
        set({ userPaused: paused });
        // userPaused dominates: pausing always pauses; unpausing only
        // resumes if the user is currently idle. The idle detector
        // re-fires on the next idle window otherwise.
        if (paused) {
          setScanPaused(true);
          set({ scanPaused: true });
        }
      },
      hydrateCache: (entries) => {
        // Disk cache is composite-keyed (`${path}#variant=${index}`)
        // post-bxb. The in-memory store still operates on bare paths
        // — equivalent to "the active variant's summary per project"
        // — so we filter to variant=0 entries on hydrate. The
        // alternatives chain (lpx-explorer-4qf) will introduce a
        // variant-aware in-memory layer when the frontend actually
        // needs to load non-zero variants.
        const s = get() as InternalState;
        for (const [key, entry] of entries) {
          const { path, variant } = parseCacheKeyToParts(key);
          if (variant !== 0) continue;
          s._summariesInner.set(path, entry.summary);
          s._cacheStats.set(path, {
            mtime_unix: entry.mtime_unix,
            size_bytes: entry.size_bytes,
          });
        }
        set({ summaries: new Map(s._summariesInner) });
      },
      getOrParse: async (path: string) => {
        const s = get() as InternalState;
        const cached = s._summariesInner.get(path);
        if (cached !== undefined) {
          // First time seeing this hydrated entry: stat-check before
          // trusting it. Subsequent requests within the session reuse
          // the in-memory copy without hitting disk.
          if (!s._statValidated.has(path) && s._cacheStats.has(path)) {
            const stat = await projectDataStat(path);
            const cachedStats = s._cacheStats.get(path)!;
            const fresh =
              stat !== null &&
              stat.mtime_unix === cachedStats.mtime_unix &&
              stat.size_bytes === cachedStats.size_bytes;
            if (!fresh) {
              console.info(`[parse] cache stale path=${path} — re-parsing`);
              s._summariesInner.delete(path);
              s._cacheStats.delete(path);
              void deleteParseCacheEntry(path);
              set({ summaries: new Map(s._summariesInner) });
              // Fall through to the parse path below.
            } else {
              s._statValidated.add(path);
              return cached;
            }
          } else {
            return cached;
          }
        }
        const inflight = s._inflight.get(path);
        if (inflight !== undefined) {
          return inflight;
        }
        const promise = (async () => {
          await acquireSlot(path);
          try {
            const t0 = performance.now();
            const summary = await parseProject(path);
            console.info(
              `[parse] ok path=${path} ${(performance.now() - t0).toFixed(0)}ms`,
            );
            const cur = get() as InternalState;
            cur._summariesInner.set(path, summary);
            cur._errorsInner.delete(path);
            cur._inflight.delete(path);
            cur._statValidated.add(path);
            // Stat the file we just parsed and persist alongside the
            // summary. If the stat fails (file vanished mid-parse) we
            // skip the cache write — better to re-parse next launch
            // than to cache an entry we can't validate.
            const stat = await projectDataStat(path).catch(() => null);
            if (stat !== null) {
              cur._cacheStats.set(path, stat);
              void persistParseCacheEntry(path, {
                mtime_unix: stat.mtime_unix,
                size_bytes: stat.size_bytes,
                summary,
              });
            }
            set({
              summaries: new Map(cur._summariesInner),
              errors: new Map(cur._errorsInner),
            });
            return summary;
          } catch (e) {
            console.warn(`[parse] FAIL path=${path}`, e);
            const cur = get() as InternalState;
            cur._errorsInner.set(path, messageOf(e));
            cur._inflight.delete(path);
            set({
              errors: new Map(cur._errorsInner),
            });
            return null;
          } finally {
            releaseSlot(path);
          }
        })();
        s._inflight.set(path, promise);
        return promise;
      },
      getOrParseAllVariants: async (path: string) => {
        const s = get() as InternalState;
        // Cache hit: already merged this session (variants don't
        // change while the app is running unless the user re-saves
        // in Logic, which would invalidate the variant-0 cache via
        // stat — handled by getOrParse below).
        const cached = s._mergedSummariesInner.get(path);
        if (cached !== undefined) return cached;
        const inflight = s._mergeInflight.get(path);
        if (inflight !== undefined) return inflight;

        const promise = (async () => {
          // Variant 0 reuses the existing path-keyed cache.
          const v0 = await get().getOrParse(path);
          if (v0 === null) return null;
          let alts: { index: number; is_active: boolean; display_name: string }[];
          try {
            alts = await listAlternatives(path);
          } catch {
            // listAlternatives failure: fall back to variant 0 only.
            alts = [{ index: 0, is_active: true, display_name: path }];
          }
          const summaries: ProjectSummary[] = [v0];
          for (const a of alts) {
            if (a.index === 0) continue;
            try {
              const extra = await parseAlternative(path, a.index);
              summaries.push(extra);
            } catch (e) {
              // Variant ≥ 1 parse failure is non-fatal — log and
              // skip; the merged summary still includes variant 0
              // and any other variants that did parse.
              console.warn(
                `[parse] variant ${a.index} of ${path} failed:`,
                e,
              );
            }
          }
          const merged = mergeAcrossVariants(summaries);
          const cur = get() as InternalState;
          cur._mergedSummariesInner.set(path, merged);
          cur._mergeInflight.delete(path);
          set({ mergedSummaries: new Map(cur._mergedSummariesInner) });
          return merged;
        })();
        s._mergeInflight.set(path, promise);
        return promise;
      },
      clear: () => {
        const s = get() as InternalState;
        s._summariesInner.clear();
        s._errorsInner.clear();
        s._inflight.clear();
        s._cacheStats.clear();
        s._statValidated.clear();
        s._mergedSummariesInner.clear();
        s._mergeInflight.clear();
        // Module-level concurrency state must reset too — otherwise a
        // hung test or store reset leaves slots permanently consumed.
        // scanPaused resets to false so test code reaching for clear()
        // doesn't have to know about the idle gate; production callers
        // (App boot) flip it on explicitly via setScanPaused.
        inFlightParseCount = 0;
        parseSlotQueue.length = 0;
        scanPaused = false;
        set({
          summaries: new Map(),
          mergedSummaries: new Map(),
          errors: new Map(),
          scanPaused: false,
          userPaused: false,
        });
      },
    };
    return state;
  },
);
