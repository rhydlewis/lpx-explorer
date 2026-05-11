// ─── GoatCounter Install Tracking ────────────────────────────────────
//
// Fires a single anonymous install (or upgrade) event to GoatCounter
// the first time the app runs against a given version.
//
// What is collected:
//   - Event path: "install/<version>" (new) or "upgrade/<from>-to-<to>"
//   - App version (from @tauri-apps/api/app::getVersion)
//   - OS is implicit (macOS-only app); the User-Agent header carries the app name
//   - Server-side timestamp (recorded by GoatCounter)
//
// What is NOT collected:
//   - No personal data, IP addresses, or user-agent fingerprinting
//   - No usage patterns, sessions, or behavioural data
//   - No device identifiers
//
// The tracked version is stored in a dedicated `analytics.json` store
// (separate from library.json / parse-cache.json) so the small/static
// analytics state never touches the churning library files. Uses
// GoatCounter's public /count endpoint — no API token in the binary.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getVersion } from "@tauri-apps/api/app";
import { load } from "@tauri-apps/plugin-store";

const GOATCOUNTER_URL = "https://lpx-explorer.goatcounter.com/count";
const STORE_FILE = "analytics.json";
const STORE_KEY = "analytics:installed-version";

let storePromise: ReturnType<typeof load> | null = null;
function getStore() {
  if (storePromise === null) {
    storePromise = load(STORE_FILE);
  }
  return storePromise;
}

export async function trackInstall(): Promise<void> {
  if (import.meta.env.DEV) return;

  try {
    const store = await getStore();
    const [storedRaw, currentVersion] = await Promise.all([
      store.get(STORE_KEY),
      getVersion(),
    ]);

    const storedVersion =
      typeof storedRaw === "string" ? storedRaw : null;
    if (storedVersion === currentVersion) return;

    const isUpgrade = storedVersion !== null;
    const path = isUpgrade
      ? `upgrade/${storedVersion}-to-${currentVersion}`
      : `install/${currentVersion}`;
    const title = isUpgrade
      ? `Upgrade+${storedVersion}+${encodeURIComponent("→")}+${currentVersion}`
      : `Install+${currentVersion}`;

    const url = `${GOATCOUNTER_URL}?p=${path}&t=${title}&e=true`;

    const response = await tauriFetch(url, {
      headers: {
        "User-Agent": `Mozilla/5.0 (Macintosh) lpx-explorer/${currentVersion}`,
      },
    });

    if (response.ok) {
      await store.set(STORE_KEY, currentVersion);
      await store.save();
    }
  } catch {
    // Analytics must never crash the app
  }
}
