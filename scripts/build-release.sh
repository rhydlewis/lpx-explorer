#!/bin/bash
# Build LPX Explorer for release with code-signing, notarization, and
# the Sparkle EdDSA update signature applied.
#
# Mirrors flowcus-v2/scripts/build-release.sh — credentials live in the
# macOS Keychain under account=lpx-explorer (kept separate from flowcus
# so each app can rotate its app-specific password independently).
#
# Refs: lpx-explorer-j7w

set -euo pipefail

KEYCHAIN_ACCOUNT="lpx-explorer"
APPLE_TEAM_ID_VALUE="87A97X8DAG"

echo "🔐 Loading notarization credentials from Keychain (account=$KEYCHAIN_ACCOUNT)..."

APPLE_ID_VALUE=$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "APPLE_ID" -w 2>/dev/null || true)
APPLE_PASSWORD_VALUE=$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "APPLE_PASSWORD" -w 2>/dev/null || true)
SIGNING_IDENTITY=$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "SIGNING_IDENTITY" -w 2>/dev/null || true)

if [ -z "$APPLE_ID_VALUE" ] || [ -z "$APPLE_PASSWORD_VALUE" ] || [ -z "$SIGNING_IDENTITY" ]; then
    echo "❌ Missing Keychain entries. Run these once on this machine:"
    echo ""
    echo "    security add-generic-password -a \"$KEYCHAIN_ACCOUNT\" -s \"APPLE_ID\" -w \"your-apple-id@email.com\" -U"
    echo "    security add-generic-password -a \"$KEYCHAIN_ACCOUNT\" -s \"APPLE_PASSWORD\" -w \"xxxx-xxxx-xxxx-xxxx\" -U"
    echo "    security add-generic-password -a \"$KEYCHAIN_ACCOUNT\" -s \"SIGNING_IDENTITY\" -w \"<sha1 from: security find-identity -v -p codesigning>\" -U"
    echo ""
    echo "See docs/release-setup.md for full instructions."
    exit 1
fi

# Tauri 2's bundler reads these env vars and runs codesign + notarytool
# inline as part of `tauri build`. Source of truth:
# https://tauri.app/distribute/sign/macos/
export APPLE_ID="$APPLE_ID_VALUE"
export APPLE_PASSWORD="$APPLE_PASSWORD_VALUE"
export APPLE_TEAM_ID="$APPLE_TEAM_ID_VALUE"
export APPLE_SIGNING_IDENTITY="$SIGNING_IDENTITY"

echo "✓ APPLE_ID loaded"
echo "✓ APPLE_PASSWORD loaded"
echo "✓ APPLE_TEAM_ID: $APPLE_TEAM_ID"
echo "✓ SIGNING_IDENTITY loaded"
echo ""

SPARKLE_FW="src-tauri/Sparkle.framework"

echo "🔏 Pre-signing Sparkle.framework with Developer ID..."
# Tauri's bundler signs the .app and its top-level binary, but does NOT
# recurse into nested frameworks. Sparkle ships its own XPC services +
# Updater.app + Autoupdate helper, all of which need a hardened-runtime
# signature for notarization to succeed. Sign inside-out so the outer
# framework signature covers the now-signed nested bundles.
codesign --force --options runtime --timestamp --sign "$SIGNING_IDENTITY" \
  "$SPARKLE_FW/Versions/B/XPCServices/Downloader.xpc" \
  "$SPARKLE_FW/Versions/B/XPCServices/Installer.xpc" \
  "$SPARKLE_FW/Versions/B/Updater.app" \
  "$SPARKLE_FW/Versions/B/Autoupdate"
codesign --force --options runtime --timestamp --sign "$SIGNING_IDENTITY" \
  "$SPARKLE_FW"
echo "✓ Sparkle.framework signed"
echo ""

echo "🔨 Building LPX Explorer (Universal — Apple Silicon + Intel)..."
npm run tauri build -- --target universal-apple-darwin

echo ""
echo "🔐 Generating Sparkle EdDSA signature for the update payload..."
# sign_update reads the Ed25519 private key from Keychain
# (account=ed25519, shared with flowcus) and prints the signature line
# we'll paste into appcast.xml (lpx-explorer-z7j wires the actual
# appcast generation step).
./src-tauri/sparkle-bin/sign_update src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg

echo ""
echo "✅ Build complete!"
echo ""
echo "📦 Installer:"
ls -lh src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
