/**
 * Concurrency + idle gate for library parses (split out from
 * library-summaries-store.ts so the store stays inside the
 * 300-line ESLint budget after the alternatives chain landed).
 *
 * Two responsibilities:
 *  1. Cap concurrent parseProject calls at PARSE_CONCURRENCY — without
 *     this the library tile grid would spawn N parses on the same
 *     frame, flooding the IPC bridge and freezing the UI thread
 *     (lpx-explorer-bh4).
 *  2. Idle pause (lpx-explorer-fz4) — while `scanPaused`, slot
 *     acquisitions queue without ever running until the gate
 *     unpauses; lets the UI stay responsive while a deferred scan
 *     waits.
 */

export const PARSE_CONCURRENCY = 8;

let inFlightParseCount = 0;
const parseSlotQueue: Array<() => void> = [];
let scanPaused = true;

export function acquireSlot(path: string): Promise<void> {
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

export function releaseSlot(path: string): void {
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
  console.info(
    `[parse] scan ${paused ? "PAUSE" : "RESUME"} queued=${parseSlotQueue.length}`,
  );
  if (!paused) drainSlotQueue();
}

export function isScanPaused(): boolean {
  return scanPaused;
}

export function queuedParseCount(): number {
  return parseSlotQueue.length;
}

/** Reset all gate state. Used by the store's clear() — resets the
 * counter + drains the queue + flips paused off so test code calling
 * clear() doesn't have to know about the idle gate. */
export function resetGate(): void {
  inFlightParseCount = 0;
  parseSlotQueue.length = 0;
  scanPaused = false;
}
