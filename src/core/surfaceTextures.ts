// Procedural, tileable surface textures for the realistic (Render) floor and
// walls. Everything is drawn on an offscreen <canvas> — no external image
// assets — so it works offline and inside the packaged Electron app. Each
// pattern is tinted around a user-chosen base colour (so any colour works with
// any template) and is seamless: features near an edge are mirrored to the
// opposite edge so the tile repeats without a visible seam.
import type { FloorPresetId, WallPresetId } from '../types';

export interface SurfacePreset<Id extends string> {
  id: Id;
  label: string;            // German UI label
  defaultColor: string;     // sensible base tint
  roughness: number;        // PBR roughness for the lit material
  tileMeters: number;       // world span of one canvas tile (m)
  // Draw the pattern onto a `size`×`size` canvas around base RGB. null = a flat
  // colour with no map (the "Einfarbig" option).
  draw: ((ctx: CanvasRenderingContext2D, size: number, base: RGB) => void) | null;
}

interface RGB { r: number; g: number; b: number; }

// ── small helpers ──────────────────────────────────────────────────────────
export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? parseInt(h.split('').map((c) => c + c).join(''), 16)
    : parseInt(h.padEnd(6, '0').slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const rgbCss = (c: RGB) => `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
// Lighten (+) / darken (−) a colour by `d` (−1..1) toward white/black.
function shade(c: RGB, d: number): RGB {
  if (d >= 0) return { r: c.r + (255 - c.r) * d, g: c.g + (255 - c.g) * d, b: c.b + (255 - c.b) * d };
  return { r: c.r * (1 + d), g: c.g * (1 + d), b: c.b * (1 + d) };
}
// Deterministic PRNG so a given preset+colour always renders identically.
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fillBase = (ctx: CanvasRenderingContext2D, size: number, base: RGB) => {
  ctx.fillStyle = rgbCss(base); ctx.fillRect(0, 0, size, size);
};
// Draw a soft dot, mirrored across both edges so the tile stays seamless.
// Only the wrap copies that actually straddle an edge are drawn.
function wrapDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, size: number, css: string) {
  ctx.fillStyle = css;
  const xs = x < r ? [x, x + size] : x > size - r ? [x, x - size] : [x];
  const ys = y < r ? [y, y + size] : y > size - r ? [y, y - size] : [y];
  for (const px of xs) for (const py of ys) {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── floor patterns ──────────────────────────────────────────────────────────
function drawConcrete(ctx: CanvasRenderingContext2D, size: number, base: RGB, blobs = 1100, crackN = 4) {
  fillBase(ctx, size, base);
  const r = mulberry(11);
  for (let i = 0; i < blobs; i++) {
    const x = r() * size, y = r() * size, rad = 2 + r() * 9;
    const up = r() > 0.5;
    wrapDot(ctx, x, y, rad, size, up ? `rgba(255,255,255,${0.025 + r() * 0.04})` : `rgba(0,0,0,${0.03 + r() * 0.05})`);
  }
  // a few hairline cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
  for (let i = 0; i < crackN; i++) {
    let x = r() * size, y = r() * size; ctx.beginPath(); ctx.moveTo(x, y);
    const steps = 6 + (r() * 8 | 0);
    for (let s = 0; s < steps; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
}

function woodPlank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: RGB, rnd: () => number) {
  const tint = (rnd() - 0.5) * 0.22;
  ctx.fillStyle = rgbCss(shade(base, tint));
  ctx.fillRect(x, y, w, h);
  // grain streaks along the long axis
  const along = w >= h;
  const len = along ? w : h, span = along ? h : w;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let i = 0; i < span / 2; i++) {
    const o = (i + 0.5) * 2 + (rnd() - 0.5);
    ctx.strokeStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`;
    ctx.lineWidth = 0.6 + rnd() * 0.6; ctx.beginPath();
    if (along) {
      ctx.moveTo(x, y + o);
      for (let t = 0; t <= len; t += 8) ctx.lineTo(x + t, y + o + Math.sin(t * 0.05 + i) * 0.8);
    } else {
      ctx.moveTo(x + o, y);
      for (let t = 0; t <= len; t += 8) ctx.lineTo(x + o + Math.sin(t * 0.05 + i) * 0.8, y + t);
    }
    ctx.stroke();
  }
  ctx.restore();
  // bevel seam
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// Basket-weave block parquet (Tafelparkett): a checkerboard of blocks, each a
// run of short planks alternating horizontal / vertical. Tiles seamlessly.
function drawParquet(ctx: CanvasRenderingContext2D, size: number, base: RGB) {
  const rnd = mulberry(5);
  const blocks = 4, bs = size / blocks, planks = 4, pw = bs / planks;
  fillBase(ctx, size, shade(base, -0.05));
  for (let bx = 0; bx < blocks; bx++) for (let by = 0; by < blocks; by++) {
    const horiz = (bx + by) % 2 === 0;
    for (let p = 0; p < planks; p++) {
      if (horiz) woodPlank(ctx, bx * bs, by * bs + p * pw, bs, pw, base, rnd);
      else woodPlank(ctx, bx * bs + p * pw, by * bs, pw, bs, base, rnd);
    }
  }
}

