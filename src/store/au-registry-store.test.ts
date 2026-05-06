import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadAuRegistry, runAuScan } from "../lib/au-registry";
import type { AuvalEntry } from "../lib/types";
import { makeAuRegistry } from "../test/fixtures";

import { useAuRegistryStore } from "./au-registry-store";

vi.mock("../lib/au-registry", () => ({
  loadAuRegistry: vi.fn(),
  runAuScan: vi.fn(),
}));

const mockedLoad = vi.mocked(loadAuRegistry);
const mockedRun = vi.mocked(runAuScan);

describe("useAuRegistryStore", () => {
  beforeEach(() => {
    useAuRegistryStore.getState().reset();
    vi.clearAllMocks();
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

  it("autoScanIfAbsent triggers a scan when the cache is missing", async () => {
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

    const promise = useAuRegistryStore.getState().autoScanIfAbsent();
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

  it("autoScanIfAbsent does NOT scan when the cache already exists", async () => {
    mockedLoad.mockResolvedValueOnce(makeAuRegistry(["aufx/Cmpr/appl"]));

    await useAuRegistryStore.getState().autoScanIfAbsent();

    expect(useAuRegistryStore.getState().status.kind).toBe("loaded");
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it("autoScanIfAbsent does NOT scan when loadFromCache errors", async () => {
    // A disk-read error shouldn't trigger an expensive scan automatically
    // — error states should be visible, not papered over with side effects.
    mockedLoad.mockRejectedValueOnce(new Error("disk read fail"));

    await useAuRegistryStore.getState().autoScanIfAbsent();

    expect(useAuRegistryStore.getState().status.kind).toBe("error");
    expect(mockedRun).not.toHaveBeenCalled();
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
