import { useLibrarySummariesStore } from "../store/library-summaries-store";

import { installIdleDetector } from "./idle-detector";
import { loadParseCache } from "./persistence";

/**
 * Window idle threshold before the deferred library scan kicks off
 * (lpx-explorer-fz4). Picked to feel snappy but not so short that
 * mousing-into-the-window-and-pausing-to-think wakes the scan.
 */
export const SCAN_IDLE_THRESHOLD_MS = 3000;

/**
 * Hydrate the persisted parse cache (lpx-explorer-aay) into the
 * in-memory summaries map so launches 2..N serve library tiles +
 * plug-in rollups without parsing. Returns a cancel thunk for the
 * effect's cleanup.
 */
export function hydrateParseCacheAsync(): () => void {
  let cancelled = false;
  void (async () => {
    const cache = await loadParseCache();
    if (cancelled) return;
    console.info(`[parse-cache] hydrate entries=${cache.size}`);
    useLibrarySummariesStore.getState().hydrateCache(cache);
  })();
  return () => {
    cancelled = true;
  };
}

/**
 * Wire the idle detector to the scan-pause flag (lpx-explorer-fz4).
 * Module default has the scan queue paused so launch is fast — no
 * parse work runs until SCAN_IDLE_THRESHOLD_MS passes without user
 * activity. User-explicit pause (banner button) overrides
 * idle-resume.
 */
export function installScanIdleGate(): () => void {
  return installIdleDetector({
    thresholdMs: SCAN_IDLE_THRESHOLD_MS,
    onIdle: () => {
      if (useLibrarySummariesStore.getState().userPaused) return;
      useLibrarySummariesStore.getState().setScanPausedState(false);
    },
    onActive: () => {
      useLibrarySummariesStore.getState().setScanPausedState(true);
    },
  });
}
