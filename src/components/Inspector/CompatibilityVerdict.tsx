import sectionStyles from "./Inspector.module.css";
import styles from "./CompatibilityVerdict.module.css";

export type CompatibilityStatus =
  | "clean"
  | "warnings"
  | "will-not-open"
  | "unknown";

interface Props {
  readonly status?: CompatibilityStatus;
  readonly summary?: string;
}

const COPY: Record<CompatibilityStatus, string> = {
  clean: "Opens cleanly",
  warnings: "Has warnings",
  "will-not-open": "Will not open",
  unknown: "AU registry not yet scanned",
};

/**
 * The "will this project open cleanly on this Mac?" verdict pill.
 * Defaults to the `unknown` variant (neutral grey) until the AU lookup
 * epic (`lpx-explorer-59o`) wires real status; once that ships, the
 * caller passes the resolved status + a summary line.
 */
export function CompatibilityVerdict({ status = "unknown", summary }: Props) {
  return (
    <section aria-label="compatibility" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Compatibility</h3>
      <span data-status={status} className={styles.pill}>
        {COPY[status]}
      </span>
      {summary !== undefined && <p className={styles.summary}>{summary}</p>}
    </section>
  );
}
