import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Copy a plug-in fingerprint to the system clipboard. Preserves
 * trailing/leading spaces in 4CCs verbatim — a `String.trim()` here
 * would silently break round-trip lookup against `auval -l`.
 *
 * Uses the web Clipboard API rather than a Tauri plugin: no extra
 * permission prompt, works inside the WebView2 surface, and matches the
 * acceptance criterion on `lpx-explorer-yqw`.
 */
export async function copyFingerprint(fingerprint: string): Promise<void> {
  await navigator.clipboard.writeText(fingerprint);
}

/**
 * Open a Google search for the given plug-in name in the system default
 * browser via `tauri-plugin-opener::openUrl`. Phase-1 of the
 * missing-plug-in helper flow — phase 2 (vendor-aware deep-linking) is
 * a separate bead.
 */
export async function searchPluginOnWeb(query: string): Promise<void> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  await openUrl(url);
}
