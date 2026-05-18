#!/usr/bin/env node
/**
 * Wrap the portable Linux binary into native Linux installers:
 *   - spearcode_<ver>_amd64.deb   (Debian/Ubuntu)
 *   - Spearcode-<ver>-x86_64.AppImage  (universal, portable)
 *
 * Prerequisite: `npm run build:bin` produced release/spearcode-linux-x64.
 * appimagetool is downloaded on demand into scripts/.tools/.
 */
import {
  mkdirSync, rmSync, existsSync, copyFileSync, writeFileSync,
  chmodSync, readFileSync, statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const BIN = join(root, 'release', 'spearcode-linux-x64');
const OUT = join(root, 'release');
const TOOLS = join(root, 'scripts', '.tools');

if (!existsSync(BIN)) {
  console.error(`✗ Missing ${BIN}\n  Run: npm run build:bin -- node20-linux-x64`);
  process.exit(1);
}

function sh(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
}

// ── Minimal dependency-free PNG icon generator (solid + diagonal spear) ──
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makeIcon(path, size = 256) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const o = y * (1 + size * 4) + 1 + x * 4;
      // dark slate background
      let r = 17, g = 24, b = 39;
      // bright diagonal "spear" stroke
      if (Math.abs((x - y)) < size * 0.06) { r = 220; g = 38; b = 38; }
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

// Terminal=true → GNOME/most DEs open the configured terminal automatically
// and run `spearcode` in it (the robust native path for a packaged install;
// the source/local launcher uses scripts/install-desktop-launcher.sh).
// Single main Category avoids duplicate menu entries (desktop-file-validate).
const DESKTOP = `[Desktop Entry]
Type=Application
Version=1.0
Name=SpearCode
Comment=AI coding agent for the terminal
Exec=spearcode
Icon=spearcode
Categories=Development;
Terminal=true
StartupNotify=true
`;

mkdirSync(OUT, { recursive: true });
const iconPath = join(OUT, 'spearcode.png');
makeIcon(iconPath);

// ─────────────────────────── .deb ───────────────────────────
function buildDeb() {
  const stage = join(OUT, `deb/spearcode_${VERSION}_amd64`);
  rmSync(join(OUT, 'deb'), { recursive: true, force: true });
  mkdirSync(join(stage, 'DEBIAN'), { recursive: true });
  mkdirSync(join(stage, 'usr/bin'), { recursive: true });
  mkdirSync(join(stage, 'usr/share/applications'), { recursive: true });
  mkdirSync(join(stage, 'usr/share/icons/hicolor/256x256/apps'), { recursive: true });
  mkdirSync(join(stage, 'usr/share/doc/spearcode'), { recursive: true });

  copyFileSync(BIN, join(stage, 'usr/bin/spearcode'));
  chmodSync(join(stage, 'usr/bin/spearcode'), 0o755);
  copyFileSync(iconPath, join(stage, 'usr/share/icons/hicolor/256x256/apps/spearcode.png'));
  writeFileSync(join(stage, 'usr/share/applications/spearcode.desktop'), DESKTOP);
  copyFileSync(join(root, 'LICENSE'), join(stage, 'usr/share/doc/spearcode/copyright'));

  const sizeKb = Math.ceil(statSync(BIN).size / 1024);
  writeFileSync(join(stage, 'DEBIAN/control'),
`Package: spearcode
Version: ${VERSION}
Section: devel
Priority: optional
Architecture: amd64
Maintainer: SpearCode <noreply@spearcode.dev>
Installed-Size: ${sizeKb}
Homepage: ${pkg.homepage ?? 'https://spearcode.dev'}
Description: AI coding agent for the terminal
 Standalone AI coding agent — 51 tools, 31 models. Self-contained:
 no Node.js runtime required.
`);

  const debFile = join(OUT, `spearcode_${VERSION}_amd64.deb`);
  sh('fakeroot', ['dpkg-deb', '--build', '--root-owner-group', stage, debFile]);
  console.log(`✓ ${debFile}`);
}

// ────────────────────────── AppImage ──────────────────────────
function buildAppImage() {
  const tool = join(TOOLS, 'appimagetool');
  if (!existsSync(tool)) {
    mkdirSync(TOOLS, { recursive: true });
    console.log('↓ downloading appimagetool…');
    sh('curl', ['-fsSL', '-o', tool,
      'https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage']);
    chmodSync(tool, 0o755);
  }
  const appdir = join(OUT, 'Spearcode.AppDir');
  rmSync(appdir, { recursive: true, force: true });
  mkdirSync(join(appdir, 'usr/bin'), { recursive: true });

  copyFileSync(BIN, join(appdir, 'usr/bin/spearcode'));
  chmodSync(join(appdir, 'usr/bin/spearcode'), 0o755);
  writeFileSync(join(appdir, 'spearcode.desktop'), DESKTOP);
  copyFileSync(iconPath, join(appdir, 'spearcode.png'));
  copyFileSync(iconPath, join(appdir, '.DirIcon'));
  const appRun = join(appdir, 'AppRun');
  writeFileSync(appRun,
`#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/spearcode" "$@"
`);
  chmodSync(appRun, 0o755);

  const outFile = join(OUT, `Spearcode-${VERSION}-x86_64.AppImage`);
  sh(tool, ['--appimage-extract-and-run', '--no-appstream', appdir, outFile],
    { env: { ...process.env, ARCH: 'x86_64' } });
  chmodSync(outFile, 0o755);
  console.log(`✓ ${outFile}`);
}

buildDeb();
buildAppImage();
console.log('\n✓ Linux installers ready in release/');
