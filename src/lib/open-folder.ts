import { open } from "@tauri-apps/plugin-dialog";

import { useLibraryStore } from "../store/library-store";

/**
 * Open the directory dialog and route the chosen folder through
 * `library-store.addFolder`. Used by both the EmptyState's "Open folder"
 * CTA and the rail's `AddFolderButton`.
 *
 * Cancelling the dialog (no selection) is a no-op.
 */
export async function pickAndAddFolder(): Promise<void> {
  const selection = await open({
    directory: true,
    multiple: false,
    title: "Choose a folder to scan for .logicx projects",
  });
  if (typeof selection !== "string") {
    return;
  }
  await useLibraryStore.getState().addFolder(selection);
}
