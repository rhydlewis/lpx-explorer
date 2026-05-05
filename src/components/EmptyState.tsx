import styles from "./EmptyState.module.css";

interface Props {
  readonly onPickProject: () => void;
  readonly onOpenFolder: () => void;
}

/**
 * First-launch view. Two CTAs (Pick project / Open folder), a tagline, and a
 * read-only reassurance line.
 */
export function EmptyState({ onPickProject, onOpenFolder }: Props) {
  return (
    <div className={styles.empty}>
      <h1 className={styles.heading}>lpx-explorer</h1>
      <p className={styles.tagline}>
        Inspect Logic Pro projects without opening Logic.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={onPickProject}
        >
          Pick project
        </button>
        <button type="button" onClick={onOpenFolder}>
          Open folder
        </button>
      </div>
      <p className={styles.reassurance}>
        Read-only. We never write to your projects.
      </p>
    </div>
  );
}
