import type { InstallStatus } from "../../lib/au-utils";
import type { RolledFingerprint } from "../../lib/library-rollup";
import { openProject } from "../../lib/open-project";

import { RowIcon } from "./RowIcon";

import styles from "./PluginRail.module.css";

const INSTALL_LABEL: Record<Exclude<InstallStatus, "unknown">, string> = {
  installed: "Installed",
  missing: "Missing on this Mac",
};

export interface LibraryPluginRowProps {
  readonly fingerprint: string;
  readonly displayName: string;
  readonly status: InstallStatus;
  readonly rolled: RolledFingerprint;
  readonly showFingerprint: boolean;
}

/**
 * Cross-project rollup row (lpx-explorer-185 + 4l1). Line 1 mirrors
 * `<PluginRow />` exactly — leading icon, name, count badge, install
 * badge — so the user reads both scopes the same way. The library
 * twist: the count badge reads `· N projects` (clickable disclosure)
 * and expands to list the contributing paths.
 */
export function LibraryPluginRow({
  fingerprint,
  displayName,
  status,
  rolled,
  showFingerprint,
}: LibraryPluginRowProps) {
  const projectsLabel = `${rolled.projectCount} project${
    rolled.projectCount === 1 ? "" : "s"
  }`;
  return (
    <li
      className={styles.row}
      data-fingerprint={fingerprint}
      data-status={status}
    >
      <details className={styles.libraryProjects}>
        <summary className={styles.libraryRowSummary}>
          <span className={styles.line}>
            <RowIcon fingerprint={fingerprint} status={status} />
            <span className={styles.name}>{displayName}</span>
            <span className={styles.libraryCount}>· {projectsLabel}</span>
            {status !== "unknown" && (
              <span data-status={status} className={styles.installBadge}>
                {INSTALL_LABEL[status]}
              </span>
            )}
          </span>
        </summary>
        <ul className={styles.libraryProjectsList}>
          {rolled.projectPaths.map((path) => (
            <li key={path}>
              <button
                type="button"
                className={styles.libraryProjectButton}
                onClick={() => void openProject(path)}
              >
                {path}
              </button>
            </li>
          ))}
        </ul>
      </details>
      {showFingerprint && displayName !== fingerprint && (
        <div className={styles.line}>
          <span className={styles.fingerprint}>{fingerprint}</span>
        </div>
      )}
    </li>
  );
}
