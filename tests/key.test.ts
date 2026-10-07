import { describe, expect, it } from 'vitest';
import { findKey, keySignatureSharps } from '../src/analysis/key';

const histogramFor = (pcs: number[], weights?: number[]) => {
  const h = new Array(12).fill(0);
  pcs.forEach((pc, i) => (h[pc % 12] += weights?.[i] ?? 1));
  return h;
};

describe('key finder', () => {
  it('finds C major from a C major scale with tonic-triad emphasis', () => {
    const k = findKey(histogramFor([0, 2, 4, 5, 7, 9, 11, 0, 4, 7]));
    expect(k?.tonic).toBe(0);
    expect(k?.mode).toBe('major');
    expect(k?.sharps).toBe(0);
  });
  it('finds A minor from an A harmonic minor scale', () => {
    const k = findKey(histogramFor([9, 11, 0, 2, 4, 5, 8, 9, 0, 4]));
    expect(k?.tonic).toBe(9);
    expect(k?.mode).toBe('minor');
    expect(k?.sharps).toBe(0);
  });
  it('finds D major (2 sharps)', () => {
    const k = findKey(histogramFor([2, 4, 6, 7, 9, 11, 1, 2, 6, 9]));
    expect(k?.tonic).toBe(2);
    expect(k?.sharps).toBe(2);
  });
  it('returns null for an empty histogram', () => {
    expect(findKey(new Array(12).fill(0))).toBeNull();
  });
  it('spells key signatures', () => {
    expect(keySignatureSharps(5, 'major')).toBe(-1);
    expect(keySignatureSharps(4, 'minor')).toBe(1);
    expect(keySignatureSharps(0, 'minor')).toBe(-3);
  });
});
