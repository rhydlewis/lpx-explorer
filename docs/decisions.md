# Architecture decisions

Append-only log. Newest entries at the bottom.

---

## 2026-05-03 — Walking skeleton parser: native Rust crate vs Python subprocess

**Bead:** lpx-explorer-82n (walking skeleton epic)

**Context:** The Tauri port needs a parser for the undocumented `.logicx` `ProjectData` binary. Two paths were on the table: port the format knowledge to a native Rust crate, or ship a Tauri shell that spawns the existing `lpxtool` Python helper as a subprocess and proxies its JSON. The walking skeleton only requires `find_aus` (lpx_inspect.py:706-728) — a ~22-line scan for three contiguous little-endian 4CCs (manufacturer + type + subtype) anchored on `umua`/`xfua`/`fmua` — so the porting cost for the tracer is bounded and known.

**Decision:** Build a native Rust crate at `src-tauri/crates/lpx-parser/`. The walking skeleton ports `find_aus` only, taking `&[u8]` and returning `Vec<AURef>`. The crate becomes the single source of truth for `.logicx` format knowledge; the existing Python CLI is expected to consume it later via PyO3 bindings (deferred — out of scope for this skeleton).

**Alternatives considered:** A Python-subprocess shim that marshals `lpxtool --json` output across the Tauri boundary was rejected. It collapses the skeleton to plumbing with zero format-parsing in Rust, drags a Python runtime into every shipped build, complicates notarization/codesigning, and forfeits the shared-crate trajectory the brief commits to. Faster to a v1, far worse as a foundation.

**Trade-offs:** We accept up-front Rust porting cost (offset by `find_aus` being trivially portable — `memchr`-style scan plus printable-ASCII validation) in exchange for: a self-contained binary, `cargo test` ergonomics against hand-built byte fixtures with no Python in CI, a natural enforcement point for the read-only invariant (`&[u8]` cannot write), and a clean PyO3 surface later because `find_aus(raw: bytes)` already takes bytes. Risk deferred: every additional parser surface (`find_track_registry_records`, `_decode_audio_strip_id`, OCuA decoding, NSKeyedArchive walking) must be re-ported rather than reused — that's the cost of owning the format twice until PyO3 lands.

---

## 2026-05-04 — UX/UI design v1

**Bead:** docs/specs/2026-05-04-ux-design-v1.md (spec); resolves 6 decision beads + adds 2 task amendments.

**Context:** The Python tool's CLI surfaces (`--html`, `--serve`, `--rollup`, `--json`) shouldn't translate 1:1 into native-app views. After a `/spec` session, six open questions surfaced. Settled jointly with Rhyd 2026-05-04.

**Decisions:**

1. **AU lookup activation when `~/.cache/lpx-toolkit/auval.json` is missing** (bead `lpx-explorer-jfx`). When the cache is absent, the CompatibilityVerdict stays neutral grey ("AU registry not yet scanned") and a one-time "Run AU scan" CTA lets the user opt into a Tauri-side scan. Rejected: spawning `auval -l` automatically (5–30s startup tax). Rejected: leaving the user to run the Python tool (half-answers the JTBD). Note: the auval text-parsing logic itself ports to the `lpx-parser` Rust crate as part of the AU-lookup epic — single source of truth, mechanical PyO3 surface.

2. **Phantom-plugin filter UX** (bead `lpx-explorer-q78`). Always show with grouping: collapse identical fingerprints into one row with a `×N` badge; clicking expands. Rejected: always-on dedupe (loses information). Rejected: opt-in toggle (the Python tool's approach — too easy to forget the toggle exists). Grouping is honest *and* visually clean.

3. **Library search/filter affordance** (bead `lpx-explorer-8uw`). Ship an always-visible search input at the top of the rail in Epic C (Library store + Recent). Rhyd has run the Python tool against 100+ Logic projects, so the use case is real, not hypothetical. Rejected: defer (premature optimisation only if the use case were speculative). Rejected: `⌘F` overlay (overkill for a list filter).

4. **Folder scan persistence across launches** (bead `lpx-explorer-fzc`). Hold the v1 "no persistence" stance. The persistence epic (`lpx-explorer-nxt`) is filed and ready when a user-feedback signal indicates re-adding the same folder feels annoying.

5. **Bundle path resolution location** (bead `lpx-explorer-cab`). Keep the parser bytes-only; folder scanning + `ProjectData` location stay in `src-tauri/src/commands.rs`. Re-evaluate when a third path-aware feature lands (AU-lookup, persistence, or JSON export will trigger the second).

6. **Cross-project plug-in lookup UX** (bead `lpx-explorer-ehq`). Defer the rail-filter-vs-overlay shape — the right answer will be obvious once metadata extraction + AU-lookup epics ship and we can see what the data feels like in-app. The rollup epic (`lpx-explorer-185`) is filed as the implementation home.

7. **Drag-and-drop project files** (bead `lpx-explorer-9h9`). Pull into Epic A (AppShell). Tauri 2 handles the drop event natively; ~20 lines on top of the existing file-pick handler. Cheaper to ship now than to remember to revisit.

**Trade-offs:** Pulling decisions in at the spec stage costs minimal time and prevents downstream rework. Two decisions (3 and 7) overrode the spec's recommendations — both based on concrete Rhyd context (100+ projects, drag-and-drop is trivial in Tauri 2) rather than abstract correctness. The deferred decisions (4, 5, 6) all have implementation epics already filed, so they're not lost — just waiting for signal.

---

## 2026-05-05 — Hierarchy in v1: flat where it's labelling, nested where it's signal flow

**Beads:** `lpx-explorer-aum` (track-list folders), `lpx-explorer-mrh` (rail folders).

**Context:** Two open decisions about visual nesting before the new Tracks-section bead (`lpx-explorer-8sy`) ships. (a) The existing TrackList (now relabelled "Plug-in Chains" per `vbt`) nests summing-stack children one indent under their parent, but renders folder children flat. Should folders also nest? (b) The LibraryRail renders projects from a scanned folder as a flat list under one FolderNode, with the path hint disambiguating. Should subfolders render as nested disclosures?

**Decision (a) — track list:** Stay as-is. Summing stacks (Track Stacks) route audio *through* their parent — nesting reflects real signal flow. Folders in Logic are visual-only organisation markers; their children play through their own outputs, not the folder's. Indenting folder children would imply routing that doesn't exist. Existing test in `TrackList.test.tsx` already encodes this (`renders folders flat — children do NOT nest under folders`).

**Decision (b) — rail:** Stay flat. Search/filter (already shipped per the prior decision log entry) handles "find one project among 100+" better than visual hierarchy. Nested disclosures cost real UI complexity (empty-folder rendering, partial-scan state per subfolder, expand/collapse persistence) for marginal gain when the path hint already disambiguates "Covers/" from the parent.

**Alternatives considered:** (a) Nest folder children one indent. Rejected — implies routing semantics Logic doesn't have. (b) File-tree-style rail with disclosure triangles per subfolder. Rejected — adds state machinery the v1 doesn't need; revisit when persistence (`lpx-explorer-nxt`) ships and folders accumulate enough that organisation becomes the dominant friction.

**Trade-offs:** Both choices are reversible — flat-by-default is the cheap baseline; nested is additive when a real signal demands it. The carrying cost is one more thing the user has to learn (which kinds nest, which don't), mitigated by the answer being intuitive: "folders just label, summing stacks actually route."
