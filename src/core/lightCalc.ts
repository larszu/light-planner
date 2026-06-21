import type { PlacedFixture, Attachment, PhotometricData, Wall, Ceiling } from '../types';
import { combinedTransmission, effectiveBeamAngleWithFrost, frostLevel } from '../core/gelLibrary';
import { sampleWall, isCurved, pointInPolygon, polygonBounds, wallSegments, normalizedWindows } from './geometry';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Barn-door (Flügeltore) attenuation toward a point, given the *unit* vector
 * (ux,uy,uz) from the fixture to that point and the effective field angle.
 * Returns a factor in 0..1 that multiplies the beam intensity.
 *
 * Each of the four flaps (top/bottom/left/right) closes from 0 (fully open – no
 * cut) to 1 (fully closed – blocks that half of the beam). A flap at closure c
 * cuts everything beyond the half-angle (1−c)·refHalf on its side, measured in
 * the fixture's own frame (aim axis, rolled by bodyRotation).
 *
 * Gel placement decides how crisp that cut is – the one thing that physically
 * changes between putting a gel in the colour frame vs. in front of the doors:
 *   'frame' (default) – gel sits behind the doors at the lens → hard, crisp cut.
 *   'front'           – gel/diffusion hangs in front of the doors → the lit
 *                       diffusion becomes the new, larger source, so the edge
 *                       softens; with real frost the cut is largely defeated
 *                       (the doors effectively stop working), as in practice.
 */
export function barnDoorAttenuation(
  f: PlacedFixture,
  ux: number, uy: number, uz: number,
  fieldAngleDeg: number,
): number {
  const bd = f.barnDoors;
  if (!bd) return 1;
  const top = bd.top || 0, bottom = bd.bottom || 0, left = bd.left || 0, right = bd.right || 0;
  if (top <= 0 && bottom <= 0 && left <= 0 && right <= 0) return 1;

  // Aim axis (fixture → aim point on floor), normalised.
  const h = f.mountingHeight;
  const aDx = f.aimX - f.x, aDy = f.aimY - f.y;
  const aimDist = Math.sqrt(aDx * aDx + aDy * aDy + h * h) || 1e-6;
  const ax = aDx / aimDist, ay = aDy / aimDist, az = -h / aimDist;

  // Orthonormal frame perpendicular to the aim axis.
  //   right0 = aimAxis × worldZ  → horizontal; up0 = aimAxis × right0.
  // For a (near-)vertical aim, right0 collapses → fall back to world X.
  let rx = ay, ry = -ax, rz = 0;
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-4) { rx = 1; ry = 0; rz = 0; rl = 1; }
  rx /= rl; ry /= rl; rz /= rl;
  let upx = ay * rz - az * ry;
  let upy = az * rx - ax * rz;
  let upz = ax * ry - ay * rx;
  const ul = Math.hypot(upx, upy, upz) || 1e-6;
  upx /= ul; upy /= ul; upz /= ul;

  // Roll the frame about the aim axis by the body rotation.
  const br = f.bodyRotation * DEG2RAD;
  const cb = Math.cos(br), sb = Math.sin(br);
  const Rx = rx * cb + upx * sb, Ry = ry * cb + upy * sb, Rz = rz * cb + upz * sb;
  const Ux = -rx * sb + upx * cb, Uy = -ry * sb + upy * cb, Uz = -rz * sb + upz * cb;

  // Decompose the point direction into forward / right / up components.
  const af = ux * ax + uy * ay + uz * az;      // = cos(theta) along the aim axis
  if (af <= 1e-3) return 1;                     // ≥90° off-axis: beam is ~0 anyway
  const ar = ux * Rx + uy * Ry + uz * Rz;
  const au = ux * Ux + uy * Uy + uz * Uz;
  const angR = Math.atan2(ar, af) * RAD2DEG;    // signed °, + toward the 'right' flap
  const angU = Math.atan2(au, af) * RAD2DEG;    // signed °, + toward the 'top' flap

  // The flaps measure against the beam edge (field half-angle).
  const refHalf = Math.max(fieldAngleDeg / 2, 1);

  // Crispness from gel placement.
  const front = f.gelPlacement === 'front';
  const frost = front ? frostLevel(f.gelFilterIds ?? []) : 0;
  const baseSoft = refHalf * 0.12 + 0.5;                       // gentle even when crisp
  const soft = baseSoft * (front ? 2.5 + 4 * frost : 1);       // front → softer edge
  const defeat = front ? Math.min(0.85, 0.25 + 0.7 * frost) : 0; // front+frost → cut pulled back

  const flap = (ang: number, closure: number): number => {
    if (closure <= 0) return 1;
    const cutCrisp = (1 - closure) * refHalf;
    const cut = cutCrisp + (refHalf - cutCrisp) * defeat; // defeat eases the cut outward
    const t = (cut - ang) / (2 * soft) + 0.5;             // 1 well inside → 0 well outside
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);                            // smoothstep
  };

  return flap(angR, right) * flap(-angR, left) * flap(angU, top) * flap(-angU, bottom);
}

