# Architecture decisions

Append-only log. Newest entries at the bottom.

---

## 2026-05-03 — Walking skeleton parser: native Rust crate vs Python subprocess

**Bead:** lpx-explorer-82n (walking skeleton epic)

**Context:** The Tauri port needs a parser for the undocumented `.logicx` `ProjectData` binary. Two paths were on the table: port the format knowledge to a native Rust crate, or ship a Tauri shell that spawns the existing `lpxtool` Python helper as a subprocess and proxies its JSON. The walking skeleton only requires `find_aus` (lpx_inspect.py:706-728) — a ~22-line scan for three contiguous little-endian 4CCs (manufacturer + type + subtype) anchored on `umua`/`xfua`/`fmua` — so the porting cost for the tracer is bounded and known.

**Decision:** Build a native Rust crate at `src-tauri/crates/lpx-parser/`. The walking skeleton ports `find_aus` only, taking `&[u8]` and returning `Vec<AURef>`. The crate becomes the single source of truth for `.logicx` format knowledge; the existing Python CLI is expected to consume it later via PyO3 bindings (deferred — out of scope for this skeleton).

**Alternatives considered:** A Python-subprocess shim that marshals `lpxtool --json` output across the Tauri boundary was rejected. It collapses the skeleton to plumbing with zero format-parsing in Rust, drags a Python runtime into every shipped build, complicates notarization/codesigning, and forfeits the shared-crate trajectory the brief commits to. Faster to a v1, far worse as a foundation.

**Trade-offs:** We accept up-front Rust porting cost (offset by `find_aus` being trivially portable — `memchr`-style scan plus printable-ASCII validation) in exchange for: a self-contained binary, `cargo test` ergonomics against hand-built byte fixtures with no Python in CI, a natural enforcement point for the read-only invariant (`&[u8]` cannot write), and a clean PyO3 surface later because `find_aus(raw: bytes)` already takes bytes. Risk deferred: every additional parser surface (`find_track_registry_records`, `_decode_audio_strip_id`, OCuA decoding, NSKeyedArchive walking) must be re-ported rather than reused — that's the cost of owning the format twice until PyO3 lands.
