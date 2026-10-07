// Key finder replacing music21's score.analyze('key') (B8.1).
// music21 maps 'key' to its Aarden-Essen analyser, so those profile weights are used here.

export const MAJOR_PROFILE = [
  17.7661, 0.145624, 14.9265, 0.160186, 19.8049, 11.3587, 0.291248, 22.062, 0.145624, 8.15494,
  0.232998, 4.95122,
];
export const MINOR_PROFILE = [
  18.2648, 0.737619, 14.0499, 16.8599, 0.702494, 14.4362, 0.702494, 18.6161, 4.56621, 1.93186,
  7.37619, 1.75623,
];

// Sharps in the major key on each tonic pitch class. F#/Gb is spelled as 6 sharps.
const MAJOR_SHARPS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

export interface KeyResult {
  tonic: number; // pitch class 0-11
  mode: 'major' | 'minor';
  correlation: number;
  sharps: number; // key signature, -7 to +7
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

export function keySignatureSharps(tonic: number, mode: 'major' | 'minor'): number {
  const relativeMajor = mode === 'major' ? tonic : (tonic + 3) % 12;
  return MAJOR_SHARPS[relativeMajor];
}

/** Correlates a 12-bin pitch-class histogram against the 24 rotated profiles. */
export function findKey(histogram: ArrayLike<number>): KeyResult | null {
  const h = Array.from(histogram);
  if (h.reduce((s, x) => s + x, 0) <= 0) return null;
  let best: KeyResult | null = null;
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = h.map((_, i) => h[(i + tonic) % 12]);
    for (const mode of ['major', 'minor'] as const) {
      const r = pearson(rotated, mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE);
      if (!best || r > best.correlation) {
        best = { tonic, mode, correlation: r, sharps: keySignatureSharps(tonic, mode) };
      }
    }
  }
  return best;
}

export function keyCorrelation(
  histogram: ArrayLike<number>,
  tonic: number,
  mode: 'major' | 'minor',
): number {
  const h = Array.from(histogram);
  const rotated = h.map((_, i) => h[(i + tonic) % 12]);
  return pearson(rotated, mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE);
}