/**
 * Get the active attachment for a placed fixture, if any.
 */
function getActiveAttachment(f: PlacedFixture): Attachment | undefined {
  if (!f.activeAttachmentId || !f.fixture.compatibleAttachments) return undefined;
  return f.fixture.compatibleAttachments.find((a) => a.id === f.activeAttachmentId);
}

/**
 * Get effective beam parameters, considering active attachment overrides.
 *
 * `currentBeamAngle` is the zoom override expressed as FWHM (50 %) – when set,
 * the field angle (10 %) is scaled by the same factor.
 *
 * `refFieldAngle` is the field angle at which the photometric reference was
 * taken, converted from the stored FWHM into the same fieldAngle convention
 * used by σ. When no photometric is provided it defaults to the nominal
 * (base) field angle, so zoomCompensation collapses to 1 at default zoom.
 */
/**
 * Effective field angle (10 %) for the placed fixture, including attachment
 * overrides, zoom (currentBeamAngle is FWHM and scales fieldAngle by the
 * same factor) and frost widening. Use this to draw the cone footprint in
 * 2D / 3D so its edge coincides with the heat-map fade-out (σ is anchored
 * on the same value inside `luxFromFixture`).
 */
export function effectiveFieldAngleDeg(f: PlacedFixture): number {
  const eff = getEffectiveBeam(f);
  return effectiveBeamAngleWithFrost(eff.fieldAngle, f.gelFilterIds ?? []);
}

/**
 * Effective on-axis peak luminous intensity (candela) for a placed fixture,
 * including dimming, gel transmission and zoom/frost — the very same engine the
 * heat-map uses. Drives the 3D spotlight intensity so the relit ("photo") view
 * stays physically consistent with the lux calculation. Muted lamps return 0.
 */
export function peakCandela(f: PlacedFixture): number {
  if (f.hidden) return 0;
  const dim = Math.max(0, f.dimming / 100);
  if (dim <= 0) return 0;
  const eff = getEffectiveBeam(f);
  let fieldAngle = eff.fieldAngle;
  if (f.gelFilterIds && f.gelFilterIds.length > 0) fieldAngle = effectiveBeamAngleWithFrost(eff.fieldAngle, f.gelFilterIds);
  const gel = (f.gelFilterIds && f.gelFilterIds.length > 0) ? combinedTransmission(f.gelFilterIds) : 1;
  const cd = peakIntensity(eff.lumens, eff.refFieldAngle, fieldAngle, eff.beamRatioWH, eff.photometric);
  return cd * dim * gel;
}

function getEffectiveBeam(f: PlacedFixture): {
  beamAngle: number;       // 50 % FWHM (metadata / labelling)
  fieldAngle: number;      // 10 % – used for the Gaussian σ
  refFieldAngle: number;   // 10 % equivalent of photometric.beamAngle
  beamShape: typeof f.fixture.beamShape;
  beamRatioWH: number;
  lumens: number;
  photometric: PhotometricData | undefined;
} {
  const att = getActiveAttachment(f);
  const fix = f.fixture;
  const baseBeam = att?.beamAngleOverride ?? fix.beamAngle;
  const baseField = att?.fieldAngleOverride ?? fix.fieldAngle;
  const beamAngle = f.currentBeamAngle ?? baseBeam;
  // Zoom scales beam & field together; preserve their ratio.
  const zoomScale = baseBeam > 0 ? beamAngle / baseBeam : 1;
  const fieldAngle = baseField * zoomScale;
  const beamShape = att?.beamShapeOverride ?? fix.beamShape;
  const photometric = att?.photometricOverride ?? fix.photometric;
  // Convert photometric.beamAngle (stored as FWHM, matching fixture.beamAngle
  // convention) into a fieldAngle so it can be compared against the σ-relevant
  // currentAngle inside zoomCompensation.
  const beamToFieldRatio = baseBeam > 0 ? baseField / baseBeam : 1;
  const refFieldAngle = photometric?.beamAngle
    ? photometric.beamAngle * beamToFieldRatio
    : baseField;
  return {
    beamAngle,
    fieldAngle,
    refFieldAngle,
    beamShape,
    beamRatioWH: fix.beamRatioWH,
    lumens: fix.lumens,
    photometric,
  };
}

