import { describe, it, expect } from 'vitest';
import type { Wall } from '../types';
import {
  distToSegment,
  convexHull,
  pointInPolygon,
  polygonBounds,
  wallControl,
  wallPointAt,
  isCurved,
  type Pt,
} from './geometry';

const SQUARE: Pt[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

function makeWall(extra: Partial<Wall> = {}): Wall {
  return {
    id: 'w1', x1: 0, y1: 0, x2: 10, y2: 0,
    height: 3, reflectance: 0.5, color: '#ccc', label: '',
    ...extra,
  };
}

describe('distToSegment', () => {
  it('is the perpendicular distance when the projection lands on the segment', () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it('clamps to the start endpoint when the projection falls before it', () => {
    expect(distToSegment(0, 1, 0, 0, 10, 0)).toBeCloseTo(1);
  });

  it('clamps to the end endpoint when the projection falls past it', () => {
    expect(distToSegment(15, 0, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it('handles a degenerate zero-length segment', () => {
    expect(distToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});

describe('convexHull', () => {
  it('returns the input (sorted) when given fewer than 3 points', () => {
    expect(convexHull([{ x: 1, y: 1 }, { x: 0, y: 0 }])).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('drops interior points and keeps only the corners', () => {
    const hull = convexHull([...SQUARE, { x: 2, y: 2 }]);
    expect(hull).toHaveLength(4);
    for (const corner of SQUARE) expect(hull).toContainEqual(corner);
    expect(hull).not.toContainEqual({ x: 2, y: 2 });
  });
});

describe('pointInPolygon', () => {
  it('detects a point inside the polygon', () => {
    expect(pointInPolygon(2, 2, SQUARE)).toBe(true);
  });

  it('detects points outside the polygon', () => {
    expect(pointInPolygon(5, 5, SQUARE)).toBe(false);
    expect(pointInPolygon(-1, 2, SQUARE)).toBe(false);
  });
});

describe('polygonBounds', () => {
  it('returns the axis-aligned bounding box', () => {
    expect(polygonBounds(SQUARE)).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 4 });
  });
});

describe('wall geometry', () => {
  it('treats a wall without a control point as straight', () => {
    const w = makeWall();
    expect(isCurved(w)).toBe(false);
    expect(wallControl(w)).toEqual({ x: 5, y: 0 });
    expect(wallPointAt(w, 0.5)).toEqual({ x: 5, y: 0 });
  });

  it('treats a wall with an off-chord control point as curved', () => {
    const w = makeWall({ cx: 5, cy: 5 });
    expect(isCurved(w)).toBe(true);
    // Apex of the quadratic Bézier at t=0.5 is half-way to the control point.
    expect(wallPointAt(w, 0.5)).toEqual({ x: 5, y: 2.5 });
  });
});
