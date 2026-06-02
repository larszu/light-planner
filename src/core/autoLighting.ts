import type { Person, PlacedFixture, Fixture, StageElement } from '../types';
import { fixtureLibrary } from '../core/fixtureLibrary';
import { luxFromFixture } from './lightCalc';

const DEG2RAD = Math.PI / 180;

/** A truss the auto-lighting can hang fixtures on (so throws aren't random). */
export interface TrussLine { x1: number; y1: number; x2: number; y2: number; height: number }

/** Closest point on segment (x1,y1)-(x2,y2) to (px,py). */
function nearestOnSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + dx * t, y: y1 + dy * t };
}

function findFixture(id: string): Fixture | undefined {
  return fixtureLibrary.find((f) => f.id === id);
}

function defaultProfile(): Fixture {
  return findFixture('etc-s4-26') ?? fixtureLibrary[0];
}

function defaultFresnel(): Fixture {
  return findFixture('fresnel-1kw') ?? fixtureLibrary[0];
}

let autoIdCounter = 0;
function nextId(): string {
  return `auto-${Date.now()}-${++autoIdCounter}`;
}

/**
 * Estimate the dimming % needed for a fixture at a given position/aim
 * to produce `targetLux` at the aim point.
 *
 * Uses a binary search: create a temporary PlacedFixture at 100%,
 * measure its peak lux, then scale linearly (lux ∝ dimming).
 */
function computeDimmingForTarget(
  fixture: Fixture,
  x: number, y: number,
  mountingHeight: number,
  aimX: number, aimY: number,
  targetLux: number,
): number {
  if (targetLux <= 0) return 100;

  // Create a temporary fixture at 100% to measure max output
  const temp: PlacedFixture = {
    id: 'tmp', fixture, x, y, mountingHeight,
    aimX, aimY, bodyRotation: 0, dimming: 100,
  };
  const fullLux = luxFromFixture(temp, aimX, aimY);
  if (fullLux <= 0) return 100;

  // lux scales linearly with dimming
  const needed = (targetLux / fullLux) * 100;
  return Math.max(1, Math.min(100, Math.round(needed)));
}

// ─────────────────────────────────────────────────────────
// 3-POINT LIGHTING
// ─────────────────────────────────────────────────────────
//
// Roger Deakins / cinematographic approach:
//  • Key:  Main light source. 45° azimuth from camera axis,
//          ~45° elevation. Defines the exposure.
//  • Fill: Opposite side, ~30° elevation. Intensity set via
//          contrast ratio (key:fill). A 2:1 ratio = gentle,
//          4:1 = dramatic, 8:1 = noir.
//  • Back: 180° behind subject, ~60° elevation.
//          Typically 0.5–1 stop above key for rim separation.
//
// Key angle convention: "front" = negative Y (audience).
// Person faces the audience (−Y direction).
//
// If a targetLux > 0 is provided, key dimming is calculated
// so the key alone delivers that illuminance at the person.
// Fill dimming is derived from the contrast ratio.
// ─────────────────────────────────────────────────────────

export interface ThreePointConfig {
  keyFixture?: Fixture;
  fillFixture?: Fixture;
  backFixture?: Fixture;
  /** Key:Fill contrast ratio. 2 = soft, 4 = moderate, 8 = dramatic. Default 2. */
  contrastRatio?: number;
  /** Back light intensity relative to key. 1.0 = same as key, 1.5 = brighter rim. Default 1.0. */
  backRatio?: number;
  /** Target illuminance (lux) for the key light at the subject. 0 = use manual dimming. */
  targetLux?: number;
  /** Manual fallback dimming when targetLux is 0. */
  keyDimming?: number;
  fillDimming?: number;
  backDimming?: number;
  /** Hang key & fill on this truss (uses its height) so throws are consistent. */
  truss?: TrussLine;
  /** Horizontal distance person→lamp (m). 0/undef ⇒ derive from mounting height. */
  throwDistance?: number;
}

