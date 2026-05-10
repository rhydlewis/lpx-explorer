import { useEffect, useMemo, useRef, useState } from "react";

import { folderNameOf, projectNameOf } from "../../lib/path-utils";
import { describeAxis, matchesAxis } from "../../lib/similarity";
import type { FolderEntry } from "../../lib/types";
import { useLibrarySummariesStore } from "../../store/library-summaries-store";
import { useUIStore } from "../../store/ui-store";

import { LibraryHomeTile } from "./LibraryHomeTile";

import styles from "./LibraryHome.module.css";

interface Props {
  readonly folder: FolderEntry;
}

/**
 * Library home view (lpx-explorer-1di) — shown in the main area when
 * the user has selected a library folder and no project is loaded.
 * Renders a tile per `.logicx` project in the folder; each tile lazily
 * parses its own summary on mount via `<LibraryHomeTile />`.
 *
 * Reuses `useLibrarySummariesStore` (introduced for lpx-explorer-185)
 * so a project that's already been parsed for the cross-project rollup
 * doesn't re-parse here.
 */
export function LibraryHome({ folder }: Props) {
  const name = folderNameOf(folder.path);
  const errors = useLibrarySummariesStore((s) => s.errors);
  const summaries = useLibrarySummariesStore((s) => s.summaries);
  const similarityFilter = useUIStore((s) => s.librarySimilarityFilter);
  const setSimilarityFilter = useUIStore(
    (s) => s.setLibrarySimilarityFilter,
  );
  // Per-mount filter state (lpx-explorer-xxb). Reset implicitly on
  // folder switch via React's `key` semantics — each folder mounts a
  // fresh <LibraryHome /> from <App />.
  const [query, setQuery] = useState("");

  // Switching folders clears the similarity filter — the user has
  // navigated away from the result of the pivot, so the chip would be
  // misleading on the new folder. Tracked via a prev-value ref rather
  // than a useEffect cleanup, because under React.StrictMode (enabled
  // in main.tsx) cleanup runs once on initial mount as part of the
  // setup → cleanup → setup verification cycle — and a cleanup that
  // wipes global state was wiping the filter on the very mount that
  // received it. Compare prev vs current path explicitly so we only
  // clear on a genuine switch (lpx-explorer-m1w).
  const prevFolderPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      prevFolderPathRef.current !== null &&
      prevFolderPathRef.current !== folder.path
    ) {
      useUIStore.getState().setLibrarySimilarityFilter(null);
    }
    prevFolderPathRef.current = folder.path;
  }, [folder.path]);

  const failedPaths = folder.projects.filter((path) => errors.has(path));

  const trimmed = query.trim().toLowerCase();
  const visibleProjects = useMemo(() => {
    return folder.projects.filter((path) => {
      if (
        trimmed !== "" &&
        !projectNameOf(path).toLowerCase().includes(trimmed)
      ) {
        return false;
      }
      if (similarityFilter !== null) {
        const summary = summaries.get(path);
        if (summary === undefined) return false;
        if (!matchesAxis(summary, similarityFilter)) return false;
      }
      return true;
    });
  }, [folder.projects, trimmed, similarityFilter, summaries]);

  return (
    <section
      aria-label="library home"
      className={styles.section}
    >
      <header className={styles.header}>
        <h2 className={styles.heading}>{name}</h2>
        <p className={styles.path}>{folder.path}</p>
        {similarityFilter !== null && (
          <button
            type="button"
            className={styles.chip}
            aria-label={`Clear similarity filter: ${describeAxis(similarityFilter)}`}
            onClick={() => setSimilarityFilter(null)}
          >
            <span className={styles.chipLabel}>
              Filtered by:{" "}
              <span className={styles.chipAxis}>
                {describeAxis(similarityFilter)}
              </span>
            </span>
            <span className={styles.chipDismiss} aria-hidden="true">
              ×
            </span>
          </button>
        )}
        {folder.projects.length > 0 && (
          <input
            type="search"
            role="searchbox"
            aria-label="Search projects"
            placeholder="Search projects…"
            value={query}
            className={styles.search}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
        )}
        {(similarityFilter !== null || trimmed !== "") &&
          folder.projects.length > 0 && (
            <p className={styles.countLine} aria-live="polite">
              {visibleProjects.length} of {folder.projects.length}
            </p>
          )}
        {failedPaths.length > 0 && (
          <FailedList paths={failedPaths} errors={errors} />
        )}
      </header>
      <Body
        folder={folder}
        visibleProjects={visibleProjects}
        query={trimmed}
        similarityLabel={
          similarityFilter !== null ? describeAxis(similarityFilter) : null
        }
      />
    </section>
  );
}

interface FailedListProps {
  readonly paths: ReadonlyArray<string>;
  readonly errors: ReadonlyMap<string, string>;
}

function FailedList({ paths, errors }: FailedListProps) {
  return (
    <details className={styles.failedList}>
      <summary>
        {paths.length} couldn't be read — show {paths.length === 1 ? "it" : "them"}
      </summary>
      <ul>
        {paths.map((path) => (
          <li key={path}>
            <span className={styles.failedName}>{projectNameOf(path)}</span>
            <span className={styles.failedPath}>{path}</span>
            <span className={styles.failedReason}>
              {errors.get(path) ?? "unknown error"}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

interface BodyProps {
  readonly folder: FolderEntry;
  readonly visibleProjects: ReadonlyArray<string>;
  readonly query: string;
  readonly similarityLabel: string | null;
}

function Body({ folder, visibleProjects, query, similarityLabel }: BodyProps) {
  if (folder.status.kind === "error") {
    return (
      <p className={styles.error}>
        Couldn't scan this folder: {folder.status.message}
      </p>
    );
  }
  if (folder.projects.length === 0) {
    return (
      <p className={styles.placeholder}>No .logicx projects in this folder.</p>
    );
  }
  if (visibleProjects.length === 0) {
    if (similarityLabel !== null && query !== "") {
      return (
        <p className={styles.placeholder}>
          No projects in {similarityLabel} matching &ldquo;{query}&rdquo;.
        </p>
      );
    }
    if (similarityLabel !== null) {
      return (
        <p className={styles.placeholder}>
          No other projects in {similarityLabel}.
        </p>
      );
    }
    if (query !== "") {
      return (
        <p className={styles.placeholder}>
          No projects match &ldquo;{query}&rdquo;.
        </p>
      );
    }
  }
  return (
    <div className={styles.grid}>
      {visibleProjects.map((path) => (
        <LibraryHomeTile key={path} path={path} />
      ))}
    </div>
  );
}
