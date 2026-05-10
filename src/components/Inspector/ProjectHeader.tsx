import { useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ChevronLeft } from "lucide-react";

import { folderNameOf } from "../../lib/path-utils";
import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";

import styles from "./ProjectHeader.module.css";

interface Props {
  readonly path: string;
}

interface MenuPos {
  readonly x: number;
  readonly y: number;
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
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const selectedLibraryFolder = useUIStore((s) => s.selectedLibraryFolder);
  const clearProject = useProjectStore((s) => s.clear);

  // Dismiss-on-outside-click + Escape. Listeners attach only while the
  // menu is open so we don't run a global keydown handler the rest of
  // the time.
  useEffect(() => {
    if (menuPos === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuPos(null);
    };
    const onMouseDown = () => setMenuPos(null);
    window.addEventListener("keydown", onKey);
    // Use mousedown rather than click so the menu dismisses before any
    // click handler outside the menu fires.
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [menuPos]);

  return (
    <section aria-label="project" className={styles.header}>
      {selectedLibraryFolder !== null && (
        <button
          type="button"
          className={styles.backButton}
          onClick={() => clearProject()}
          title={`Back to ${folderNameOf(selectedLibraryFolder)}`}
        >
          <ChevronLeft size="0.9em" aria-hidden="true" />
          <span className={styles.backLabel}>
            {folderNameOf(selectedLibraryFolder)}
          </span>
        </button>
      )}
      <h2 className={styles.name} title={trimmed}>
        {projectNameOf(path)}
      </h2>
      <div className={styles.pathRow}>
        <p
          className={styles.path}
          title={trimmed}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuPos({ x: e.clientX, y: e.clientY });
          }}
        >
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
      {menuPos !== null && (
        <div
          role="menu"
          className={styles.contextMenu}
          style={{ top: menuPos.y, left: menuPos.x }}
          // Stop the global mousedown from firing inside the menu so
          // clicking the button doesn't dismiss before its onClick runs.
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.contextMenuItem}
            onClick={() => {
              void navigator.clipboard.writeText(trimmed);
              setMenuPos(null);
            }}
          >
            Copy path
          </button>
        </div>
      )}
    </section>
  );
}