export function generate3PointLighting(
  person: Person,
  mountingHeight: number = 5,
  config: ThreePointConfig = {},
): PlacedFixture[] {
  const px = person.x;
  const py = person.y;

  const keyF = config.keyFixture ?? defaultProfile();
  const fillF = config.fillFixture ?? defaultFresnel();
  const backF = config.backFixture ?? defaultProfile();
  const ratio = config.contrastRatio ?? 2;
  const backRatio = config.backRatio ?? 1.0;
  const targetLux = config.targetLux ?? 0;

  // Horizontal throw (person → lamp). Adjustable; default = mounting height (45°).
  const throwDist = config.throwDistance && config.throwDistance > 0 ? config.throwDistance : mountingHeight;
  const truss = config.truss;
  const mh = truss ? truss.height : mountingHeight;

  // Place a lamp at a given azimuth + throw; when a truss is chosen, snap key &
  // fill onto it (consistent distances instead of random ones).
  const place = (azDeg: number, snap: boolean): { x: number; y: number } => {
    const az = azDeg * DEG2RAD;
    let x = px + throwDist * Math.cos(az);
    let y = py + throwDist * Math.sin(az);
    if (truss && snap) { const n = nearestOnSegment(x, y, truss.x1, truss.y1, truss.x2, truss.y2); x = n.x; y = n.y; }
    return { x, y };
  };

  const { x: keyX, y: keyY } = place(-135, true);   // front-left
  const { x: fillX, y: fillY } = place(-45, true);  // front-right
  const backX = px;                                  // back light stays behind
  const backY = py + throwDist;

  // ── Compute dimming ──
  let keyDim: number, fillDim: number, backDim: number;

  if (targetLux > 0) {
    keyDim = computeDimmingForTarget(keyF, keyX, keyY, mh, px, py, targetLux);
    fillDim = computeDimmingForTarget(fillF, fillX, fillY, mh, px, py, targetLux / ratio);
    backDim = computeDimmingForTarget(backF, backX, backY, mh, px, py, targetLux * backRatio);
  } else {
    keyDim = config.keyDimming ?? 100;
    fillDim = config.fillDimming ?? Math.round(100 / ratio);
    backDim = config.backDimming ?? 70;
  }

  return [
    { id: nextId(), fixture: keyF, x: Math.round(keyX * 10) / 10, y: Math.round(keyY * 10) / 10, mountingHeight: mh, aimX: px, aimY: py, bodyRotation: 0, dimming: keyDim },
    { id: nextId(), fixture: fillF, x: Math.round(fillX * 10) / 10, y: Math.round(fillY * 10) / 10, mountingHeight: mh, aimX: px, aimY: py, bodyRotation: 0, dimming: fillDim },
    { id: nextId(), fixture: backF, x: Math.round(backX * 10) / 10, y: Math.round(backY * 10) / 10, mountingHeight: mh, aimX: px, aimY: py, bodyRotation: 0, dimming: backDim },
  ];
}

// ─────────────────────────────────────────────────────────
// EVEN AREA DISTRIBUTION
// ─────────────────────────────────────────────────────────
//
// Professional approach: fixtures are mounted on front & back
// trusses aiming forward at ~45° elevation. No cross-lighting
// that creates opposing shadows / hotspots.
//
// Layout (front truss + back truss):
//   Front truss: upstage side of area, fixtures aim downstage at 45°
//   Back truss: downstage side, fixtures aim upstage at 45°
//   → beams overlap in the centre for even coverage.
//
// When targetLux > 0, fixture dimming is computed so the
// combined contribution at the area centre hits the target.
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// AREA LIGHTING WITH CHOSEN DIRECTION(S)
// ─────────────────────────────────────────────────────────
//
// Lights a rectangular area to a uniform target illuminance from the
// side(s) the user picks. This unifies the common stage techniques:
//   • one side          → e.g. front wash only
//   • two opposite sides → "über Kreuz" / cross-light (beams cross,
//                          each side fills the other's shadows)
//   • all four sides     → fully even wrap-around wash
//
// Fixtures sit on a truss along each chosen side (offset by the 45° throw)
// and aim into the area. Dimming is solved so the MEAN illuminance across
// the area equals targetLux — independent of how many sides are used, so
// switching direction keeps the same brightness.
// ─────────────────────────────────────────────────────────

export type LightSide = 'N' | 'E' | 'S' | 'W';

export interface LightArea { minX: number; minY: number; maxX: number; maxY: number }

export interface AreaLightConfig {
  sides: LightSide[];
  targetLux?: number;
  fixture?: Fixture;
  mountingHeight?: number;
  /** Cross-light: beams cross the area (each lamp aims at the opposite side) for
   *  even coverage that beats a flat straight-on wash — McCandless principle. */
  cross?: boolean;
  /** Hang the fixtures on this truss instead of synthetic side rows. */
  truss?: TrussLine;
  /** Horizontal throw / side offset (m). 0/undef ⇒ = mounting height (45°). */
  throwDistance?: number;
}

function mkFixture(fixture: Fixture, x: number, y: number, mh: number, aimX: number, aimY: number, dim = 80): PlacedFixture {
  return {
    id: nextId(), fixture,
    x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
    mountingHeight: mh,
    aimX: Math.round(aimX * 10) / 10, aimY: Math.round(aimY * 10) / 10,
    bodyRotation: 0, dimming: dim,
  };
}

