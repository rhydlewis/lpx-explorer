import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { handleRailKeyDown } from "../../lib/rail-keynav";
import { useLibraryStore } from "../../store/library-store";
import { useUIStore } from "../../store/ui-store";

import { AddFolderButton } from "./AddFolderButton";
import { FolderNode } from "./FolderNode";
import { LibrarySearch } from "./LibrarySearch";
import { RecentList } from "./RecentList";

import styles from "./Library.module.css";

function SortIcon({ dir }: { readonly dir: "asc" | "desc" | null }) {
  if (dir === "asc") return <ArrowUp size="0.85em" aria-hidden="true" />;
  if (dir === "desc") return <ArrowDown size="0.85em" aria-hidden="true" />;
  return <ArrowUpDown size="0.85em" aria-hidden="true" />;
}

function sortLabel(dir: "asc" | "desc" | null): string {
  if (dir === "asc") return "Sort: A→Z";
  if (dir === "desc") return "Sort: Z→A";
  return "Sort by name";
}

/**
 * Library rail container. Composes:
 *   - LibrarySearch (always visible at top)
 *   - RecentList    (collapses if empty)
 *   - one FolderNode per opened folder, under a 'FOLDERS' heading
 *   - AddFolderButton at the bottom
 *
 * Returns null when both Recent and Folders are empty so AppShell can
 * collapse the rail column at first launch.
 *
 * Captures Up/Down/Home/End keystrokes on `[data-rail-row="true"]`
 * children (project rows + folder toggles) for roving keyboard
 * navigation — see lib/rail-keynav.ts.
 */
export function LibraryRail() {
  const recentCount = useLibraryStore((s) => s.recent.length);
  const folders = useLibraryStore((s) => s.folders);
  const libraryRailSort = useUIStore((s) => s.libraryRailSort);
  const cycleLibraryRailSort = useUIStore((s) => s.cycleLibraryRailSort);

  if (recentCount === 0 && folders.length === 0) {
    return null;
  }

  return (
    <div onKeyDown={handleRailKeyDown}>
      <LibrarySearch />
      <div className={styles.sortBar}>
        <button
          type="button"
          className={styles.sortButton}
          aria-label={sortLabel(libraryRailSort)}
          aria-pressed={libraryRailSort !== null}
          title={sortLabel(libraryRailSort)}
          onClick={cycleLibraryRailSort}
        >
          <SortIcon dir={libraryRailSort} />
          <span>{sortLabel(libraryRailSort)}</span>
        </button>
      </div>
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
    </div>
  );
}
