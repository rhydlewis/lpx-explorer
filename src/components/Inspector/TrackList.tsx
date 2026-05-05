import { useMemo } from "react";

import type { Track, TrackKind } from "../../lib/types";

import { TrackRow } from "./TrackRow";

import sectionStyles from "./Inspector.module.css";

interface Props {
  readonly tracks: ReadonlyArray<Track>;
}

const USER_VISIBLE: ReadonlySet<TrackKind> = new Set<TrackKind>([
  "audio",
  "instrument",
  "folder",
  "summing-stack",
]);

interface RenderItem {
  readonly track: Track;
  readonly depth: number;
}

/**
 * Build the visible render order from a flat tracks array:
 *   1. Filter to user-visible kinds.
 *   2. Sort by byte offset (matches Logic's Tracks Area top-to-bottom).
 *   3. Nest tracks under summing-stack parents (depth = 1). Folder
 *      children stay flat — folder is a visual marker only in v1.
 */
function buildRenderOrder(tracks: ReadonlyArray<Track>): ReadonlyArray<RenderItem> {
  const visible = tracks
    .filter((t) => USER_VISIBLE.has(t.kind))
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

export function TrackList({ tracks }: Props) {
  const items = useMemo(() => buildRenderOrder(tracks), [tracks]);

  return (
    <section aria-label="tracks" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Tracks</h3>
      {items.length === 0 ? (
        <p className={sectionStyles.placeholder}>No tracks detected.</p>
      ) : (
        items.map(({ track, depth }) => (
          <TrackRow key={track.offset} track={track} depth={depth} />
        ))
      )}
    </section>
  );
}