/**
 * Peak luminous intensity (candela) from photometric reference data.
 * candela = lux × distance²
 */
function candelaFromPhotometric(p: PhotometricData): number {
  return p.lux * p.distance * p.distance;
}

/**
 * Zoom- & frost-compensation scale factor for peak candela.
 *
 * A focusing fixture conserves luminous flux while the beam is zoomed or
 * diffused, so the peak angular intensity scales with 1/σ². We multiply
 * the reference peak candela by (σ_ref / σ_current)²; since both σs are
 * derived from the same field-angle convention, the ratio simplifies to
 * (refAngle / currentAngle)².
 *
 * `refAngle` is the field angle at which the photometric reference was
 * taken: `photometric.beamAngle` if available, otherwise the fixture's
 * nominal `fieldAngle`.
 */
function zoomCompensation(refAngle: number, currentAngle: number): number {
  if (refAngle <= 0 || currentAngle <= 0) return 1;
  const ratio = refAngle / currentAngle;
  return ratio * ratio;
}

/**
 * Gaussian sigma (radians) from the field angle (10 % intensity).
 *
 * σ such that I(θ = fieldAngle/2) = 10 % · I₀, i.e.
 *   exp(−θ²/(2σ²)) = 0.1  ⇒  σ = θ / √(2·ln10)
 *
 * Anchoring σ on the field angle makes the heatmap edge coincide with the
 * visible cone (which is also drawn at the 10 % isophote in 2D / 3D).
 */
function beamSigma(fieldAngleDeg: number): number {
  const halfAngle = (fieldAngleDeg / 2) * DEG2RAD;
  return halfAngle / Math.sqrt(2 * Math.LN10);
}

/**
 * Peak luminous intensity (candela) for a fixture using lumens.
 * Fallback when no photometric measurement is available.
 *
 * For a 2-D Gaussian beam, total flux Φ = 2π·I₀·σ_x·σ_y ⇒ I₀ = Φ / (2π·σ_x·σ_y).
 * σ is anchored on the same field angle used by `beamSigma()` so the σ used
 * here matches the σ used in `luxFromFixture()`.
 */
function peakIntensityFromLumens(lumens: number, fieldAngleDeg: number, ratio: number): number {
  const sigmaW = beamSigma(fieldAngleDeg);
  const sigmaH = sigmaW / Math.max(ratio, 0.1);
  const denom = 2 * Math.PI * sigmaW * sigmaH;
  return denom > 0 ? lumens / denom : 0;
}

/**
 * Peak luminous intensity (candela) – prefers photometric data over lumens.
 *
 * When the fixture is zoomed (or frosted) away from the reference field
 * angle at which the photometric measurement was taken, we apply flux
 * conservation. The lumen fallback already bakes σ² scaling into I₀, so
 * no extra zoom compensation is required there.
 */
function peakIntensity(
  lumens: number,
  refAngleDeg: number,
  currentAngleDeg: number,
  ratio: number,
  photometric?: PhotometricData,
): number {
  if (photometric && photometric.lux > 0 && photometric.distance > 0) {
    return candelaFromPhotometric(photometric) * zoomCompensation(refAngleDeg, currentAngleDeg);
  }
  return peakIntensityFromLumens(lumens, currentAngleDeg, ratio);
}

/**
 * Illuminance (lux) from one fixture at a floor point (px, py).
 *
 * Supports:
 *  - Circular beams (Profile, Moving Head, Fresnel with ratio=1)
 *  - Elliptical beams (PAR cans with different lamp types)
 *  - Linear/rectangular beams (Cyc lights, Blinder)
 *
 * The bodyRotation of the fixture rotates the elliptical beam axis.
 */
