import { useLibraryStore } from "../../store/library-store";

import { AddFolderButton } from "./AddFolderButton";
import { FolderNode } from "./FolderNode";
import { LibrarySearch } from "./LibrarySearch";
import { RecentList } from "./RecentList";

import styles from "./Library.module.css";

/**
 * Library rail container. Composes:
 *   - LibrarySearch (always visible at top)
 *   - RecentList    (collapses if empty)
 *   - one FolderNode per opened folder, under a 'FOLDERS' heading
 *   - AddFolderButton at the bottom
 *
 * Returns null when both Recent and Folders are empty so AppShell can
 * collapse the rail column at first launch.
 */
export function LibraryRail() {
  const recentCount = useLibraryStore((s) => s.recent.length);
  const folders = useLibraryStore((s) => s.folders);

  if (recentCount === 0 && folders.length === 0) {
    return null;
  }

  return (
    <>
      <LibrarySearch />
      <RecentList />
      {folders.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>Folders</h3>
          {folders.map((f) => (
            <FolderNode key={f.path} folder={f} />
          ))}
        </section>
      )}
      <AddFolderButton />
    </>
  );
}
