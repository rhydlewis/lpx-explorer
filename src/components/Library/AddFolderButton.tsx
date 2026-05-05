import { open } from "@tauri-apps/plugin-dialog";

import { useLibraryStore } from "../../store/library-store";

import styles from "./AddFolderButton.module.css";

async function pickFolder(): Promise<void> {
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

export function AddFolderButton() {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => void pickFolder()}
    >
      + Add folder
    </button>
  );
}