export function luxFromFixture(
  f: PlacedFixture,
  px: number,
  py: number,
): number {
  const h = f.mountingHeight;
  if (h <= 0) return 0;

  const dimFactor = f.dimming / 100;
  if (dimFactor <= 0) return 0;

  const eff = getEffectiveBeam(f);
  // Anchor the Gaussian on the field angle (10 % isophote) so the heatmap
  // edge coincides with the visible cone drawn in 2D/3D. Frost widens it.
  const nominalFieldAngle = eff.fieldAngle;
  const ratio = eff.beamRatioWH;

  let effectiveFieldAngle = nominalFieldAngle;
  if (f.gelFilterIds && f.gelFilterIds.length > 0) {
    effectiveFieldAngle = effectiveBeamAngleWithFrost(nominalFieldAngle, f.gelFilterIds);
  }

  // Reference field angle at which the photometric measurement was taken.
  // Already converted into the fieldAngle convention by getEffectiveBeam,
  // so it matches `effectiveFieldAngle` and zoomCompensation == 1 at the
  // photometric-measurement zoom (i.e. no zoom override, no frost).
  const refAngle = eff.refFieldAngle;

  // Gel transmission factor
  const gelTransmission = (f.gelFilterIds && f.gelFilterIds.length > 0)
    ? combinedTransmission(f.gelFilterIds)
    : 1;

  // Vector from fixture projection to floor point
  const dx = px - f.x;
  const dy = py - f.y;
  const r2 = dx * dx + dy * dy;
  const dist2 = r2 + h * h;
  const dist = Math.sqrt(dist2);

  // Aim axis unit vector (3D: from fixture at height to aim point on floor)
  const aDx = f.aimX - f.x;
  const aDy = f.aimY - f.y;
  const aimDist = Math.sqrt(aDx * aDx + aDy * aDy + h * h);
  const axU = aDx / aimDist;
  const ayU = aDy / aimDist;
  const azU = -h / aimDist;

  // Point direction unit vector
  const pxU = dx / dist;
  const pyU = dy / dist;
  const pzU = -h / dist;

  const cosTheta = axU * pxU + ayU * pyU + azU * pzU;
  const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));

  // ── Elliptical / anisotropic beams ──
  // For non-circular beams, decompose the off-axis angle into
  // a wide (W) and narrow (H) component relative to the body rotation
  let effectiveTheta = theta;

  if (ratio !== 1 && theta > 1e-6) {
    // Project point direction into a 2D plane perpendicular to aim axis
    // to find the azimuthal angle relative to body rotation

    // Tangent frame: use body rotation to define the "wide" direction
    const bodyRad = f.bodyRotation * DEG2RAD;

    // Aim direction projected onto XY (floor)
    const aimFloorLen = Math.sqrt(aDx * aDx + aDy * aDy);
    let aimFloorAngle = 0;
    if (aimFloorLen > 0.01) {
      aimFloorAngle = Math.atan2(aDy, aDx);
    }

    // The "wide" axis is bodyRotation relative to the aim direction on floor
    const wideAngle = aimFloorAngle + bodyRad;

    // Offset vector from aim point to floor point (on the floor plane)
    const offX = px - f.aimX;
    const offY = py - f.aimY;

    // Project onto wide/narrow axes
    const wideComponent = offX * Math.cos(wideAngle) + offY * Math.sin(wideAngle);
    const narrowComponent = -offX * Math.sin(wideAngle) + offY * Math.cos(wideAngle);

    // Scale narrow by ratio to make it equivalent to wide dimension
    const scaledNarrow = narrowComponent * ratio;
    const effOff = Math.sqrt(wideComponent * wideComponent + scaledNarrow * scaledNarrow);
    const origOff = Math.sqrt(offX * offX + offY * offY);

    if (origOff > 0.01) {
      effectiveTheta = theta * (effOff / origOff);
    }
  }

  const sigma = beamSigma(effectiveFieldAngle);
  const Ipeak =
    peakIntensity(eff.lumens, refAngle, effectiveFieldAngle, ratio, eff.photometric)
    * dimFactor
    * gelTransmission;
  let I = Ipeak * Math.exp(-(effectiveTheta * effectiveTheta) / (2 * sigma * sigma));

  // Flügeltore: clip the beam asymmetrically (crispness depends on gel placement).
  if (f.barnDoors) I *= barnDoorAttenuation(f, pxU, pyU, pzU, effectiveFieldAngle);

  const cosIncidence = h / dist;
  return (I * cosIncidence) / dist2;
}

/**
 * Luminous intensity (candela) from a fixture toward an arbitrary 3D point.
 * Same beam model as luxFromFixture but without the inverse-square / incidence
 * terms — used to light non-floor surfaces (walls) for the bounce calc.
 */
