import type { PlacedFixture } from '../types';
import { effectiveColorTemp } from '../core/gelLibrary';

/**
 * Convert a color temperature (Kelvin) to an [R, G, B] triplet (0–255).
 * Based on Tanner Helland's algorithm (widely used in lighting/photo tools).
 */
export function cctToRgb(kelvin: number): [number, number, number] {
  const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number, g: number, b: number;

  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }

  // Green
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }
  g = Math.max(0, Math.min(255, g));

  // Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    b = Math.max(0, Math.min(255, b));
  }

  return [Math.round(r), Math.round(g), Math.round(b)];
}

/**
 * Get the effective CCT for a placed fixture, considering:
 *  - currentColorTemp override (tunable white)
 *  - fixture base colorTemp
 *  - gel filter mired shifts
 * Returns 0 for full RGBW fixtures without a set temperature.
 */
export function getFixtureCCT(f: PlacedFixture): number {
  const base = f.currentColorTemp
    ?? (f.fixture.colorTempRange ? f.fixture.colorTempRange[0] : f.fixture.colorTemp);
  if (base <= 0) return 5600; // default daylight for RGBW without explicit CCT
  if (f.gelFilterIds && f.gelFilterIds.length > 0) {
    return effectiveColorTemp(base, f.gelFilterIds);
  }
  return base;
}

/**
 * Get CSS rgba string for a fixture's beam cone.
 * Uses the fixture's effective CCT to tint the cone color.
 */
export function getBeamColorRgba(f: PlacedFixture, alpha: number): string {
  const cct = getFixtureCCT(f);
  const [r, g, b] = cctToRgb(cct);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Get a THREE.js compatible hex color number for a fixture's beam.
 */
export function getBeamColorHex(f: PlacedFixture): number {
  const cct = getFixtureCCT(f);
  const [r, g, b] = cctToRgb(cct);
  return (r << 16) | (g << 8) | b;
}
