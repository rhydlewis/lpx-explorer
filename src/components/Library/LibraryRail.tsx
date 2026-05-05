import { useLibraryStore } from "../../store/library-store";

import { RecentList } from "./RecentList";

/**
 * Library rail container. Currently composes only RecentList; folder
 * scanning (Epic D) and search input (C.8) slot in here.
 *
 * Returns null when the library has nothing to show — AppShell consumes
 * this as a signal to collapse the rail column. Once `useUIStore.railVisible`
 * gets a manual toggle (Epic F.2 keyboard nav), the visibility decision
 * moves up to AppShell consumers.
 */
export function LibraryRail() {
  const recentCount = useLibraryStore((s) => s.recent.length);

  if (recentCount === 0) {
    return null;
  }

  return (
    <>
      <RecentList />
    </>
  );
}
