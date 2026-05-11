# Release setup — lpx-explorer

Operational notes for code signing, notarization, and the auto-updater. Mirrors
the flowcus-v2 pipeline so the same Apple Developer Program account + Developer
ID Application certificate is reused.

## Apple Developer Program

- **Team ID:** `87A97X8DAG`
- **Cert in Keychain:** `Developer ID Application: RHYDIAN GWYN LEWIS (87A97X8DAG)`

Two such certs are present (renewal pair). The build script reads the SHA-1
from a Keychain entry rather than hard-coding it, so either works as long as
the entry points at a non-expired cert.

To list available identities:

```bash
security find-identity -v -p codesigning
```

## One-time Keychain setup (lpx-explorer-a6g)

The build script (`scripts/build-release.sh`) reads three Keychain entries
under `account=lpx-explorer`. Run these once on this machine (substituting
real values):

```bash
# Apple ID associated with the Developer Program account
security add-generic-password \
  -a "lpx-explorer" -s "APPLE_ID" \
  -w "your-apple-id@email.com" -U

# App-specific password (NOT the Apple ID password)
# Generate at https://account.apple.com/account/manage → App-Specific Passwords
security add-generic-password \
  -a "lpx-explorer" -s "APPLE_PASSWORD" \
  -w "xxxx-xxxx-xxxx-xxxx" -U

# SHA-1 of the Developer ID Application cert from `security find-identity`
# above. Pick whichever one's still valid — they're renewals of the same
# cert and either signs identically.
security add-generic-password \
  -a "lpx-explorer" -s "SIGNING_IDENTITY" \
  -w "<40-char-SHA1>" -U
```

Verify:

```bash
security find-generic-password -a "lpx-explorer" -s "APPLE_ID" 2>/dev/null \
  && echo "  ✓ APPLE_ID set"
security find-generic-password -a "lpx-explorer" -s "APPLE_PASSWORD" 2>/dev/null \
  && echo "  ✓ APPLE_PASSWORD set"
security find-generic-password -a "lpx-explorer" -s "SIGNING_IDENTITY" 2>/dev/null \
  && echo "  ✓ SIGNING_IDENTITY set"
```

(The `-w` flag is intentionally omitted from the verification calls so the
secret doesn't print.)

## Auto-updater (Sparkle)

`tauri-plugin-sparkle-updater` v0.2.4 is wired in (lpx-explorer-tat). The
EdDSA keypair is **shared with flowcus-v2** — both apps validate against the
same `SUPublicEDKey` because the private half lives in this user's login
Keychain under the standard Sparkle entry (account=`ed25519`,
service=`https://sparkle-project.org`). If the key ever needs rotating, do
both apps in lockstep so existing installs of either can verify the next
release.

The public key in `src-tauri/Info.plist`:

    SUPublicEDKey = K3ez3NH5DW5mbJbJcMWK5yvK5JYv7gjMowuMZsJwzf0=

## CI release pipeline (lpx-explorer-ehi + z7j)

`.github/workflows/release.yml` triggers on `v*.*.*` tag push and runs on a
GitHub-hosted `macos-14` runner. Required GitHub Actions secrets:

| Secret                       | What                                                   |
|------------------------------|--------------------------------------------------------|
| `APPLE_DEV_CERT_P12_BASE64`  | `base64 < cert.p12` of the Developer ID Application cert exported from Keychain Access (export both cert + private key). |
| `APPLE_DEV_CERT_PASSWORD`    | Password set when exporting the .p12.                  |
| `KEYCHAIN_PASSWORD`          | Any random string — used only for the temp keychain on the runner. |
| `APPLE_ID`                   | Apple ID email associated with the Developer Program.   |
| `APPLE_TEAM_ID`              | `87A97X8DAG`.                                          |
| `APPLE_ID_APP_PASSWORD`      | App-specific password (same value as the local Keychain `APPLE_PASSWORD` entry). |
| `APPLE_SIGNING_IDENTITY`     | SHA-1 of the Developer ID Application cert (same value as the local Keychain `SIGNING_IDENTITY` entry). |
| `SPARKLE_PRIVATE_KEY`        | Output of `security find-generic-password -a ed25519 -s 'https://sparkle-project.org' -w` from the local Keychain (Sparkle's standard storage location). |

To export the Developer ID cert:

    # In Keychain Access → My Certificates → right-click the
    # "Developer ID Application: ..." entry → Export → save as .p12
    # with a password, then:
    base64 < ~/Downloads/cert.p12 | pbcopy

The workflow:

1. Imports the cert into a temporary keychain on the runner.
2. Imports the Sparkle EdDSA key into the same temp keychain (so
   `sign_update` can find it via the standard Sparkle account/service).
3. Runs `npm run release` — which reads `APPLE_*` from env (CI mode), pre-
   signs Sparkle.framework, runs `tauri build` (which signs + notarizes
   inline), generates the EdDSA signature, and templates `appcast.xml`.
4. Creates a GitHub Release with both `.dmg` and `appcast.xml` as assets.

Sparkle's `SUFeedURL` resolves `releases/latest/download/appcast.xml`, so
the next release becomes the canonical update source automatically.

## How the script uses these

`scripts/build-release.sh`:

1. Reads `APPLE_ID`, `APPLE_PASSWORD`, `SIGNING_IDENTITY` from the
   `lpx-explorer` Keychain account.
2. Exports them as env vars so Tauri's bundler picks them up automatically.
   Tauri 2 reads `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, and
   `APPLE_SIGNING_IDENTITY` and runs both code-signing and notarization
   inline as part of `npm run tauri build`.
3. Signs the bundled Sparkle.framework explicitly (Tauri doesn't sign
   nested frameworks by default — see `flowcus-v2/scripts/build-release.sh`
   for why and how).
4. Generates the Sparkle EdDSA signature on the final DMG.

If any of the three Keychain entries is missing, the script bails with a
clear message + the commands above.

## Release notes (CHANGELOG.md)

Sparkle shows the per-release notes in its update dialog. Source of truth is
`CHANGELOG.md` at the repo root — one section per version, headed by
`## v<X.Y.Z>`:

    ## v0.0.4

    - Added insights view
    - Fixed plugin-rail cache bug

Bullets and free-form paragraphs both work. `scripts/extract-release-notes.js`
pulls the section matching the current tag and converts it to HTML
(`<ul>/<li>`/`<p>`), which the workflow injects into `RELEASE_NOTES` so
`generate-appcast.sh` can drop it into the `<description>` CDATA.

**Release checklist:**

1. Edit `CHANGELOG.md` — add a `## v<next-version>` section above the previous one.
2. `git add CHANGELOG.md && git commit -m "docs: release notes for v<next-version>"`.
3. `npm run bump` (bumps `package.json` + tags `v<next-version>`).
4. `git push && git push --tags`.

If CI fails at the "Extract release notes" step, you forgot step 1 — the
section is missing or empty. Add the entry, amend / re-tag, push again.

## Reference

- `flowcus-v2/scripts/build-release.sh` — the working pattern this mirrors.
- `docs/audits/2026-05-10-updater-spike.md` — why we picked
  `tauri-plugin-sparkle-updater` over the official `tauri-plugin-updater`.
