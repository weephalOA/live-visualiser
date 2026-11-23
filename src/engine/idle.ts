import { scoreFeatures } from '../analysis/features';
import type { FeatureFrame, NoteEvent } from '../analysis/types';
import type { FeatureSource } from './loop';
import { Simplex2 } from './noise';

/**
 * A gentle synthetic source that wanders slowly around the valence-arousal plane, so the chosen
 * theme can be previewed behind the start screen before any audio is connected.
 */
export class IdleSource implements FeatureSource {
  private readonly start = performance.now();
  private readonly noise = new Simplex2(77);
  private lastPulse = 0;

  time(): number {
    return (performance.now() - this.start) / 1000;
  }

  current(): FeatureFrame {
    const t = this.time();
    const n = (i: number) => 0.5 + 0.5 * this.noise.noise(t * 0.02, i * 11.7);
    const pv = 60 + 400 * n(4);
    const dens = 2 + 8 * n(3);
    return {
      ...scoreFeatures({
        avgPitch: 50 + 25 * n(1),
        pitchVar: pv,
        density: dens,
        tempo: 70 + 70 * n(2),
        key: Math.round(-3 + 6 * n(5)),
        keyMode: n(6) > 0.45 ? 1 : 0,
        beatsPerBar: 4,
        motifScore: n(7) * 0.6,
        pitchVarFirst: pv,
        pitchVarSecond: pv * (0.6 + 0.8 * n(8)),
        densityFirst: dens,
        densitySecond: dens * (0.6 + 0.8 * n(9)),
      }),
      time: t,
      level: 0.4,
      silent: false,
      tonic: -1,
    };
  }

  drainOnsets(): NoteEvent[] {
    const t = this.time();
    if (t - this.lastPulse < 1.2) return [];
    this.lastPulse = t;
    return [{ time: t, midi: 48 + Math.round(24 * (0.5 + 0.5 * this.noise.noise(t, 3))), velocity: 0.35 }];
  }
}
