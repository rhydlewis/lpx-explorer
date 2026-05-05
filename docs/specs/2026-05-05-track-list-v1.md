# 2026-05-05 — Track list v1 spec (epic `lpx-explorer-5d8`)

**Status:** draft, awaiting bead-filing pass
**Inputs:** chat 2026-05-05 (this conversation), `docs/specs/2026-05-04-ux-design-v1.md` (UX baseline), `lpx-toolkit/lpx_inspect.py`, `lpx-toolkit/CLAUDE.md` (format knowledge).
**Out of scope:** AU lookup (next epic `59o`); action-on-finding (deferred); hidden-track flag (unsolved per `lpx-toolkit/CLAUDE.md`); recursive-region user-renamed track names (filed as `5d8.cluster` follow-up if needed); routing tracks (master/output/bus/aux/input — filed as v1.1 toggle).

## Summary

Port the simpler half of `lpx_inspect.py`'s track parsing — `find_tracks` (16-byte name + 8-byte descriptor scan) and `assign_aus` (route fingerprints to the nearest preceding track) — into the bytes-only `lpx-parser` Rust crate, surface tracks in the existing `parse_project` IPC payload, and replace the `<TrackList />` placeholder with a Logic Pro Tracks Area-style read-out. v1 ships only user-visible kinds (audio, instrument, folder, summing-stack); the more elaborate registry-record + region-cluster parsers + the Show-all-routing-tracks toggle are filed as separate follow-up beads.

## Decisions (resolved 2026-05-05)

1. **IPC strategy:** extend `parse_project` to return tracks in the same payload. Single roundtrip, small JSON.
2. **`TrackKind` representation:** TS string-literal union; optional fields (e.g. `sub_number?: number`) live on the Track itself. No discriminated union per kind — a label, not a state machine.
3. **Track filtering:** v1 renders only user-visible kinds (`audio | instrument | folder | summing-stack`). Routing kinds (`master | output | bus | aux | input`) are parsed (so the data is in the IPC payload) but hidden. A "Show all" toggle is filed as a v1.1 follow-up.
4. **Parser pipeline scope:** v1 ships `find_tracks` + `assign_aus` only. Registry-record signature parsing (`22 12`/`23 12`/etc.) and region-cluster heuristics are filed as `5d8.registry` + `5d8.cluster` for later if a real project shows gaps.
5. **Summing-stack encoding:** parser returns a flat `Vec<Track>`; each `Track` carries an optional `sub_number?: number` and `parent_offset?: number`. The UI builds the tree at render time.

## IPC shape

### Rust (`lpx-parser` + `commands.rs`)

```rust
// crates/lpx-parser/src/tracks.rs
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Track {
    pub name: String,
    pub kind: TrackKind,             // see below
    pub offset: usize,                // byte offset of name marker — stable identity
    pub is_active: bool,              // descriptor[2] & 0x04 || descriptor[4] != 0
    pub instrument: Option<AURef>,    // Some only when kind == "instrument"
    pub midi_fx: Vec<AURef>,
    pub audio_fx: Vec<AURef>,
    pub sub_number: Option<u32>,      // Some only when kind == "summing-stack"
    pub parent_offset: Option<usize>, // Some when this track sits inside a summing-stack
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TrackKind {
    Audio,
    Instrument,
    Folder,
    SummingStack,    // serialised as "summing-stack"
    Master,
    Output,
    Bus,
    Aux,
    Input,
    Unknown,
}

pub fn find_tracks(raw: &[u8]) -> Vec<Track>;
pub fn assign_aus(tracks: &mut Vec<Track>, aus: &[AURef]);
```

`ProjectSummary` (in `commands.rs`) gains a `tracks: Vec<Track>` field. Existing `fingerprints`, `metadata`, `stats` fields unchanged.

### TypeScript (`src/lib/types.ts`)

