import { useLibraryStore } from "../store/library-store";
import { useProjectStore } from "../store/project-store";

/**
 * Single entry point for "load this project". Adds the path to Recent
 * (dedupes to top, capped at 8) and routes through project-store.select.
 *
 * Used by App.tsx's Pick project flow, the drag-drop handler, RecentList
 * rows, and FolderNode rows — all UI surfaces that select a project go
 * through this so Recent stays in sync.
 */
export async function openProject(path: string): Promise<void> {
  useLibraryStore.getState().addRecent(path);
  await useProjectStore.getState().select(path);
}
