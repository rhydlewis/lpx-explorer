import { openUrl } from "@tauri-apps/plugin-opener";

import { searchUrlFor, type SearchEngineId } from "./search-engines";

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
 * Copy arbitrary text (a plug-in's display name) to the clipboard
 * verbatim — lpx-explorer-9ll. Same no-normalisation discipline as
 * [`copyFingerprint`]: what the user sees is what they get.
 */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/**
 * Open a web search for the given plug-in name in the system default
 * browser via `tauri-plugin-opener::openUrl`.
 *
 * `engine` comes from the user's View → Search With preference
 * (lpx-explorer-tmo). It is a parameter rather than a store read so
 * this module stays a thin, testable wrapper over the opener.
 */
export async function searchPluginOnWeb(
  query: string,
  engine: SearchEngineId,
): Promise<void> {
  await openUrl(searchUrlFor(engine, query));
}
