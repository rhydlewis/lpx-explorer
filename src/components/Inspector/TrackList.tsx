import { useMemo, useState } from "react";

import type { Track, TrackKind } from "../../lib/types";
import { useUIStore } from "../../store/ui-store";

import { TrackRow } from "./TrackRow";

import sectionStyles from "./Inspector.module.css";
import styles from "./TrackList.module.css";

interface Props {
  readonly tracks: ReadonlyArray<Track>;
}

const USER_VISIBLE: ReadonlySet<TrackKind> = new Set<TrackKind>([
  "audio",
  "instrument",
  "folder",
  "summing-stack",
]);

const ROUTING_KINDS: ReadonlySet<TrackKind> = new Set<TrackKind>([
  "master",
  "output",
  "bus",
  "aux",
  "input",
]);

interface RenderItem {
  readonly track: Track;
  readonly depth: number;
}

function hasAnyInsert(t: Track): boolean {
  return (
    t.instrument !== null || t.midi_fx.length > 0 || t.audio_fx.length > 0
  );
}

/**
 * Build the visible render order from a flat tracks array:
 *   1. User-visible kinds (audio/instrument/folder/summing-stack) always
 *      pass. Routing kinds (master/output/bus/aux/input) require both
 *      `showAll` AND at least one insert — Logic emits ~256 default buses
 *      whose descriptors flag as `is_active` (the bus number lives in
 *      descriptor[4]), so an unfiltered "show all" balloons the list
 *      with empty Bus 1…256 rows.
 *   2. Filter to is_active — Logic creates a default set of unused
 *      channel strips when a project starts; without this filter the
 *      list balloons with phantom Audio 1-3 / Inst 4 etc.
 *   3. Sort by byte offset (matches Logic's Tracks Area top-to-bottom).
 *   4. Nest tracks under summing-stack parents (depth = 1). Folder
 *      children stay flat — folder is a visual marker only in v1.
 */
function buildRenderOrder(
  tracks: ReadonlyArray<Track>,
  showAll: boolean,
): ReadonlyArray<RenderItem> {
  const kindFilter = (t: Track) => {
    if (USER_VISIBLE.has(t.kind)) {
      return true;
    }
    if (!showAll) {
      return false;
    }
    return ROUTING_KINDS.has(t.kind) && hasAnyInsert(t);
  };
  const visible = tracks
    .filter((t) => kindFilter(t) && t.is_active)
    .slice()
    .sort((a, b) => a.offset - b.offset);

  const summingStackOffsets = new Set<number>();
  for (const t of visible) {
    if (t.kind === "summing-stack") {
      summingStackOffsets.add(t.offset);
    }
  }

  const out: RenderItem[] = [];
  for (const t of visible) {
    const isChildOfSummingStack =
      t.parent_offset !== null && summingStackOffsets.has(t.parent_offset);
    out.push({ track: t, depth: isChildOfSummingStack ? 1 : 0 });
  }

  // Reorder so each summing-stack's children render directly after it.
  // Without this step the offset-asc order can scatter children across
  // siblings — Logic's Tracks Area always groups them visually.
  return groupChildrenUnderParents(out);
}

function groupChildrenUnderParents(
  items: ReadonlyArray<RenderItem>,
): ReadonlyArray<RenderItem> {
  const result: RenderItem[] = [];
  const childrenByParent = new Map<number, RenderItem[]>();
  for (const item of items) {
    if (item.depth === 1 && item.track.parent_offset !== null) {
      const arr = childrenByParent.get(item.track.parent_offset) ?? [];
      arr.push(item);
      childrenByParent.set(item.track.parent_offset, arr);
    }
  }
  for (const item of items) {
    if (item.depth === 1) {
      continue; // emitted under its parent below
    }
    result.push(item);
    const children = childrenByParent.get(item.track.offset);
    if (children !== undefined) {
      result.push(...children);
    }
  }
  return result;
}

/**
 * Case-insensitive substring filter against the track's user-given
 * name (preferred) with channel-strip default name fallback. Per
 * lpx-explorer-1ki: 'where's the Bass track?' on a 80+ track
 * project. v1 deliberately does NOT consult the auval registry to
 * resolve instrument names — the renamed-by-user track is the
 * common case, and registry-resolved fallbacks would couple the
 * filter to load order.
 */
function matchesQuery(track: Track, needle: string): boolean {
  if (needle === "") return true;
  const haystack = (track.user_name ?? track.name).toLowerCase();
  return haystack.includes(needle);
}

export function TrackList({ tracks }: Props) {
  const showAll = useUIStore((s) => s.pluginChainsShowAll);
  const togglePluginChainsShowAll = useUIStore((s) => s.togglePluginChainsShowAll);
  const tracksAllExpanded = useUIStore((s) => s.tracksAllExpanded);
  const toggleAllTracks = useUIStore((s) => s.toggleAllTracks);
  const [query, setQuery] = useState("");

  const allItems = useMemo(
    () => buildRenderOrder(tracks, showAll),
    [tracks, showAll],
  );
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return allItems;
    return allItems.filter((it) => matchesQuery(it.track, needle));
  }, [allItems, query]);

  return (
    <section aria-label="tracks" className={sectionStyles.section}>
      <div className={styles.header}>
        <h3 className={sectionStyles.sectionLabel}>Tracks</h3>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.expandAllButton}
            onClick={toggleAllTracks}
          >
            {tracksAllExpanded ? "Collapse all" : "Expand all"}
          </button>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showAll}
              onChange={togglePluginChainsShowAll}
              aria-label="show routing kinds (master, output, bus, aux, input)"
            />
            <span>Show all</span>
          </label>
        </div>
      </div>
      <input
        type="search"
        role="searchbox"
        aria-label="Search tracks"
        placeholder="Search tracks…"
        value={query}
        className={styles.search}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
        }}
      />
      <TrackListBody items={items} totalBeforeFilter={allItems.length} query={query} />
    </section>
  );
}

interface BodyProps {
  readonly items: ReadonlyArray<RenderItem>;
  readonly totalBeforeFilter: number;
  readonly query: string;
}

function TrackListBody({ items, totalBeforeFilter, query }: BodyProps) {
  if (totalBeforeFilter === 0) {
    return <p className={sectionStyles.placeholder}>No tracks detected.</p>;
  }
  const trimmed = query.trim();
  if (items.length === 0 && trimmed !== "") {
    return (
      <p className={sectionStyles.placeholder}>
        No tracks match &ldquo;{trimmed}&rdquo;.
      </p>
    );
  }
  return (
    <>
      {items.map(({ track, depth }) => (
        <TrackRow key={track.offset} track={track} depth={depth} />
      ))}
    </>
  );
}
