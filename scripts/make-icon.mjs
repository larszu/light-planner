// Rasterises the committed app icon masters, so installer, window, favicon and
// touch icons cannot drift apart.
//
//   npm i --no-save sharp png-to-ico && node scripts/make-icon.mjs
//
// Masters (committed, drawn to Brand Guide 2.0: navy square, pictogram, signet):
//   build/icon.svg      1024 — every size from 48 px up
//   public/favicon.svg  pictogram only — sizes below 48 px (no signet, no tally)
//
// Outputs (committed, so npm ci / the release CI never need these deps):
//   build/icon.png 1024 · build/icon.ico 16–256 · public/icon.png 512 (window)
//   public/icon-192.png · public/icon-512.png · public/apple-touch-icon.png 180
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gross = readFileSync(join(ROOT, 'build', 'icon.svg'));
const klein = readFileSync(join(ROOT, 'public', 'favicon.svg'));

const png = (svg, size) => sharp(svg, { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const ziele = [
  ['build/icon.png', 1024],
  ['public/icon.png', 512],
  ['public/icon-512.png', 512],
  ['public/icon-192.png', 192],
  ['public/apple-touch-icon.png', 180],
];
for (const [datei, size] of ziele) writeFileSync(join(ROOT, datei), await png(gross, size));

const ico = await pngToIco(await Promise.all([16, 24, 32, 48, 64, 128, 256].map((n) => png(n < 48 ? klein : gross, n))));
writeFileSync(join(ROOT, 'build', 'icon.ico'), ico);

console.log(`wrote ${ziele.map(([d]) => d).join(', ')}, build/icon.ico`);
