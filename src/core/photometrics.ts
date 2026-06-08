// Photometric quality report — the numbers a lighting designer signs off on,
// not just the visual heat-map: minimum / average / maximum illuminance and the
// uniformity ratios used by DIN EN 12464 / CIBSE.
//
//   U0 = Emin / Eavg   "Gesamtgleichmäßigkeit" (general uniformity)   target ≥ 0.6
//   U2 = Emin / Emax   "Diversität" (min-to-max)                      target ≥ 0.4
//
// Reuses the same engine as the on-screen heat-map so the figures match what is
// drawn (incl. wall/ceiling bounce).
import type { PlacedFixture, Wall, Ceiling } from '../types';
import { computeHeatMap } from './lightCalc';

export interface EvalArea { minX: number; minY: number; maxX: number; maxY: number }

export interface PhotometricReport {
  min: number;        // lx
  avg: number;        // lx
  max: number;        // lx
  u0: number;         // Emin / Eavg
  u2: number;         // Emin / Emax
  areaM2: number;     // illuminated area evaluated
  coverage: number;   // 0..1 fraction of the grid that is lit
  rating: 'gut' | 'akzeptabel' | 'ungleichmäßig';
}

const RES = 48; // evaluation grid per axis

// Stats over an area. If `area` is given (a defined task area, e.g. the stage),
// every cell in it counts — dark corners legitimately lower the uniformity.
// Otherwise the lit footprint (cells above a small floor) is evaluated.
export function photometricReport(
  fixtures: PlacedFixture[],
  walls: Wall[] = [],
  ceilings: Ceiling[] = [],
  area: EvalArea | null = null,
): PhotometricReport | null {
  const lit = fixtures.filter((f) => !f.hidden);
  if (lit.length === 0) return null;

  let a = area;
  if (!a) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of lit) { minX = Math.min(minX, f.aimX); maxX = Math.max(maxX, f.aimX); minY = Math.min(minY, f.aimY); maxY = Math.max(maxY, f.aimY); }
    if (!isFinite(minX)) return null;
    a = { minX: minX - 1, minY: minY - 1, maxX: maxX + 1, maxY: maxY + 1 };
  }
  const w = Math.max(0.5, a.maxX - a.minX), h = Math.max(0.5, a.maxY - a.minY);
  const { data, maxLux } = computeHeatMap(lit, a.minX, a.minY, w, h, RES, RES, walls, ceilings);
  if (maxLux <= 0) return null;

  // A floor of 2 % of peak (and ≥ 1 lx) defines "the illuminated zone" so a few
  // black cells just outside the beam edge don't collapse U0 to ~0.
  const floor = Math.max(1, maxLux * 0.02);
  let sum = 0, count = 0, min = Infinity;
  for (const v of data) { if (v >= floor) { sum += v; count++; if (v < min) min = v; } }
  if (count === 0) return null;

  const avg = sum / count;
  const u0 = min / avg, u2 = min / maxLux;
  const cellArea = (w / RES) * (h / RES);
  const rating = u0 >= 0.6 ? 'gut' : u0 >= 0.4 ? 'akzeptabel' : 'ungleichmäßig';
  return {
    min, avg, max: maxLux, u0, u2,
    areaM2: count * cellArea,
    coverage: count / (RES * RES),
    rating,
  };
}
