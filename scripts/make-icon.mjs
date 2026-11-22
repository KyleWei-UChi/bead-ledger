/**
 * Draws the app icon and compiles it to build/BeadLedger.icns.
 *
 * Deliberately dependency-free: it rasterises into a plain pixel buffer,
 * encodes PNG by hand (zlib is in Node) and hands the sizes to `iconutil`,
 * so nothing has to be installed and the icon rebuilds on any Mac.
 */
import { deflateSync } from 'node:zlib';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, 'build');
const ICONSET = join(BUILD, 'BeadLedger.iconset');

const MASTER = 1024; // rendered once, then box-downsampled to every size
const SS = 2; // supersampling factor for edge smoothing

/** Highlights can push a channel past 255; a Buffer write would wrap it. */
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Nine beads, read left to right, top to bottom. */
const BEADS = [
  '#E4572E', '#F2A541', '#F6D45C',
  '#5BBF6A', '#2E9BD6', '#7D63CC',
  '#EC6B9D', '#2BC4AE', '#EFE9DC',
];

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Rendered at `size`, returns RGBA bytes. */
function render(size) {
  const n = size * SS;
  const buf = new Float32Array(n * n * 4);

  const bgTop = hex('#30323D');
  const bgBottom = hex('#14151B');

  // Squircle plate, inset the way macOS icons are.
  const inset = n * 0.086;
  const a = n / 2 - inset;
  const cx = n / 2;
  const cy = n / 2;
  const POW = 4.6;

  const put = (i, r, g, b, alpha) => {
    const o = i * 4;
    const inv = 1 - alpha;
    buf[o] = buf[o] * inv + r * alpha;
    buf[o + 1] = buf[o + 1] * inv + g * alpha;
    buf[o + 2] = buf[o + 2] * inv + b * alpha;
    buf[o + 3] = buf[o + 3] * inv + 255 * alpha;
  };

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = Math.abs(x + 0.5 - cx) / a;
      const dy = Math.abs(y + 0.5 - cy) / a;
      if (dx ** POW + dy ** POW > 1) continue;
      const t = y / n;
      put(
        y * n + x,
        bgTop[0] + (bgBottom[0] - bgTop[0]) * t,
        bgTop[1] + (bgBottom[1] - bgTop[1]) * t,
        bgTop[2] + (bgBottom[2] - bgTop[2]) * t,
        1,
      );
    }
  }

  // 3x3 of beads: fuse beads are rings, and the hole is what makes the
  // shape read as a bead rather than a dot, so it stays punched out.
  const grid = n * 0.60;
  const gap = grid / 3;
  const left = cx - grid / 2 + gap / 2;
  const top = cy - grid / 2 + gap / 2;
  const outer = gap * 0.40;
  const inner = outer * 0.40;

  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const [r, g, b] = hex(BEADS[gy * 3 + gx]);
      const bx = left + gx * gap;
      const by = top + gy * gap;
      const lo = Math.max(0, Math.floor(by - outer - 2));
      const hi = Math.min(n, Math.ceil(by + outer + 2));
      for (let y = lo; y < hi; y++) {
        for (let x = Math.max(0, Math.floor(bx - outer - 2)); x < Math.min(n, Math.ceil(bx + outer + 2)); x++) {
          const ddx = x + 0.5 - bx;
          const ddy = y + 0.5 - by;
          const d = Math.hypot(ddx, ddy);
          if (d > outer || d < inner) continue;
          // Light from the top-left, so each bead reads as a solid object.
          const shade = 1 - 0.26 * ((ddx + ddy) / (outer * 2) + 0.5);
          put(y * n + x, r * shade, g * shade, b * shade, 1);
        }
      }
    }
  }

  // Box-downsample the supersampled buffer.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, bl = 0, al = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y * SS + sy) * n + x * SS + sx) * 4;
          r += buf[o]; g += buf[o + 1]; bl += buf[o + 2]; al += buf[o + 3];
        }
      }
      const k = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = clamp8(r / k);
      out[o + 1] = clamp8(g / k);
      out[o + 2] = clamp8(bl / k);
      out[o + 3] = clamp8(al / k);
    }
  }
  return out;
}

/** Box filter from the master render, so every size looks identical. */
function downsample(src, from, to) {
  const out = Buffer.alloc(to * to * 4);
  const f = from / to;
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      let r = 0, g = 0, b = 0, a = 0, cnt = 0;
      for (let sy = Math.floor(y * f); sy < Math.floor((y + 1) * f); sy++) {
        for (let sx = Math.floor(x * f); sx < Math.floor((x + 1) * f); sx++) {
          const o = (sy * from + sx) * 4;
          r += src[o]; g += src[o + 1]; b += src[o + 2]; a += src[o + 3];
          cnt++;
        }
      }
      const o = (y * to + x) * 4;
      out[o] = clamp8(r / cnt);
      out[o + 1] = clamp8(g / cnt);
      out[o + 2] = clamp8(b / cnt);
      out[o + 3] = clamp8(a / cnt);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const master = render(MASTER);

await rm(ICONSET, { recursive: true, force: true });
await mkdir(ICONSET, { recursive: true });

const SIZES = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];

const cache = new Map([[MASTER, master]]);
for (const [size, name] of SIZES) {
  if (!cache.has(size)) cache.set(size, downsample(master, MASTER, size));
  await writeFile(join(ICONSET, name), png(cache.get(size), size));
}

const icns = join(BUILD, 'BeadLedger.icns');
execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', icns]);
await rm(ICONSET, { recursive: true, force: true });

console.log(`icon written to ${icns}`);
