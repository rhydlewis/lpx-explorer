import { useEffect, useMemo, useRef, useState } from "react";

import { type InstallStatus } from "../../lib/au-utils";
import { aggregateLibrary } from "../../lib/library-rollup";
import type { AuRegistry, ProjectSummary } from "../../lib/types";
import { useAuRegistryStore } from "../../store/au-registry-store";
import { useLibraryStore } from "../../store/library-store";
import { useLibrarySummariesStore } from "../../store/library-summaries-store";
import {
  useUIStore,
  type PluginRailChip,
  type PluginRailScope,
} from "../../store/ui-store";

import { AuFreshness } from "./AuFreshnessLine";
import { LibraryPluginRow } from "./LibraryPluginRow";
import { PluginName } from "./PluginName";
import { PluginRowActions } from "./PluginRowActions";
import { PluginRailCountLine } from "./PluginRailCountLine";
import { PluginRailFacetRow } from "./PluginRailFacetRow";
import { RowIcon } from "./RowIcon";
import {
  applyFilters,
  buildDisplayGroups,
  buildLibraryGroups,
  fineCategoryFacets,
  sortLibraryGroups,
  type DisplayGroup,
} from "./plugin-rail-groups";

import sectionStyles from "./Inspector.module.css";
import styles from "./PluginRail.module.css";

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
 * Right-rail plug-in panel. After the 2026-05-08 PM review
 * (lpx-explorer-4l1):
 *   - per-row Lucide icon (effect/instrument/midi) lives in the icon
 *     column; Klopfgeist's Ghost glyph migrated here too
 *   - category chip row removed (icons + search box do the same job)
 *   - fingerprint sub-line off by default; toggle in the header
 *   - count badge always sits on line 1 right of the name
 *   - library-scope rows match line 1 of project-scope rows; the
 *     project-paths disclosure stays underneath
 */
