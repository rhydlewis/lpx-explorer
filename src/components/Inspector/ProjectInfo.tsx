import styles from "./Inspector.module.css";

export function ProjectInfo() {
  return (
    <section aria-label="project info" className={styles.section}>
      <h3 className={styles.sectionLabel}>Project</h3>
      <p className={styles.placeholder}>
        Project info will appear here once metadata extraction lands.
      </p>
    </section>
  );
}
