// Direct port of the emotion model in music_analysis.py (A5). Keep these pure and untouched by themes.
import {
  AROUSAL_DENSITY_CAP,
  KEY_SIGNATURE_MAX,
  MAX_DENSITY,
  MAX_PITCH_VAR,
  MAX_TEMPO,
} from './constants';
import type { RawFeatures, SegmentFeatures } from './types';

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x: number) => clamp(x, 0, 1);

export function computeValence(keyMode: number, key: number, avgPitch: number): number {
  const keyComponent = (key + KEY_SIGNATURE_MAX) / (2 * KEY_SIGNATURE_MAX);
  const pitchComponent = (avgPitch - 20) / 80;
  return clamp01(0.4 * keyMode + 0.3 * keyComponent + 0.3 * pitchComponent);
}

export function computeArousal(tempo: number, density: number, pitchVar: number): number {
  return (
    0.4 * Math.min(tempo / MAX_TEMPO, 1) +
    0.35 * Math.min(density / AROUSAL_DENSITY_CAP, 1) +
    0.25 * Math.min(pitchVar / MAX_PITCH_VAR, 1)
  );
}

export function computeComplexity(density: number, pitchVar: number): number {
  return 0.5 * Math.min(density / MAX_DENSITY, 1) + 0.5 * Math.min(pitchVar / MAX_PITCH_VAR, 1);
}

export function computeCadence(
  pitchVar: number,
  density: number,
  pitchVarFirst: number,
  pitchVarSecond: number,
  densityFirst: number,
  densitySecond: number,
): number {
  const varNorm = Math.min(pitchVar / MAX_PITCH_VAR, 1);
  const densNorm = Math.min(density / MAX_DENSITY, 1);
  const varRatio = Math.min(pitchVarSecond / (pitchVarFirst + 1e-5), 2) / 2;
  const densRatio = Math.min(densitySecond / (densityFirst + 1e-5), 2) / 2;
  return 0.5 * (1 - 0.5 * (varNorm + densNorm)) + 0.5 * (1 - 0.5 * (varRatio + densRatio));
}

/** Trigram repetition over pitch classes, n-grams formed within each bar (A4). */
export function computeMotifScore(bars: number[][], n = 3): number {
  const counts = new Map<string, number>();
  let total = 0;
  for (const bar of bars) {
    const pcs = bar.map((p) => ((p % 12) + 12) % 12);
    for (let i = 0; i + n <= pcs.length; i++) {
      const key = pcs.slice(i, i + n).join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  if (total === 0) return 0;
  let repeats = 0;
  for (const c of counts.values()) if (c > 1) repeats += c - 1;
  return repeats / total;
}

export function scoreFeatures(raw: RawFeatures): SegmentFeatures {
  return {
    ...raw,
    valence: computeValence(raw.keyMode, raw.key, raw.avgPitch),
    arousal: computeArousal(raw.tempo, raw.density, raw.pitchVar),
    complexity: computeComplexity(raw.density, raw.pitchVar),
    cadence: computeCadence(
      raw.pitchVar,
      raw.density,
      raw.pitchVarFirst,
      raw.pitchVarSecond,
      raw.densityFirst,
      raw.densitySecond,
    ),
  };
}
