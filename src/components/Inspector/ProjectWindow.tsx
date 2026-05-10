import { convertFileSrc } from "@tauri-apps/api/core";

import type { Alternative } from "../../lib/types";
import { formatRelative } from "../../lib/time-utils";

import { AlternativeStrip } from "./AlternativeStrip";
import sectionStyles from "./Inspector.module.css";
import styles from "./ProjectWindow.module.css";

interface Props {
  readonly alternatives: ReadonlyArray<Alternative>;
  readonly activeVariantIndex: number;
  readonly onSelectAlternative: (index: number) => void;
  /** Bundle modified-time. Drives the "Snapshot from last save · …" caption. */
  readonly lastSavedUnix: number;
  /** Reference instant for relative-time formatting. Tests pin it. */
  readonly now?: Date;
}

export function ProjectWindow({
  alternatives,
  activeVariantIndex,
  onSelectAlternative,
  lastSavedUnix,
  now = new Date(),
}: Props) {
  const active = alternatives.find((a) => a.index === activeVariantIndex);
  const windowImagePath = active?.window_image_path ?? null;

  return (
    <section aria-label="project window" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Project window</h3>
      <div className={styles.layout}>
        <AlternativeStrip
          alternatives={alternatives}
          activeVariantIndex={activeVariantIndex}
          onSelectAlternative={onSelectAlternative}
        />
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
      </div>
    </section>
  );
}
