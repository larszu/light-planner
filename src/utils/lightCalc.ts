import type { PlacedFixture, Attachment, PhotometricData } from '../types';
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
 */
function getEffectiveBeam(f: PlacedFixture): {
  beamAngle: number;
  beamShape: typeof f.fixture.beamShape;
  beamRatioWH: number;
  lumens: number;
  photometric: PhotometricData | undefined;
} {
  const att = getActiveAttachment(f);
  const fix = f.fixture;
  const beamAngle = f.currentBeamAngle
    ?? att?.beamAngleOverride
    ?? fix.beamAngle;
  const beamShape = att?.beamShapeOverride ?? fix.beamShape;
  const photometric = att?.photometricOverride ?? fix.photometric;
  return {
    beamAngle,
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
 * Peak luminous intensity (candela) for a fixture using lumens.
 * Fallback when no photometric measurement is available.
 */
function peakIntensityFromLumens(lumens: number, beamAngleDeg: number, ratio: number): number {
  const halfW = (beamAngleDeg / 2) * DEG2RAD;
  const halfH = halfW / Math.max(ratio, 0.1);
  const geoMean = Math.sqrt(halfW * halfH);
  const solidAngle = 2 * Math.PI * (1 - Math.cos(geoMean));
  return solidAngle > 0 ? lumens / solidAngle : 0;
}

/**
 * Peak luminous intensity (candela) – prefers photometric data over lumens.
 */
function peakIntensity(
  lumens: number,
  beamAngleDeg: number,
  ratio: number,
  photometric?: PhotometricData,
): number {
  if (photometric && photometric.lux > 0 && photometric.distance > 0) {
    return candelaFromPhotometric(photometric);
  }
  return peakIntensityFromLumens(lumens, beamAngleDeg, ratio);
}

/**
 * Gaussian sigma (radians) from beam angle (50% power).
 */
function beamSigma(beamAngleDeg: number): number {
  const halfAngle = (beamAngleDeg / 2) * DEG2RAD;
  return halfAngle / Math.sqrt(2 * Math.LN2);
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
  let beamAngle = eff.beamAngle;
  const ratio = eff.beamRatioWH;

  // Apply frost/diffusion gel widening
  if (f.gelFilterIds && f.gelFilterIds.length > 0) {
    beamAngle = effectiveBeamAngleWithFrost(beamAngle, f.gelFilterIds);
  }

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

  const sigma = beamSigma(beamAngle);
  const Ipeak = peakIntensity(eff.lumens, beamAngle, ratio, eff.photometric) * dimFactor * gelTransmission;
  const I = Ipeak * Math.exp(-(effectiveTheta * effectiveTheta) / (2 * sigma * sigma));

  const cosIncidence = h / dist;
  return (I * cosIncidence) / dist2;
}

/**
 * Total illuminance at a point from all fixtures.
 */
export function totalLux(
  fixtures: PlacedFixture[],
  px: number,
  py: number,
): number {
  let sum = 0;
  for (const f of fixtures) {
    sum += luxFromFixture(f, px, py);
  }
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
): { data: Float32Array; maxLux: number } {
  const data = new Float32Array(resX * resY);
  const stepX = widthM / resX;
  const stepY = heightM / resY;
  let maxLux = 0;

  for (let yi = 0; yi < resY; yi++) {
    const py = originY + (yi + 0.5) * stepY;
    for (let xi = 0; xi < resX; xi++) {
      const px = originX + (xi + 0.5) * stepX;
      const lux = totalLux(fixtures, px, py);
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
