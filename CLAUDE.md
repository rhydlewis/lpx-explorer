# lpx-explorer

Tauri 2 + React 19 + TypeScript desktop app for macOS. A read-only inspector for Logic Pro `.logicx` project bundles. Surfaces the AU plug-ins, tracks, and metadata stored in the undocumented binary `ProjectData` file inside each bundle, without launching Logic.

This repo is currently a **walking-skeleton port** of an existing Python CLI (`lpx-toolkit`). See `BRIEF.md` for the architecture and scope of the skeleton; see `TASKS.md` for the step-by-step plan.

## Sources of truth

- **Development discipline** (TDD rules, decision logging, code conventions, testing patterns): `/Users/rhyd/code/flowcus-v2/CLAUDE.md`. Read it before writing code. Inherit those rules unless this file or `BRIEF.md` says otherwise.
- **Format-parsing knowledge** (4CC anchors, AU descriptor layout, registry record signatures, what's reverse-engineered, what's still open): `/Users/rhyd/code/lpx-toolkit/CLAUDE.md` and the parser at `/Users/rhyd/code/lpx-toolkit/lpx_inspect.py`. Trust those byte offsets — they were empirically derived against real Logic projects.
- **What we're building**: `BRIEF.md` (this directory).
- **What to do next**: `TASKS.md` (this directory).

## Hard rules specific to this repo

- **Read-only contract.** Never write to a `.logicx` file under any circumstance. A SHA-256 invariant test gates the parser — `.logicx` files are irreplaceable user work.
- **macOS-only.** Logic Pro is mac-only; don't add Windows/Linux conditionals.
- **TDD non-negotiable.** RED → GREEN → REFACTOR in *vertical* slices (one test → one implementation → repeat). Tracer bullet first. No horizontal slicing. See `flowcus-v2/CLAUDE.md` "Testing" for the full discipline.
- **Verify RED is genuine.** A test that fails with `ImportError` / "function not defined" is not RED — it's broken-test-infrastructure. Fix it until the failure points at *missing behaviour*, then implement.
- **No `any` types or type assertions in tests.** Use real schemas from a shared `types.ts`.

## Working mode

This repo's tooling will mature over the course of the walking skeleton (Tauri scaffold → ESLint flat config → Vitest → pre-commit hooks). Until those land, the canonical commands don't exist yet — see `TASKS.md` section 3 for the sequence to set them up. The end state should match flowcus-v2's quality gates (typecheck + ESLint + tests via `npm run quality`, `cargo test` for Rust).

## Issue tracking

Currently undecided between `bd` (beads, as flowcus-v2 uses) and a plain `TASKS.md` checklist. `TASKS.md` section 5 flags this — ask the user before spending time on `bd init`.

## When stuck

Read the Python source-of-truth at `/Users/rhyd/code/lpx-toolkit/lpx_inspect.py`. Don't re-derive the `.logicx` format from first principles — every offset and signature whitelist is encoded there.

## Quick Reference

```bash
npm run tauri:dev    # Full Tauri dev mode (Rust + frontend)
npm run dev          # Vite dev server only (Tauri calls this automatically)
npm test             # Vitest single run
npm run test:watch   # Vitest watch mode
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm run quality      # typecheck + lint + test
cargo test           # Rust tests (run from src-tauri/ or src-tauri/crates/<crate>)
```

Pre-commit hook (`.husky/pre-commit`) runs typecheck, lint-staged on TS/TSX files (`eslint --max-warnings=0`), and the full test suite. Bypass with `git commit --no-verify` for emergencies only.

Rust toolchain pinned in `rust-toolchain.toml` (channel `1.88`, the flowcus-v2 floor).
