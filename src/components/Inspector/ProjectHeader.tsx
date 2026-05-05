import { revealItemInDir } from "@tauri-apps/plugin-opener";

import styles from "./ProjectHeader.module.css";

interface Props {
  readonly path: string;
}

function projectNameOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? trimmed;
  return last.replace(/\.logicx$/i, "");
}

function trimmedPath(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function ProjectHeader({ path }: Props) {
  const trimmed = trimmedPath(path);
  return (
    <section aria-label="project" className={styles.header}>
      <h2 className={styles.name} title={trimmed}>
        {projectNameOf(path)}
      </h2>
      <div className={styles.pathRow}>
        <p className={styles.path} title={trimmed}>
          {trimmed}
        </p>
        <button
          type="button"
          className={styles.revealButton}
          onClick={() => void revealItemInDir(trimmed)}
        >
          Reveal in Finder
        </button>
      </div>
    </section>
  );
}
