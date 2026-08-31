import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadAuPathsNewestMtime,
  loadAuRegistry,
  runAuScan,
} from "../lib/au-registry";
import type { AuvalEntry } from "../lib/types";
import { makeAuRegistry } from "../test/fixtures";

import { useAuRegistryStore } from "./au-registry-store";

vi.mock("../lib/au-registry", () => ({
  loadAuPathsNewestMtime: vi.fn(),
  loadAuRegistry: vi.fn(),
  runAuScan: vi.fn(),
}));

const mockedLoad = vi.mocked(loadAuRegistry);
const mockedRun = vi.mocked(runAuScan);
const mockedMtime = vi.mocked(loadAuPathsNewestMtime);

const nowUnix = () => Math.floor(Date.now() / 1000);

/** A registry scanned just now — fresh by both mtime and TTL. */
function freshRegistry(...fps: string[]) {
  return { ...makeAuRegistry(fps), scanned_at_unix: nowUnix() };
}

describe("useAuRegistryStore", () => {
  beforeEach(() => {
    useAuRegistryStore.getState().reset();
    vi.clearAllMocks();
    mockedMtime.mockResolvedValue(null);
  });

  afterEach(() => {
    useAuRegistryStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("starts idle", () => {
    expect(useAuRegistryStore.getState().status).toEqual({ kind: "idle" });
  });

  it("loadFromCache transitions idle → loading → loaded when cache exists", async () => {
    const registry = makeAuRegistry(["aumu/EZk2/Toon"]);
    mockedLoad.mockResolvedValueOnce(registry);

    await useAuRegistryStore.getState().loadFromCache();

    expect(useAuRegistryStore.getState().status).toEqual({
      kind: "loaded",
      registry,
    });
  });

  it("loadFromCache transitions to 'absent' when the cache is missing", async () => {
    mockedLoad.mockResolvedValueOnce(null);

    await useAuRegistryStore.getState().loadFromCache();

    expect(useAuRegistryStore.getState().status).toEqual({ kind: "absent" });
  });

  it("loadFromCache transitions to 'error' on rejection", async () => {
    mockedLoad.mockRejectedValueOnce(new Error("disk read fail"));

    await useAuRegistryStore.getState().loadFromCache();

    expect(useAuRegistryStore.getState().status).toEqual({
      kind: "error",
      message: "disk read fail",
    });
  });

  it("runScan transitions to 'scanning' with a live count, then 'loaded'", async () => {
    let onEntry: ((e: AuvalEntry) => void) | undefined;
    let resolveScan!: () => void;
    mockedRun.mockImplementationOnce(async (cb) => {
      onEntry = cb;
      await new Promise<void>((r) => {
        resolveScan = r;
      });
    });
    mockedLoad.mockResolvedValueOnce(makeAuRegistry(["aumu/EZk2/Toon"]));

    const scanPromise = useAuRegistryStore.getState().runScan();
    expect(useAuRegistryStore.getState().status).toEqual({
      kind: "scanning",
      found: 0,
    });

    onEntry?.({
      fingerprint: "aumu/EZk2/Toon",
      type_4cc: "aumu",
      subtype_4cc: "EZk2",
      manufacturer_4cc: "Toon",
      name: "EZdrummer 2",
    });
    expect(useAuRegistryStore.getState().status).toEqual({
      kind: "scanning",
      found: 1,
    });

    onEntry?.({
      fingerprint: "aufx/Cmpr/appl",
      type_4cc: "aufx",
      subtype_4cc: "Cmpr",
      manufacturer_4cc: "appl",
      name: "AUDynamicsProcessor",
    });
    expect(useAuRegistryStore.getState().status).toEqual({
      kind: "scanning",
      found: 2,
    });

    resolveScan();
    await scanPromise;

    // After scan completes, the store reloads from cache (Rust wrote it).
    expect(useAuRegistryStore.getState().status.kind).toBe("loaded");
  });

  it("runScan transitions to 'error' when the spawn fails", async () => {
    mockedRun.mockRejectedValueOnce({
      kind: "SpawnFailed",
      message: "auval exited with signal: 11",
    });

    await useAuRegistryStore.getState().runScan();

    const status = useAuRegistryStore.getState().status;
    expect(status.kind).toBe("error");
    if (status.kind === "error") {
      expect(status.message).toMatch(/auval/i);
    }
  });

  it("autoScanIfStale triggers a scan when the cache is missing", async () => {
    // First call — no cache. Should auto-kick the scan instead of leaving
    // the user on a non-actionable 'absent' pill.
    mockedLoad.mockResolvedValueOnce(null);
    let resolveScan!: () => void;
    mockedRun.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        resolveScan = r;
      });
    });
    mockedLoad.mockResolvedValueOnce(makeAuRegistry(["aufx/Cmpr/appl"]));

    const promise = useAuRegistryStore.getState().autoScanIfStale();
    // Should be scanning by the time loadFromCache resolves with null.
    await Promise.resolve();
    await Promise.resolve();
    expect(useAuRegistryStore.getState().status).toEqual({
      kind: "scanning",
      found: 0,
    });

    resolveScan();
    await promise;

    expect(useAuRegistryStore.getState().status.kind).toBe("loaded");
    expect(mockedRun).toHaveBeenCalledTimes(1);
  });

  it("autoScanIfStale does NOT scan when the cache is fresh", async () => {
    mockedLoad.mockResolvedValueOnce(freshRegistry("aufx/Cmpr/appl"));
    mockedMtime.mockResolvedValue(nowUnix() - 3600);

    await useAuRegistryStore.getState().autoScanIfStale();

    expect(useAuRegistryStore.getState().status.kind).toBe("loaded");
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it("autoScanIfStale rescans when a plug-in was installed after the scan", async () => {
    // The lpx-explorer-kw0 regression test: cache exists, so the old
    // 'absent'-only guard skipped the rescan and kept reporting the
    // newly installed plug-in as missing.
    const stale = freshRegistry("aufx/Cmpr/appl");
    mockedLoad.mockResolvedValueOnce(stale);
    mockedMtime.mockResolvedValue(stale.scanned_at_unix + 60);
    mockedRun.mockResolvedValueOnce(undefined);
    mockedLoad.mockResolvedValueOnce(
      freshRegistry("aufx/Cmpr/appl", "aumu/kphp/ kHs"),
    );

    await useAuRegistryStore.getState().autoScanIfStale();

    expect(mockedRun).toHaveBeenCalledTimes(1);
    const status = useAuRegistryStore.getState().status;
    expect(status.kind).toBe("loaded");
    if (status.kind === "loaded") {
      expect(status.registry.entries).toHaveLength(2);
    }
  });

  it("autoScanIfStale keeps the stale registry rendering during the refresh", async () => {
    // A refresh must not blank the verdict back to 'Haven't checked your
    // AUs yet' — the user is mid-read of a project.
    const stale = freshRegistry("aufx/Cmpr/appl");
    mockedLoad.mockResolvedValueOnce(stale);
    mockedMtime.mockResolvedValue(stale.scanned_at_unix + 60);
    let resolveScan!: () => void;
    mockedRun.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        resolveScan = r;
      });
    });
    mockedLoad.mockResolvedValueOnce(freshRegistry("aufx/Cmpr/appl"));

    const promise = useAuRegistryStore.getState().autoScanIfStale();
    await vi.waitFor(() => {
      expect(useAuRegistryStore.getState().rescanning).toBe(true);
    });
    expect(useAuRegistryStore.getState().status).toEqual({
      kind: "loaded",
      registry: stale,
    });

    resolveScan();
    await promise;
    expect(useAuRegistryStore.getState().rescanning).toBe(false);
  });

  it("a failed rescan preserves the previously loaded registry", async () => {
    // auval segfaults on a broken plug-in install. Losing a good
    // registry to that would be a worse bug than the staleness it fixes.
    const good = freshRegistry("aufx/Cmpr/appl");
    mockedLoad.mockResolvedValueOnce(good);
    await useAuRegistryStore.getState().loadFromCache();
    mockedRun.mockRejectedValueOnce(new Error("auval exited with signal 11"));

    await useAuRegistryStore.getState().rescan();

    expect(useAuRegistryStore.getState().status).toEqual({
      kind: "loaded",
      registry: good,
    });
    expect(useAuRegistryStore.getState().rescanning).toBe(false);
    expect(useAuRegistryStore.getState().rescanError).toMatch(/auval/i);
  });

  it("a successful rescan clears a previous rescan error", async () => {
    mockedLoad.mockResolvedValueOnce(freshRegistry("aufx/Cmpr/appl"));
    await useAuRegistryStore.getState().loadFromCache();
    mockedRun.mockRejectedValueOnce(new Error("auval exited with signal 11"));
    await useAuRegistryStore.getState().rescan();
    expect(useAuRegistryStore.getState().rescanError).not.toBeNull();

    mockedRun.mockResolvedValueOnce(undefined);
    mockedLoad.mockResolvedValueOnce(freshRegistry("aufx/Cmpr/appl", "aumu/kphp/ kHs"));
    await useAuRegistryStore.getState().rescan();

    expect(useAuRegistryStore.getState().rescanError).toBeNull();
  });

  it("autoScanIfStale does NOT scan when loadFromCache errors", async () => {
    // A disk-read error shouldn't trigger an expensive scan automatically
    // — error states should be visible, not papered over with side effects.
    mockedLoad.mockRejectedValueOnce(new Error("disk read fail"));

    await useAuRegistryStore.getState().autoScanIfStale();

    expect(useAuRegistryStore.getState().status.kind).toBe("error");
    expect(mockedRun).not.toHaveBeenCalled();
  });


  it("a second rescan while one is in flight is a no-op", async () => {
    // React StrictMode double-invokes mount effects in dev, and the user
    // can hit Rescan while the auto-refresh is already running. Two
    // concurrent 'auval -l' processes race to write the same cache file.
    mockedLoad.mockResolvedValueOnce(freshRegistry("aufx/Cmpr/appl"));
    await useAuRegistryStore.getState().loadFromCache();
    let resolveScan!: () => void;
    mockedRun.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        resolveScan = r;
      });
    });
    mockedLoad.mockResolvedValueOnce(freshRegistry("aufx/Cmpr/appl"));

    const first = useAuRegistryStore.getState().rescan();
    await vi.waitFor(() => {
      expect(useAuRegistryStore.getState().rescanning).toBe(true);
    });
    await useAuRegistryStore.getState().rescan();

    expect(mockedRun).toHaveBeenCalledTimes(1);

    resolveScan();
    await first;
  });

  it("autoScanIfStale does not stack a scan on top of one already running", async () => {
    const stale = freshRegistry("aufx/Cmpr/appl");
    mockedLoad.mockResolvedValue(stale);
    mockedMtime.mockResolvedValue(stale.scanned_at_unix + 60);
    let resolveScan!: () => void;
    mockedRun.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        resolveScan = r;
      });
    });

    const both = Promise.all([
      useAuRegistryStore.getState().autoScanIfStale(),
      useAuRegistryStore.getState().autoScanIfStale(),
    ]);
    await vi.waitFor(() => {
      expect(useAuRegistryStore.getState().rescanning).toBe(true);
    });

    expect(mockedRun).toHaveBeenCalledTimes(1);

    resolveScan();
    await both;
  });

  it("byFingerprint returns an empty map when not loaded", () => {
    expect(useAuRegistryStore.getState().byFingerprint().size).toBe(0);
  });

  it("byFingerprint returns a lookup map when loaded", async () => {
    mockedLoad.mockResolvedValueOnce(
      makeAuRegistry(["aumu/EZk2/Toon", "aufx/Cmpr/appl"]),
    );
    await useAuRegistryStore.getState().loadFromCache();

    const map = useAuRegistryStore.getState().byFingerprint();
    expect(map.size).toBe(2);
    expect(map.get("aumu/EZk2/Toon")?.fingerprint).toBe("aumu/EZk2/Toon");
  });
});