function beamIntensityToward(f: PlacedFixture, px: number, py: number, pz: number): number {
  const dimFactor = f.dimming / 100;
  if (dimFactor <= 0) return 0;
  const eff = getEffectiveBeam(f);
  let fieldAngle = eff.fieldAngle;
  if (f.gelFilterIds && f.gelFilterIds.length > 0) fieldAngle = effectiveBeamAngleWithFrost(eff.fieldAngle, f.gelFilterIds);
  const gelT = (f.gelFilterIds && f.gelFilterIds.length > 0) ? combinedTransmission(f.gelFilterIds) : 1;

  const ex = px - f.x, ny = py - f.y, vz = pz - f.mountingHeight;
  const dist = Math.sqrt(ex * ex + ny * ny + vz * vz) || 1e-6;
  const aEx = f.aimX - f.x, aNy = f.aimY - f.y, aVz = -f.mountingHeight;
  const aimDist = Math.sqrt(aEx * aEx + aNy * aNy + aVz * aVz) || 1e-6;
  const cosT = (ex * aEx + ny * aNy + vz * aVz) / (dist * aimDist);
  const theta = Math.acos(Math.min(1, Math.max(-1, cosT)));
  const sigma = beamSigma(fieldAngle);
  const Ipeak = peakIntensity(eff.lumens, eff.refFieldAngle, fieldAngle, eff.beamRatioWH, eff.photometric) * dimFactor * gelT;
  let I = Ipeak * Math.exp(-(theta * theta) / (2 * sigma * sigma));
  if (f.barnDoors) I *= barnDoorAttenuation(f, ex / dist, ny / dist, vz / dist, fieldAngle);
  return I;
}

/**
 * Direct illuminance (lux) on an oriented surface patch at an arbitrary 3D
 * point — the same beam model (Gaussian + barn doors + gel + inverse-square +
 * cosine of incidence) the floor heat-map uses, but for surfaces that are NOT
 * the floor: a podium top at its real height, a vertical wall, a person's body.
 *
 * This lets the heat-map be draped over the actual 3D geometry with physically
 * correct values — a head closer to the lamp reads brighter than the floor, a
 * wall standing in the beam shows the beam at the height it actually hits, etc.
 *
 * Coordinates are the lighting engine's plan space: (x, y) on the floor plan
 * and z = height above the floor. (nx,ny,nz) is the surface unit normal;
 * `twoSided` lights the patch from either face (walls). Muted lamps are skipped.
 * Bounce/ambient is not included here (that's a floor-only refinement).
 */
export function surfaceLux(
  fixtures: PlacedFixture[],
  x: number, y: number, z: number,
  nx: number, ny: number, nz: number,
  twoSided = false,
): number {
  let E = 0;
  for (const f of fixtures) {
    if (f.hidden) continue;
    const I = beamIntensityToward(f, x, y, z);
    if (I <= 0) continue;
    const rx = x - f.x, ry = y - f.y, rz = z - f.mountingHeight; // fixture → point
    const d2 = rx * rx + ry * ry + rz * rz; const d = Math.sqrt(d2) || 1e-6;
    const dot = (rx / d) * nx + (ry / d) * ny + (rz / d) * nz;
    const cosInc = twoSided ? Math.abs(dot) : Math.max(0, -dot); // light onto the lit face
    if (cosInc <= 0) continue;
    E += (I * cosInc) / d2;
  }
  return E;
}

// A small reflecting surface patch with its pre-computed reflected exitance.
// Normal (nx,ny,nz); walls are double-sided, ceilings face down.
export interface WallSample { x: number; y: number; z: number; nx: number; ny: number; nz: number; m: number; dA: number; twoSided: boolean }

// Incident illuminance on a patch at (sx,sy,sz) with unit normal (nx,ny,nz).
function incidentLux(fixtures: PlacedFixture[], sx: number, sy: number, sz: number, nx: number, ny: number, nz: number, twoSided: boolean): number {
  let E = 0;
  for (const f of fixtures) {
    const I = beamIntensityToward(f, sx, sy, sz);
    if (I <= 0) continue;
    const rx = sx - f.x, ry = sy - f.y, rz = sz - f.mountingHeight; // fixture → patch
    const d2 = rx * rx + ry * ry + rz * rz; const d = Math.sqrt(d2) || 1e-6;
    const dot = ((rx / d) * nx + (ry / d) * ny + (rz / d) * nz);
    const cosInc = twoSided ? Math.abs(dot) : Math.max(0, -dot); // light arriving onto the lit face
    if (cosInc <= 0) continue;
    E += (I * cosInc) / d2;
  }
  return E;
}

/**
 * Pre-compute reflecting patches for walls (sampled along their curve) and
 * ceilings (sampled over their polygon). One bounce, surface → floor.
 */
