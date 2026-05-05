import styles from "./Inspector.module.css";

/**
 * Walking placeholder for Epic E (`lpx-explorer-466`). E.1 upgrades this to
 * a status-prop pill driven by AU lookup; for now we render the spec's
 * neutral-grey copy ("AU registry not yet wired") so the Inspector layout
 * already includes all five Logic-terminology regions.
 */
export function CompatibilityVerdict() {
  return (
    <section aria-label="compatibility" className={styles.section}>
      <h3 className={styles.sectionLabel}>Compatibility</h3>
      <p className={styles.placeholder}>AU registry not yet wired.</p>
    </section>
  );
}
