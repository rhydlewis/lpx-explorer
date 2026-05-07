import { folderNameOf, projectNameOf } from "../../lib/path-utils";
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
  const failedPaths = folder.projects.filter((path) => errors.has(path));
  const progress = computeProgress(folder, total, parsed, failedPaths.length);

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
        {failedPaths.length > 0 && (
          <FailedList paths={failedPaths} errors={errors} />
        )}
      </header>
      <Body folder={folder} />
    </section>
  );
}

interface FailedListProps {
  readonly paths: ReadonlyArray<string>;
  readonly errors: ReadonlyMap<string, string>;
}

function FailedList({ paths, errors }: FailedListProps) {
  return (
    <details className={styles.failedList}>
      <summary>
        {paths.length} couldn't be read — show {paths.length === 1 ? "it" : "them"}
      </summary>
      <ul>
        {paths.map((path) => (
          <li key={path}>
            <span className={styles.failedName}>{projectNameOf(path)}</span>
            <span className={styles.failedPath}>{path}</span>
            <span className={styles.failedReason}>
              {errors.get(path) ?? "unknown error"}
            </span>
          </li>
        ))}
      </ul>
    </details>
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
  // 'N-1 of N…' forever. Once everything's settled, hide the line —
  // <FailedList /> renders separately when there are errors.
  const settled = parsed + errored;
  if (folder.status.kind === "done" && total > 0 && settled < total) {
    return {
      label: `Reading ${settled} of ${total}…`,
      percent: (settled / total) * 100,
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
