#!/usr/bin/env node
/**
 * Wrap the portable macOS binary into a .dmg disk image.
 * Runs on macOS only (uses hdiutil) — invoked by CI on a macos runner.
 *
 * Arg: arch — "arm64" (default) or "x64".
 * Prerequisite: release/spearcode-macos-<arch> built by build-bin.mjs.
 */
import {
  mkdirSync, rmSync, existsSync, copyFileSync, writeFileSync, chmodSync, readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'darwin') {
  console.error('✗ pack-macos.mjs must run on macOS');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const arch = process.argv[2] === 'x64' ? 'x64' : 'arm64';
const BIN = join(root, 'release', `spearcode-macos-${arch}`);
const OUT = join(root, 'release');

if (!existsSync(BIN)) {
  console.error(`✗ Missing ${BIN}\n  Run: npm run build:bin -- node20-macos-${arch}`);
  process.exit(1);
}

const stage = join(OUT, `dmg-${arch}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// Ship the CLI binary plus a one-line installer the user double-clicks.
copyFileSync(BIN, join(stage, 'spearcode'));
chmodSync(join(stage, 'spearcode'), 0o755);

writeFileSync(join(stage, 'Install.command'),
`#!/bin/bash
# Installs spearcode to /usr/local/bin (asks for password once).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
sudo mkdir -p /usr/local/bin
sudo cp "$DIR/spearcode" /usr/local/bin/spearcode
sudo chmod 755 /usr/local/bin/spearcode
# Drop the quarantine flag set on downloaded files (unsigned build).
sudo xattr -dr com.apple.quarantine /usr/local/bin/spearcode 2>/dev/null || true
echo "✓ spearcode installed. Open a new terminal and run: spearcode"
read -n 1 -s -r -p "Press any key to close."
`);
chmodSync(join(stage, 'Install.command'), 0o755);

writeFileSync(join(stage, 'README.txt'),
`SpearCode ${VERSION} — AI coding agent for the terminal

PORTABLE (no install):
  Open Terminal here and run:  ./spearcode

INSTALL system-wide:
  Double-click "Install.command".

This build is unsigned: on first run macOS may warn about an
unidentified developer. Right-click > Open, or run:
  xattr -dr com.apple.quarantine ./spearcode
`);

const dmg = join(OUT, `Spearcode-${VERSION}-macos-${arch}.dmg`);
rmSync(dmg, { force: true });
execFileSync('hdiutil', [
  'create', '-volname', `SpearCode ${VERSION}`,
  '-srcfolder', stage, '-ov', '-format', 'UDZO', dmg,
], { stdio: 'inherit' });

console.log(`\n✓ ${dmg}`);
