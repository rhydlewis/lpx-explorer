import type { TrackKind, TrackRegistryEntry } from "../../lib/types";

import sectionStyles from "./Inspector.module.css";
import styles from "./TrackRegistry.module.css";

interface Props {
  readonly entries: ReadonlyArray<TrackRegistryEntry>;
  /**
   * `track_count` from `MetaData.plist`. When present and strictly greater
   * than the recovered registry-entry count, we surface the gap explicitly
   * — Logic's binary stores some user-visible tracks (notably Apple-stock
   * instrument tracks like Bass / Alchemy) in NSKeyedArchive blobs that
   * neither lpx-toolkit nor lpx-explorer parses yet (bead lpx-explorer-14d).
   */
  readonly trackCount?: number;
}

const KIND_GLYPH: Record<TrackKind, string> = {
  audio: "🎤",
  instrument: "🎹",
  folder: "🗀",
  "summing-stack": "⊞",
  master: "M",
  output: "→",
  bus: "B",
  aux: "A",
  input: "←",
  unknown: "?",
};

export function TrackRegistry({ entries, trackCount }: Props) {
  const sorted = [...entries].sort((a, b) => a.offset - b.offset);
  const recovered = sorted.length;
  const gap =
    typeof trackCount === "number" && trackCount > recovered
      ? trackCount - recovered
      : 0;

  return (
    <section aria-label="tracks" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Tracks</h3>
      {recovered === 0 ? (
        <p className={sectionStyles.placeholder}>No tracks identified.</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((entry) => (
            <li
              key={entry.offset}
              className={styles.row}
              data-track-kind={entry.kind}
            >
              <span className={styles.icon} aria-hidden="true">
                {KIND_GLYPH[entry.kind]}
              </span>
              <span className={styles.name} title={entry.name}>
                {entry.name}
              </span>
            </li>
          ))}
        </ul>
      )}
      {gap > 0 && (
        <p className={styles.coverageNote} role="note">
          {recovered} of {trackCount} tracks identified — the rest live in
          NSKeyedArchive blobs not yet parsed.
        </p>
      )}
    </section>
  );
}
