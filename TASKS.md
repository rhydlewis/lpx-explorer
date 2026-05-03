# lpx-explorer — setup + tracer task list

Work this list top to bottom. Don't skip ahead. Mark items `- [x]` as you go and commit after each meaningful step. Read `BRIEF.md` first if you haven't.

## 0. Read context

- [x] Read `/Users/rhyd/code/flowcus-v2/CLAUDE.md` in full (the development discipline you'll follow).
- [x] Read `/Users/rhyd/code/lpx-toolkit/CLAUDE.md` in full (the format-parsing knowledge you'll port).
- [x] Skim `/Users/rhyd/code/lpx-toolkit/lpx_inspect.py:706-731` for `find_aus` — that's the function you're porting first.
- [x] Read `BRIEF.md` in this directory in full.

## 1. Project initialisation

- [x] `cd /Users/rhyd/code/lpx-explorer`
- [x] `git init`
- [x] Add a sensible `.gitignore` (Tauri standard: `target/`, `node_modules/`, `dist/`, `.DS_Store`, `*.log`, `src-tauri/gen/`, build artefacts).
- [x] `git add BRIEF.md TASKS.md .gitignore && git commit -m "Initial brief + task list"`
- [ ] Create the GitHub repo (private or public — ask Rhyd if unsure). Set the SSH remote: `git remote add origin git@github.com:rhydlewis/lpx-explorer.git`. Push the initial commit.  *(deferred — pending visibility confirmation)*

## 2. Scaffold the Tauri app

- [x] Run `npm create tauri-app@latest .` inside this directory. Choose: TypeScript, React, Vite. (Tauri 2, not v1.)
- [x] Verify the scaffold builds with `npm install && npm run tauri:dev` — make sure the default Tauri window opens before going further.  *(`cargo check` + `npm install` clean; full `tauri:dev` deferred to manual smoke at 7.6)*
- [x] Pin Rust toolchain to `>= 1.88` in `rust-toolchain.toml` (matches flowcus-v2).
- [x] Commit: `Scaffold Tauri 2 + React 19 + TypeScript via create-tauri-app`.

## 3. Bring tooling parity with flowcus-v2

- [x] Copy ESLint flat-config approach from `/Users/rhyd/code/flowcus-v2/eslint.config.js`. Adapt project-specific rules, keep Sonarjs (cognitive complexity ≤15, max-lines 300).
- [x] Add Vitest config + `npm test` / `npm run test:watch` scripts.
- [x] Add `npm run quality` script that chains: `tsc --noEmit && eslint . && npm test`.
- [x] Set up a pre-commit hook (Husky or `simple-git-hooks`) that runs typecheck + lint + tests on staged files.
- [x] Verify all checks pass on the scaffolded code.
- [x] Commit: `Tooling: ESLint flat config, Vitest, pre-commit hook`.

## 4. Confirm `CLAUDE.md` is current

A `CLAUDE.md` already exists at the repo root (committed alongside the brief). **Do not run `claude init` — it will clobber the existing file.**

- [x] Read the existing `CLAUDE.md` to confirm it's still accurate.
- [x] Once the Tauri scaffold + tooling are in place (sections 2–3), append a "Quick Reference" section to `CLAUDE.md` listing the canonical commands (`npm run tauri:dev`, `npm test`, `cargo test`, `npm run quality`).
- [x] Section 5's beads decision: **yes** — `bd init` already added the beads section to `CLAUDE.md` linking to `bd prime`.
- [x] Commit each `CLAUDE.md` extension separately: `CLAUDE.md: add Quick Reference once tooling is in place`.

## 5. Decide: beads or no beads

- [x] Ask Rhyd: "Use `bd` (beads) for issue tracking on this repo, or stick with `TASKS.md` checklists?"
- [x] **Decision: beads.** `bd init` ran. Walking-skeleton epic = `lpx-explorer-82n` with seven child tasks (`82n.1` through `82n.7`) covering the tracer steps from BRIEF.md. From here, **`bd ready` is the source of truth for what's next** — this `TASKS.md` is frozen as the setup record.

## 6. Decide: Rust crate vs Python subprocess

This is the architecture choice the brief flags. Pick one **before** writing code, log the decision in `docs/decisions.md`.

- [ ] **Option A (recommended)**: native Rust parser crate at `src-tauri/crates/lpx-parser/`. Walking skeleton ports `find_aus` only. Future: PyO3 bindings let the existing Python CLI consume the same crate.
- [ ] **Option B (faster v1)**: Tauri shell that spawns the existing `lpxtool` Python helper as a subprocess and proxies its JSON. No format-parsing in Rust. Skips the port entirely.
- [ ] Write a 5-line entry in `docs/decisions.md` recording the choice + rationale.

The brief assumes Option A. If you choose B, the rest of this task list collapses to "spawn lpxtool, render its JSON output" — much simpler, far less educational, and forfeits the future shared-crate architecture.

## 7. Tracer bullet — vertical slices (per BRIEF.md §"Test expectations")

Each is **one RED → GREEN cycle**. Verify RED is genuine before implementing. Run `npm test` + `cargo test` after each GREEN to confirm no regressions.

### 7.1 Rust parser tracer (Option A)

- [ ] **RED**: write a `cargo test` against a hand-built `Vec<u8>` fixture (4 bytes manufacturer + 4 bytes `umua` + 4 bytes subtype + 8 bytes name padding). Test asserts `find_aus(&bytes)` returns `vec![one AURef { type_code: "aumu", subtype: ..., manufacturer: ... }]`. Confirm test fails with "function not found" → fix to a missing-behaviour failure.
- [ ] **GREEN**: implement the minimal scanner in `crates/lpx-parser/src/lib.rs`. Scan for the four-byte tags `umua` / `xfua` / `fmua`, read 4 bytes either side, reverse each 4CC for the LE encoding, build the fingerprint string `"{type}/{subtype}/{manufacturer}"`.
- [ ] Commit: `Rust: find_aus tracer (single AU descriptor scan)`.

### 7.2 Rust parser real-fixture test

- [ ] Decide fixture strategy: synthesise a minimal `.logicx` programmatically in tests (preferred — no real audio in repo) **or** ask Rhyd for one small `.logicx` to vendor under `tests/fixtures/` (only with explicit permission — `.logicx` files are user content).
- [ ] **RED**: test that `find_aus` against the fixture's `ProjectData` returns ≥1 fingerprint.
- [ ] **GREEN**: extend `find_aus` to handle the realistic byte layout (filter out 4CC matches that aren't preceded by valid manufacturer 4CCs, etc. — see Python `find_aus` for the heuristics).
- [ ] Commit: `Rust: find_aus on real ProjectData fixture`.

### 7.3 Read-only invariant test

- [ ] **RED**: test that SHA-256 of `ProjectData` before parsing equals SHA-256 after parsing. Assert mtime unchanged too. Mirror `lpx-toolkit/tests/test_readonly_invariant.py`.
- [ ] **GREEN**: confirm pass — the parser only reads bytes, never opens the file for write. (If it fails, that's a real bug; fix before continuing.)
- [ ] Commit: `Rust: SHA-256 invariant guards read-only contract`.

### 7.4 Tauri command + IPC contract

- [ ] **RED**: TypeScript test (Vitest, with Tauri IPC mocked) that calls `invoke('parse_project', { path: '...' })` and expects a typed response shape `{ fingerprints: AURef[] }`. Use real types from a shared `types.ts` — no `any`, no type assertions.
- [ ] **GREEN**: implement the Rust `#[tauri::command] fn parse_project(path: String) -> Result<ProjectSummary, ParseError>`. Wire it into `tauri::Builder::default().invoke_handler(...)`. Declare the capability in `src-tauri/capabilities/default.json`.
- [ ] Commit: `Tauri: parse_project command + IPC contract test`.

### 7.5 React frontend tracer

- [ ] **RED**: Vitest + React Testing Library test for `<ProjectSummary />`. Renders a count + first fingerprint string when given a mock IPC response. No `any`, no implementation details (test rendered output, not internal state).
- [ ] **GREEN**: implement `<App />` with a "Pick project" button (uses `@tauri-apps/plugin-dialog`'s `open({ directory: true })`), calls `parse_project`, renders `<ProjectSummary>`. Minimal CSS — list of fingerprints, that's it.
- [ ] Commit: `React: file picker + ProjectSummary tracer`.

### 7.6 Manual end-to-end smoke

- [ ] Run `npm run tauri:dev`. Click "Pick project". Select a real `.logicx` from `~/Music/Logic/`. See fingerprints render.
- [ ] If it works, take a screenshot for the README and check it in.
- [ ] If it doesn't, debug. Don't declare done until the manual smoke passes.

## 8. README + done-definition gate

- [ ] Write `README.md` at the repo root: what the app is, how to dev (`npm run tauri:dev`), how to test (`npm test`, `cargo test`), what's missing relative to the Python CLI (link to `/Users/rhyd/code/lpx-toolkit`), screenshot of the working tracer.
- [ ] Append the architecture decision to `docs/decisions.md` if you haven't already.
- [ ] Confirm: all tests pass, ESLint clean, typecheck clean, pre-commit hooks all green.
- [ ] Commit, push, confirm `git status` shows "up to date with origin".

## 9. Hand off

- [ ] Summarise for Rhyd in chat: what works, what was deferred, what the next epic should be (next likely: port `parse_project()` and the metadata extraction; then the track-registry records).
- [ ] Note any architectural questions that came up during the skeleton (e.g. "the Rust crate naturally wants to be a workspace member — should we restructure?"), so the next session can act on them.

---

## Non-goals reminder (don't get pulled into these during the skeleton)

- Inventory tab, vendor rollup, diagnostics, phantom plugins
- Caching layers (auval, bundles, presets, index)
- HTTP server / `--serve` equivalent
- `--rollup` cross-project view
- Reveal-in-Finder, codesign integration, preset count
- PyO3 bindings (defer)
- Notarization (leave a stub script)
- Auto-updater
- Light/dark theme
- Recursive `~/Music/Logic` browsing

The skeleton is one fingerprint list from one project. Anything else waits.
