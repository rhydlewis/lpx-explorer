import { useState } from "react";

import { ChevronRight, X } from "lucide-react";

import { openProject } from "../../lib/open-project";
import { projectNameOf } from "../../lib/path-utils";
import type { FolderEntry } from "../../lib/types";
import { useLibraryStore } from "../../store/library-store";
import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";
import { ErrorCard } from "../ErrorCard";

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

function statusLine(folder: FolderEntry, matchCount: number, query: string): string | null {
  const filtering = query.trim() !== "";
  switch (folder.status.kind) {
    case "scanning":
      return `Scanning… (${folder.projects.length})`;
    case "done":
      if (filtering) {
        return `${matchCount} of ${folder.projects.length}`;
      }
      return folder.projects.length === 1
        ? "1 project"
        : `${folder.projects.length} projects`;
    case "idle":
      return null;
    case "error":
      return null;
  }
}

function matchesQuery(path: string, query: string): boolean {
  if (query.trim() === "") {
    return true;
  }
  const needle = query.toLowerCase();
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? trimmed;
  const name = last.replace(/\.logicx$/i, "").toLowerCase();
  return name.includes(needle);
}

export function FolderNode({ folder }: Props) {
  const [open, setOpen] = useState(false);
  const removeFolder = useLibraryStore((s) => s.removeFolder);
  const query = useLibraryStore((s) => s.query);
  const selectedPath = useProjectStore((s) =>
    s.current.kind === "idle" ? undefined : s.current.path,
  );
  const selectedLibraryFolder = useUIStore((s) => s.selectedLibraryFolder);
  const setSelectedLibraryFolder = useUIStore(
    (s) => s.setSelectedLibraryFolder,
  );
  const isSelectedForBrowse = selectedLibraryFolder === folder.path;

  const visibleProjects = folder.projects.filter((p) => matchesQuery(p, query));
  const status = statusLine(folder, visibleProjects.length, query);
  const name = folderNameOf(folder.path);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <button
          type="button"
          data-rail-row="true"
          aria-expanded={open}
          aria-current={isSelectedForBrowse ? "true" : undefined}
          className={styles.toggle}
          onClick={() => {
            // Two responsibilities on click: toggle the rail-tree open
            // state AND mark this folder as the active library-browse
            // target so the main area renders <LibraryHome /> when no
            // project is loaded (lpx-explorer-1di).
            setOpen((v) => !v);
            setSelectedLibraryFolder(folder.path);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" && !open) {
              e.preventDefault();
              setOpen(true);
            } else if (e.key === "ArrowLeft" && open) {
              e.preventDefault();
              setOpen(false);
            }
          }}
          title={folder.path}
        >
          <span
            className={`${styles.disclosure} ${open ? styles.open : ""}`}
            aria-hidden="true"
          >
            <ChevronRight size="1em" />
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
          <X size="1em" aria-hidden="true" />
        </button>
      </div>

      {folder.status.kind === "error" && (
        <div className={styles.errorWrap}>
          <ErrorCard
            headline="Scan failed"
            detail={folder.status.message}
            onRetry={() => void useLibraryStore.getState().startScan(folder.path)}
          />
        </div>
      )}

      {folder.status.kind === "done" && folder.projects.length === 0 && (
        <p className={styles.empty}>No .logicx projects found.</p>
      )}

      {open && visibleProjects.length > 0 && (
        <ul className={styles.list}>
          {visibleProjects.map((path) => (
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
