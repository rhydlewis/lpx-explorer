import { useEffect, useMemo, useRef } from "react";

import { Ghost } from "lucide-react";

import { type InstallStatus } from "../../lib/au-utils";
import { aggregateLibrary } from "../../lib/library-rollup";
import { copyFingerprint, searchPluginOnWeb } from "../../lib/plugin-actions";
import type { AuRegistry, ProjectSummary } from "../../lib/types";
import { useAuRegistryStore } from "../../store/au-registry-store";
import { useLibraryStore } from "../../store/library-store";
import { useLibrarySummariesStore } from "../../store/library-summaries-store";
import {
  useUIStore,
  type PluginRailChip,
  type PluginRailScope,
} from "../../store/ui-store";

import { LibraryPluginRow } from "./LibraryPluginRow";
import {
  applyFilters,
  buildDisplayGroups,
  buildLibraryGroups,
  type DisplayGroup,
} from "./plugin-rail-groups";

import sectionStyles from "./Inspector.module.css";
import styles from "./PluginRail.module.css";

/**
 * Apple's stock metronome AU. Klopfgeist is German for poltergeist /
 * knocker — the in-joke Apple's hidden in plain sight. Logic auto-loads
 * it into every project (most users never hear it). Triggers a small
 * `<Ghost />` mark next to the row name; the row is the only place this
 * easter egg surfaces, fires on the canonical fingerprint only, never
 * as decoration.
 */
const KLOPFGEIST_FINGERPRINT = "aumu/klop/appl";

interface Props {
  readonly summary: ProjectSummary;
}

const INSTALL_LABEL: Record<Exclude<InstallStatus, "unknown">, string> = {
  installed: "Installed",
  missing: "Missing on this Mac",
};

const CHIPS: ReadonlyArray<{ id: PluginRailChip; label: string }> = [
  { id: "all", label: "All" },
  { id: "installed", label: "Installed" },
  { id: "missing", label: "Missing" },
  { id: "duplicated", label: "Duplicated" },
];

const SCOPES: ReadonlyArray<{ id: PluginRailScope; label: string }> = [
  { id: "project", label: "This project" },
  { id: "library", label: "Library" },
];

function loadedRegistry(
  status: ReturnType<typeof useAuRegistryStore.getState>["status"],
): AuRegistry | null {
  return status.kind === "loaded" ? status.registry : null;
}

/**
 * Right-rail plug-in panel — surfaces the project's deduped plug-ins
 * permanently alongside the Inspector's main column. A scope toggle
 * flips between the loaded project and a library-wide rollup
 * (lpx-explorer-185).
 */
