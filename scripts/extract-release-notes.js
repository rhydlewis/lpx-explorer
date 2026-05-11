#!/usr/bin/env node

// Extract the section matching a given version tag from CHANGELOG.md
// and emit HTML suitable for Sparkle's <description> CDATA block in
// appcast.xml.
//
// Usage: node scripts/extract-release-notes.js v0.0.4
//
// Expects CHANGELOG.md to be structured like:
//
//     ## v0.0.4
//     - Added insights view
//     - Fixed plugin-rail cache bug
//
//     ## v0.0.3
//     - ...
//
// Bullets become <ul><li>…</li></ul>. Non-bullet paragraph lines
// become <p>…</p>. HTML special chars are escaped.
//
// Exits non-zero if the section is missing — so a release without a
// CHANGELOG entry fails CI loudly rather than shipping empty notes.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const version = process.argv[2];
if (!version) {
    console.error('Usage: extract-release-notes.js <version-tag>');
    process.exit(1);
}

const changelog = readFileSync(join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const lines = changelog.split('\n');

const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headerRegex = new RegExp(`^##\\s+${escaped}\\b`);
const startIdx = lines.findIndex((l) => headerRegex.test(l));
if (startIdx === -1) {
    console.error(`No section matching "## ${version}" in CHANGELOG.md`);
    process.exit(1);
}

const sectionLines = [];
for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    sectionLines.push(lines[i]);
}

const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = [];
const bullets = [];
const flushBullets = () => {
    if (bullets.length > 0) {
        html.push(`<ul>${bullets.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
        bullets.length = 0;
    }
};

for (const raw of sectionLines) {
    const line = raw.trim();
    if (!line) {
        flushBullets();
        continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
        bullets.push(bullet[1]);
    } else {
        flushBullets();
        html.push(`<p>${esc(line)}</p>`);
    }
}
flushBullets();

if (html.length === 0) {
    console.error(`Section "## ${version}" exists but is empty`);
    process.exit(1);
}

process.stdout.write(html.join('\n'));
