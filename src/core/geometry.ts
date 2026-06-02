import type { Wall } from '../types';

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
