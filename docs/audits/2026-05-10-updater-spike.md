# snx 1/8 spike: tauri-plugin-updater vs Sparkle direct

**Bead:** lpx-explorer-gvp
**Date:** 2026-05-10
**Output:** Decision + downstream implications. No code.

## TL;DR

**Pick `tauri-plugin-sparkle-updater` v0.2.4.**

Native macOS update experience out of the box (the Sparkle dialog every Mac user
recognises from Raycast / CleanShot / etc), zero custom UI code, actively
maintained as of April 2026. The official `tauri-plugin-updater` v2 only ships
a basic confirm/dismiss dialog — progress bars, "Remind Me Later," background
checks, phased rollouts would all be ours to build.

For a solo maintainer the eliminated UI tax is worth the community-plugin
trade-off. If the plugin ever stalls we can fork or fall back to hand-rolled
NSWorkspace bindings.

## Comparison

|                          | tauri-plugin-updater (v2) | tauri-plugin-sparkle-updater |
|--------------------------|---------------------------|------------------------------|
| Maintenance              | Official Tauri team       | Community (ahonn, ~monthly releases) |
| macOS native UI          | No — basic confirm dialog | Yes — full Sparkle dialog    |
| Built-in features        | Confirm, install, restart | Progress, "Later", background checks, phased rollouts, release notes rendering |
| Signing scheme           | Ed25519 / Minisign (Tauri-native) | EdDSA via Sparkle |
| Manifest format          | `latest.json` (Tauri-native) | `appcast.xml` (Sparkle's RSS) |
| Update key separate from Developer ID | Yes | Yes |
| Hosting                  | GitHub Releases canonical | GitHub Releases canonical    |

Both options:
- macOS-only (we don't need cross-platform).
- Both need a separate signing keypair from the Apple Developer ID cert. The
  Developer ID cert signs the `.app` / `.dmg` for notarization; the updater
  key signs the update payload so older versions can verify the new one is
  authentic.
- Private key in CI secrets (GitHub Actions). **Loss of this key locks
  existing users out of future updates** — same risk on both plugins.

## Why not the official plugin

The official `tauri-plugin-updater` is fine architecturally, but its dialog is
a `dialog.ask` confirm/dismiss. That means:

- No progress bar during download.
- No "Remind Me Later" persistence.
- No background checks; user has to click "check for updates" or we wire our
  own timer.
- No release-notes rendering panel.

Building those uniformly across macOS appearance modes is a non-trivial design
+ engineering project. Sparkle has solved it for 20 years. The author of
`tauri-plugin-sparkle-updater` wrote it explicitly because the official
plugin's macOS experience falls short of what users expect.

## Implementation implications for snx 6/8 (lpx-explorer-tat)

- Add `tauri-plugin-sparkle-updater` to `src-tauri/Cargo.toml` + register in
  `src-tauri/src/lib.rs`.
- Generate an EdDSA signing keypair via the Sparkle plugin's CLI; commit the
  public key to `tauri.conf.json` (or wherever the plugin reads it).
- Store the private key as a GitHub Actions secret (e.g.
  `SPARKLE_PRIVATE_KEY`) — used during release builds to sign the appcast
  entry.
- The "Check for Updates…" menu item is built into Sparkle's framework once
  the plugin is wired; no manual integration in our existing menu builder.
- Default to "check at launch + daily" — Sparkle's standard behaviour. No
  config needed.

## Implementation implications for snx 7/8 (lpx-explorer-z7j)

- Update feed format: `appcast.xml` (RSS-like XML).
- Hosted at a stable URL — recommended: GitHub Releases asset
  `https://github.com/rhydlewis/lpx-explorer/releases/latest/download/appcast.xml`.
- The release workflow (snx 5/8) needs to either (a) generate the appcast
  entry and upload as a release asset, or (b) commit it to a `gh-pages`
  branch. Asset is simpler.
- `EdDSA` signature appended to each `<enclosure>` per Sparkle's convention.

## Risks for a solo maintainer

- **Key rotation** is hard if the private key leaks: existing users on v1.x
  trust the v1 public key. To rotate, we'd need a transitional release that
  ships both old + new public keys, wait for users to install it, then
  rotate. Manageable; document the process now.
- **Plugin stalling**: 2 PRs open as of April 2026; activity is consistent
  but it's one maintainer. If maintenance stops, fork is straightforward
  (the plugin is small).
- **Sparkle 2.x macOS minimum**: 10.13+. Our Tauri 2 baseline is well above
  that already.

## Out of scope (per bead)

- Implementation. Children 6/8 (`tat`) + 7/8 (`z7j`) wire it up.
- Cross-platform updater fallback. Defer until we add Windows.
