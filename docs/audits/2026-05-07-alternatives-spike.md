# Spike: Project Alternatives — multiple ProjectData inside one .logicx

**Bead:** lpx-explorer-rob
**Date:** 2026-05-07
**Test bundle:** `~/Music/Logic/new idea.logicx` (Logic Pro 12.2, 2 alternatives)
**Output:** Findings + recommendation + follow-up beads filed.

## TL;DR

The bundle layout is dead-simple and the alternatives manifest lives in a
single plist at the bundle root. Implementation is much smaller than feared.

- `Resources/ProjectInformation.plist` is the manifest. It contains
  `VariantNames` (display names per zero-padded index), `VariantNamesV2`
  (template-style names with `{PROJECT_NAME}` placeholder, newer key),
  and `ActiveVariant` (integer index — absent on single-variant
  projects, treat as 0).
- Each variant lives at `Alternatives/NNN/` (3-digit zero-padded). The
  per-variant file set is identical to what we already parse: own
  `ProjectData`, own `MetaData.plist`, plus `DisplayState.plist`,
  `DisplayStateArchive`, `WindowImage.jpg`, and per-variant `Project File
  Backups/` + `Undo Data.nosync/`.
- Audio assets are bundle-root (`Media/Audio Files/`) — shared.
- Single-variant projects emit `VariantNames = { "0": "<project-name>" }`
  and no `ActiveVariant` key.

## Findings (long form)

### 1. Layout

```
new idea.logicx/
├── Alternatives/
│   ├── 000/         # 6 tracks
│   │   ├── ProjectData
│   │   ├── MetaData.plist
│   │   ├── DisplayState.plist
│   │   ├── DisplayStateArchive
│   │   ├── WindowImage.jpg
│   │   ├── Project File Backups/
│   │   └── Undo Data.nosync/
│   └── 001/         # 5 tracks (distinct mix of the same project)
│       └── ... (same shape)
├── Media/
│   └── Audio Files/ # shared between variants
└── Resources/
    └── ProjectInformation.plist
```

Identical file *set* per alternative; distinct content per file (sizes
differ, plist contents differ — `MetaData.plist` showed 6 vs 5 tracks).

### 2. Where the alternative names live

`Resources/ProjectInformation.plist`. Inspected with `plutil -p`:

```
{
  "ActiveVariant" => 1
  "BundleVersion" => 2
  "VariantNames" => {
    "0" => "new idea"
    "1" => "new idea - alt 1"
  }
  "VariantNamesV2" => {
    "0" => "{PROJECT_NAME}"
    "1" => "{PROJECT_NAME} - alt 1"
  }
}
```

The plist also carries `LastSavedFrom`, `BundleVersion`, `HasProjectFolder`,
`projectAssetFlags`, `WasOnceSavedFromLPX`. None matter for our purposes.

**`VariantNamesV2`** uses a `{PROJECT_NAME}` template. Logic resolves it
against the bundle's filename at display time. We should mirror that:
substitute `{PROJECT_NAME}` with the bundle's basename (`projectNameOf`
already exists in `path-utils.ts`). When `VariantNamesV2` and
`VariantNames` disagree (older bundles only have v1), prefer v2 if
present, fall back to v1.

### 3. How "active" is determined

`ActiveVariant` integer key in `ProjectInformation.plist`. Sample
single-variant projects (`an idea.logicx`, `captain.logicx`) lacked the
key entirely — interpret missing as `0`. The two-variant test bundle
showed `ActiveVariant => 1`, matching the most-recently-mtime-stamped
`Alternatives/NNN/` directory. Mtime is **not a reliable proxy** —
saving from one variant updates only that variant's mtime, but the
*active variant* could still be a different one if the user switched
without saving. Trust the plist.

### 4. Per-alternative verdict

`MetaData.plist` differs per variant (track counts diverged: 6 vs 5).
`ProjectData` sizes also differ (1.05 MB vs 0.83 MB). The full parse
output (fingerprints, tracks, metadata) will differ per variant. Library
rollups should aggregate **all** variants of every project, not just
variant 000 — that's a behaviour change worth flagging.

### 5. Frequency in the wild

Surveyed every `.logicx` under `~/Music/Logic`: only **1 of 121** had >1
alternative (the test bundle, with 2). The feature is rare in the real
data. Implementation should not regress the common path.

## Recommendation

**Surface as a dropdown in `<ProjectHeader />`.**

- Mirrors Logic's own File > Project Alternatives menu.
- Cheapest UI change: one `<select>` with the `VariantNames` list.
- Hide entirely when there's only one variant (the 120/121 case).
- Default selection: the active variant per `ActiveVariant`.
- Switching the dropdown re-parses the chosen alternative and replaces
  the inspector contents; the alternative selection lives in
  `useProjectStore` (in-session, not persisted across launches —
  re-opening the project should default to `ActiveVariant` again).

**Alternative considered:** segmented switcher above the inspector. Costs
more layout real estate and is wasted on the 99% single-variant case.

**Alternative considered:** showing all alternatives as separate "rows"
in Recents / Library Home tiles. Discarded — would crowd the library
view for a feature that's rare AND user-controlled (the user knows the
alternatives exist; no need to surface them at the library level).

### Library-rollup behaviour

When a user is in **Library scope** in the plug-in rail, the rollup
should aggregate plug-ins from **every** variant of every project, not
just the active one. Otherwise a Reverb only used in `mix v2` would be
invisible until the user opens that project and switches the dropdown.
This is one extra parse per non-active variant, mitigated by the
parse-cache landed in `aay`.

### What stays the same

- Read-only contract — only ever reading bytes.
- Parser API surface — `parse_project(path)` is unchanged. New
  `list_alternatives(path)` + `parse_alternative(path, variant_index)`.
- `parse-cache.json` — cache key gains a variant index suffix; existing
  entries are valid as variant 0 by definition.

## Follow-up beads

Filed below; see `bd ready` after this commit lands.

1. **Parser-side multi-alternative read** — Tauri command to enumerate
   variants from `ProjectInformation.plist` + parse a specific variant.
2. **Project-store: active variant state** — extend `useProjectStore`
   to track which variant is loaded.
3. **`<ProjectHeader />` dropdown** — UX surface per recommendation.
4. **Library rollup across variants** — `aggregateLibrary` should walk
   every variant of every project.
5. **Parse-cache key gains variant index** — extend the cache so each
   variant gets its own entry.

## Out of scope (per bead)

- Implementation. This is the audit; implementation lives in the
  follow-ups above.
- Alternative *creation* / editing — the read-only contract is
  non-negotiable.
