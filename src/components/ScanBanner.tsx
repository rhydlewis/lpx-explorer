import { useLibraryStore } from "../store/library-store";
import { useLibrarySummariesStore } from "../store/library-summaries-store";

import styles from "./ScanBanner.module.css";

/**
 * Top-of-content banner for the deferred library scan
 * (lpx-explorer-fz4). Visible only when there's work to display:
 *   - the user has at least one library folder, and
 *   - some projects in those folders are still unparsed.
 *
 * Three states:
 *   - 'paused (idle gate)': user is interacting; scan is waiting.
 *   - 'paused (user)':      user clicked Pause; only Resume continues.
 *   - 'scanning':           parses are running.
 *
 * The banner is non-blocking and dismissible only via Pause +
 * navigating away from a folder; once the scan is done, the banner
 * removes itself.
 */
export function ScanBanner() {
  const folders = useLibraryStore((s) => s.folders);
  const summaries = useLibrarySummariesStore((s) => s.summaries);
  const errors = useLibrarySummariesStore((s) => s.errors);
  const scanPaused = useLibrarySummariesStore((s) => s.scanPaused);
  const userPaused = useLibrarySummariesStore((s) => s.userPaused);
  const setUserPaused = useLibrarySummariesStore((s) => s.setUserPaused);

  const allPaths = new Set<string>();
  for (const f of folders) for (const p of f.projects) allPaths.add(p);

  const total = allPaths.size;
  if (total === 0) return null;

  let parsed = 0;
  let errored = 0;
  for (const p of allPaths) {
    if (summaries.has(p)) parsed += 1;
    else if (errors.has(p)) errored += 1;
  }
  const settled = parsed + errored;
  if (settled >= total) return null;

  const status = describeStatus(scanPaused, userPaused);
  const label = `${status} · ${parsed} of ${total}`;
  const percent = total > 0 ? (settled / total) * 100 : 0;

  return (
    <div role="status" aria-live="polite" className={styles.banner}>
      <span className={styles.label}>{label}</span>
      <progress
        className={styles.progress}
        value={percent}
        max={100}
        aria-label="library scan progress"
      />
      <button
        type="button"
        className={styles.button}
        onClick={() => setUserPaused(!userPaused)}
      >
        {userPaused ? "Resume" : "Pause"}
      </button>
    </div>
  );
}

function describeStatus(scanPaused: boolean, userPaused: boolean): string {
  if (userPaused) return "Library scan paused";
  if (scanPaused) return "Library scan waiting…";
  return "Reading library";
}
