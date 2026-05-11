#!/bin/bash
# Generate appcast.xml for the Sparkle auto-updater.
#
# Reads the just-built DMG, runs sign_update on it to produce the
# EdDSA signature + content-length, and emits a single-item appcast
# referencing the GitHub Release download URL.
#
# Inputs (env):
#   VERSION       — semver string, defaults to package.json version
#   DMG_PATH      — path to the .dmg, defaults to glob match in the
#                   universal-apple-darwin bundle dir
#   RELEASE_NOTES — optional plain-text notes for the <description>
#
# Output:
#   src-tauri/target/universal-apple-darwin/release/bundle/dmg/appcast.xml
#
# Refs: lpx-explorer-z7j

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
DMG_PATH="${DMG_PATH:-$(ls src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg | head -1)}"
RELEASE_NOTES="${RELEASE_NOTES:-Bug fixes and improvements.}"

if [ ! -f "$DMG_PATH" ]; then
    echo "❌ DMG not found at $DMG_PATH" >&2
    exit 1
fi

DMG_FILENAME="$(basename "$DMG_PATH")"
# GitHub Releases renames assets on upload — spaces become dots. The
# Tauri bundler names the DMG from `productName` ("LPX Explorer") so
# the local file has a space, but the URL has to point at the
# renamed asset. Mirror that transform here.
URL_FILENAME="${DMG_FILENAME// /.}"
PUB_DATE="$(date -u +'%a, %d %b %Y %H:%M:%S +0000')"
DOWNLOAD_URL="https://github.com/rhydlewis/lpx-explorer/releases/download/v${VERSION}/${URL_FILENAME}"

echo "🔐 Signing $DMG_FILENAME with EdDSA key..."
# sign_update prints e.g.
#   sparkle:edSignature="..." length="..."
# We capture the full line as-is and inline it into the <enclosure>.
SIGN_OUTPUT="$(./src-tauri/sparkle-bin/sign_update "$DMG_PATH")"
echo "$SIGN_OUTPUT"

OUTPUT_PATH="$(dirname "$DMG_PATH")/appcast.xml"

cat > "$OUTPUT_PATH" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
    <channel>
        <title>LPX Explorer Updates</title>
        <link>https://github.com/rhydlewis/lpx-explorer</link>
        <description>Updates for LPX Explorer — read-only inspector for Logic Pro projects.</description>
        <language>en</language>
        <item>
            <title>Version ${VERSION}</title>
            <pubDate>${PUB_DATE}</pubDate>
            <sparkle:version>${VERSION}</sparkle:version>
            <sparkle:shortVersionString>${VERSION}</sparkle:shortVersionString>
            <sparkle:minimumSystemVersion>10.13</sparkle:minimumSystemVersion>
            <description><![CDATA[${RELEASE_NOTES}]]></description>
            <enclosure url="${DOWNLOAD_URL}" type="application/octet-stream" ${SIGN_OUTPUT} />
        </item>
    </channel>
</rss>
EOF

echo ""
echo "✓ Wrote $OUTPUT_PATH"
echo ""
echo "📦 Appcast preview:"
cat "$OUTPUT_PATH"
