#!/usr/bin/env node

/**
 * Syncs the version in package.json out to tauri.conf.json and
 * src-tauri/Cargo.toml (and regenerates Cargo.lock). Wired as the npm
 * `version` lifecycle hook so `npm version <bump>` (and `npm run bump`)
 * keeps every spelling of the version in lockstep.
 *
 * Ported from /Users/rhyd/code/flowcus-v2/scripts/sync-version.js
 * (lpx-explorer-rin). Sparkle binary git-add block intentionally
 * dropped — lpx-explorer hasn't adopted Sparkle yet (see
 * lpx-explorer-snx); revisit this when it does.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const packageJsonPath = join(rootDir, 'package.json');
const tauriConfPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = join(rootDir, 'src-tauri', 'Cargo.toml');

try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const version = packageJson.version;

  if (!version) {
    console.error('Error: No version found in package.json');
    process.exit(1);
  }

  const stagedFiles = [];

  // tauri.conf.json
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
  if (tauriConf.version !== version) {
    const oldVersion = tauriConf.version;
    tauriConf.version = version;
    writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    stagedFiles.push(tauriConfPath);
    console.log(`tauri.conf.json: ${oldVersion} → ${version}`);
  }

  // Cargo.toml — update only the [package] version line, not workspace
  // member versions. The regex anchors on the line start; multiline.
  const cargoToml = readFileSync(cargoTomlPath, 'utf-8');
  const versionRegex = /^version = "(.+)"$/m;
  const cargoMatch = cargoToml.match(versionRegex);
  if (cargoMatch && cargoMatch[1] !== version) {
    const oldVersion = cargoMatch[1];
    const updatedCargoToml = cargoToml.replace(
      versionRegex,
      `version = "${version}"`,
    );
    writeFileSync(cargoTomlPath, updatedCargoToml);
    stagedFiles.push(cargoTomlPath);
    console.log(`Cargo.toml: ${oldVersion} → ${version}`);

    // Regenerate Cargo.lock so it reflects the new package version.
    const cargoLockPath = join(rootDir, 'src-tauri', 'Cargo.lock');
    execSync('cargo generate-lockfile', {
      cwd: join(rootDir, 'src-tauri'),
      stdio: 'inherit',
    });
    stagedFiles.push(cargoLockPath);
    console.log('Cargo.lock: regenerated');
  }

  if (stagedFiles.length === 0) {
    console.log(`Version already in sync: ${version}`);
    process.exit(0);
  }

  // Stage updated files so the npm-version commit picks them up.
  for (const file of stagedFiles) {
    execSync(`git add "${file}"`, { cwd: rootDir, stdio: 'inherit' });
  }

  console.log(
    `Staged: ${stagedFiles.map((f) => f.replace(rootDir + '/', '')).join(', ')}`,
  );
} catch (error) {
  console.error('Error syncing version:', error.message);
  process.exit(1);
}
