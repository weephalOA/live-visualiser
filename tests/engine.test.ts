import { describe, expect, it } from 'vitest';
import { applyDrift, Drift, GENE_BOUNDS, NO_DRIFT } from '../src/engine/drift';
import { easeHue, ParamSmoother } from '../src/engine/smoothing';
import { toVisualParams } from '../src/mapping/params';
import { scoreFeatures } from '../src/analysis/features';

const params = (valence: number) => {
  const p = toVisualParams(
    scoreFeatures({
      avgPitch: 60, pitchVar: 100, density: 4, tempo: 100, key: 0, keyMode: 1, beatsPerBar: 4,
      motifScore: 0, pitchVarFirst: 100, pitchVarSecond: 100, densityFirst: 4, densitySecond: 4,
    }),
  );
  return { ...p, valence };
};

describe('smoothing', () => {
  it('eases hue by the shortest arc across zero', () => {
    const h = easeHue(0.95, 0.05, 0.5);
    expect(h === 0 || h > 0.99 || h < 0.01).toBe(true);
  });
  it('converges toward the target', () => {
    const s = new ParamSmoother();
    const a = params(0.2);
    const b = { ...params(0.8), arousal: 1 };
    s.update(a, 0.016, 1);
    let out = s.update(b, 0.016, 1);
    expect(out.arousal).toBeLessThan(0.5);
    for (let i = 0; i < 600; i++) out = s.update(b, 0.016, 1);
    expect(out.arousal).toBeCloseTo(1, 3);
  });
});

describe('drift', () => {
  it('stays inside the gene bounds', () => {
    const d = new Drift(7);
    for (let t = 0; t < 200; t += 0.7) {
      const s = d.sample(t, 1, 1, 0.3);
      for (const [k, v] of Object.entries(s)) {
        const [lo, hi] = GENE_BOUNDS[k as keyof typeof GENE_BOUNDS];
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
      }
    }
  });
  it('is narrower at low valence', () => {
    const d = new Drift(7);
    let lowMax = 0;
    let highMax = 0;
    for (let t = 0; t < 300; t += 0.5) {
      lowMax = Math.max(lowMax, Math.abs(d.sample(t, 0, 1, 0.3).hueShift));
      highMax = Math.max(highMax, Math.abs(d.sample(t, 1, 1, 0.3).hueShift));
    }
    expect(lowMax).toBeLessThan(highMax);
  });
  it('is deterministic for a given seed', () => {
    expect(new Drift(3).sample(12.5, 0.6, 1)).toEqual(new Drift(3).sample(12.5, 0.6, 1));
  });
  it('keeps the cool clamp active after drift', () => {
    const p = { ...params(0.1), palette: [0.5, 0.6, 0.7], hue: 0.5 };
    const out = applyDrift(p, { ...NO_DRIFT, hueShift: 0.4 });
    for (const h of [out.hue, ...out.palette]) {
      expect(h).toBeGreaterThanOrEqual(0.45);
      expect(h).toBeLessThanOrEqual(0.75);
    }
  });
});
