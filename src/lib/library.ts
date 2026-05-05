import { invoke } from "@tauri-apps/api/core";

/**
 * Invoke the Rust `scan_folder` Tauri command. Returns absolute paths of
 * `.logicx` bundles found beneath `path` (recursively, treating `.logicx`
 * directories as leaves).
 *
 * Cancellation + progressive streaming ship in bead `lpx-explorer-has.6`.
 */
export async function scanFolder(path: string): Promise<readonly string[]> {
  return invoke<string[]>("scan_folder", { path });
}
