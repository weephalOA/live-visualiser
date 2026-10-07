import { MAX_DENSITY, MAX_PITCH_VAR } from '../analysis/constants';
import type { SegmentFeatures } from '../analysis/types';
import {
  mapArousalToBrightness,
  mapPitchToHue,
  mapValenceToSaturation,
} from './colour';
import { buildPalette, chooseScheme, computeTension, type HarmonyScheme } from './harmony';

export interface VisualParams {
  hue: number;
  saturation: number;
  brightness: number;
  palette: number[];
  harmony: HarmonyScheme;
  valence: number;
  arousal: number;
  complexity: number;
  cadence: number;
  densityNorm: number;
  varNorm: number;
  motifScore: number;
  shapeCount: number;
  dynamicsRatio: number;
}

export function toVisualParams(f: SegmentFeatures): VisualParams {
  const varNorm = Math.min(f.pitchVar / MAX_PITCH_VAR, 1);
  const densityNorm = Math.min(f.density / MAX_DENSITY, 1);
  const hue = mapPitchToHue(f.avgPitch, f.valence);
  const harmony = chooseScheme(computeTension(f.valence, varNorm, f.arousal));
  return {
    hue,
    saturation: mapValenceToSaturation(f.valence),
    brightness: mapArousalToBrightness(f.arousal, f.valence),
    palette: buildPalette(hue, harmony, f.valence),
    harmony,
    valence: f.valence,
    arousal: f.arousal,
    complexity: f.complexity,
    cadence: f.cadence,
    densityNorm,
    varNorm,
    motifScore: f.motifScore,
    shapeCount: Math.floor(3 + 9 * f.complexity),
    dynamicsRatio: f.densitySecond / (f.densityFirst + 1e-5),
  };
}