export function PluginRail({ summary }: Props) {
  const registry = useAuRegistryStore((s) => loadedRegistry(s.status));
  const filter = useUIStore((s) => s.pluginRailFilter);
  const setFilter = useUIStore((s) => s.setPluginRailFilter);
  const chip = useUIStore((s) => s.pluginRailChip);
  const setChip = useUIStore((s) => s.setPluginRailChip);
  const fineCategory = useUIStore((s) => s.pluginRailFineCategory);
  const setFineCategory = useUIStore((s) => s.setPluginRailFineCategory);
  const scope = useUIStore((s) => s.pluginRailScope);
  const setScope = useUIStore((s) => s.setPluginRailScope);
  const showFingerprints = useUIStore((s) => s.pluginRailShowFingerprints);
  const toggleShowFingerprints = useUIStore(
    (s) => s.togglePluginRailShowFingerprints,
  );
  const jumpNonce = useUIStore((s) => s.pluginRailJumpToMissingNonce);

  const recentEntries = useLibraryStore((s) => s.recent);
  const folderEntries = useLibraryStore((s) => s.folders);
  const mergedSummariesMap = useLibrarySummariesStore((s) => s.mergedSummaries);
  const getOrParseAllVariants = useLibrarySummariesStore(
    (s) => s.getOrParseAllVariants,
  );

  const libraryPaths = useMemo<ReadonlyArray<string>>(() => {
    const seen = new Set<string>();
    for (const r of recentEntries) seen.add(r.path);
    for (const f of folderEntries) {
      for (const p of f.projects) seen.add(p);
    }
    return Array.from(seen);
  }, [recentEntries, folderEntries]);

  useEffect(() => {
    if (scope !== "library") return;
    let cancelled = false;
    void (async () => {
      // bpp: getOrParseAllVariants reuses the variant-0 cache for
      // variant 0; variants ≥ 1 parse on the IPC bridge once per
      // session. Single-variant projects collapse to a single
      // existing-cache hit (no extra IPC).
      for (const path of libraryPaths) {
        if (cancelled) return;
        await getOrParseAllVariants(path);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, libraryPaths, getOrParseAllVariants]);

  const all = useMemo<ReadonlyArray<DisplayGroup>>(() => {
    if (scope !== "library") {
      return buildDisplayGroups(summary, registry);
    }
    const map = new Map<string, ProjectSummary>(mergedSummariesMap);
    map.set("__current__", summary);
    return sortLibraryGroups(
      buildLibraryGroups(aggregateLibrary(map), registry),
    );
  }, [scope, summary, registry, mergedSummariesMap]);

  const visible = useMemo(
    () => applyFilters(all, filter, chip, fineCategory),
    [all, filter, chip, fineCategory],
  );

  const missingCount = useMemo(
    () => all.filter((g) => g.status === "missing").length,
    [all],
  );

  const facets = useMemo(() => fineCategoryFacets(all), [all]);
  const categorisedCount = useMemo(
    () => all.filter((g) => g.fineCategory !== "Uncategorised").length,
    [all],
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
        <button
          type="button"
          className={styles.fingerprintsToggle}
          aria-pressed={showFingerprints}
          onClick={toggleShowFingerprints}
          title={
            showFingerprints
              ? "Hide technical IDs"
              : "Show technical IDs (4CC fingerprints)"
          }
        >
          {showFingerprints ? "Hide IDs" : "Show IDs"}
        </button>
      </div>
      <PluginRailCountLine
        visible={visible.length}
        total={all.length}
        missing={missingCount}
        categorised={categorisedCount}
      />
      <AuFreshness />
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
      <PluginRailFacetRow
        facets={facets}
        active={fineCategory}
        onSelect={setFineCategory}
      />
      <PluginRailBody
        all={all}
        visible={visible}
        listRef={listRef}
        scope={scope}
        showFingerprints={showFingerprints}
      />
    </section>
  );
}

interface BodyProps {
  readonly all: ReadonlyArray<DisplayGroup>;
  readonly visible: ReadonlyArray<DisplayGroup>;
  readonly listRef: React.RefObject<HTMLUListElement | null>;
  readonly scope: PluginRailScope;
  readonly showFingerprints: boolean;
}

function PluginRailBody({
  all,
  visible,
  listRef,
  scope,
  showFingerprints,
}: BodyProps) {
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
            showFingerprint={showFingerprints && g.hasRegistryEntry}
          />
        ) : (
          <PluginRow
            key={g.group.fingerprint}
            group={g}
            showFingerprint={showFingerprints}
          />
        ),
      )}
    </ul>
  );
}

interface RowProps {
  readonly group: DisplayGroup;
  readonly showFingerprint: boolean;
}

function PluginRow({ group, showFingerprint }: RowProps) {
  const [nameExpanded, setNameExpanded] = useState(false);
  const { displayName, hasRegistryEntry, status } = group;
  const fingerprintLineVisible = showFingerprint && hasRegistryEntry;
  const count = group.group.count;
  return (
    <li
      className={styles.row}
      data-fingerprint={group.group.fingerprint}
      data-status={status}
    >
      <div className={styles.line}>
        <RowIcon fingerprint={group.group.fingerprint} status={status} />
        <PluginName
          displayName={displayName}
          expanded={nameExpanded}
          onToggle={() => setNameExpanded((v) => !v)}
        />
        {count > 1 && (
          <span className={styles.countBadge}>×{count}</span>
        )}
        {status !== "unknown" && (
          <span data-status={status} className={styles.installBadge}>
            {INSTALL_LABEL[status]}
          </span>
        )}
      </div>
      {fingerprintLineVisible && (
        <div className={styles.line}>
          <span className={styles.fingerprint}>
            {group.group.fingerprint}
          </span>
        </div>
      )}
      {(status === "missing" || nameExpanded) && (
        <PluginRowActions
          fingerprint={group.group.fingerprint}
          displayName={displayName}
        />
      )}
    </li>
  );
}

