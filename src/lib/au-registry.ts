import { invoke } from "@tauri-apps/api/core";

import type { AuRegistry } from "./types";

/**
 * Read the cached AU registry from disk. Returns `null` when the cache
 * file doesn't exist (fresh install — frontend surfaces a "Run AU scan"
 * CTA in that case).
 */
export async function loadAuRegistry(): Promise<AuRegistry | null> {
  return invoke<AuRegistry | null>("load_au_registry");
}
