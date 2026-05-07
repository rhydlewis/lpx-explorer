import { folderNameOf } from "../../lib/path-utils";
import type { FolderEntry } from "../../lib/types";
import { useLibrarySummariesStore } from "../../store/library-summaries-store";

import { LibraryHomeTile } from "./LibraryHomeTile";

import styles from "./LibraryHome.module.css";

interface Props {
  readonly folder: FolderEntry;
}

/**
 * Library home view (lpx-explorer-1di) — shown in the main area when
 * the user has selected a library folder and no project is loaded.
 * Renders a tile per `.logicx` project in the folder; each tile lazily
 * parses its own summary on mount via `<LibraryHomeTile />`.
 *
 * Reuses `useLibrarySummariesStore` (introduced for lpx-explorer-185)
 * so a project that's already been parsed for the cross-project rollup
 * doesn't re-parse here.
 */
export function LibraryHome({ folder }: Props) {
  const name = folderNameOf(folder.path);
  const summaries = useLibrarySummariesStore((s) => s.summaries);
  const errors = useLibrarySummariesStore((s) => s.errors);

  const total = folder.projects.length;
  const parsed = folder.projects.reduce(
    (n, path) => n + (summaries.has(path) ? 1 : 0),
    0,
  );
  const errored = folder.projects.reduce(
    (n, path) => n + (errors.has(path) ? 1 : 0),
    0,
  );
  const progress = computeProgress(folder, total, parsed, errored);

  return (
    <section
      aria-label="library home"
      className={styles.section}
    >
      <header className={styles.header}>
        <h2 className={styles.heading}>{name}</h2>
        <p className={styles.path}>{folder.path}</p>
        {progress !== null && (
          <p className={styles.progress} aria-live="polite">
            {progress.label}
            {progress.percent !== null && (
              <progress
                className={styles.progressBar}
                value={progress.percent}
                max={100}
              />
            )}
          </p>
        )}
      </header>
      <Body folder={folder} />
    </section>
  );
}

interface Progress {
  readonly label: string;
  /** 0-100; null when no determinate progress is available (mid-scan). */
  readonly percent: number | null;
}

function computeProgress(
  folder: FolderEntry,
  total: number,
  parsed: number,
  errored: number,
): Progress | null {
  if (folder.status.kind === "scanning") {
    return { label: `Scanning… ${total} found`, percent: null };
  }
  // Both successfully-parsed AND errored projects count as 'done' —
  // otherwise a single corrupt bundle would trap the progress bar at
  // 'N-1 of N…' forever. Surface a distinct label when the final
  // count includes errors.
  const settled = parsed + errored;
  if (folder.status.kind === "done" && total > 0 && settled < total) {
    const label = errored > 0
      ? `Reading ${settled} of ${total}… (${errored} couldn't be read)`
      : `Reading ${settled} of ${total}…`;
    return {
      label,
      percent: (settled / total) * 100,
    };
  }
  // All settled but some errored — keep a quiet summary visible so the
  // user knows why the count of 'plug-ins ready' is below their
  // project count.
  if (folder.status.kind === "done" && errored > 0 && settled === total) {
    return {
      label: `${errored} project${errored === 1 ? "" : "s"} couldn't be read`,
      percent: null,
    };
  }
  return null;
}

function Body({ folder }: { readonly folder: FolderEntry }) {
  if (folder.status.kind === "error") {
    return (
      <p className={styles.error}>
        Couldn't scan this folder: {folder.status.message}
      </p>
    );
  }
  if (folder.projects.length === 0) {
    return (
      <p className={styles.placeholder}>No .logicx projects in this folder.</p>
    );
  }
  return (
    <div className={styles.grid}>
      {folder.projects.map((path) => (
        <LibraryHomeTile key={path} path={path} />
      ))}
    </div>
  );
}
