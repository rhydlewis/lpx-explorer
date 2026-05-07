import { Ghost } from "lucide-react";

import type { InstallStatus } from "../../lib/au-utils";
import type { RolledFingerprint } from "../../lib/library-rollup";
import { openProject } from "../../lib/open-project";

import styles from "./PluginRail.module.css";

const KLOPFGEIST_FINGERPRINT = "aumu/klop/appl";

const INSTALL_LABEL: Record<Exclude<InstallStatus, "unknown">, string> = {
  installed: "Installed",
  missing: "Missing on this Mac",
};

export interface LibraryPluginRowProps {
  readonly fingerprint: string;
  readonly displayName: string;
  readonly status: InstallStatus;
  readonly rolled: RolledFingerprint;
}

/**
 * One row in the cross-project rollup view (`<PluginRail />` library
 * scope, lpx-explorer-185). Differs from the per-project `<PluginRow />`
 * in two ways: the badge reads *'Used in N projects'* (not `×N`) and a
 * disclosure under the row lists the contributing project paths as
 * clickable buttons that open each project.
 */
export function LibraryPluginRow({
  fingerprint,
  displayName,
  status,
  rolled,
}: LibraryPluginRowProps) {
  const projectsLabel = `Used in ${rolled.projectCount} project${
    rolled.projectCount === 1 ? "" : "s"
  }`;
  // Only show the fingerprint sub-line when it differs from displayName.
  // For 3rd-party AUs without a registry hit, displayName IS the
  // fingerprint — duplicating it adds noise.
  const showSecondLine = displayName !== fingerprint;
  return (
    <li
      className={styles.row}
      data-fingerprint={fingerprint}
      data-status={status}
    >
      <div className={styles.line}>
        <span className={styles.name}>{displayName}</span>
        {fingerprint === KLOPFGEIST_FINGERPRINT && (
          <span
            className={styles.klopfgeist}
            aria-label="Klopfgeist (Logic's stock metronome)"
            title="Klopfgeist — Logic's stock metronome (German: poltergeist)"
          >
            <Ghost size="0.85em" aria-hidden="true" />
          </span>
        )}
        {status !== "unknown" && (
          <span data-status={status} className={styles.installBadge}>
            {INSTALL_LABEL[status]}
          </span>
        )}
      </div>
      {showSecondLine && (
        <div className={styles.line}>
          <span className={styles.fingerprint}>{fingerprint}</span>
        </div>
      )}
      <details className={styles.libraryProjects}>
        <summary className={styles.libraryProjectsSummary}>
          {projectsLabel}
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
    </li>
  );
}
