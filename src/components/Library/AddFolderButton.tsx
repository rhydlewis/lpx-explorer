import { pickAndAddFolder } from "../../lib/open-folder";

import styles from "./AddFolderButton.module.css";

export function AddFolderButton() {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => void pickAndAddFolder()}
    >
      + Add folder
    </button>
  );
}
