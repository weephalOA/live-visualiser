// Real-time replacement for the GA's variation (B5): slow noise drift on the quantities the
// genes controlled, kept inside a small fraction of the gene bounds (C2).
import { clamp } from '../analysis/features';
import { applyCoolClamp, wrapHue } from '../mapping/harmony';
import type { VisualParams } from '../mapping/params';
import { Simplex2 } from './noise';

/** Full GA search ranges from genome.py, used only as limits. */
export const GENE_BOUNDS = {
  hueShift: [-0.5, 0.5],
  saturationScale: [0.3, 2.5],
  brightnessScale: [0.5, 1.5],
  shapePositionJitter: [0, 0.35],
  shapeSizeScale: [0.5, 2.0],
  shapeHueDelta: [-0.4, 0.4],
  harmonyShift: [-0.2, 0.2],
  paletteSpread: [-0.5, 0.5],
  vignetteScale: [0.6, 1.4],
  figureOffsetX: [-0.25, 0.25],
  figureOffsetY: [-0.25, 0.25],
  shapeAlphaScale: [0.5, 1.5],
  shapeDx: [-0.15, 0.15],
  shapeDy: [-0.15, 0.15],
  shapeSizeMult: [0.5, 2.0],
} as const;

export type GeneName = keyof typeof GENE_BOUNDS;
export type DriftState = Record<Exclude<GeneName, 'shapeDx' | 'shapeDy' | 'shapeSizeMult'>, number>;

const NEUTRAL: Record<GeneName, number> = {
  hueShift: 0, saturationScale: 1, brightnessScale: 1, shapePositionJitter: 0, shapeSizeScale: 1,
  shapeHueDelta: 0, harmonyShift: 0, paletteSpread: 0, vignetteScale: 1, figureOffsetX: 0,
  figureOffsetY: 0, shapeAlphaScale: 1, shapeDx: 0, shapeDy: 0, shapeSizeMult: 1,
};

/** Fraction of each gene's range the drift may use at full amount and full valence. */
const RANGE_FRACTION = 0.15;

export const NO_DRIFT: DriftState = Object.fromEntries(
  Object.entries(NEUTRAL).filter(([k]) => !k.startsWith('shapeD') && k !== 'shapeSizeMult'),
) as DriftState;

/** Drift amplitude narrows at low valence so sad, calm music stays cool, muted and dark (A12). */
export const valenceDriftScale = (valence: number) => 0.25 + 0.75 * clamp(valence, 0, 1);

export class Drift {
  private readonly noise: Simplex2;
  private readonly names = Object.keys(NEUTRAL) as GeneName[];

  constructor(seed = 20251) {
    this.noise = new Simplex2(seed);
  }

  private gene(name: GeneName, n: number, scale: number): number {
    const [lo, hi] = GENE_BOUNDS[name];
    const neutral = NEUTRAL[name];
    // Asymmetric ranges (jitter starts at 0) drift one way only.
    const halfRange = Math.min(hi - neutral, neutral - lo) || (hi - lo) / 2;
    const v = neutral === lo ? neutral + Math.abs(n) * (hi - lo) * scale : neutral + n * halfRange * scale;
    return clamp(v, lo, hi);
  }

  /** @param amount theme-specific drift amount, 0-1. @param speed noise cycles per second. */
  sample(t: number, valence: number, amount: number, speed = 0.05): DriftState {
    const scale = RANGE_FRACTION * amount * valenceDriftScale(valence);
    const out = { ...NO_DRIFT };
    this.names.forEach((name, i) => {
      if (name === 'shapeDx' || name === 'shapeDy' || name === 'shapeSizeMult') return;
      out[name as keyof DriftState] = this.gene(name, this.noise.noise(t * speed, i * 7.31), scale);
    });
    return out;
  }

  /** Per-shape offsets for shape `i`. */
  shape(i: number, t: number, valence: number, amount: number, speed = 0.08) {
    const scale = RANGE_FRACTION * amount * valenceDriftScale(valence);
    const y = 100 + i * 3.17;
    return {
      dx: this.gene('shapeDx', this.noise.noise(t * speed, y), scale),
      dy: this.gene('shapeDy', this.noise.noise(t * speed, y + 1.1), scale),
      sizeMult: this.gene('shapeSizeMult', this.noise.noise(t * speed, y + 2.3), scale),
    };
  }
}

/**
 * Applies global drift to colours. The cool clamp is re-applied afterwards so drift can never
 * push sad music warm (A12 lesson 3).
 */
export function applyDrift(p: VisualParams, d: DriftState): VisualParams {
  const shift = d.hueShift + d.harmonyShift;
  const base = p.palette[0] ?? p.hue;
  const palette = p.palette.map((h, i) => {
    const offset = ((((h - base) % 1) + 1.5) % 1) - 0.5;
    const spread = i === 0 ? 0 : offset * d.paletteSpread;
    return applyCoolClamp(wrapHue(h + shift + spread), p.valence);
  });
  return {
    ...p,
    hue: applyCoolClamp(wrapHue(p.hue + shift), p.valence),
    palette,
    saturation: clamp(p.saturation * d.saturationScale, 0, 1),
    brightness: clamp(p.brightness * d.brightnessScale, 0, 1),
  };
}
