# lpx-explorer

Read-only inspector for Logic Pro `.logicx` project bundles. macOS desktop app — Tauri 2 + React 19 + TypeScript + Rust.

The headline question: **"Will this project open cleanly on this Mac?"** LPX Explorer answers it by parsing the undocumented binary `ProjectData` file inside a `.logicx` bundle and cross-referencing the Audio Unit plug-ins it references against the AUs installed on your machine — without launching Logic and without touching a byte of the bundle.

## What it does

**Pick a project, see the verdict.**

- Compatibility verdict band — `clean` / `warnings` / `will-not-open`, with a CTA that jumps to the first missing plug-in.
- Project metadata — key, BPM, time signature, sample rate, dates, bundle size.
- Track list — kind (audio / instrument / folder / summing-stack), user-renamed names recovered from region records and the track registry, with expandable insert chains rendered as colour-coded pills (instrument / FX / MIDI).
- Plug-in rail — every AU referenced by the project, grouped by category, with install-status badges resolved against the local `auval -l` registry. Per-row actions for missing plug-ins (search, copy fingerprint, etc.) and an opt-in mono fingerprint sub-line for triage.

**Pick a folder, see the library.**

- Recursive `.logicx` scan with idle-aware progress and per-project parse cache.
- Tile grid — name, musical line (key + BPM), counts, size; click to open.
- Folder rail with search; recent projects and recent folders surface in the native File menu.
- Plug-in rail flips to library scope — `47 plug-ins · 3 missing across 12 projects` — and each row expands to the contributing project paths.

**System integration.**

- Native macOS menu (File / Edit / View / Help) with `Cmd-O` open project, `Cmd-Shift-O` open folder, theme switcher (System / Light / Dark), Open Recent submenus.
- Drag-and-drop a `.logicx` or a folder onto the window.
- `Cmd-+` / `Cmd-–` / `Cmd-0` scales the entire UI proportionally.

## Read-only contract

`.logicx` files are irreplaceable user work. The parser is structurally incapable of writing to one:

- The Rust crate's API is bytes-only — `find_aus(&[u8])`, `find_tracks(&[u8])`, etc. — it cannot open a file.
- The Tauri command layer reads bytes once and routes them through the parser.
- An integration test (`src-tauri/tests/readonly_invariant.rs`) snapshots SHA-256 + mtime around every parse path and asserts no byte changed.

This is non-negotiable and gated in CI.

## Install

No notarized build yet — build from source:

```sh
git clone https://github.com/rhydlewis/lpx-explorer
cd lpx-explorer
npm install
npm run tauri:dev
```

Requirements: macOS, Node 20+, Rust ≥ 1.88 (pinned in `rust-toolchain.toml`), Xcode command-line tools.

## Develop

```sh
npm run tauri:dev          # full Tauri dev mode (Rust + Vite + window)
npm run dev                # Vite only (Tauri calls this automatically)
npm run quality            # typecheck + lint + frontend tests
cargo test --manifest-path src-tauri/Cargo.toml --workspace
                           # parser crate + Tauri command tests + read-only invariant
```

The pre-commit hook runs typecheck + lint-staged + Vitest. Bypass with `--no-verify` for emergencies only.

## Architecture

- `src-tauri/crates/lpx-parser/` — native Rust crate, single source of truth for `.logicx` format knowledge. Submodules: `metadata` (plist), `regions` (region records → user-renamed track names), `tracks` (track records + AU assignment), `tracks_registry` (registry record names), `auval` (AU registry parsing), `apple_stock` / `apple_drummer` (vendor allow-lists). Bytes-only API.
- `src-tauri/src/commands.rs` — Tauri command surface (`parse_project`, `project_data_stat`, `is_dir`, `home_dir`, `log_event`).
- `src-tauri/src/library.rs` — recursive folder scan (`scan_folder`).
- `src-tauri/src/auval.rs` — `auval -l` registry loader + on-demand rescan.
- `src-tauri/src/lib.rs` — native menu, recents, theme handoff.
- `src/components/` — React surfaces: `Inspector/` (project header, compatibility verdict, project info, track list, plug-in rail), `Library/` (home grid, tile, folder rail, search).
- `src/store/` — Zustand stores (project, library, library summaries, AU registry, UI / theme / zoom).
- `src/lib/` — IPC wrappers, AU categorisation, parse cache, persistence (via `tauri-plugin-store`), drop routing, idle detector, scan scheduler.
- `docs/decisions.md` — architecture decisions log (append-only).

The `&[u8]` parser API is the safety boundary. Future PyO3 bindings will let the Python CLI consume this crate directly so the format knowledge has one home.

## What's missing relative to the Python CLI

The Python tool at [`lpx-toolkit`](https://github.com/rhydlewis/lpx-toolkit) ships a few surfaces this app doesn't (yet):

- **HTML self-contained dashboard** (`--html`) — single-file portable report.
- **Cross-project rollup** as a dedicated view (`--rollup`) — partially covered by the plug-in rail's library scope, but no standalone export.
- **Reveal-in-Finder** on missing plug-ins.
- **Codesign / notarization integration** for plug-in bundles.
- **Preset count + plug-in bundle scanning** beyond the AU registry.

Distribution gaps:

- **Notarized release build** — no `.dmg` on the Releases page yet.
- **Auto-updater** (Sparkle / `tauri-plugin-updater`).

## Known quirks (not bugs)

- Duplicate fingerprints from undo history are *real* — Logic keeps prior plug-in references in `ProjectData` even after you swap a plug-in. The Python CLI offers an opt-in dedupe filter; this app currently shows them as-is.
- Phantom plug-ins from other Alternatives in the bundle are similarly real. Open the project in Logic to see what the active alternative actually loads.

## Issue tracking

Beads (`bd`). Run `bd ready` to see what's open.

## Source-of-truth references

- [`lpx-toolkit/lpx_inspect.py`](https://github.com/rhydlewis/lpx-toolkit) — empirically-derived `.logicx` parser. Every offset and signature whitelist was reverse-engineered against real Logic projects.
- `src-tauri/crates/lpx-parser/` — Rust port + extension.
- `BRIEF.md` — original walking-skeleton scope.
- `docs/decisions.md` — architecture choices and rationale.

## License

TBD.