// Long floorboards (Dielen) with offset butt joints.
function drawPlanks(ctx: CanvasRenderingContext2D, size: number, base: RGB) {
  const rnd = mulberry(9);
  const rows = 6, bh = size / rows;
  fillBase(ctx, size, shade(base, -0.05));
  for (let row = 0; row < rows; row++) {
    const y = row * bh;
    const off = (row % 2) * (size / 4) + (rnd() * 0.15 * size);
    // boards across the width, wrapping so the joint pattern tiles
    for (let x = -off; x < size; x += size / 2) {
      woodPlank(ctx, x, y, size / 2, bh, base, rnd);
    }
  }
}

// Square tiles with grout lines.
function drawTiles(ctx: CanvasRenderingContext2D, size: number, base: RGB) {
  const rnd = mulberry(3);
  const n = 2, ts = size / n, grout = Math.max(2, size * 0.012);
  ctx.fillStyle = rgbCss(shade(base, -0.45)); ctx.fillRect(0, 0, size, size); // grout colour
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = rgbCss(shade(base, (rnd() - 0.5) * 0.08));
    ctx.fillRect(i * ts + grout / 2, j * ts + grout / 2, ts - grout, ts - grout);
    // soft sheen gradient on each tile
    const g = ctx.createLinearGradient(i * ts, j * ts, i * ts + ts, j * ts + ts);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = g; ctx.fillRect(i * ts + grout / 2, j * ts + grout / 2, ts - grout, ts - grout);
  }
}

// Fine fabric speckle (Teppich).
function drawCarpet(ctx: CanvasRenderingContext2D, size: number, base: RGB) {
  fillBase(ctx, size, base);
  const r = mulberry(21);
  for (let i = 0; i < size * size * 0.5; i++) {
    const x = r() * size, y = r() * size;
    const up = r() > 0.5;
    ctx.fillStyle = up ? `rgba(255,255,255,${0.05 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.06})`;
    ctx.fillRect(x, y, 1.3, 1.3);
  }
}

// ── wall patterns ─────────────────────────────────────────────────────────
function drawPlaster(ctx: CanvasRenderingContext2D, size: number, base: RGB) {
  fillBase(ctx, size, base);
  const r = mulberry(33);
  for (let i = 0; i < 600; i++) {
    const x = r() * size, y = r() * size, rad = 4 + r() * 14;
    const up = r() > 0.5;
    wrapDot(ctx, x, y, rad, size, up ? `rgba(255,255,255,${0.02 + r() * 0.025})` : `rgba(0,0,0,${0.02 + r() * 0.03})`);
  }
}

