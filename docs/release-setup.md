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

## Auto-updater (Sparkle) — coming next

`tauri-plugin-sparkle-updater` v0.2.4 adds an EdDSA keypair separate from the
Apple Developer ID. The private key is stored in Keychain too (under
`account=lpx-explorer-sparkle`). The public key gets committed to
`src-tauri/Info.plist` (`SUPublicEDKey`).

Setup happens in lpx-explorer-tat (snx 6/8) — see notes there once the bead
lands.

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

## Reference

- `flowcus-v2/scripts/build-release.sh` — the working pattern this mirrors.
- `docs/audits/2026-05-10-updater-spike.md` — why we picked
  `tauri-plugin-sparkle-updater` over the official `tauri-plugin-updater`.
