// ───────────────────────────────────────────────────────────────────────────
// Sun position & direction for the "global sun" feature (issue #28).
//
// Given a location (lat/lon), a date and a clock time, plus where North points
// on the plan, this resolves the sun into:
//   • altitude / azimuth (the real solar position), and
//   • a direction vector in plan space and in the 3D scene, so the renderer can
//     place a directional "sun" light and the heat-map can cast it through the
//     room's windows.
//
// The solar-position maths is the standard NOAA approximation. Time is taken as
// local clock time; the timezone is approximated from the longitude
// (round(lon / 15)), which is accurate enough for planning where the sun sits
// and how it falls through a window — not for astronomy.
// ───────────────────────────────────────────────────────────────────────────
import type { SunSettings } from '../types';

const DEG = Math.PI / 180;

export interface SolarPosition {
  altitudeDeg: number; // degrees above the horizon (negative = below)
  azimuthDeg: number;  // compass bearing, 0 = North, 90 = East, clockwise
}

// Day of year (1..366) for a YYYY-MM-DD string.
function dayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 0);
  const here = Date.UTC(year, month - 1, day);
  return Math.floor((here - start) / 86400000);
}

/**
 * Solar altitude & azimuth (NOAA approximation). `date` is 'YYYY-MM-DD', `time`
 * is 'HH:MM' interpreted as local clock time at `lon`.
 */
export function solarPosition(latDeg: number, lonDeg: number, date: string, time: string): SolarPosition {
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (!y || !mo || !d || Number.isNaN(hh) || Number.isNaN(mm)) return { altitudeDeg: 0, azimuthDeg: 180 };

  const n = dayOfYear(y, mo, d);
  const tzHours = Math.round(lonDeg / 15); // approximate local timezone from longitude
  const hours = hh + mm / 60;

  // Fractional year (radians).
  const gamma = (2 * Math.PI / 365) * (n - 1 + (hours - 12) / 24);
  // Equation of time (minutes) and solar declination (radians).
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  // True solar time (minutes), then hour angle (degrees).
  const timeOffset = eqTime + 4 * lonDeg - 60 * tzHours;
  const tst = hours * 60 + timeOffset;
  const ha = (tst / 4) - 180; // degrees

  const lat = latDeg * DEG;
  const haR = ha * DEG;
  const cosZenith = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(haR);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const altitude = Math.PI / 2 - zenith;

  // Azimuth measured clockwise from North.
  let azimuth = Math.atan2(
    Math.sin(haR),
    Math.cos(haR) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat),
  ); // this is the bearing from South, CCW
  azimuth = (azimuth / DEG + 180) % 360; // convert to 0=N, CW
  if (azimuth < 0) azimuth += 360;

  return { altitudeDeg: altitude / DEG, azimuthDeg: azimuth };
}

export interface ResolvedSun {
  altitude: number;          // radians above the horizon (> 0 when up)
  azimuthDeg: number;        // compass bearing of the sun
  /** Horizontal unit vector in plan space pointing toward the sun. */
  dir: { x: number; y: number };
  /** Unit vector in 3D scene space pointing from the ground toward the sun. */
  dir3D: { x: number; y: number; z: number };
  /** Horizontal illuminance (lux) at an unobstructed floor point. */
  lux: number;
  /** Light colour, warmer near the horizon. */
  color: string;
  altitudeDeg: number;
}

// Warm the sun toward the horizon (sunrise/sunset) and keep it white high up.
function sunColor(altitudeDeg: number): string {
  const t = Math.max(0, Math.min(1, altitudeDeg / 25)); // 0 at horizon → 1 at 25°+
  const r = 255;
  const g = Math.round(150 + 95 * t);
  const b = Math.round(70 + 175 * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Resolve sun settings into render/heat-map inputs. Returns null when the sun is
 * disabled or below the horizon (nothing to add).
 */
export function resolveSun(s: SunSettings | undefined): ResolvedSun | null {
  if (!s || !s.enabled) return null;
  const pos = solarPosition(s.latitude, s.longitude, s.date, s.time);
  if (pos.altitudeDeg <= 0.5) return null; // below / at the horizon

  const altitude = pos.altitudeDeg * DEG;
  // Screen bearing (clockwise from plan "up" = -Y): rotate the compass bearing
  // by the user's North offset. Plan Y increases downward, so "up" is -Y.
  const beta = (s.northDeg + pos.azimuthDeg) * DEG;
  const dir = { x: Math.sin(beta), y: -Math.cos(beta) };
  const cosA = Math.cos(altitude), sinA = Math.sin(altitude);
  const dir3D = { x: dir.x * cosA, y: sinA, z: dir.y * cosA };

  // Horizontal illuminance ≈ direct-normal intensity × sin(altitude).
  const lux = s.intensity * sinA;

  return {
    altitude,
    azimuthDeg: pos.azimuthDeg,
    dir,
    dir3D,
    lux,
    color: sunColor(pos.altitudeDeg),
    altitudeDeg: pos.altitudeDeg,
  };
}

// A sensible default: Berlin, summer afternoon, North up, bright clear sky.
export function defaultSunSettings(): SunSettings {
  return {
    enabled: false,
    latitude: 52.52,
    longitude: 13.405,
    date: '2026-06-21',
    time: '15:00',
    northDeg: 0,
    intensity: 40000,
  };
}
