// Port of colour_harmony.py (A7).
import { COOL_CLAMP_MAX, COOL_CLAMP_MIN, COOL_CLAMP_VALENCE } from '../analysis/constants';

export type HarmonyScheme = 'analogous' | 'split_complementary' | 'triadic' | 'complementary';

export const HARMONY_OFFSETS: Record<HarmonyScheme, number[]> = {
  analogous: [0, 0.08, -0.08],
  split_complementary: [0, 0.42, -0.42],
  triadic: [0, 0.333, 0.667],
  complementary: [0, 0.5],
};

export function computeTension(valence: number, varNorm: number, arousal: number): number {
  return 0.35 * (1 - valence) + 0.35 * varNorm + 0.3 * arousal;
}

export function chooseScheme(tension: number): HarmonyScheme {
  if (tension < 0.3) return 'analogous';
  if (tension < 0.5) return 'split_complementary';
  if (tension < 0.7) return 'triadic';
  return 'complementary';
}

export const wrapHue = (h: number) => ((h % 1) + 1) % 1;

/** Sad music stays cool: every palette hue is clamped into [0.45, 0.75] when valence < 0.3. */
export function applyCoolClamp(hue: number, valence: number): number {
  if (valence >= COOL_CLAMP_VALENCE) return hue;
  return Math.min(COOL_CLAMP_MAX, Math.max(COOL_CLAMP_MIN, wrapHue(hue)));
}

/**
 * Unlike the Python GA render path, valence is a required argument so the cool clamp
 * is always applied (A12 lesson 3).
 */
export function buildPalette(hue: number, scheme: HarmonyScheme, valence: number): number[] {
  return HARMONY_OFFSETS[scheme].map((o) => applyCoolClamp(wrapHue(hue + o), valence));
}

/** Golden-ratio scatter so shapes do not share identical hues. */
export function shapeHue(palette: number[], i: number, varNorm: number): number {
  const spread = 0.15 * varNorm;
  return wrapHue(palette[i % palette.length] + spread * (((i * 0.618033988) % 1) - 0.5));
}
