import { describe, expect, it } from 'vitest';
import {
  applyCoolClamp,
  buildPalette,
  chooseScheme,
  computeTension,
  shapeHue,
} from '../src/mapping/harmony';

describe('colour harmony', () => {
  it('chooses schemes by tension thresholds', () => {
    expect(chooseScheme(0.1)).toBe('analogous');
    expect(chooseScheme(0.3)).toBe('split_complementary');
    expect(chooseScheme(0.5)).toBe('triadic');
    expect(chooseScheme(0.7)).toBe('complementary');
  });
  it('computes tension from the dissertation weights', () => {
    expect(computeTension(1, 0, 0)).toBe(0);
    expect(computeTension(0, 1, 1)).toBeCloseTo(1);
  });
  it('builds palettes from the scheme offsets', () => {
    const p = buildPalette(0.1, 'analogous', 0.8);
    expect(p[0]).toBeCloseTo(0.1);
    expect(p[1]).toBeCloseTo(0.18);
    expect(p[2]).toBeCloseTo(0.02);
    expect(buildPalette(0.9, 'complementary', 0.8)[1]).toBeCloseTo(0.4);
  });
  it('applies the cool clamp below valence 0.3', () => {
    const sad = buildPalette(0.05, 'triadic', 0.1);
    for (const h of sad) {
      expect(h).toBeGreaterThanOrEqual(0.45);
      expect(h).toBeLessThanOrEqual(0.75);
    }
    expect(applyCoolClamp(0.05, 0.5)).toBe(0.05);
  });
  it('scatters shape hues within the spread', () => {
    const palette = [0.5];
    for (let i = 0; i < 12; i++) {
      expect(Math.abs(shapeHue(palette, i, 1) - 0.5)).toBeLessThanOrEqual(0.075 + 1e-9);
    }
    expect(shapeHue(palette, 3, 0)).toBeCloseTo(0.5);
  });
});