export function generateAreaLighting(area: LightArea, config: AreaLightConfig): PlacedFixture[] {
  const fixture = config.fixture ?? defaultFresnel();
  const targetLux = config.targetLux ?? 0;
  const truss = config.truss;
  const mh = truss ? truss.height : (config.mountingHeight ?? 5);
  const cross = !!config.cross;
  const sides = config.sides.length ? config.sides : (['N', 'S'] as LightSide[]);
  const { minX, minY, maxX, maxY } = area;
  const w = Math.max(0.1, maxX - minX), d = Math.max(0.1, maxY - minY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const results: PlacedFixture[] = [];

  const beamAngle = fixture.zoomRange ? fixture.zoomRange[1] : fixture.beamAngle;
  const beamR = Math.tan((beamAngle / 2) * DEG2RAD) * mh;
  const throwDist = config.throwDistance && config.throwDistance > 0 ? config.throwDistance : mh;

  // Straight: aim into the area perpendicular to the row.
  // Cross (über Kreuz): aim at the mirrored point across the area centre, so the
  // beams cross — even coverage that doesn't fall off like a flat frontal wash.
  const build = (spacing: number): PlacedFixture[] => {
    const out: PlacedFixture[] = [];
    if (truss) {
      const tdx = truss.x2 - truss.x1, tdy = truss.y2 - truss.y1;
      const tlen = Math.hypot(tdx, tdy) || 0.1;
      const horiz = Math.abs(tdx) >= Math.abs(tdy);
      const count = Math.max(2, Math.ceil(tlen / spacing) + 1);
      for (let i = 0; i < count; i++) {
        const f = count > 1 ? i / (count - 1) : 0.5;
        const fx = truss.x1 + tdx * f, fy = truss.y1 + tdy * f;
        const aimX = horiz ? (cross ? 2 * cx - fx : fx) : cx;
        const aimY = horiz ? cy : (cross ? 2 * cy - fy : fy);
        out.push(mkFixture(fixture, fx, fy, mh, aimX, aimY, 100));
      }
      return out;
    }
    for (const side of sides) {
      if (side === 'N' || side === 'S') {
        const count = Math.max(2, Math.ceil(w / spacing) + 1);
        const startX = cx - ((count - 1) * spacing) / 2;
        const ty = side === 'N' ? minY - throwDist : maxY + throwDist;
        for (let i = 0; i < count; i++) {
          const fxw = startX + i * spacing;
          out.push(mkFixture(fixture, fxw, ty, mh, cross ? 2 * cx - fxw : fxw, cy, 100));
        }
      } else {
        const count = Math.max(2, Math.ceil(d / spacing) + 1);
        const startY = cy - ((count - 1) * spacing) / 2;
        const tx = side === 'W' ? minX - throwDist : maxX + throwDist;
        for (let i = 0; i < count; i++) {
          const fyw = startY + i * spacing;
          out.push(mkFixture(fixture, tx, fyw, mh, cx, cross ? 2 * cy - fyw : fyw, 100));
        }
      }
    }
    return out;
  };

  const meanLux = (fx: PlacedFixture[]): number => {
    const gx = 6, gy = 6;
    let sum = 0;
    for (let i = 0; i < gx; i++) for (let j = 0; j < gy; j++) {
      const sxw = minX + ((i + 0.5) / gx) * w;
      const syw = minY + ((j + 0.5) / gy) * d;
      sum += fx.reduce((s, f) => s + luxFromFixture(f, sxw, syw), 0);
    }
    return sum / (gx * gy);
  };

  let spacing = Math.max(beamR * 1.2, 1.2); // ~40 % overlap
  let built = build(spacing);

  if (targetLux > 0) {
    // Densify (more fixtures = more flux) until the target is reachable within
    // 100 % dimming — so one side reaches the same lux as four, just with more
    // fixtures. Capped so it can't run away on huge areas / unreachable targets.
    for (let iter = 0; iter < 6 && built.length <= 70; iter++) {
      if (meanLux(built) >= targetLux) break;
      spacing *= 0.72;
      built = build(spacing);
    }
    const avg = meanLux(built);
    const dim = avg > 0 ? Math.max(1, Math.min(100, Math.round((targetLux / avg) * 100))) : 80;
    for (const f of built) f.dimming = dim;
  } else {
    for (const f of built) f.dimming = 80;
  }

  results.push(...built);
  return results;
}

export interface EvenDistConfig {
  /** Target illuminance in the area centre. 0 = use default 80% dimming. */
  targetLux?: number;
  fixture?: Fixture;
}

/**
 * Generate even area lighting.
 *
 * If stageElements are provided, uses their bounding box as the lit area.
 * Otherwise falls back to the persons' bounding box with padding.
 */
export function generateEvenDistribution(
  persons: Person[],
  mountingHeight: number = 5,
  config: EvenDistConfig = {},
  stageElements: StageElement[] = [],
): PlacedFixture[] {
  const fresnel = config.fixture ?? defaultFresnel();
  const targetLux = config.targetLux ?? 0;
  const results: PlacedFixture[] = [];

  // ── Determine area to light ──
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  if (stageElements.length > 0) {
    // Use stage elements bounding box
    for (const se of stageElements) {
      if (se.x < minX) minX = se.x;
      if (se.x + se.width > maxX) maxX = se.x + se.width;
      if (se.y < minY) minY = se.y;
      if (se.y + se.depth > maxY) maxY = se.y + se.depth;
    }
  } else if (persons.length > 0) {
    // Fall back to persons bounding box
    for (const p of persons) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const padding = 2;
    minX -= padding; maxX += padding;
    minY -= padding; maxY += padding;
  } else {
    return [];
  }

  const stageWidth = maxX - minX;
  const stageDepth = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // ── Fixture spacing from beam geometry ──
  const beamAngle = fresnel.zoomRange ? fresnel.zoomRange[1] : fresnel.beamAngle;
  const beamRadius = Math.tan((beamAngle / 2) * DEG2RAD) * mountingHeight;
  // ~30% overlap → spacing = beam diameter × 0.7
  const spacing = Math.max(beamRadius * 1.4, 1.5);

  // ── Truss positions ──
  // 45° elevation → horizontal throw = mountingHeight
  const throwDist = mountingHeight; // tan(45°) = 1
  // Trusses positioned so beams hit the area edges
  const frontTrussY = minY - throwDist;
  const backTrussY = maxY + throwDist;

  // Number of fixtures across the width
  const countX = Math.max(2, Math.ceil(stageWidth / spacing) + 1);
  const startX = centerX - ((countX - 1) * spacing) / 2;

  // ── Front truss: fixtures aim INTO the area (towards +Y / upstage) ──
  for (let i = 0; i < countX; i++) {
    const fx = startX + i * spacing;
    const aimX = fx; // aim straight ahead, not cross
    const aimY = centerY; // aim at the area centre depth
    results.push({
      id: nextId(), fixture: fresnel,
      x: Math.round(fx * 10) / 10,
      y: Math.round(frontTrussY * 10) / 10,
      mountingHeight,
      aimX: Math.round(aimX * 10) / 10,
      aimY: Math.round(aimY * 10) / 10,
      bodyRotation: 0,
      dimming: 80,
    });
  }

  // ── Back truss: fixtures aim INTO the area (towards −Y / downstage) ──
  for (let i = 0; i < countX; i++) {
    const fx = startX + i * spacing;
    const aimX = fx;
    const aimY = centerY;
    results.push({
      id: nextId(), fixture: fresnel,
      x: Math.round(fx * 10) / 10,
      y: Math.round(backTrussY * 10) / 10,
      mountingHeight,
      aimX: Math.round(aimX * 10) / 10,
      aimY: Math.round(aimY * 10) / 10,
      bodyRotation: 0,
      dimming: 80,
    });
  }

  // ── If wide area, add side fills at 45° ──
  if (stageWidth > spacing * 2) {
    const countY = Math.max(2, Math.ceil(stageDepth / spacing) + 1);
    const startY = centerY - ((countY - 1) * spacing) / 2;
    const leftTrussX = minX - throwDist;
    const rightTrussX = maxX + throwDist;

    for (let i = 0; i < countY; i++) {
      const fy = startY + i * spacing;
      // Left side → aim right
      results.push({
        id: nextId(), fixture: fresnel,
        x: Math.round(leftTrussX * 10) / 10,
        y: Math.round(fy * 10) / 10,
        mountingHeight,
        aimX: Math.round(centerX * 10) / 10,
        aimY: Math.round(fy * 10) / 10,
        bodyRotation: 0,
        dimming: 60,
      });
      // Right side → aim left
      results.push({
        id: nextId(), fixture: fresnel,
        x: Math.round(rightTrussX * 10) / 10,
        y: Math.round(fy * 10) / 10,
        mountingHeight,
        aimX: Math.round(centerX * 10) / 10,
        aimY: Math.round(fy * 10) / 10,
        bodyRotation: 0,
        dimming: 60,
      });
    }
  }

  // ── Adjust dimming for target lux if set ──
  if (targetLux > 0 && results.length > 0) {
    // Measure combined lux at area centre from all fixtures at current dimming
    const testLux = results.reduce((sum, f) => sum + luxFromFixture(f, centerX, centerY), 0);
    if (testLux > 0) {
      const scale = targetLux / testLux;
      for (const f of results) {
        f.dimming = Math.max(1, Math.min(100, Math.round(f.dimming * scale)));
      }
    }
  }

  return results;
}
