import { pickAndAddFolder } from "../../lib/open-folder";

import styles from "./AddFolderButton.module.css";

export function AddFolderButton() {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label="Add folder"
      onClick={() => void pickAndAddFolder()}
    >
      <span aria-hidden="true">+ </span>Add folder
    </button>
  );
}
