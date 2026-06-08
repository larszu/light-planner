// Generates the Light Planner app icon + logo from a SINGLE geometric
// definition, so the packaged installer icons and the in-app / favicon logo
// can never drift apart.
//
//   node scripts/make-icon.mjs
//
// Outputs (committed):
//   build/icon.png    1024x1024  electron-builder derives the Windows .ico
//                                 and macOS .icns from this during the release.
//   public/icon.png    256x256   packaged into dist/ -> BrowserWindow / taskbar
//                                 icon at runtime.
//   public/logo.svg               crisp vector logo for the UI (TopBar, About
//                                 dialog) and the browser/Electron favicon.
//
// No native image tooling (ImageMagick / rsvg / iconutil) is required: the
// raster icons are drawn with @napi-rs/canvas (Skia) and the SVG is emitted
// from the same numbers below.
//
// The mark: a stage spotlight — a glowing lens casting a warm beam down into a
// pool of light, on a deep-navy rounded-square badge.
//
// One-time setup (kept out of package.json so the release CI / npm ci stay lean
// — the generated assets are committed, so the build never needs this dep):
//   npm i --no-save @napi-rs/canvas
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Geometry, defined once in a 1024 design box ───────────────────────────
const D = 1024;
const C = D / 2;            // horizontal centre (512)
const LAMP_Y = 296;        // lens centre
const LENS_OUTER = 122;    // metallic bezel radius
const LENS_INNER = 94;     // glowing lens radius
const BEAM_TOP_Y = 300, BEAM_TOP_HALF = 72;
const BEAM_BOT_Y = 858, BEAM_BOT_HALF = 288;
const POOL_Y = 860, POOL_RX = 300, POOL_RY = 80;
const RADIUS = 224;        // badge corner radius (~22%)

