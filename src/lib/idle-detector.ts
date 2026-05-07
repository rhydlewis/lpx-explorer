/**
 * Window-level idle detector for the library scan scheduler
 * (lpx-explorer-fz4). The scheduler stays paused while the user is
 * actively driving the app — drag, click, key press, scroll, file
 * drop, menu open — and unpauses after `thresholdMs` of inactivity.
 *
 * Activity events are intentionally limited: high-frequency listeners
 * (mousemove, pointermove) would themselves wake the scheduler on
 * every frame, so they're omitted. The cost is that idle parking on
 * a static screen requires the cursor to also be idle for the
 * threshold — which matches what we want.
 */

const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
  "mousedown",
  "keydown",
  "wheel",
  "dragstart",
  "drop",
  "touchstart",
];

export interface IdleDetectorOptions {
  readonly thresholdMs: number;
  readonly onIdle: () => void;
  readonly onActive: () => void;
}

/**
 * Install activity listeners on the window. Returns a cleanup
 * function. Initial state is "active" — the caller is expected to
 * start the scheduler in the paused state and let the first idle tick
 * unpause it.
 */
export function installIdleDetector(opts: IdleDetectorOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let idle = false;

  const goIdle = () => {
    if (idle) return;
    idle = true;
    opts.onIdle();
  };

  const bump = () => {
    if (timer !== null) clearTimeout(timer);
    if (idle) {
      idle = false;
      opts.onActive();
    }
    timer = setTimeout(goIdle, opts.thresholdMs);
  };

  for (const ev of ACTIVITY_EVENTS) {
    window.addEventListener(ev, bump, { passive: true });
  }
  // Visibility loss counts as "user is doing something else" — pause
  // until they come back and trigger another idle window.
  const onVisibilityChange = () => {
    if (document.hidden) {
      bump();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Kick off the initial idle timer so we eventually unpause even on
  // a totally inert window.
  timer = setTimeout(goIdle, opts.thresholdMs);

  return () => {
    if (timer !== null) clearTimeout(timer);
    for (const ev of ACTIVITY_EVENTS) {
      window.removeEventListener(ev, bump);
    }
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
