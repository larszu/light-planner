import type { Wall, WallWindow } from '../types';

export interface Pt { x: number; y: number }

// Quadratic-Bézier control point of a wall (chord midpoint when it's straight).
export function wallControl(w: Wall): Pt {
  if (w.cx != null && w.cy != null) return { x: w.cx, y: w.cy };
  return { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 };
}

export function isCurved(w: Wall): boolean {
  if (w.cx == null || w.cy == null) return false;
  const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
  return Math.hypot(w.cx - mx, w.cy - my) > 0.05;
}

// Point on the wall at parameter t∈[0,1] (straight line or quadratic Bézier).
export function wallPointAt(w: Wall, t: number): Pt {
  if (!isCurved(w)) return { x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t };
  const c = wallControl(w);
  const mt = 1 - t;
  return {
    x: mt * mt * w.x1 + 2 * mt * t * c.x + t * t * w.x2,
    y: mt * mt * w.y1 + 2 * mt * t * c.y + t * t * w.y2,
  };
}

// The point at the visual middle (t=0.5) — where the drag handle sits.
export function wallMidHandle(w: Wall): Pt {
  return wallPointAt(w, 0.5);
}

// Control point so the curve passes through (mx,my) at t=0.5.
export function curveControlForMid(x1: number, y1: number, x2: number, y2: number, mx: number, my: number): Pt {
  return { x: 2 * mx - 0.5 * (x1 + x2), y: 2 * my - 0.5 * (y1 + y2) };
}

// Sample a wall into `n` segments → n+1 points.
export function sampleWall(w: Wall, n = 16): Pt[] {
  if (!isCurved(w)) return [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(wallPointAt(w, i / n));
  return out;
}

// ── Windows / openings ───────────────────────────────────────────────────
// A wall is sampled into straight segments carrying a cumulative "run" distance
// (meters from the (x1,y1) end). Window openings are expressed in that run space
// so they work the same on straight and curved walls.
export interface WallSeg { a: Pt; b: Pt; r0: number; r1: number }

export function wallSegments(w: Wall): { segs: WallSeg[]; length: number } {
  const pts = sampleWall(w, isCurved(w) ? 18 : 1);
  const segs: WallSeg[] = [];
  let run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 1e-6) { segs.push({ a, b, r0: run, r1: run + len }); run += len; }
  }
  return { segs, length: run };
}

export function wallLength(w: Wall): number {
  return wallSegments(w).length;
}

// A window clamped to the wall's actual run length and height, sorted by start.
export interface NormWindow { r0: number; r1: number; sill: number; top: number; transmittance: number; tint: string; src: WallWindow }

export function normalizedWindows(w: Wall, length = wallLength(w)): NormWindow[] {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const out: NormWindow[] = [];
  for (const win of w.windows ?? []) {
    const r0 = clamp(win.start, 0, length);
    const r1 = clamp(win.start + win.width, 0, length);
    if (r1 - r0 < 0.02) continue;
    const sill = clamp(win.sill, 0, w.height);
    const top = clamp(win.top, sill, w.height);
    if (top - sill < 0.02) continue;
    out.push({ r0, r1, sill, top, transmittance: clamp(win.transmittance, 0, 1), tint: win.tint, src: win });
  }
  return out.sort((a, b) => a.r0 - b.r0);
}

// Position on the wall at a given run distance (walks the sampled segments).
export function pointAtRun(segs: WallSeg[], run: number): Pt {
  if (!segs.length) return { x: 0, y: 0 };
  for (const s of segs) {
    if (run <= s.r1 || s === segs[segs.length - 1]) {
      const span = s.r1 - s.r0;
      const t = span > 1e-6 ? (run - s.r0) / span : 0;
      return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
    }
  }
  const last = segs[segs.length - 1];
  return { x: last.b.x, y: last.b.y };
}

// Shortest distance from a point to a (possibly curved) wall.
export function distToWall(w: Wall, px: number, py: number): number {
  const pts = sampleWall(w, isCurved(w) ? 20 : 1);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distToSegment(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
  }
  return best;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Andrew's monotone chain convex hull.
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// Point-in-polygon (ray casting).
export function pointInPolygon(px: number, py: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonBounds(poly: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}
