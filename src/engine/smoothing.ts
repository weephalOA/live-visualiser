// Real-time replacement for the GA's temporal-coherence term (B5): ease every parameter
// toward its target each frame.
import { wrapHue } from '../mapping/harmony';
import type { VisualParams } from '../mapping/params';

export const easeFactor = (dt: number, tau: number) => (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau));

export const easeScalar = (current: number, target: number, k: number) => current + (target - current) * k;

/** Hue is eased around the colour wheel by the shortest arc, never linearly through 0-1. */
export function easeHue(current: number, target: number, k: number): number {
  const d = ((((target - current) % 1) + 1.5) % 1) - 0.5;
  return wrapHue(current + d * k);
}

const SCALAR_KEYS = [
  'saturation', 'brightness', 'valence', 'arousal', 'complexity', 'cadence',
  'densityNorm', 'varNorm', 'motifScore', 'shapeCount', 'dynamicsRatio',
] as const;

/**
 * Note: the eased `shapeCount` is fractional so themes can cross-fade shapes in and out.
 */
export class ParamSmoother {
  private state: VisualParams | null = null;

  reset(): void {
    this.state = null;
  }

  update(target: VisualParams, dt: number, tau: number): VisualParams {
    if (!this.state) {
      this.state = { ...target, palette: [...target.palette] };
      return this.state;
    }
    const s = this.state;
    const k = easeFactor(dt, tau);
    for (const key of SCALAR_KEYS) s[key] = easeScalar(s[key], target[key], k);
    s.hue = easeHue(s.hue, target.hue, k);
    // Palette length changes with the harmony scheme; new entries start at their target.
    const next = target.palette.map((h, i) => (i < s.palette.length ? easeHue(s.palette[i], h, k) : h));
    s.palette = next;
    s.harmony = target.harmony;
    return s;
  }
}