export function precomputeSurfaceSamples(walls: Wall[], ceilings: Ceiling[], fixtures: PlacedFixture[]): WallSample[] {
  const out: WallSample[] = [];

  for (const w of walls) {
    if (w.reflectance <= 0 || w.height <= 0) continue;
    const pts = sampleWall(w, isCurved(w) ? 16 : 1);
    const zc = w.height / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y;
      const segLen = Math.hypot(bx - ax, by - ay);
      if (segLen < 0.01) continue;
      const sx = (ax + bx) / 2, sy = (ay + by) / 2;
      const nx = -(by - ay) / segLen, ny = (bx - ax) / segLen;
      const dA = segLen * w.height;
      const E = incidentLux(fixtures, sx, sy, zc, nx, ny, 0, true);
      out.push({ x: sx, y: sy, z: zc, nx, ny, nz: 0, m: w.reflectance * E, dA, twoSided: true });
    }
  }

  for (const c of ceilings) {
    if (c.reflectance <= 0 || c.points.length < 3) continue;
    const b = polygonBounds(c.points);
    const w = b.maxX - b.minX, d = b.maxY - b.minY;
    const step = Math.max(0.8, Math.max(w, d) / 12);
    const cellA = step * step;
    for (let yy = b.minY + step / 2; yy < b.maxY; yy += step) {
      for (let xx = b.minX + step / 2; xx < b.maxX; xx += step) {
        if (!pointInPolygon(xx, yy, c.points)) continue;
        const E = incidentLux(fixtures, xx, yy, c.height, 0, 0, -1, false);
        if (E <= 0) continue;
        out.push({ x: xx, y: yy, z: c.height, nx: 0, ny: 0, nz: -1, m: c.reflectance * E, dA: cellA, twoSided: false });
      }
    }
  }

  return out;
}

/** Reflected illuminance at a floor point from pre-computed surface patches. */
export function wallBounceAt(samples: WallSample[], px: number, py: number): number {
  let extra = 0;
  for (const s of samples) {
    if (s.m <= 0) continue;
    const rx = px - s.x, ry = py - s.y, rz = -s.z; // patch → floor point
    const rd2 = rx * rx + ry * ry + rz * rz; const rd = Math.sqrt(rd2) || 1e-6;
    const dot = ((rx / rd) * s.nx + (ry / rd) * s.ny + (rz / rd) * s.nz);
    const cosEmit = s.twoSided ? Math.abs(dot) : Math.max(0, dot);
    const cosRecv = s.z / rd; // floor up-normal · (floor → patch) direction
    if (cosEmit <= 0 || cosRecv <= 0) continue;
    extra += (s.m / Math.PI) * ((cosEmit * cosRecv) / rd2) * s.dA;
  }
  return extra;
}

/**
 * Step-by-step breakdown of the illuminance at a floor point from one fixture,
 * so the user can follow (and hand-check) the calculation. The factors multiply
 * to `lux`:  lux = peakCd · dim · gel · gauss · barnDoor · cos(incidence) / distance²
 * (circular-beam form; the elliptical refinement is omitted here for clarity).
 */
export interface LuxBreakdown {
  source: 'photometric' | 'lumens';
  refLux?: number; refDistance?: number; refBeamAngle?: number;
  basePeakCd: number;      // peak candela of the reference (before zoom comp)
  zoomComp: number;        // zoom/frost flux-conservation factor (photometric path)
  peakCd: number;          // effective peak candela (basePeakCd × zoomComp)
  fieldAngleDeg: number;   // effective field angle used for σ
  dimming: number;         // 0..1
  gel: number;             // gel transmission 0..1
  distance: number;        // m (fixture → point, 3D)
  offAxisDeg: number;      // θ between aim axis and the point
  gauss: number;           // exp(−θ²/2σ²)
  barnDoor: number;        // Flügeltor-Schnitt 0..1 (1 = kein Schnitt)
  cosIncidence: number;    // h / distance
  lux: number;
}

