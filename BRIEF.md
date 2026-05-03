# Walking-skeleton brief: lpx-explorer (Tauri port of lpx-toolkit)

You are a fresh Claude Code session. You're going to build a **walking skeleton** for a Tauri 2 + React 19 + TypeScript port of an existing Python CLI tool called **lpx-toolkit**.

**Walking skeleton** in this brief means: a *tracer bullet* through the entire stack — file picker → Tauri IPC → Rust parser → TypeScript view rendering one parsed result — implemented as the smallest end-to-end vertical slice that proves the architecture works. Not feature-complete. The point is to validate the wiring before a full port.

Start with `TASKS.md` (in this same directory) — it's a short setup list to get you to the point where you can execute on this brief. Read this brief in full first, then work through `TASKS.md` top to bottom.

---

## Hard constraints

1. **Follow `/Users/rhyd/code/flowcus-v2/CLAUDE.md` as your development guideline.** Read it first. The rules that matter most for this work:
   - TDD is non-negotiable — RED/GREEN/REFACTOR in *vertical* slices (one test → one implementation → repeat). No horizontal slicing.
   - **Tracer bullet first** — your first test must prove the end-to-end path through the public interface (file → parser → IPC → frontend rendering).
   - Verify RED is genuine: `ImportError`/`SyntaxError` doesn't count; the failure must point at *missing behaviour*.
   - Decision logging in `docs/decisions.md` when you make architectural choices.
   - No `any` types or type assertions in tests.
   - Test files colocated as `*.test.ts` / `*.rs` with `#[cfg(test)]`.
   - Tauri IPC mocked at the test boundary so frontend tests never hit the runtime.
   - Pre-commit hooks for typecheck + lint + tests.

   **Note on issue tracking**: flowcus-v2 mandates `bd` (beads). For this project, beads use is **undecided** — Rhyd will tell you whether to set it up. Default to a plain `TASKS.md` checklist plus the existing `TASKS.md` in this directory until told otherwise.

2. **Match flowcus-v2's tooling stack** where reasonable:
   - Tauri 2 (not v1)
   - React 19 + TypeScript strict mode
   - Vite for the frontend
   - Vitest for TS tests; Cargo's built-in `cargo test` for Rust
   - ESLint flat config + Sonarjs (cognitive complexity ≤15, file length ≤300 lines)
   - No Prettier (follow existing style)
   - Tauri commands declared in capabilities at `src-tauri/capabilities/default.json`

3. **macOS-only for now.** Logic Pro is mac-only, so the parser can assume macOS. Don't add Windows/Linux conditionals yet.

4. **Read-only contract.** lpx-toolkit *never* writes to a `.logicx` file under any circumstance. Add a Rust integration test that takes a SHA-256 of a fixture before parsing and asserts no byte changed after. This is non-negotiable — `.logicx` files are irreplaceable user work.

---

## What lpx-toolkit is (the product)

A read-only inspector for Logic Pro `.logicx` project bundles. Parses the undocumented binary `ProjectData` file inside the bundle to extract:
- Project metadata (key, BPM, time signature, track count, dates, sample rate, bundle size)
- Audio Unit (AU) plug-in references (manufacturer 4CC + type + subtype = "fingerprint")
- Track list with kind (audio / instrument / folder / summing-stack)
- FX chains per active strip

The headline JTBD is **"Will this project open cleanly on this Mac?"** — answered by cross-referencing the project's plug-ins against the user's locally installed AU registry (`auval -l`).

The existing Python implementation lives at `/Users/rhyd/code/lpx-toolkit/`. **Read these files first** for format knowledge:

- `lpx-toolkit/CLAUDE.md` — the format-parsing knowledge: how AU descriptors are stored as 4CCs, where track-registry records live, the OCuA / gRuA / karT 4CC anchors, what's reverse-engineered and what's still open
- `lpx-toolkit/lpx_inspect.py` — the parser. ~3500 lines. Skim, don't memorise. Key functions: `find_aus()`, `parse_project()`, `find_track_registry_records()`, `_decode_audio_strip_id()`
- `lpx-toolkit/README.md` — user-facing description of the surfaces (`--html`, `--serve`, `--rollup`, `--json`)

The Python tool ships these surfaces today:
- CLI plain-text report
- `--json` (versioned schema, currently v1)
- `--html` self-contained dashboard
- `--serve` library browser (HTTP server, recursive scan of `.logicx` folders)
- `--rollup` cross-project plug-in usage aggregator

---

## Architecture for the Tauri port

Eventual target: a shared **`lpx-parser` Rust crate** that's consumed by both the Tauri app *and* (later, via PyO3 bindings) the existing Python CLI — single source of truth for format knowledge, two distribution surfaces.

For the **walking skeleton**, build only:

```
src-tauri/
  crates/lpx-parser/        # New native Rust crate. Parser code lives here.
    src/lib.rs              # find_aus() port — scan ProjectData bytes for AU descriptors
    src/lib.rs (tests)      # Hand-built byte fixtures replicating Python tests
  src/                      # Tauri app crate
    commands.rs             # `parse_project(path) -> ProjectSummary` Tauri command
    main.rs                 # Standard Tauri entry
src/                        # React frontend
  App.tsx                   # File picker + parsed-result display
  lib/parse.ts              # Tauri IPC wrapper (`invoke('parse_project', { path })`)
  lib/parse.test.ts         # Contract test pinning IPC shape
  components/ProjectSummary.tsx
  components/ProjectSummary.test.tsx
docs/
  decisions.md              # Empty file with header. Append-only.
```

