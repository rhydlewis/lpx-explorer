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


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
