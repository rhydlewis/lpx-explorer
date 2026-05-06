import type { RegistryStatus } from "../store/au-registry-store";

import styles from "./EmptyState.module.css";

interface Props {
  readonly onPickProject: () => void;
  readonly onOpenFolder: () => void;
  /**
   * Current AU registry state. Surfaced in the empty view so the user
   * sees the cold-start scan progress instead of staring at idle copy
   * while their library is being read.
   */
  readonly auRegistryStatus?: RegistryStatus;
}

/**
 * First-launch view. Two CTAs (Pick project / Open folder), a tagline, and a
 * read-only reassurance line. When the AU registry is being scanned (cold
 * start with no cache), a quiet status line surfaces the live entry count.
 */
export function EmptyState({
  onPickProject,
  onOpenFolder,
  auRegistryStatus,
}: Props) {
  return (
    <div className={styles.empty}>
      <h1 className={styles.heading}>
        LPX <em className={styles.headingAccent}>Explorer</em>
      </h1>
      <p className={styles.tagline}>
        Check whether a project will open before you launch Logic.
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
      <p className={styles.dropHint}>or drag a .logicx anywhere</p>
      <ScanStatusLine status={auRegistryStatus} />
      <p className={styles.reassurance}>
        Read-only. We never write to your projects.
      </p>
    </div>
  );
}

function ScanStatusLine({ status }: { readonly status: RegistryStatus | undefined }) {
  if (status === undefined) {
    return null;
  }
  if (status.kind === "scanning") {
    return (
      <p
        role="status"
        aria-live="polite"
        className={styles.scanStatus}
      >
        Reading your AU library… ({status.found})
      </p>
    );
  }
  if (status.kind === "loaded") {
    const n = status.registry.entries.length;
    return (
      <p className={styles.scanStatus}>
        {n} {n === 1 ? "plug-in" : "plug-ins"} ready to check against.
      </p>
    );
  }
  if (status.kind === "error") {
    return (
      <p
        role="status"
        aria-live="polite"
        className={styles.scanStatus}
      >
        Couldn't read your AU library — pick a project anyway, or retry from the inspector.
      </p>
    );
  }
  return null;
}
