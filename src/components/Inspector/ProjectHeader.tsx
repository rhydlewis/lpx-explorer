import { useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ChevronLeft, FolderOpen } from "lucide-react";

import { folderNameOf } from "../../lib/path-utils";
import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";

import styles from "./ProjectHeader.module.css";

interface Props {
  readonly path: string;
  /**
   * Inline content rendered alongside the path + Reveal button on the
   * same row — used to slot the compatibility verdict in so the
   * verdict reads next to the path instead of consuming its own row.
   */
  readonly children?: React.ReactNode;
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

export function ProjectHeader({ path, children }: Props) {
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
      <div className={styles.nameRow}>
        <h2 className={styles.name} title={trimmed}>
          {projectNameOf(path)}
        </h2>
      </div>
      <div className={styles.pathRow}>
        <button
          type="button"
          className={styles.pathButton}
          title="Reveal in Finder"
          aria-label={`Reveal ${trimmed} in Finder`}
          onClick={() => void revealItemInDir(trimmed)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuPos({ x: e.clientX, y: e.clientY });
          }}
        >
          <span className={styles.path}>{trimmed}</span>
          <FolderOpen size="0.9em" aria-hidden="true" className={styles.pathIcon} />
        </button>
        {children}
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