**Tracer bullet path** (the first vertical slice):

1. User clicks a "Pick project" button.
2. Tauri's file-dialog plug-in opens; user selects a `.logicx` directory.
3. Frontend calls `invoke('parse_project', { path })`.
4. Rust command invokes `lpx_parser::find_aus(path)` which:
   - Locates `<bundle>/Alternatives/*/ProjectData`
   - Reads it as `&[u8]`
   - Scans for AU descriptors (`umua`/`xfua`/`fmua` 4CCs reversed)
   - Returns `Vec<AURef { type_code, subtype, manufacturer, fingerprint }>`
5. Result serialises via `serde` to JSON, crosses the IPC boundary.
6. Frontend renders the count + first 5 fingerprints in a list.

That's the entire skeleton. No metadata extraction beyond AU fingerprints. No track list. No HTML port. No HTTP server. No caching. No reveal-in-Finder.

---

## What's explicitly out of scope for the walking skeleton

- All caching (auval, AU bundles, presets, index — defer)
- Track list / region records / OCuA decoding (defer)
- HTML port — keep the React UI minimal (a list, no styling pass)
- `--rollup` cross-project view (defer)
- Reveal-in-Finder, codesign integration, preset count
- PyO3 bindings to the Rust crate (defer to a later epic)
- Notarization workflow — leave a `scripts/build-release.sh` stub mirroring flowcus-v2's, but don't run it
- Auto-updater (Sparkle / `tauri-plugin-updater`) — defer
- Light/dark theme — defer

You are validating that **Rust can parse the format, Tauri IPC carries it, React renders it**. Anything else is scope creep.

---

## Test expectations (TDD discipline)

Order of vertical slices for the skeleton (each is one RED → GREEN cycle):

1. **Rust parser tracer**: failing test loads a hand-built byte fixture (4 bytes manufacturer + 4 bytes `umua` + 4 bytes subtype + 8 bytes name padding), `find_aus(bytes)` returns `vec![one AURef]`. Implement the minimal scan.
2. **Rust parser real fixture**: copy *one* small `.logicx` from `/Users/rhyd/Music/Logic/` (with user permission to use it as a fixture, OR generate a synthetic minimal bundle programmatically — see `lpx-toolkit/tests/conftest.py` for the pattern; do NOT commit user audio). Assert at least one fingerprint is found.
3. **Rust read-only invariant**: SHA-256 the bundle's `ProjectData` before and after parse — assert unchanged.
4. **Tauri command contract test**: invoke `parse_project` with a fixture path via the test harness, assert the IPC response shape matches the Rust struct.
5. **Frontend tracer**: mock the IPC, assert the React component renders the count + the first fingerprint string when given a known response payload.
6. **End-to-end smoke test (manual)**: run `npm run tauri:dev`, click "Pick project", select a `.logicx`, see fingerprints render.

Steps 1–5 must have automated tests. Step 6 is a manual verification gate before declaring the skeleton done.

---

## Format-parsing knowledge that ports directly

From `lpx-toolkit/lpx_inspect.py:706-731` (`find_aus`):

```python
# Three contiguous 4CCs: manufacturer + type + subtype, all little-endian.
# AU type tags scanned (each reversed because of LE encoding):
#   "aumu" ←→ b"umua"   (instrument)
#   "aufx" ←→ b"xfua"   (effect)
#   "aumf" ←→ b"fmua"   (MIDI FX)
# Fingerprint key format: f"{type}/{subtype}/{manufacturer}"
# Display name precedes the descriptor by ~11 chars (truncated in source).
```

That's everything you need for the walking skeleton's parser. Do *not* attempt track-registry records, OCuA channel-strip decoding, or summing-stack detection — those come later.

---

## Done definition for the walking skeleton

- All six tracer steps green (5 automated, 1 manual smoke).
- `cargo test` and `npm test` both pass with no warnings.
- ESLint, typecheck, and pre-commit hooks all pass.
- One entry in `docs/decisions.md` explaining the architecture choice (Rust crate vs spawning Python subprocess from Tauri — pick one with rationale).
- A `README.md` at the repo root explaining how to dev, test, and what's missing relative to the Python CLI.
- A clean git history with descriptive commits per vertical slice.

---

## When stuck

Read the source-of-truth Python code at `/Users/rhyd/code/lpx-toolkit/lpx_inspect.py`. Every byte offset and signature whitelist in that file was empirically derived against real Logic projects — trust it. Don't re-derive the format from first principles.

If a format pattern in the Python code doesn't make sense, check `lpx-toolkit/CLAUDE.md` — the "How the parsing actually works", "Region records and user-renamed track names", and "Track-registry record format" sections explain the *why* behind the offsets.

Ask the user (Rhyd) for clarification only if a real architectural ambiguity surfaces (e.g. "should the Rust crate be a workspace member or a separate crate?", "do you want `bd` set up here?"). Don't ask about code style — match flowcus-v2 conventions.

---

Begin by reading `/Users/rhyd/code/flowcus-v2/CLAUDE.md` and `/Users/rhyd/code/lpx-toolkit/CLAUDE.md` in full. Then work `TASKS.md` top to bottom. Do not write code until you have a failing test.
