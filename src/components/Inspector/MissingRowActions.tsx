import { copyFingerprint, searchPluginOnWeb } from "../../lib/plugin-actions";

import styles from "./PluginRail.module.css";

interface Props {
  readonly fingerprint: string;
  readonly displayName: string;
}

/**
 * Action affordances on a missing-plug-in row in `<PluginRail />`
 * (lpx-explorer-yqw). Always-visible buttons — Copy fingerprint
 * (clipboard) + Search the web (Google query via Tauri opener). The
 * action is the loudest element on a missing row per the 2026-05-06
 * Whimsy review.
 */
export function MissingRowActions({ fingerprint, displayName }: Props) {
  return (
    <div className={styles.actions}>
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
        onClick={() => void searchPluginOnWeb(displayName)}
      >
        Search the web
      </button>
    </div>
  );
}
