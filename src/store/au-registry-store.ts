import { create } from "zustand";

import { loadAuRegistry, runAuScan } from "../lib/au-registry";
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
  loadFromCache: () => Promise<void>;
  runScan: () => Promise<void>;
  /**
   * Cold-start sequence: load the cached registry, and if there isn't one
   * (`absent`), kick the AU scan straight away so the user doesn't sit
   * on a non-actionable empty verdict. No-op when the cache loads cleanly
   * or when the disk read errors — those states should remain visible
   * rather than be papered over with side effects.
   */
  autoScanIfAbsent: () => Promise<void>;
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

  autoScanIfAbsent: async () => {
    console.info("[au] autoScanIfAbsent enter");
    await get().loadFromCache();
    if (get().status.kind === "absent") {
      console.info("[au] autoScanIfAbsent → cache absent, scanning");
      await get().runScan();
    }
    console.info(
      `[au] autoScanIfAbsent exit status.kind=${get().status.kind}`,
    );
  },

  byFingerprint: () => lookupMapOf(get().status),

  reset: () => {
    set({ status: { kind: "idle" } });
  },
}));
