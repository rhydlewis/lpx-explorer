import { useState } from "react";

import { openProject } from "../../lib/open-project";
import { projectNameOf } from "../../lib/path-utils";
import type { FolderEntry } from "../../lib/types";
import { useLibraryStore } from "../../store/library-store";
import { useProjectStore } from "../../store/project-store";

import { ProjectRow } from "./ProjectRow";

import styles from "./FolderNode.module.css";

interface Props {
  readonly folder: FolderEntry;
}

function folderNameOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? trimmed;
}

function statusLine(folder: FolderEntry): string | null {
  switch (folder.status.kind) {
    case "scanning":
      return `Scanning… (${folder.projects.length})`;
    case "done":
      return folder.projects.length === 1
        ? "1 project"
        : `${folder.projects.length} projects`;
    case "idle":
      return null;
    case "error":
      return null;
  }
}

export function FolderNode({ folder }: Props) {
  const [open, setOpen] = useState(false);
  const removeFolder = useLibraryStore((s) => s.removeFolder);
  const selectedPath = useProjectStore((s) =>
    s.current.kind === "idle" ? undefined : s.current.path,
  );

  const status = statusLine(folder);
  const name = folderNameOf(folder.path);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <button
          type="button"
          aria-expanded={open}
          className={styles.toggle}
          onClick={() => setOpen((v) => !v)}
          title={folder.path}
        >
          <span className={`${styles.disclosure} ${open ? styles.open : ""}`}>
            ▶
          </span>
          <span className={styles.name}>{name}</span>
          {status !== null && <span className={styles.status}>{status}</span>}
        </button>
        <button
          type="button"
          aria-label={`Remove folder ${name}`}
          className={styles.remove}
          onClick={() => removeFolder(folder.path)}
        >
          ✕
        </button>
      </div>

      {folder.status.kind === "error" && (
        <p className={styles.error}>Scan failed: {folder.status.message}</p>
      )}

      {folder.status.kind === "done" && folder.projects.length === 0 && (
        <p className={styles.empty}>No .logicx projects found.</p>
      )}

      {open && folder.projects.length > 0 && (
        <ul className={styles.list}>
          {folder.projects.map((path) => (
            <li key={path}>
              <ProjectRow
                name={projectNameOf(path)}
                path={path}
                status="neutral"
                selected={path === selectedPath}
                onSelect={() => {
                  void openProject(path);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
