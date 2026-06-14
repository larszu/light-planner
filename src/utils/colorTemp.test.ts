import { describe, it, expect } from 'vitest';
import { cctToRgb } from './colorTemp';

describe('cctToRgb', () => {
  it('returns near-white at the algorithm anchor (~6600K)', () => {
    expect(cctToRgb(6600)).toEqual([255, 255, 255]);
  });

  it('is warm (full red, no blue) at low colour temperatures', () => {
    const [r, g, b] = cctToRgb(1000);
    expect(r).toBe(255);
    expect(b).toBe(0);
    expect(g).toBeGreaterThan(40);
    expect(g).toBeLessThan(90);
  });

  it('is cool (full blue, reduced red) at high colour temperatures', () => {
    const [r, , b] = cctToRgb(40000);
    expect(b).toBe(255);
    expect(r).toBeLessThan(255);
  });

  it('clamps inputs below 1000K to the 1000K result', () => {
    expect(cctToRgb(500)).toEqual(cctToRgb(1000));
  });

  it('clamps inputs above 40000K to the 40000K result', () => {
    expect(cctToRgb(50000)).toEqual(cctToRgb(40000));
  });

  it('always returns three integer channels within 0..255', () => {
    for (let k = 1000; k <= 40000; k += 2500) {
      const rgb = cctToRgb(k);
      expect(rgb).toHaveLength(3);
      for (const c of rgb) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
  });
});
