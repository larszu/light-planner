import type { PlacedFixture, Attachment, PhotometricData, Wall } from '../types';
import { combinedTransmission, effectiveBeamAngleWithFrost } from '../data/gelLibrary';

const DEG2RAD = Math.PI / 180;

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
  const I = Ipeak * Math.exp(-(effectiveTheta * effectiveTheta) / (2 * sigma * sigma));

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
  return Ipeak * Math.exp(-(theta * theta) / (2 * sigma * sigma));
}

// A small reflecting patch on a wall, with its pre-computed reflected exitance.
export interface WallSample { x: number; y: number; z: number; nx: number; ny: number; m: number; dA: number }

/**
 * Pre-compute reflecting patches for all walls: how much light each wall patch
 * receives (from all fixtures) × its reflectance. One bounce, wall → floor.
 */
export function precomputeWallSamples(walls: Wall[], fixtures: PlacedFixture[]): WallSample[] {
  const out: WallSample[] = [];
  for (const w of walls) {
    if (w.reflectance <= 0 || w.height <= 0) continue;
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    const L = Math.hypot(dx, dy);
    if (L < 0.1) continue;
    const K = Math.max(2, Math.min(14, Math.ceil(L / 1.5)));
    const nx = -dy / L, ny = dx / L;   // wall normal (double-sided via abs below)
    const zc = w.height / 2;
    const dA = (L / K) * w.height;
    for (let k = 0; k < K; k++) {
      const t = (k + 0.5) / K;
      const sx = w.x1 + dx * t, sy = w.y1 + dy * t;
      let E = 0;
      for (const f of fixtures) {
        const I = beamIntensityToward(f, sx, sy, zc);
        if (I <= 0) continue;
        const rx = sx - f.x, ry = sy - f.y, rz = zc - f.mountingHeight;
        const d2 = rx * rx + ry * ry + rz * rz; const d = Math.sqrt(d2) || 1e-6;
        const cosInc = Math.abs((rx / d) * nx + (ry / d) * ny); // double-sided
        E += (I * cosInc) / d2;
      }
      out.push({ x: sx, y: sy, z: zc, nx, ny, m: w.reflectance * E, dA });
    }
  }
  return out;
}

/** Reflected illuminance at a floor point from pre-computed wall patches. */
export function wallBounceAt(samples: WallSample[], px: number, py: number): number {
  let extra = 0;
  for (const s of samples) {
    if (s.m <= 0) continue;
    const rx = px - s.x, ry = py - s.y, rz = -s.z;
    const rd2 = rx * rx + ry * ry + rz * rz; const rd = Math.sqrt(rd2) || 1e-6;
    const cosEmit = Math.abs((rx / rd) * s.nx + (ry / rd) * s.ny); // double-sided
    const cosRecv = s.z / rd; // floor normal (up) · direction to patch
    if (cosEmit <= 0 || cosRecv <= 0) continue;
    extra += (s.m / Math.PI) * ((cosEmit * cosRecv) / rd2) * s.dA;
  }
  return extra;
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
    sum += luxFromFixture(f, px, py);
  }
  if (wallSamples.length) sum += wallBounceAt(wallSamples, px, py);
  return sum;
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
): { data: Float32Array; maxLux: number } {
  const data = new Float32Array(resX * resY);
  const stepX = widthM / resX;
  const stepY = heightM / resY;
  let maxLux = 0;

  // Pre-compute the wall reflecting patches once for the whole grid.
  const wallSamples = walls.length ? precomputeWallSamples(walls, fixtures) : [];

  for (let yi = 0; yi < resY; yi++) {
    const py = originY + (yi + 0.5) * stepY;
    for (let xi = 0; xi < resX; xi++) {
      const px = originX + (xi + 0.5) * stepX;
      const lux = totalLux(fixtures, px, py, wallSamples);
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
