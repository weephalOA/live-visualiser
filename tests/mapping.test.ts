import { describe, expect, it } from 'vitest';
import {
  mapArousalToBrightness,
  mapPitchToHue,
  mapValenceToSaturation,
  mapValenceToWarmth,
  pickShapeForArousal,
  rankShapesForArousal,
} from '../src/mapping/colour';
import { toVisualParams } from '../src/mapping/params';
import { scoreFeatures } from '../src/analysis/features';

describe('colour mapping', () => {
  it('is blue when sad and orange when happy', () => {
    expect(mapValenceToWarmth(0)).toBeCloseTo(0.6);
    expect(mapValenceToWarmth(1)).toBeCloseTo(0.08);
  });
  it('keeps hue in [0, 1)', () => {
    for (const p of [0, 21, 60, 108, 127, 200]) {
      for (const v of [0, 0.5, 1]) {
        const h = mapPitchToHue(p, v);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
      }
    }
  });
  it('matches the dissertation hue formula', () => {
    const v = 0.5;
    const expected = (0.4 * (60 / 128) + 0.6 * (0.6 - 0.52 * v)) % 1;
    expect(mapPitchToHue(60, v)).toBeCloseTo(expected, 10);
  });
  it('keeps energetic sad music darker than energetic happy music', () => {
    expect(mapArousalToBrightness(1, 0)).toBeCloseTo(0.6);
    expect(mapArousalToBrightness(1, 1)).toBeCloseTo(1);
    expect(mapArousalToBrightness(0, 0)).toBeCloseTo(0.3);
  });
  it('saturation rises with valence', () => {
    expect(mapValenceToSaturation(0)).toBeCloseTo(0.2);
    expect(mapValenceToSaturation(1)).toBeCloseTo(0.95);
  });
  it('leads with round shapes when calm and sharp shapes when energetic', () => {
    expect(rankShapesForArousal(0)[0]).toBe('circle');
    expect(rankShapesForArousal(0.1)[1]).toBe('ellipse');
    expect(rankShapesForArousal(0.95)[0]).toBe('pentagon');
    expect(new Set(Array.from({ length: 5 }, (_, i) => pickShapeForArousal(0.5, i))).size).toBe(5);
  });
});

describe('visual params', () => {
  it('maps a feature set to sensible params', () => {
    const p = toVisualParams(
      scoreFeatures({
        avgPitch: 64, pitchVar: 200, density: 6, tempo: 120, key: 0, keyMode: 1, beatsPerBar: 4,
        motifScore: 0.5, pitchVarFirst: 200, pitchVarSecond: 200, densityFirst: 6, densitySecond: 3,
      }),
    );
    expect(p.shapeCount).toBeGreaterThanOrEqual(3);
    expect(p.shapeCount).toBeLessThanOrEqual(12);
    expect(p.dynamicsRatio).toBeCloseTo(0.5, 3);
    expect(p.palette.length).toBeGreaterThanOrEqual(2);
  });
});
