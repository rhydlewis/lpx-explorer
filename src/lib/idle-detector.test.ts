import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installIdleDetector } from "./idle-detector";

describe("installIdleDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onIdle after the threshold elapses with no activity", () => {
    const onIdle = vi.fn();
    const onActive = vi.fn();
    installIdleDetector({ thresholdMs: 1000, onIdle, onActive });

    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("activity events reset the idle timer", () => {
    const onIdle = vi.fn();
    const onActive = vi.fn();
    installIdleDetector({ thresholdMs: 1000, onIdle, onActive });

    vi.advanceTimersByTime(800);
    window.dispatchEvent(new Event("mousedown"));
    vi.advanceTimersByTime(800);

    expect(onIdle).not.toHaveBeenCalled();
  });

  it("fires onActive when activity arrives during an idle window", () => {
    const onIdle = vi.fn();
    const onActive = vi.fn();
    installIdleDetector({ thresholdMs: 1000, onIdle, onActive });

    vi.advanceTimersByTime(1000);
    expect(onIdle).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("keydown"));
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it("does not refire onIdle while already idle", () => {
    const onIdle = vi.fn();
    const onActive = vi.fn();
    installIdleDetector({ thresholdMs: 1000, onIdle, onActive });

    vi.advanceTimersByTime(5000);

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("cleanup removes listeners and clears the timer", () => {
    const onIdle = vi.fn();
    const onActive = vi.fn();
    const cleanup = installIdleDetector({
      thresholdMs: 1000,
      onIdle,
      onActive,
    });

    cleanup();
    vi.advanceTimersByTime(2000);
    window.dispatchEvent(new Event("mousedown"));

    expect(onIdle).not.toHaveBeenCalled();
    expect(onActive).not.toHaveBeenCalled();
  });
});
