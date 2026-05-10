import { convertFileSrc } from "@tauri-apps/api/core";

import { formatRelative } from "../../lib/time-utils";

import sectionStyles from "./Inspector.module.css";
import styles from "./ProjectWindow.module.css";

interface Props {
  /**
   * Path to Logic's last-save screenshot for the active alternative,
   * surfaced by `commands::list_alternatives` (lpx-explorer-ax6). Null
   * when the file is absent (older Logic versions or projects never
   * re-saved in a recent version).
   */
  readonly windowImagePath: string | null;
  /** Bundle modified-time. Drives the "Snapshot from last save · …" caption. */
  readonly lastSavedUnix: number;
  /** Reference instant for relative-time formatting. Tests pin it. */
  readonly now?: Date;
}

export function ProjectWindow({
  windowImagePath,
  lastSavedUnix,
  now = new Date(),
}: Props) {
  return (
    <section aria-label="project window" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Project window</h3>
      {windowImagePath !== null ? (
        <figure className={styles.figure}>
          <img
            className={styles.image}
            src={convertFileSrc(windowImagePath)}
            alt="Logic window at last save"
            decoding="async"
            loading="lazy"
          />
          <figcaption className={styles.caption}>
            Snapshot from last save · {formatRelative(lastSavedUnix, now)}
          </figcaption>
        </figure>
      ) : (
        <p className={styles.placeholder}>
          No preview available — saved with older Logic.
        </p>
      )}
    </section>
  );
}
