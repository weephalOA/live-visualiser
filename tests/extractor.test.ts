import { describe, expect, it } from 'vitest';
import { AudioFeatureExtractor } from '../src/analysis/extractor';
import { FFT } from '../src/analysis/fft';

const SR = 44100;
const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Renders decaying harmonic tones (a crude piano) at the given onsets. */
function render(
  seconds: number,
  notes: { time: number; midi: number; dur: number }[],
): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (const n of notes) {
    const f = midiToFreq(n.midi);
    const s0 = Math.round(n.time * SR);
    const len = Math.round(n.dur * SR);
    for (let i = 0; i < len && s0 + i < out.length; i++) {
      const t = i / SR;
      const release = Math.min(1, (n.dur - t) / 0.03);
      const env = Math.min(1, t / 0.005) * release * Math.exp(-t * 3);
      let v = 0;
      for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * f * h * t) / (h * h);
      out[s0 + i] += 0.2 * env * v;
    }
  }
  return out;
}

function feed(ex: AudioFeatureExtractor, signal: Float32Array) {
  for (let i = 0; i < signal.length; i += 128) ex.push(signal.subarray(i, i + 128));
}

describe('FFT', () => {
  it('finds a single bin for a pure tone', () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n);
    new FFT(n).forward(re, im);
    expect(Math.hypot(re[5], im[5])).toBeCloseTo(n / 2, 6);
    expect(Math.hypot(re[6], im[6])).toBeLessThan(1e-9);
  });
});

describe('AudioFeatureExtractor', () => {
  it('estimates average pitch of a sustained tone near its fundamental', () => {
    const ex = new AudioFeatureExtractor(SR);
    const notes = Array.from({ length: 10 }, (_, i) => ({ time: i * 0.5, midi: 69, dur: 0.5 }));
    feed(ex, render(5, notes));
    const f = ex.current();
    expect(Math.abs(f.avgPitch - 69)).toBeLessThan(1);
    // Residual overtone energy leaves a small variance; negligible against the 1000 cap.
    expect(f.pitchVar).toBeLessThan(10);
  });

  it('measures pitch spread for a two-octave pattern', () => {
    const ex = new AudioFeatureExtractor(SR);
    const notes = Array.from({ length: 20 }, (_, i) => ({ time: i * 0.25, midi: i % 2 ? 72 : 48, dur: 0.25 }));
    feed(ex, render(5, notes));
    const f = ex.current();
    expect(f.avgPitch).toBeGreaterThan(54);
    expect(f.avgPitch).toBeLessThan(66);
    expect(f.pitchVar).toBeGreaterThan(60);
  });

  it('tracks tempo and density of a steady pulse', () => {
    const ex = new AudioFeatureExtractor(SR);
    const bpm = 120;
    const beat = 60 / bpm;
    const notes = Array.from({ length: 24 }, (_, i) => ({ time: 0.1 + i * beat, midi: 60 + (i % 3) * 4, dur: beat }));
    feed(ex, render(12, notes));
    const f = ex.current();
    expect(Math.abs(f.tempo - bpm)).toBeLessThan(4);
    // Quarter notes in 4/4: four events per bar.
    expect(Math.abs(f.density - 4)).toBeLessThan(0.75);
  });

  it('reports onsets and finds C major from an arpeggiated I-IV-V-I', () => {
    const ex = new AudioFeatureExtractor(SR);
    const chords = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]];
    const notes: { time: number; midi: number; dur: number }[] = [];
    let t = 0.1;
    for (let rep = 0; rep < 3; rep++) {
      for (const ch of chords) {
        for (const m of ch) {
          notes.push({ time: t, midi: m, dur: 0.4 });
          t += 0.25;
        }
      }
    }
    feed(ex, render(t + 0.5, notes));
    const onsets = ex.drainOnsets();
    expect(onsets.length).toBeGreaterThan(notes.length * 0.8);
    expect(onsets.length).toBeLessThanOrEqual(notes.length + 2);
    expect(ex.detectedKey?.tonic).toBe(0);
    expect(ex.detectedKey?.mode).toBe('major');
    expect(ex.current().keyMode).toBe(1);
  });

  it('reports silence and stays finite on an all-zero input', () => {
    const ex = new AudioFeatureExtractor(SR);
    feed(ex, new Float32Array(SR * 3));
    const f = ex.current();
    expect(f.silent).toBe(true);
    expect(f.density).toBe(0);
    for (const v of [f.valence, f.arousal, f.complexity, f.cadence]) expect(Number.isFinite(v)).toBe(true);
  });
});
