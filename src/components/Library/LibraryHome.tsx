import { folderNameOf } from "../../lib/path-utils";
import type { FolderEntry } from "../../lib/types";

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

  return (
    <section
      aria-label="library home"
      className={styles.section}
    >
      <header className={styles.header}>
        <h2 className={styles.heading}>{name}</h2>
        <p className={styles.path}>{folder.path}</p>
      </header>
      <Body folder={folder} />
    </section>
  );
}

function Body({ folder }: { readonly folder: FolderEntry }) {
  if (folder.status.kind === "scanning") {
    return (
      <p className={styles.placeholder} role="status" aria-live="polite">
        Scanning folder…
      </p>
    );
  }
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
