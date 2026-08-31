import {
  copyFingerprint,
  copyText,
  searchPluginOnWeb,
} from "../../lib/plugin-actions";
import { useUIStore } from "../../store/ui-store";

import styles from "./PluginRail.module.css";

interface Props {
  readonly fingerprint: string;
  readonly displayName: string;
}

/**
 * Action affordances for a plug-in row. Shared by the per-project rail
 * and the cross-project Library rollup (lpx-explorer-akj) — the Library
 * scope is where a user is triage-shopping for a plug-in they're
 * missing across several projects, so the actions matter at least as
 * much there.
 *
 * "Copy name" (lpx-explorer-9ll) is suppressed when the display name is
 * just the fingerprint: there'd be nothing there that "Copy
 * fingerprint" doesn't already give.
 *
 * Clicks are stopped from bubbling — library rows place these inside a
 * row that has its own click behaviour.
 */
export function PluginRowActions({ fingerprint, displayName }: Props) {
  const searchEngine = useUIStore((s) => s.searchEngine);
  const hasDistinctName = displayName !== fingerprint;

  return (
    <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
      {hasDistinctName && (
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => void copyText(displayName)}
        >
          Copy name
        </button>
      )}
      <button
        type="button"
        className={styles.actionButton}
        onClick={() => void copyFingerprint(fingerprint)}
      >
        Copy fingerprint
      </button>
      <button
        type="button"
        className={styles.actionButton}
        onClick={() => void searchPluginOnWeb(displayName, searchEngine)}
      >
        Search the web
      </button>
    </div>
  );
}
