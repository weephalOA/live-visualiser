import { describe, expect, it } from 'vitest';
import {
  computeArousal,
  computeCadence,
  computeComplexity,
  computeMotifScore,
  computeValence,
  scoreFeatures,
} from '../src/analysis/features';

describe('valence', () => {
  it('stays in [0, 1] at extremes', () => {
    expect(computeValence(1, 7, 127)).toBe(1);
    expect(computeValence(0, -7, 0)).toBe(0);
  });
  it('is higher for major, sharper and higher-pitched music', () => {
    expect(computeValence(1, 0, 60)).toBeGreaterThan(computeValence(0, 0, 60));
    expect(computeValence(0.5, 3, 60)).toBeGreaterThan(computeValence(0.5, -3, 60));
    expect(computeValence(0.5, 0, 80)).toBeGreaterThan(computeValence(0.5, 0, 50));
  });
  it('matches the dissertation formula', () => {
    // 0.4*1 + 0.3*(7/14) + 0.3*(40/80)
    expect(computeValence(1, 0, 60)).toBeCloseTo(0.7, 10);
  });
});

describe('arousal', () => {
  it('stays in [0, 1] and caps each term', () => {
    expect(computeArousal(0, 0, 0)).toBe(0);
    expect(computeArousal(400, 100, 5000)).toBeCloseTo(1, 10);
  });
  it('orders fast and dense above slow and sparse', () => {
    expect(computeArousal(160, 10, 300)).toBeGreaterThan(computeArousal(60, 2, 50));
  });
  it('caps density at 12, not 16', () => {
    expect(computeArousal(0, 12, 0)).toBeCloseTo(0.35, 10);
    expect(computeArousal(0, 16, 0)).toBeCloseTo(0.35, 10);
  });
});

describe('complexity and cadence', () => {
  it('complexity uses the 16 cap', () => {
    expect(computeComplexity(8, 500)).toBeCloseTo(0.5, 10);
  });
  it('cadence is high for sparse, narrow, winding-down segments', () => {
    const windingDown = computeCadence(20, 1, 40, 5, 2, 0.5);
    const building = computeCadence(800, 14, 100, 900, 4, 14);
    expect(windingDown).toBeGreaterThan(0.7);
    expect(building).toBeLessThan(0.3);
    expect(windingDown).toBeGreaterThan(building);
  });
  it('handles zero features without NaN', () => {
    const f = scoreFeatures({
      avgPitch: 0, pitchVar: 0, density: 0, tempo: 0, key: 0, keyMode: 0, beatsPerBar: 4,
      motifScore: 0, pitchVarFirst: 0, pitchVarSecond: 0, densityFirst: 0, densitySecond: 0,
    });
    for (const v of [f.valence, f.arousal, f.complexity, f.cadence]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('motif score', () => {
  it('is zero with no repetition', () => {
    expect(computeMotifScore([[60, 61, 62, 63, 64]])).toBe(0);
  });
  it('counts repeated trigrams within bars', () => {
    // Bar 1: (0,4,7),(4,7,0); bar 2: (0,4,7). 3 trigrams, one repeat.
    expect(computeMotifScore([[60, 64, 67, 72], [60, 64, 67]])).toBeCloseTo(1 / 3, 10);
  });
  it('does not form trigrams across bar lines', () => {
    expect(computeMotifScore([[60, 64], [67]])).toBe(0);
  });
});