export function explainLux(f: PlacedFixture, px: number, py: number): LuxBreakdown {
  const h = f.mountingHeight;
  const dimFactor = Math.max(0, f.dimming / 100);
  const eff = getEffectiveBeam(f);
  let fieldAngle = eff.fieldAngle;
  if (f.gelFilterIds && f.gelFilterIds.length > 0) fieldAngle = effectiveBeamAngleWithFrost(eff.fieldAngle, f.gelFilterIds);
  const gel = (f.gelFilterIds && f.gelFilterIds.length > 0) ? combinedTransmission(f.gelFilterIds) : 1;

  const dx = px - f.x, dy = py - f.y;
  const dist2 = dx * dx + dy * dy + h * h;
  const dist = Math.sqrt(dist2) || 1e-6;
  const aDx = f.aimX - f.x, aDy = f.aimY - f.y;
  const aimDist = Math.sqrt(aDx * aDx + aDy * aDy + h * h) || 1e-6;
  const cosT = (aDx * dx + aDy * dy + h * h) / (aimDist * dist);
  const theta = Math.acos(Math.min(1, Math.max(-1, cosT)));

  let source: 'photometric' | 'lumens';
  let basePeakCd: number, zoomComp: number, peakCd: number;
  if (eff.photometric && eff.photometric.lux > 0 && eff.photometric.distance > 0) {
    source = 'photometric';
    basePeakCd = candelaFromPhotometric(eff.photometric);
    zoomComp = zoomCompensation(eff.refFieldAngle, fieldAngle);
    peakCd = basePeakCd * zoomComp;
  } else {
    source = 'lumens';
    basePeakCd = peakIntensityFromLumens(eff.lumens, fieldAngle, eff.beamRatioWH);
    zoomComp = 1;
    peakCd = basePeakCd;
  }
  const sigma = beamSigma(fieldAngle);
  const gauss = Math.exp(-(theta * theta) / (2 * sigma * sigma));
  const barnDoor = f.barnDoors ? barnDoorAttenuation(f, dx / dist, dy / dist, -h / dist, fieldAngle) : 1;
  const cosIncidence = h / dist;
  const lux = (peakCd * dimFactor * gel * gauss * barnDoor * cosIncidence) / dist2;

  return {
    source,
    refLux: eff.photometric?.lux, refDistance: eff.photometric?.distance, refBeamAngle: eff.photometric?.beamAngle,
    basePeakCd, zoomComp, peakCd, fieldAngleDeg: fieldAngle,
    dimming: dimFactor, gel, distance: dist, offAxisDeg: (theta * 180) / Math.PI, gauss, barnDoor, cosIncidence, lux,
  };
}

/**
 * Total illuminance at a point from all fixtures (+ optional wall bounce).
 */
export function totalLux(
  fixtures: PlacedFixture[],
  px: number,
  py: number,
  wallSamples: WallSample[] = [],
): number {
  let sum = 0;
  for (const f of fixtures) {
    if (f.hidden) continue; // muted lamp – contributes no light
    sum += luxFromFixture(f, px, py);
  }
  if (wallSamples.length) sum += wallBounceAt(wallSamples, px, py);
  return sum;
}

// ── Sun / daylight on the floor ──────────────────────────────────────────
// The sun is a parallel source. A floor point is lit unless a solid wall stands
// between it and the sun; a window opening lets the light through (attenuated by
// the glass transmittance), which is how daylight reaches the floor through the
// room's windows.
export interface SunInput {
  dir: { x: number; y: number }; // horizontal unit vector toward the sun (plan space)
  altitude: number;              // radians above the horizon (> 0)
  lux: number;                   // horizontal illuminance at an unobstructed point
}

/**
 * Horizontal sun illuminance reaching a floor point, accounting for walls
 * (which cast shadows) and windows (which let daylight through). Returns 0 in
 * full shadow.
 */
export function sunLuxAt(px: number, py: number, sun: SunInput, walls: Wall[]): number {
  if (sun.altitude <= 0 || sun.lux <= 0) return 0;
  const tanA = Math.tan(sun.altitude);
  const dx = sun.dir.x, dy = sun.dir.y;
  let transmission = 1;

  for (const w of walls) {
    if (w.height <= 0) continue;
    const { segs, length } = wallSegments(w);
    const wins = (w.windows && w.windows.length) ? normalizedWindows(w, length) : [];
    for (const seg of segs) {
      // Ray P + s·dir (s ≥ 0) vs. wall segment seg.a→seg.b. Solve for the
      // crossing; skip near-parallel cases.
      const ex = seg.b.x - seg.a.x, ey = seg.b.y - seg.a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const diffx = seg.a.x - px, diffy = seg.a.y - py;
      const s = (diffx * ey - diffy * ex) / denom;       // distance along the ray
      const u = (diffx * dy - diffy * dx) / denom;        // position along the segment 0..1
      if (s <= 1e-4 || u < 0 || u > 1) continue;
      const hCross = s * tanA;                            // ray height where it meets the wall
      if (hCross >= w.height) continue;                   // ray clears the top of the wall
      // Is the crossing inside a window opening (then daylight passes through)?
      const run = seg.r0 + u * (seg.r1 - seg.r0);
      const win = wins.find((wn) => run >= wn.r0 && run <= wn.r1 && hCross >= wn.sill && hCross <= wn.top);
      if (win) { transmission *= win.transmittance; if (transmission <= 0.001) return 0; }
      else return 0;                                      // solid wall → full shadow
    }
  }
  return sun.lux * transmission;
}