```ts
export type TrackKind =
  | "audio"
  | "instrument"
  | "folder"
  | "summing-stack"
  | "master"
  | "output"
  | "bus"
  | "aux"
  | "input"
  | "unknown";

export interface Track {
  name: string;
  kind: TrackKind;
  offset: number;
  is_active: boolean;
  instrument: AURef | null;
  midi_fx: AURef[];
  audio_fx: AURef[];
  sub_number?: number;
  parent_offset?: number;
}

export interface ProjectSummary {
  fingerprints: AURef[];
  metadata: ProjectMetadata;
  stats: BundleStats;
  tracks: Track[];
}
```

`makeSummary()` in `src/test/fixtures.ts` defaults `tracks` to `[]`.

## Render strategy

`<TrackList />` builds the visible tree in `useMemo`:

1. Filter to user-visible kinds: `audio | instrument | folder | summing-stack`. Drop everything else.
2. Group by `parent_offset`: any Track whose `parent_offset` matches the offset of a `summing-stack` Track gets nested under it.
3. Folders (kind = `folder`) are flat — Logic's folder concept is currently a visual marker only; v1 doesn't try to nest children under folders (folder children live in the same flat list).
4. Render order matches byte order (offset-asc) so the UI mirrors Logic's Tracks Area top-to-bottom.

Each track row renders:

```
●  [icon] Track name              [active dot]
        ↳ instrument (if instrument track)
        ↳ MIDI FX 1
        ↳ MIDI FX 2
        ↳ Insert 1
        ↳ Insert 2
```

- `[icon]` is a small kind glyph: 🎤 audio, 🎹 instrument, 🗀 folder, ⊞ summing-stack (replace emoji with SVG/Unicode in implementation; placeholder here).
- Active dot uses the existing `<StatusDot>` component with `status="clean"` for `is_active === true` and `status="neutral"` otherwise.
- Inserts render as the existing fingerprint string (e.g. `aufx/Comp/Yamh`) — AU-name resolution lands with epic `59o`.
- Empty insert chain → no nested rows. Inactive tracks → grey out the row but still show.
- Summing-stack children indent one level (16 px) under the parent.

Aria-label remains `tracks` (Logic terminology) per the UX spec; per-row labels use the natural track name.

## Affected files

| File | Change |
|------|--------|
| `src-tauri/crates/lpx-parser/src/lib.rs` | Re-export `Track`, `TrackKind`, `find_tracks`, `assign_aus`. |
| `src-tauri/src/commands.rs` | `ProjectSummary` gains `tracks: Vec<Track>`. `parse_project` calls `find_tracks` + `assign_aus`. |
| `src/lib/types.ts` | Add `Track`, `TrackKind` interfaces; extend `ProjectSummary`. |
| `src/test/fixtures.ts` | `makeSummary()` accepts optional `tracks` override; default `[]`. |
| `src/components/Inspector/TrackList.tsx` | Replace placeholder with the real component. |
| `src/components/Inspector/TrackList.test.tsx` | Replace the 2 placeholder tests with the new behavioural ones. |
| `src/components/Inspector/ProjectInspector.tsx` | Forward `tracks` to `<TrackList />` (currently passes nothing). |
| `src/components/Inspector/ProjectInspector.test.tsx` | Update fixture summary to include some tracks for the rendering assertion. |

## New files

| File | Responsibility |
|------|----------------|
| `src-tauri/crates/lpx-parser/src/tracks.rs` | Track + TrackKind structs; `find_tracks`; `assign_aus`. Mirrors `lpx_inspect.py:43-110, 731-786`. |
| `src/components/Inspector/TrackList.module.css` | Row layout (icon + name + active dot + indent for inserts/sub-tracks). |
| `src/components/Inspector/TrackRow.tsx` | A single track row + its inserts. Extracted so `<TrackList />` stays focused on tree-building. |
| `src/components/Inspector/TrackRow.test.tsx` | Per-row rendering tests (kind icon, active state, insert list ordering). |
| `docs/specs/2026-05-05-track-list-v1.md` | This document. |

## Component hierarchy

