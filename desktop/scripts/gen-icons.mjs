#!/usr/bin/env node
/**
 * Dependency-free SpearCode icon generator.
 * Dark slate rounded tile + red "spear" chevron — matches the CLI icon.
 * Produces the PNG sizes Tauri needs (Win .ico / mac .icns are derived
 * later by `npm run icon`, which needs @tauri-apps/cli).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons');
mkdirSync(out, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function render(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const r = size * 0.18; // corner radius
  const inCorner = (x, y) => {
    const cx = x < r ? r : x > size - r ? size - r : x;
    const cy = y < r ? r : y > size - r ? size - r : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter 0
    for (let x = 0; x < size; x++) {
      const o = y * (1 + size * 4) + 1 + x * 4;
      let R = 15, G = 22, B = 35, A = 255; // #0f1623 slate
      if (!inCorner(x, y)) {
        A = 0; // transparent rounded corners
      } else {
        // centred upward chevron "spear"
        const nx = (x - size / 2) / size;
        const ny = (y - size / 2) / size;
        const onArm = Math.abs(Math.abs(nx) - (ny + 0.16)) < 0.085 && ny > -0.28 && ny < 0.28;
        const tip = ny <= -0.2 && Math.abs(nx) < 0.09 && ny > -0.34;
        if (onArm || tip) {
          R = 220; G = 38; B = 38; // #dc2626 red
        }
      }
      raw[o] = R;
      raw[o + 1] = G;
      raw[o + 2] = B;
      raw[o + 3] = A;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ['source.png', 1024],
  ['icon.png', 512],
  ['128x128@2x.png', 256],
  ['128x128.png', 128],
  ['32x32.png', 32],
]) {
  writeFileSync(join(out, name), render(size));
  console.log(`✓ icons/${name} (${size}px)`);
}