export function PluginRail({ summary }: Props) {
  const registry = useAuRegistryStore((s) => loadedRegistry(s.status));
  const filter = useUIStore((s) => s.pluginRailFilter);
  const setFilter = useUIStore((s) => s.setPluginRailFilter);
  const chip = useUIStore((s) => s.pluginRailChip);
  const setChip = useUIStore((s) => s.setPluginRailChip);
  const scope = useUIStore((s) => s.pluginRailScope);
  const setScope = useUIStore((s) => s.setPluginRailScope);
  const jumpNonce = useUIStore((s) => s.pluginRailJumpToMissingNonce);

  const recentEntries = useLibraryStore((s) => s.recent);
  const folderEntries = useLibraryStore((s) => s.folders);
  const summariesMap = useLibrarySummariesStore((s) => s.summaries);
  const getOrParse = useLibrarySummariesStore((s) => s.getOrParse);

  const libraryPaths = useMemo<ReadonlyArray<string>>(() => {
    const seen = new Set<string>();
    for (const r of recentEntries) seen.add(r.path);
    for (const f of folderEntries) {
      for (const p of f.projects) seen.add(p);
    }
    return Array.from(seen);
  }, [recentEntries, folderEntries]);

  // When the user toggles to library scope, fetch summaries for every
  // path we know about. Lazy + de-duped: getOrParse short-circuits
  // cached entries and collapses concurrent calls. Cancellable via the
  // `cancelled` flag — a fast scope flip back to project shouldn't
  // race a half-done fetch.
  useEffect(() => {
    if (scope !== "library") return;
    let cancelled = false;
    void (async () => {
      for (const path of libraryPaths) {
        if (cancelled) return;
        await getOrParse(path);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, libraryPaths, getOrParse]);

  const all = useMemo<ReadonlyArray<DisplayGroup>>(() => {
    if (scope !== "library") {
      return buildDisplayGroups(summary, registry);
    }
    // Include the currently-loaded project's summary in the rollup so
    // the active project always contributes regardless of cache state.
    const map = new Map<string, ProjectSummary>(summariesMap);
    map.set("__current__", summary);
    return buildLibraryGroups(aggregateLibrary(map), registry);
  }, [scope, summary, registry, summariesMap]);

  const visible = useMemo(
    () => applyFilters(all, filter, chip),
    [all, filter, chip],
  );

  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (jumpNonce === 0) return;
    const list = listRef.current;
    if (list === null) return;
    const target = list.querySelector<HTMLElement>(
      'li[data-status="missing"]',
    );
    if (target === null) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    target.setAttribute("data-highlight", "true");
    const t = window.setTimeout(() => {
      target.removeAttribute("data-highlight");
    }, 2200);
    return () => window.clearTimeout(t);
  }, [jumpNonce]);

  return (
    <section aria-label="plug-ins" className={styles.section}>
      <div className={styles.header}>
        <h3 className={sectionStyles.sectionLabel}>Plug-ins</h3>
        <span className={styles.count}>
          {visible.length === all.length
            ? `${all.length}`
            : `${visible.length} / ${all.length}`}
        </span>
      </div>
      <div className={styles.scopeRow} role="group" aria-label="plug-in scope">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            data-active={scope === s.id}
            className={styles.scopeButton}
            onClick={() => setScope(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <input
        type="search"
        role="searchbox"
        aria-label="Search plug-ins"
        placeholder="Search plug-ins…"
        value={filter}
        className={styles.search}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setFilter("");
        }}
      />
      <div className={styles.chips} role="group" aria-label="filter plug-ins">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            data-active={chip === c.id}
            className={styles.chip}
            onClick={() => setChip(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <PluginRailBody all={all} visible={visible} listRef={listRef} scope={scope} />
    </section>
  );
}

interface BodyProps {
  readonly all: ReadonlyArray<DisplayGroup>;
  readonly visible: ReadonlyArray<DisplayGroup>;
  readonly listRef: React.RefObject<HTMLUListElement | null>;
  readonly scope: PluginRailScope;
}

function PluginRailBody({ all, visible, listRef, scope }: BodyProps) {
  if (all.length === 0) {
    return <p className={sectionStyles.placeholder}>No plug-ins detected.</p>;
  }
  if (visible.length === 0) {
    return <p className={sectionStyles.placeholder}>No matches.</p>;
  }
  return (
    <ul ref={listRef} className={styles.list}>
      {visible.map((g) =>
        scope === "library" && g.rolled !== undefined ? (
          <LibraryPluginRow
            key={g.group.fingerprint}
            fingerprint={g.group.fingerprint}
            displayName={g.displayName}
            status={g.status}
            rolled={g.rolled}
          />
        ) : (
          <PluginRow key={g.group.fingerprint} group={g} />
        ),
      )}
    </ul>
  );
}

interface RowProps {
  readonly group: DisplayGroup;
}

function PluginRow({ group }: RowProps) {
  const { displayName, hasRegistryEntry, status } = group;
  const showSecondLine = hasRegistryEntry;
  return (
    <li
      className={styles.row}
      data-fingerprint={group.group.fingerprint}
      data-status={status}
    >
      <div className={styles.line}>
        <span className={styles.name}>{displayName}</span>
        {group.group.fingerprint === KLOPFGEIST_FINGERPRINT && (
          <span
            className={styles.klopfgeist}
            aria-label="Klopfgeist (Logic's stock metronome)"
            title="Klopfgeist — Logic's stock metronome (German: poltergeist)"
          >
            <Ghost size="0.85em" aria-hidden="true" />
          </span>
        )}
        {!showSecondLine && group.group.count > 1 && (
          <span className={styles.countBadge}>×{group.group.count}</span>
        )}
        {status !== "unknown" && (
          <span data-status={status} className={styles.installBadge}>
            {INSTALL_LABEL[status]}
          </span>
        )}
      </div>
      {showSecondLine && (
        <div className={styles.line}>
          <span className={styles.fingerprint}>
            {group.group.fingerprint}
          </span>
          {group.group.count > 1 && (
            <span className={styles.countBadge}>×{group.group.count}</span>
          )}
        </div>
      )}
      {status === "missing" && (
        <MissingRowActions
          fingerprint={group.group.fingerprint}
          displayName={displayName}
        />
      )}
    </li>
  );
}

interface MissingActionsProps {
  readonly fingerprint: string;
  readonly displayName: string;
}

function MissingRowActions({ fingerprint, displayName }: MissingActionsProps) {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.actionButton}
        onClick={() => void copyFingerprint(fingerprint)}
      >
        Copy fingerprint
      </button>
      <button
        type="button"
        className={styles.actionButton}
        onClick={() => void searchPluginOnWeb(displayName)}
      >
        Search the web
      </button>
    </div>
  );
}
