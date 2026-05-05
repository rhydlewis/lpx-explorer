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
    set({ status: { kind: "loading" } });
    try {
      const registry = await loadAuRegistry();
      set({
        status: registry === null
          ? { kind: "absent" }
          : { kind: "loaded", registry },
      });
    } catch (e) {
      set({ status: { kind: "error", message: messageOf(e) } });
    }
  },

  runScan: async () => {
    set({ status: { kind: "scanning", found: 0 } });
    try {
      await runAuScan(() => {
        const current = get().status;
        if (current.kind === "scanning") {
          set({ status: { kind: "scanning", found: current.found + 1 } });
        }
      });
      // Rust wrote the cache; reload to surface the canonical entries.
      await get().loadFromCache();
    } catch (e) {
      set({ status: { kind: "error", message: messageOf(e) } });
    }
  },

  byFingerprint: () => lookupMapOf(get().status),

  reset: () => {
    set({ status: { kind: "idle" } });
  },
}));
