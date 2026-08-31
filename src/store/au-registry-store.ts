import { create } from "zustand";

import {
  loadAuPathsNewestMtime,
  loadAuRegistry,
  runAuScan,
} from "../lib/au-registry";
import { registryIsStale } from "../lib/au-utils";
import type { AuRegistry, AuvalEntry } from "../lib/types";

export type RegistryStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "absent" }
  | { kind: "scanning"; found: number }
  | { kind: "loaded"; registry: AuRegistry }
  | { kind: "error"; message: string };

export interface AuRegistryState {
  status: RegistryStatus;
  /**
   * A refresh of an already-loaded registry is in flight. Deliberately
   * separate from `status`: a rescan must not blank the verdict back to
   * "Haven't checked your AUs yet" while the user is mid-read
   * (lpx-explorer-kw0).
   */
  rescanning: boolean;
  /**
   * Why the last refresh failed, or `null`. A failed refresh keeps the
   * previous good registry — `auval` segfaults on broken plug-in
   * installs, and losing a working registry to that would be worse than
   * the staleness it was trying to fix.
   */
  rescanError: string | null;
  loadFromCache: () => Promise<void>;
  runScan: () => Promise<void>;
  /**
   * Refresh an already-loaded registry in place. Keeps the current
   * registry rendering throughout; on failure the prior status survives
   * untouched and the reason lands in `rescanError`.
   */
  rescan: () => Promise<void>;
  /**
   * Cold-start sequence: load the cached registry, then decide whether
   * it can be trusted.
   *
   *  - absent  → scan straight away, so the user doesn't sit on a
   *              non-actionable empty verdict
   *  - stale   → refresh in the background (see `rescan`)
   *  - fresh   → nothing
   *  - error   → nothing. A disk-read error should stay visible rather
   *              than be papered over with an expensive side effect.
   */
  autoScanIfStale: () => Promise<void>;
  byFingerprint: () => Map<string, AuvalEntry>;
  reset: () => void;
}

function messageOf(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === "object" && e !== null && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

function lookupMapOf(status: RegistryStatus): Map<string, AuvalEntry> {
  if (status.kind !== "loaded") {
    return new Map();
  }
  const map = new Map<string, AuvalEntry>();
  for (const entry of status.registry.entries) {
    map.set(entry.fingerprint, entry);
  }
  return map;
}

export const useAuRegistryStore = create<AuRegistryState>((set, get) => ({
  status: { kind: "idle" },
  rescanning: false,
  rescanError: null,

  loadFromCache: async () => {
    console.info("[au] loadFromCache start");
    set({ status: { kind: "loading" } });
    try {
      const registry = await loadAuRegistry();
      const summary = registry === null
        ? "absent"
        : `loaded n=${registry.entries.length}`;
      console.info(`[au] loadFromCache result=${summary}`);
      set({
        status: registry === null
          ? { kind: "absent" }
          : { kind: "loaded", registry },
      });
    } catch (e) {
      console.warn("[au] loadFromCache error", e);
      set({ status: { kind: "error", message: messageOf(e) } });
    }
  },

  runScan: async () => {
    console.info("[au] runScan start (auval -l)");
    set({ status: { kind: "scanning", found: 0 } });
    try {
      let lastLogged = 0;
      await runAuScan(() => {
        const current = get().status;
        if (current.kind === "scanning") {
          const next = current.found + 1;
          set({ status: { kind: "scanning", found: next } });
          // Throttle: log every 50 entries instead of all 400+.
          if (next - lastLogged >= 50) {
            lastLogged = next;
            console.info(`[au] runScan progress=${next}`);
          }
        }
      });
      console.info("[au] runScan complete; reloading cache");
      await get().loadFromCache();
    } catch (e) {
      console.warn("[au] runScan error", e);
      set({ status: { kind: "error", message: messageOf(e) } });
    }
  },

  rescan: async () => {
    if (get().rescanning) {
      // React StrictMode double-invokes mount effects in dev, and the
      // user can hit Rescan while the auto-refresh is already running.
      // Two concurrent `auval -l` runs would race to write one cache.
      console.info("[au] rescan already in flight — ignoring");
      return;
    }
    console.info("[au] rescan start (auval -l, keeping current registry)");
    const previous = get().status;
    set({ rescanning: true, rescanError: null });
    try {
      await runAuScan();
      console.info("[au] rescan complete; reloading cache");
      await get().loadFromCache();
      set({ rescanning: false });
    } catch (e) {
      // Cache is untouched on a failed scan (the Rust side only writes
      // on clean exit), so restoring `previous` cannot desync us from
      // disk.
      console.warn("[au] rescan error — keeping previous registry", e);
      set({
        status: previous,
        rescanning: false,
        rescanError: messageOf(e),
      });
    }
  },

  autoScanIfStale: async () => {
    if (get().rescanning || get().status.kind === "scanning") {
      console.info("[au] autoScanIfStale — scan already in flight, skipping");
      return;
    }
    console.info("[au] autoScanIfStale enter");
    await get().loadFromCache();
    const status = get().status;

    if (status.kind === "absent") {
      console.info("[au] autoScanIfStale → cache absent, scanning");
      await get().runScan();
      return;
    }
    if (status.kind !== "loaded") {
      console.info(`[au] autoScanIfStale exit status.kind=${status.kind}`);
      return;
    }

    const newestMtime = await probeNewestMtime();
    const stale = registryIsStale(
      status.registry,
      newestMtime,
      Math.floor(Date.now() / 1000),
    );
    console.info(
      `[au] autoScanIfStale scanned_at=${status.registry.scanned_at_unix} ` +
        `newest_plugin_mtime=${newestMtime ?? "n/a"} stale=${stale}`,
    );
    if (stale) {
      await get().rescan();
    }
  },

  byFingerprint: () => lookupMapOf(get().status),

  reset: () => {
    set({ status: { kind: "idle" }, rescanning: false, rescanError: null });
  },
}));

/**
 * Newest AU-folder mtime, or `null` if the probe itself fails. A broken
 * probe must not be read as "something changed" — that would rescan on
 * every launch — so it degrades to the TTL backstop instead.
 */
async function probeNewestMtime(): Promise<number | null> {
  try {
    return await loadAuPathsNewestMtime();
  } catch (e) {
    console.warn("[au] mtime probe failed; falling back to TTL", e);
    return null;
  }
}
