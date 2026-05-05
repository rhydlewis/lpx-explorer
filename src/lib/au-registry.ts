import { Channel, invoke } from "@tauri-apps/api/core";

import type { AuRegistry, AuvalEntry } from "./types";

type AuvalEvent =
  | { readonly type: "Entry"; readonly entry: AuvalEntry }
  | { readonly type: "Done" };

/**
 * Read the cached AU registry from disk. Returns `null` when the cache
 * file doesn't exist (fresh install — frontend surfaces a "Run AU scan"
 * CTA in that case).
 */
export async function loadAuRegistry(): Promise<AuRegistry | null> {
  return invoke<AuRegistry | null>("load_au_registry");
}

/**
 * Spawn `auval -l` and stream each parsed entry through `onEntry`.
 * Resolves when the scan completes (cache written on the Rust side);
 * rejects with an `AuvalError` if `auval` couldn't be spawned or
 * exited non-zero (e.g. segfault on a broken plug-in install — the
 * cache is **not** written in that case).
 */
export async function runAuScan(
  onEntry: (entry: AuvalEntry) => void = () => {
    // default no-op
  },
): Promise<void> {
  const channel = new Channel<AuvalEvent>();
  channel.onmessage = (event) => {
    if (event.type === "Entry") {
      onEntry(event.entry);
    }
  };
  await invoke<void>("run_au_scan", { onEvent: channel });
}