// Colours
const BG_TOP = '#27416a', BG_MID = '#15243d', BG_BOT = '#0b1220';
const HALO = '120,160,235';     // cool ambient glow behind the lamp
const BEAM = '255,214,140';     // warm beam (#ffd68c)
const POOL_CORE = '255,231,178'; // pool centre (#ffe7b2)
const RING_TOP = '#4a5d80', RING_BOT = '#19233b';

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draw the logo at an arbitrary square size S (Canvas 2D / Skia).
export function drawLogo(ctx, S) {
  const k = S / D;
  const p = (n) => n * k;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  roundRectPath(ctx, 0, 0, S, S, p(RADIUS));
  ctx.clip();

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, BG_TOP); bg.addColorStop(0.5, BG_MID); bg.addColorStop(1, BG_BOT);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);

  // cool ambient halo behind the lamp
  const halo = ctx.createRadialGradient(p(C), p(LAMP_Y), 0, p(C), p(LAMP_Y), p(560));
  halo.addColorStop(0, `rgba(${HALO},0.22)`); halo.addColorStop(1, `rgba(${HALO},0)`);
  ctx.fillStyle = halo; ctx.fillRect(0, 0, S, S);

  // beam cone
  const beam = ctx.createLinearGradient(0, p(BEAM_TOP_Y), 0, p(BEAM_BOT_Y));
  beam.addColorStop(0, `rgba(${BEAM},0.55)`);
  beam.addColorStop(0.7, `rgba(${BEAM},0.18)`);
  beam.addColorStop(1, `rgba(${BEAM},0)`);
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(p(C - BEAM_TOP_HALF), p(BEAM_TOP_Y));
  ctx.lineTo(p(C + BEAM_TOP_HALF), p(BEAM_TOP_Y));
  ctx.lineTo(p(C + BEAM_BOT_HALF), p(BEAM_BOT_Y));
  ctx.lineTo(p(C - BEAM_BOT_HALF), p(BEAM_BOT_Y));
  ctx.closePath(); ctx.fill();

  // pool of light on the floor (soft ellipse)
  ctx.save();
  ctx.translate(p(C), p(POOL_Y));
  ctx.scale(1, POOL_RY / POOL_RX);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, p(POOL_RX));
  pool.addColorStop(0, `rgba(${POOL_CORE},0.85)`);
  pool.addColorStop(0.5, `rgba(${BEAM},0.32)`);
  pool.addColorStop(1, `rgba(${BEAM},0)`);
  ctx.fillStyle = pool;
  ctx.beginPath(); ctx.arc(0, 0, p(POOL_RX), 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // lamp — metallic bezel
  const ring = ctx.createLinearGradient(0, p(LAMP_Y - LENS_OUTER), 0, p(LAMP_Y + LENS_OUTER));
  ring.addColorStop(0, RING_TOP); ring.addColorStop(1, RING_BOT);
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(p(C), p(LAMP_Y), p(LENS_OUTER), 0, Math.PI * 2); ctx.fill();

  // lamp — glowing lens (off-centre highlight gives a 3D sheen)
  const lens = ctx.createRadialGradient(p(C - 26), p(LAMP_Y - 30), p(6), p(C), p(LAMP_Y), p(LENS_INNER));
  lens.addColorStop(0, '#fffdf4');
  lens.addColorStop(0.32, '#ffe6a6');
  lens.addColorStop(0.68, '#ffc24d');
  lens.addColorStop(1, '#f59a22');
  ctx.fillStyle = lens;
  ctx.beginPath(); ctx.arc(p(C), p(LAMP_Y), p(LENS_INNER), 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// Emit the same mark as a standalone SVG (vector, for the UI + favicon).
function buildSVG() {
  const ty = (POOL_Y * (1 - POOL_RY / POOL_RX)).toFixed(2); // elliptical pool transform
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${D} ${D}" width="${D}" height="${D}" role="img" aria-label="Light Planner">
  <defs>
    <clipPath id="badge"><rect width="${D}" height="${D}" rx="${RADIUS}"/></clipPath>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="${D}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${BG_TOP}"/><stop offset="0.5" stop-color="${BG_MID}"/><stop offset="1" stop-color="${BG_BOT}"/>
    </linearGradient>
    <radialGradient id="halo" cx="${C}" cy="${LAMP_Y}" r="560" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(${HALO})" stop-opacity="0.22"/><stop offset="1" stop-color="rgb(${HALO})" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="beam" x1="0" y1="${BEAM_TOP_Y}" x2="0" y2="${BEAM_BOT_Y}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="rgb(${BEAM})" stop-opacity="0.55"/>
      <stop offset="0.7" stop-color="rgb(${BEAM})" stop-opacity="0.18"/>
      <stop offset="1" stop-color="rgb(${BEAM})" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="pool" cx="${C}" cy="${POOL_Y}" r="${POOL_RX}" gradientUnits="userSpaceOnUse"
      gradientTransform="matrix(1 0 0 ${(POOL_RY / POOL_RX).toFixed(4)} 0 ${ty})">
      <stop offset="0" stop-color="rgb(${POOL_CORE})" stop-opacity="0.85"/>
      <stop offset="0.5" stop-color="rgb(${BEAM})" stop-opacity="0.32"/>
      <stop offset="1" stop-color="rgb(${BEAM})" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="${LAMP_Y - LENS_OUTER}" x2="0" y2="${LAMP_Y + LENS_OUTER}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${RING_TOP}"/><stop offset="1" stop-color="${RING_BOT}"/>
    </linearGradient>
    <radialGradient id="lens" cx="${C}" cy="${LAMP_Y}" r="${LENS_INNER}" fx="${C - 26}" fy="${LAMP_Y - 30}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fffdf4"/><stop offset="0.32" stop-color="#ffe6a6"/>
      <stop offset="0.68" stop-color="#ffc24d"/><stop offset="1" stop-color="#f59a22"/>
    </radialGradient>
  </defs>
  <g clip-path="url(#badge)">
    <rect width="${D}" height="${D}" fill="url(#bg)"/>
    <rect width="${D}" height="${D}" fill="url(#halo)"/>
    <polygon points="${C - BEAM_TOP_HALF},${BEAM_TOP_Y} ${C + BEAM_TOP_HALF},${BEAM_TOP_Y} ${C + BEAM_BOT_HALF},${BEAM_BOT_Y} ${C - BEAM_BOT_HALF},${BEAM_BOT_Y}" fill="url(#beam)"/>
    <ellipse cx="${C}" cy="${POOL_Y}" rx="${POOL_RX}" ry="${POOL_RY}" fill="url(#pool)"/>
    <circle cx="${C}" cy="${LAMP_Y}" r="${LENS_OUTER}" fill="url(#ring)"/>
    <circle cx="${C}" cy="${LAMP_Y}" r="${LENS_INNER}" fill="url(#lens)"/>
  </g>
</svg>
`;
}

function png(size) {
  const c = createCanvas(size, size);
  drawLogo(c.getContext('2d'), size);
  return c.toBuffer('image/png');
}

// Run directly -> write the committed assets (+ throwaway previews in /tmp).
if (process.argv[1] && process.argv[1].endsWith('make-icon.mjs')) {
  mkdirSync(join(ROOT, 'build'), { recursive: true });
  mkdirSync(join(ROOT, 'public'), { recursive: true });
  writeFileSync(join(ROOT, 'build', 'icon.png'), png(1024));
  writeFileSync(join(ROOT, 'public', 'icon.png'), png(256));
  writeFileSync(join(ROOT, 'public', 'logo.svg'), buildSVG());
  console.log('wrote build/icon.png (1024), public/icon.png (256), public/logo.svg');
  try {
    mkdirSync('/tmp/icon-preview', { recursive: true });
    for (const s of [256, 128, 64, 32, 16]) writeFileSync(`/tmp/icon-preview/icon-${s}.png`, png(s));
    console.log('wrote previews to /tmp/icon-preview');
  } catch { /* previews are best-effort */ }
}