/**
 * Compute a 2D lux grid for the given area.
 */
export function computeHeatMap(
  fixtures: PlacedFixture[],
  originX: number,
  originY: number,
  widthM: number,
  heightM: number,
  resX: number,
  resY: number,
  walls: Wall[] = [],
  ceilings: Ceiling[] = [],
  sun: SunInput | null = null,
): { data: Float32Array; maxLux: number } {
  const data = new Float32Array(resX * resY);
  const stepX = widthM / resX;
  const stepY = heightM / resY;
  let maxLux = 0;

  // Muted lamps contribute no light – drop them up front (also from the bounce).
  const lit = fixtures.filter((f) => !f.hidden);

  // Pre-compute the reflecting surface patches once for the whole grid.
  const wallSamples = (walls.length || ceilings.length) ? precomputeSurfaceSamples(walls, ceilings, lit) : [];
  const sunActive = sun && sun.altitude > 0 && sun.lux > 0;

  for (let yi = 0; yi < resY; yi++) {
    const py = originY + (yi + 0.5) * stepY;
    for (let xi = 0; xi < resX; xi++) {
      const px = originX + (xi + 0.5) * stepX;
      let lux = totalLux(lit, px, py, wallSamples);
      if (sunActive) lux += sunLuxAt(px, py, sun!, walls);
      data[yi * resX + xi] = lux;
      if (lux > maxLux) maxLux = lux;
    }
  }

  return { data, maxLux };
}

/**
 * Map a lux value to an RGBA colour (heat-map palette).
 * 0 → transparent, then blue → cyan → green → yellow → red.
 */
export function luxToColor(lux: number, maxScale: number): [number, number, number, number] {
  if (lux <= 0) return [0, 0, 0, 0];
  const t = Math.min(lux / maxScale, 1);

  let r: number, g: number, b: number;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 0; g = Math.round(s * 255); b = 255;
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = 0; g = 255; b = Math.round((1 - s) * 255);
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(s * 255); g = 255; b = 0;
  } else {
    const s = (t - 0.75) / 0.25;
    r = 255; g = Math.round((1 - s) * 255); b = 0;
  }

  const alpha = Math.round(40 + t * 160);
  return [r, g, b, alpha];
}

/**
 * Map lux to RGBA with a target-based three-zone colour scheme.
 *   < 80 % target  → blue shades   (under-lit)
 *   80–120 %       → green shades   (on target)
 *   > 120 %        → orange/red     (over-lit)
 * Zero lux stays transparent.
 */
export function luxToColorTarget(
  lux: number,
  target: number,
): [number, number, number, number] {
  if (lux <= 0 || target <= 0) return [0, 0, 0, 0];
  const ratio = lux / target;

  let r: number, g: number, b: number, alpha: number;

  if (ratio < 0.8) {
    // Under-lit: dark blue → cyan as it approaches 80 %
    const t = Math.min(ratio / 0.8, 1);  // 0 → 1
    r = 0;
    g = Math.round(t * 180);
    b = Math.round(100 + t * 155);       // 100 → 255
    alpha = Math.round(60 + t * 120);
  } else if (ratio <= 1.2) {
    // On target: green zone
    // 0.8 → 1.0 brightens, 1.0 → 1.2 slightly yellows
    const t = (ratio - 0.8) / 0.4;       // 0 → 1 within zone
    r = Math.round(t * 60);              // slight yellow tint at upper end
    g = Math.round(180 + t * 75);        // 180 → 255
    b = Math.round(40 * (1 - t));        // subtle teal fades out
    alpha = Math.round(120 + t * 60);
  } else {
    // Over-lit: yellow → red
    const t = Math.min((ratio - 1.2) / 1.8, 1); // 0 → 1 from 120 % to 300 %
    r = 255;
    g = Math.round(255 * (1 - t));       // yellow → red
    b = 0;
    alpha = Math.round(160 + t * 60);
  }

  return [r, g, b, alpha];
}
