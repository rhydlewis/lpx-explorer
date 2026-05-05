import styles from "./Inspector.module.css";

export function TrackList() {
  return (
    <section aria-label="tracks" className={styles.section}>
      <h3 className={styles.sectionLabel}>Tracks</h3>
      <p className={styles.placeholder}>
        Track list will appear here once track-registry parsing lands.
      </p>
    </section>
  );
}
