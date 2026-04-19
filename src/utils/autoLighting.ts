import type { Person, PlacedFixture, Fixture } from '../types';
import { fixtureLibrary } from '../data/fixtureLibrary';

const DEG2RAD = Math.PI / 180;

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
 * 3-Point Lighting (McCandless-inspired):
 *  Key:  45° front-left, ~45° elevation, 100% intensity
 *  Fill: 45° front-right, ~30° elevation, 50% intensity
 *  Back: directly behind, ~60° elevation, 70% intensity
 *
 * "Front" is defined as the negative Y direction (audience is at larger Y).
 * The person faces towards negative Y (towards audience).
 *
 * Accepts optional fixture overrides and dimming levels per role.
 */
export function generate3PointLighting(
  person: Person,
  mountingHeight: number = 5,
  keyFixture?: Fixture,
  fillFixture?: Fixture,
  backFixture?: Fixture,
  keyDimming: number = 100,
  fillDimming: number = 50,
  backDimming: number = 70,
): PlacedFixture[] {
  const px = person.x;
  const py = person.y;
  const keyF = keyFixture ?? defaultProfile();
  const fillF = fillFixture ?? defaultFresnel();
  const backF = backFixture ?? defaultProfile();

  // Key light: 45° left, 45° elevation
  const keyDist = mountingHeight / Math.tan(45 * DEG2RAD);
  const keyAngle = -135 * DEG2RAD; // front-left (audience is -Y)
  const keyX = px + keyDist * Math.cos(keyAngle);
  const keyY = py + keyDist * Math.sin(keyAngle);

  // Fill light: 45° right, 30° elevation (further away, dimmer)
  const fillDist = mountingHeight / Math.tan(30 * DEG2RAD);
  const fillAngle = -45 * DEG2RAD; // front-right
  const fillX = px + fillDist * Math.cos(fillAngle);
  const fillY = py + fillDist * Math.sin(fillAngle);

  // Back light: behind, 60° elevation
  const backDist = mountingHeight / Math.tan(60 * DEG2RAD);
  const backX = px;
  const backY = py + backDist; // behind (positive Y direction)

  return [
    {
      id: nextId(),
      fixture: keyF,
      x: keyX,
      y: keyY,
      mountingHeight,
      aimX: px,
      aimY: py,
      bodyRotation: 0,
      dimming: keyDimming,
    },
    {
      id: nextId(),
      fixture: fillF,
      x: fillX,
      y: fillY,
      mountingHeight,
      aimX: px,
      aimY: py,
      bodyRotation: 0,
      dimming: fillDimming,
    },
    {
      id: nextId(),
      fixture: backF,
      x: backX,
      y: backY,
      mountingHeight,
      aimX: px,
      aimY: py,
      bodyRotation: 0,
      dimming: backDimming,
    },
  ];
}

/**
 * Cross-lighting / Even Distribution:
 * Places Fresnels on two "trusses" (left/right of the stage area)
 * aimed at opposite sides for even coverage.
 *
 * Uses the bounding box of all persons as the "stage area".
 * Fresnels are spaced so their beam circles overlap ~30%.
 */
export function generateEvenDistribution(
  persons: Person[],
  mountingHeight: number = 5,
): PlacedFixture[] {
  if (persons.length === 0) return [];

  const fresnel = defaultFresnel();
  const results: PlacedFixture[] = [];

  // Compute bounding box of persons with padding
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of persons) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const padding = 2; // 2m around persons
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;

  const stageWidth = maxX - minX;
  const stageDepth = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Beam radius on floor at mounting height
  const beamAngle = fresnel.zoomRange ? fresnel.zoomRange[1] : fresnel.beamAngle;
  const beamRadius = Math.tan((beamAngle / 2) * DEG2RAD) * mountingHeight;

  // Spacing: overlap ~30% → spacing = beamRadius * 1.4
  const spacing = Math.max(beamRadius * 1.4, 1.5);

  // Truss offset from center (left/right)
  const trussOffset = stageWidth / 2 + 1.5;

  // Number of fixtures along depth
  const count = Math.max(2, Math.ceil(stageDepth / spacing) + 1);
  const startY = centerY - ((count - 1) * spacing) / 2;

  // Left truss → aim right
  for (let i = 0; i < count; i++) {
    const fy = startY + i * spacing;
    results.push({
      id: nextId(),
      fixture: fresnel,
      x: centerX - trussOffset,
      y: fy,
      mountingHeight,
      aimX: centerX + trussOffset * 0.3,
      aimY: fy,
      bodyRotation: 0,
      dimming: 80,
    });
  }

  // Right truss → aim left
  for (let i = 0; i < count; i++) {
    const fy = startY + i * spacing;
    results.push({
      id: nextId(),
      fixture: fresnel,
      x: centerX + trussOffset,
      y: fy,
      mountingHeight,
      aimX: centerX - trussOffset * 0.3,
      aimY: fy,
      bodyRotation: 0,
      dimming: 80,
    });
  }

  return results;
}
