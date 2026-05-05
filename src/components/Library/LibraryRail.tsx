import { useLibraryStore } from "../../store/library-store";

import { LibrarySearch } from "./LibrarySearch";
import { RecentList } from "./RecentList";

/**
 * Library rail container. Composes LibrarySearch (always visible at the
 * top) + RecentList. Folder scanning (Epic D) slots in below RecentList.
 *
 * Returns null when the library is empty AND no query is active —
 * AppShell consumes the null as a signal to collapse the rail column.
 */
export function LibraryRail() {
  const recentCount = useLibraryStore((s) => s.recent.length);

  if (recentCount === 0) {
    return null;
  }

  return (
    <>
      <LibrarySearch />
      <RecentList />
    </>
  );
}
