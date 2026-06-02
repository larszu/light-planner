import type { GelFilter } from '../types';

// ═══════════════════════════════════════════════════════════
// LEE & ROSCO Gel Filters – CTO, CTB, Frost, Diffusion
// Transmission and mired shift from manufacturer datasheets
// ═══════════════════════════════════════════════════════════

export const gelLibrary: GelFilter[] = [
  // ── LEE CTO (Color Temperature Orange – warm shift) ──
  { id: 'lee-204', name: 'Full CTO', brand: 'LEE', code: '204', type: 'CTO', transmissionFactor: 0.50, miredShift: 159 },
  { id: 'lee-205', name: 'Half CTO', brand: 'LEE', code: '205', type: 'CTO', transmissionFactor: 0.67, miredShift: 78 },
  { id: 'lee-206', name: 'Quarter CTO', brand: 'LEE', code: '206', type: 'CTO', transmissionFactor: 0.82, miredShift: 42 },
  { id: 'lee-207', name: 'Eighth CTO', brand: 'LEE', code: '207', type: 'CTO', transmissionFactor: 0.91, miredShift: 20 },

  // ── LEE CTB (Color Temperature Blue – cool shift) ──
  { id: 'lee-201', name: 'Full CTB', brand: 'LEE', code: '201', type: 'CTB', transmissionFactor: 0.34, miredShift: -131 },
  { id: 'lee-202', name: 'Half CTB', brand: 'LEE', code: '202', type: 'CTB', transmissionFactor: 0.54, miredShift: -68 },
  { id: 'lee-203', name: 'Quarter CTB', brand: 'LEE', code: '203', type: 'CTB', transmissionFactor: 0.71, miredShift: -35 },
  { id: 'lee-218', name: 'Eighth CTB', brand: 'LEE', code: '218', type: 'CTB', transmissionFactor: 0.83, miredShift: -18 },

  // ── LEE Frost / Diffusion ──
  { id: 'lee-129', name: 'Heavy Frost', brand: 'LEE', code: '129', type: 'frost', transmissionFactor: 0.71, diffusionLevel: 0.9 },
  { id: 'lee-216', name: 'White Diffusion', brand: 'LEE', code: '216', type: 'frost', transmissionFactor: 0.79, diffusionLevel: 0.7 },
  { id: 'lee-250', name: 'Half White Diffusion', brand: 'LEE', code: '250', type: 'frost', transmissionFactor: 0.88, diffusionLevel: 0.5 },
  { id: 'lee-251', name: 'Quarter White Diff.', brand: 'LEE', code: '251', type: 'frost', transmissionFactor: 0.93, diffusionLevel: 0.3 },
  { id: 'lee-252', name: 'Eighth White Diff.', brand: 'LEE', code: '252', type: 'frost', transmissionFactor: 0.96, diffusionLevel: 0.15 },
  { id: 'lee-228', name: 'Brushed Silk', brand: 'LEE', code: '228', type: 'frost', transmissionFactor: 0.73, diffusionLevel: 0.6 },

  // ── Rosco CTO ──
  { id: 'rosco-3407', name: 'Full CTO', brand: 'Rosco', code: '3407', type: 'CTO', transmissionFactor: 0.47, miredShift: 167 },
  { id: 'rosco-3408', name: 'Half CTO', brand: 'Rosco', code: '3408', type: 'CTO', transmissionFactor: 0.65, miredShift: 81 },
  { id: 'rosco-3409', name: 'Quarter CTO', brand: 'Rosco', code: '3409', type: 'CTO', transmissionFactor: 0.81, miredShift: 42 },
  { id: 'rosco-3410', name: 'Eighth CTO', brand: 'Rosco', code: '3410', type: 'CTO', transmissionFactor: 0.90, miredShift: 21 },

  // ── Rosco CTB ──
  { id: 'rosco-3202', name: 'Full CTB', brand: 'Rosco', code: '3202', type: 'CTB', transmissionFactor: 0.30, miredShift: -131 },
  { id: 'rosco-3204', name: 'Half CTB', brand: 'Rosco', code: '3204', type: 'CTB', transmissionFactor: 0.52, miredShift: -68 },
  { id: 'rosco-3206', name: 'Quarter CTB', brand: 'Rosco', code: '3206', type: 'CTB', transmissionFactor: 0.72, miredShift: -35 },
  { id: 'rosco-3208', name: 'Eighth CTB', brand: 'Rosco', code: '3208', type: 'CTB', transmissionFactor: 0.84, miredShift: -18 },

  // ── Rosco Frost / Diffusion ──
  { id: 'rosco-111', name: 'Tough Rolux', brand: 'Rosco', code: '111', type: 'frost', transmissionFactor: 0.82, diffusionLevel: 0.4 },
  { id: 'rosco-119', name: 'Light Hamburg Frost', brand: 'Rosco', code: '119', type: 'frost', transmissionFactor: 0.86, diffusionLevel: 0.3 },
  { id: 'rosco-132', name: 'Quarter Hamburg Frost', brand: 'Rosco', code: '132', type: 'frost', transmissionFactor: 0.92, diffusionLevel: 0.2 },
  { id: 'rosco-3026', name: 'Tough White Diffusion', brand: 'Rosco', code: '3026', type: 'frost', transmissionFactor: 0.75, diffusionLevel: 0.75 },
];

export function getGelById(id: string): GelFilter | undefined {
  return gelLibrary.find((g) => g.id === id);
}

export function getGelsByType(type: GelFilter['type']): GelFilter[] {
  return gelLibrary.filter((g) => g.type === type);
}

/**
 * Compute combined transmission factor for multiple stacked gels.
 * Multiplicative: T_total = T1 × T2 × … × Tn
 */
export function combinedTransmission(gelIds: string[]): number {
  let t = 1;
  for (const id of gelIds) {
    const gel = getGelById(id);
    if (gel) t *= gel.transmissionFactor;
  }
  return t;
}

/**
 * Compute effective color temperature after applying gels (via mired shift).
 * Mired = 1,000,000 / Kelvin. CTO adds positive mired (warmer), CTB negative (cooler).
 */
export function effectiveColorTemp(baseKelvin: number, gelIds: string[]): number {
  if (baseKelvin <= 0) return 0;
  let mired = 1_000_000 / baseKelvin;
  for (const id of gelIds) {
    const gel = getGelById(id);
    if (gel?.miredShift) mired += gel.miredShift;
  }
  if (mired <= 0) return 20000; // clamp
  return Math.round(1_000_000 / mired);
}

/**
 * Dominant frost/diffusion strength (0..1) among the mounted gels. Used to
 * judge how strongly a diffusion *hung in front of the barn doors* softens
 * (and ultimately defeats) the barn-door cut – the illuminated frost becomes
 * the new, larger light source. Returns 0 when no diffusion is mounted.
 */
export function frostLevel(gelIds: string[]): number {
  let lvl = 0;
  for (const id of gelIds) {
    const gel = getGelById(id);
    if (gel?.diffusionLevel) lvl = Math.max(lvl, gel.diffusionLevel);
  }
  return lvl;
}

/**
 * Compute effective beam angle widening from frost/diffusion gels.
 * Each diffusion gel widens the beam proportional to its diffusion level.
 */
export function effectiveBeamAngleWithFrost(baseAngle: number, gelIds: string[]): number {
  let angle = baseAngle;
  for (const id of gelIds) {
    const gel = getGelById(id);
    if (gel?.diffusionLevel) {
      // Frost widens the beam: heavy frost can roughly double the beam angle
      angle += baseAngle * gel.diffusionLevel * 0.8;
    }
  }
  return Math.min(angle, 180);
}
