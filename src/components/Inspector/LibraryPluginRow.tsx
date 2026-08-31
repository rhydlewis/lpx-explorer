import { useState } from "react";

import type { InstallStatus } from "../../lib/au-utils";
import type { RolledFingerprint } from "../../lib/library-rollup";
import { openProject } from "../../lib/open-project";

import { PluginName } from "./PluginName";
import { PluginRowActions } from "./PluginRowActions";
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
 *
 * The disclosure is a plain button + `aria-expanded` rather than
 * `<details>/<summary>` (lpx-explorer-akj). Line 1 now carries its own
 * interactive controls — the expandable name and the row actions — and
 * nesting buttons inside a `<summary>` both hijacks their clicks and
 * reads badly to screen readers.
 */
export function LibraryPluginRow({
  fingerprint,
  displayName,
  status,
  rolled,
  showFingerprint,
}: LibraryPluginRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [nameExpanded, setNameExpanded] = useState(false);
  const projectsLabel = `${rolled.projectCount} project${
    rolled.projectCount === 1 ? "" : "s"
  }`;
  return (
    <li
      className={styles.row}
      data-fingerprint={fingerprint}
      data-status={status}
    >
      <div className={styles.line}>
        <RowIcon fingerprint={fingerprint} status={status} />
        <PluginName
          displayName={displayName}
          expanded={nameExpanded}
          onToggle={() => setNameExpanded((v) => !v)}
        />
        <button
          type="button"
          className={styles.libraryCount}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          · {projectsLabel}
        </button>
        {status !== "unknown" && (
          <span data-status={status} className={styles.installBadge}>
            {INSTALL_LABEL[status]}
          </span>
        )}
      </div>
      {expanded && (
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
      )}
      {showFingerprint && displayName !== fingerprint && (
        <div className={styles.line}>
          <span className={styles.fingerprint}>{fingerprint}</span>
        </div>
      )}
      {(status === "missing" || nameExpanded) && (
        <PluginRowActions fingerprint={fingerprint} displayName={displayName} />
      )}
    </li>
  );
}