```
<ProjectInspector>
  <ProjectHeader />
  <CompatibilityVerdict />
  <ProjectInfo />
  <TrackList tracks={summary.tracks}>
    {/* useMemo builds tree from flat tracks */}
    <TrackRow track={t1} depth={0} />
    <TrackRow track={t2} depth={0} />              // summing-stack parent
      <TrackRow track={t3} depth={1} />            // child of t2
      <TrackRow track={t4} depth={1} />            // child of t2
    <TrackRow track={t5} depth={0} />
  </TrackList>
  <PluginList />
</ProjectInspector>
```

## State changes

No new stores. `<TrackList />` reads `tracks` from `ProjectStatus.loaded.summary.tracks` via the existing `useProjectStore` flow. Tree-building is a memoised pure function inside `<TrackList />` — not store state.

## Decomposition into beads (the bead-filing pass should produce these)

| Bead | Title | Slices |
|------|-------|--------|
| `5d8.1` | Rust `find_tracks` (16-byte name + 8-byte descriptor scan) | Port the `TRACK_NAME_RE` + `find_tracks` logic from `lpx_inspect.py:38-39, 731-762`. Skip user-renamed-track handling; kind classification follows `Track.kind` property at lines ~70-83 (descriptor head bytes determine routing kinds). Cargo tests against synthetic byte fixtures: one of each kind, padding rejection, descriptor type-code masking. |
| `5d8.2` | Rust `assign_aus` (each AU goes to the nearest preceding track) | Port `lpx_inspect.py:765-786`. Cargo tests: instrument descriptor goes to `track.instrument` only on instrument tracks; MIDI FX goes to `midi_fx`; audio effects to `audio_fx`; AUs preceding any track are dropped. |
| `5d8.3` | Summing-stack discriminator | Detect the trailer pattern `XX 01 00 NN 00 01` after a track name, set `kind=SummingStack` + `sub_number=NN`. Mirror `_is_summing_stack_trailer()` in `lpx_inspect.py`. Cargo test against a synthetic fixture with both an offset-0 and offset-1 trailer (per the lpx-toolkit/CLAUDE.md note). Optional second part: derive `parent_offset` for child tracks (those whose audio strip routes to `Sub N`) — defer if non-trivial. |
| `5d8.4` | Wire `parse_project` to return tracks; extend TS types | Mirrors `avb.3` + `avb.4`. ProjectSummary gains `tracks`. `makeSummary` default is `[]`. Read-only invariant test still passes. parse.test.ts contract test extended to assert tracks round-trip. |
| `5d8.5` | `<TrackList />` + `<TrackRow />` components | Replace placeholder with the tree-building component. v1 renders user-visible kinds only (audio + instrument + folder + summing-stack). Inserts render as fingerprint strings. Uses `<StatusDot>` for active state. Tests: tree from a flat list builds correctly; summing-stack children indent; folders flat; routing tracks hidden; inserts render in instrument → MIDI FX → audio FX order. |
| `5d8.6` | "No tracks detected" empty state | When `tracks.length === 0`, render the italic muted "No tracks detected." copy (matches `<PluginList />`'s zero-plugins state). |

## Acceptance criteria (testable)

- [ ] `parse_project` returns `tracks: Track[]` alongside the existing fingerprints/metadata/stats.
- [ ] `find_tracks` recognises all five user-visible kinds for the canonical fixture (one audio, one instrument, one folder, one summing-stack, one bus). Routing kinds are parsed but hidden by the UI.
- [ ] `assign_aus` routes an `aumu` (instrument) descriptor only to `Track.instrument` (only on instrument tracks); `aumf` to `midi_fx`; `aufx` to `audio_fx`; AUs preceding any track are dropped silently (matches Python).
- [ ] Summing-stack detection: a synthetic fixture with the trailer `54 01 00 03 00 01` after a track name is classified `kind=SummingStack`, `sub_number=3`.
- [ ] `<TrackList />` renders tracks in byte-offset order (top-to-bottom matches Logic's Tracks Area top-to-bottom).
- [ ] Summing-stack children (`parent_offset == parent's offset`) indent one level under the parent in the rendered tree.
- [ ] Folders render flat — folder children are NOT nested under the folder for v1.
- [ ] Routing tracks (master/output/bus/aux/input) are present in the IPC payload but absent from the rendered DOM.
- [ ] Each track row renders the active dot via `<StatusDot status={isActive ? 'clean' : 'neutral'} />`.
- [ ] Each insert renders as `type/subtype/manufacturer` (matches `<PluginList />` pre-AU-lookup format).
- [ ] Insert order on the row: instrument first, then MIDI FX, then audio FX (Logic's signal flow).
- [ ] Empty tracks array renders italic "No tracks detected." (matches PluginList's zero-state).
- [ ] No `any` types or type assertions in tests; all fixtures use `makeSummary()`.
- [ ] `cargo test --workspace` and `npm run quality` both green.
- [ ] Read-only invariant test (`crates/lpx-parser/tests/readonly_invariant.rs`) still passes — find_tracks + assign_aus take `&[u8]` / `&[AURef]`.

## Edge cases

1. **Track with zero plug-ins.** Track row renders without the indented inserts list. Active state still reflects the descriptor flags.
2. **Phantom plug-ins from undo history.** `assign_aus` routes them to the nearest preceding track — they appear under whichever track they were attached to before deletion. Per the existing Python tool's documented behaviour, this is correct (see `lpx-toolkit/CLAUDE.md` "Things that look like bugs but aren't").
3. **Project with zero user-visible tracks (only routing tracks).** Empty state ("No tracks detected.") renders. Routing tracks aren't shown until the v1.1 toggle ships.
4. **Long track names.** Truncate with end-ellipsis (CSS `text-overflow: ellipsis`); full name on hover via `title` attribute. Matches `<ProjectRow />` pattern.
5. **Summing-stack with no children detected.** The summing-stack track renders standalone (no nested children); harmless until `parent_offset` derivation lands in `5d8.3`'s second part.
6. **Track name field with whitespace-only contents.** Filtered out by `find_tracks` (Python rejects empty/all-whitespace via the `name = m.group(1).decode("ascii").strip(); if not name` guard).
7. **Folder sitting between two summing-stacks.** Renders flat — folder doesn't visually contain its siblings in v1. Documented in the spec rather than hidden.

## Open questions filed as decision beads

1. **Folder hierarchy in v1.1.** Logic's folder concept is visually a container. Currently we render flat. Worth deciding when the second visual-hierarchy ask comes in (e.g. a user with a deeply foldered project).
2. **Show-all-tracks toggle scope.** v1.1 toggle should default to off. Decide UI: rail-level (in `<UIStore>`?) vs per-Inspector. Lean: in `<UIStore>`, persists across project switches.
3. **Region-record user-renamed track names.** The Python tool uses `find_region_records` to recover names like "Acoustic GTR" / "Ld GTR Low" that don't appear in the registry signature. v1 ships without it; defer until a real project shows generic names.
4. **Track-registry record signatures (`22 12`, `23 12`, …).** Per `lpx-toolkit/CLAUDE.md`, these are partially reverse-engineered. v1's `find_tracks` doesn't use them. If `5d8.5`'s smoke test on a real project shows missing tracks, file `5d8.registry` to extend the parser.

## Recommended slice order (for implementation)

1. `5d8.1` Rust `find_tracks` — biggest port, smallest risk (deterministic, well-understood).
2. `5d8.2` Rust `assign_aus` — small follow-up; needs `5d8.1` to have populated tracks.
3. `5d8.3` Summing-stack discriminator — small, refines `5d8.1`'s output. Skip the `parent_offset` second part for v1 unless the smoke shows it's worth doing.
4. `5d8.4` Wire `parse_project` + extend TS types — mechanical, mirrors `avb.3`+`avb.4`.
5. `5d8.5` `<TrackList />` + `<TrackRow />` — biggest UI slice. Tree-build in `useMemo`. Vitest covers tree shape, indent, ordering, hidden routing kinds.
6. `5d8.6` Empty state — tiny.