// Woodchip wallpaper (Rauhfasertapete): a near-uniform field of tiny raised
// chips — short, slightly darker/lighter flecks scattered densely.
function drawWoodchip(ctx: CanvasRenderingContext2D, size: number, base: RGB) {
  fillBase(ctx, size, base);
  const r = mulberry(17);
  const chips = size * size * 0.08;
  for (let i = 0; i < chips; i++) {
    const x = r() * size, y = r() * size;
    const len = 2 + r() * 5, ang = r() * Math.PI;
    const dark = r() > 0.42;
    ctx.strokeStyle = dark ? `rgba(0,0,0,${0.07 + r() * 0.11})` : `rgba(255,255,255,${0.07 + r() * 0.11})`;
    ctx.lineWidth = 0.8 + r() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
}

// Running-bond brick: mortar field, bricks offset half a brick per course.
function drawBrick(ctx: CanvasRenderingContext2D, size: number, base: RGB) {
  const rnd = mulberry(13);
  const courses = 6, ch = size / courses, bw = size / 2, mortar = Math.max(2, size * 0.02);
  ctx.fillStyle = rgbCss(shade(base, -0.4)); ctx.fillRect(0, 0, size, size); // mortar
  for (let c = 0; c < courses; c++) {
    const y = c * ch;
    const off = (c % 2) * (bw / 2);
    for (let x = -bw; x < size + bw; x += bw) {
      const bx = x + off + mortar / 2;
      ctx.fillStyle = rgbCss(shade(base, (rnd() - 0.5) * 0.18));
      ctx.fillRect(bx, y + mortar / 2, bw - mortar, ch - mortar);
      // subtle top sheen
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(bx, y + mortar / 2, bw - mortar, (ch - mortar) * 0.25);
    }
  }
}

// ── preset tables ───────────────────────────────────────────────────────────
export const FLOOR_PRESETS: SurfacePreset<FloorPresetId>[] = [
  { id: 'concrete', label: 'Beton', defaultColor: '#74787e', roughness: 0.9, tileMeters: 3, draw: (c, s, b) => drawConcrete(c, s, b) },
  { id: 'parquet', label: 'Parkett', defaultColor: '#8a5a2f', roughness: 0.55, tileMeters: 1.6, draw: drawParquet },
  { id: 'planks', label: 'Dielen', defaultColor: '#9a6b3c', roughness: 0.5, tileMeters: 2.2, draw: drawPlanks },
  { id: 'tiles', label: 'Fliesen', defaultColor: '#c9ccce', roughness: 0.25, tileMeters: 0.8, draw: drawTiles },
  { id: 'carpet', label: 'Teppich', defaultColor: '#5a6470', roughness: 0.98, tileMeters: 1.0, draw: drawCarpet },
  { id: 'solid', label: 'Einfarbig', defaultColor: '#6b6f76', roughness: 0.92, tileMeters: 1, draw: null },
];

export const WALL_PRESETS: SurfacePreset<WallPresetId>[] = [
  { id: 'plaster', label: 'Putz', defaultColor: '#cfd2d6', roughness: 0.92, tileMeters: 1.6, draw: drawPlaster },
  { id: 'woodchip', label: 'Rauhfaser', defaultColor: '#e6e6e0', roughness: 0.95, tileMeters: 0.8, draw: drawWoodchip },
  { id: 'concrete', label: 'Beton', defaultColor: '#9b9ea2', roughness: 0.88, tileMeters: 2.4, draw: (c, s, b) => drawConcrete(c, s, b, 700, 2) },
  { id: 'brick', label: 'Backstein', defaultColor: '#9c5a44', roughness: 0.9, tileMeters: 1.0, draw: drawBrick },
  { id: 'solid', label: 'Einfarbig', defaultColor: '#8a8f99', roughness: 0.85, tileMeters: 1, draw: null },
];

export const DEFAULT_FLOOR = { preset: 'concrete' as FloorPresetId, color: '#74787e' };
export const DEFAULT_WALL_MATERIAL: WallPresetId = 'plaster';

export const floorPreset = (id: FloorPresetId | undefined): SurfacePreset<FloorPresetId> =>
  FLOOR_PRESETS.find((p) => p.id === id) ?? FLOOR_PRESETS[0];
export const wallPreset = (id: WallPresetId | undefined): SurfacePreset<WallPresetId> =>
  WALL_PRESETS.find((p) => p.id === (id ?? DEFAULT_WALL_MATERIAL)) ?? WALL_PRESETS[0];

// Render a preset to a fresh canvas tinted to `color`. Returns null for the
// flat ("solid") presets, which need no map.
export function surfaceCanvas<Id extends string>(preset: SurfacePreset<Id>, color: string, size = 256): HTMLCanvasElement | null {
  if (!preset.draw) return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  preset.draw(ctx, size, hexToRgb(color));
  return cv;
}
