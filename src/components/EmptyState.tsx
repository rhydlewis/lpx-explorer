import styles from "./EmptyState.module.css";

interface Props {
  readonly onPickProject: () => void;
}

/**
 * First-launch view. Two CTAs (Pick project / Open folder), a tagline, and a
 * read-only reassurance line. Folder scanning lands in Epic D — until then,
 * the Open folder button is disabled with an explanatory tooltip.
 */
export function EmptyState({ onPickProject }: Props) {
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
        <button
          type="button"
          aria-disabled="true"
          title="Folder scanning lands in Epic D"
        >
          Open folder
        </button>
      </div>
      <p className={styles.reassurance}>
        Read-only. We never write to your projects.
      </p>
    </div>
  );
}
