// Port of the map_* functions and SHAPE_SHARPNESS from rendering.py (A6).
import { COOL_HUE, MIDI_PITCH_RANGE, WARM_HUE } from '../analysis/constants';

export type ShapeKind = 'circle' | 'ellipse' | 'square' | 'triangle' | 'pentagon';

export const SHAPE_SHARPNESS: Record<ShapeKind, number> = {
  circle: 0.1,
  ellipse: 0.15,
  square: 0.5,
  triangle: 0.8,
  pentagon: 0.9,
};

export const SHAPE_KINDS = Object.keys(SHAPE_SHARPNESS) as ShapeKind[];

export function mapValenceToWarmth(valence: number): number {
  return COOL_HUE + (WARM_HUE - COOL_HUE) * valence;
}

export function mapPitchToHue(avgPitch: number, valence: number): number {
  const baseHue = (((avgPitch % MIDI_PITCH_RANGE) + MIDI_PITCH_RANGE) % MIDI_PITCH_RANGE) / MIDI_PITCH_RANGE;
  const emotionHue = mapValenceToWarmth(valence);
  const pitchWeight = 0.2 + 0.2 * Math.min(valence / 0.3, 1);
  return (((pitchWeight * baseHue + (1 - pitchWeight) * emotionHue) % 1) + 1) % 1;
}

/** Valence damping keeps energetic sad music dark. */
export function mapArousalToBrightness(arousal: number, valence: number): number {
  return (0.5 + 0.5 * arousal) * (0.6 + 0.4 * valence);
}

export function mapValenceToSaturation(valence: number): number {
  return 0.2 + 0.75 * valence;
}

/** Shape kinds ranked by closeness of sharpness to arousal; shape i uses ranked[i % 5]. */
export function rankShapesForArousal(arousal: number): ShapeKind[] {
  return [...SHAPE_KINDS].sort(
    (a, b) => Math.abs(SHAPE_SHARPNESS[a] - arousal) - Math.abs(SHAPE_SHARPNESS[b] - arousal),
  );
}

export function pickShapeForArousal(arousal: number, i: number): ShapeKind {
  return rankShapesForArousal(arousal)[i % SHAPE_KINDS.length];
}

/** h, s, v in [0, 1] -> [r, g, b] in [0, 1]. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = (((h % 1) + 1) % 1) * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

export function hsvCss(h: number, s: number, v: number, a = 1): string {
  const [r, g, b] = hsvToRgb(h, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, v)));
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}
