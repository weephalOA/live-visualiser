// Live replacement for parse_midi (A4): estimates every segment feature from raw audio over a
// sliding 4-bar window. Pure (no Web Audio), so it can be tested in Node with synthetic signals.
//
// Deliberate differences from the MIDI pipeline:
// - Pitch statistics are weighted by sounding time, not counted once per note.
// - Note events are spectral-flux onsets; simultaneous chord notes give one onset, as in A4.
// - Tempo comes from onset autocorrelation and carries forward when unclear (B8.4 sliding mode).
// - Metre cannot be detected reliably, so beatsPerBar is fixed at 4 unless set by the user.
// - `key` is the signature of the detected key; audio has no notated key signature.

import {
  BARS_PER_SEGMENT,
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_TEMPO,
} from './constants';
import { computeMotifScore, scoreFeatures } from './features';
import { Spectrum } from './fft';
import { findKey, keyCorrelation, type KeyResult } from './key';
import type { FeatureFrame, NoteEvent } from './types';

export interface ExtractorOptions {
  hopSize?: number;
  pitchFftSize?: number;
  onsetFftSize?: number;
  /** RMS in dBFS below which a frame counts as silence. */
  silenceDb?: number;
  /** Time constant of the key-finding pitch-class histogram, seconds. */
  keyMemory?: number;
  beatsPerBar?: number;
  minTempo?: number;
  maxTempo?: number;
}

const MIN_FREQ = 55; // A1
const MAX_FREQ = 4200; // ~C8
const MAX_PEAKS = 20;
const HISTORY_SECONDS = 24; // enough for 4 bars of 4/4 at the minimum tempo
const TEMPO_ENVELOPE_SECONDS = 8;

const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);

interface Onset {
  time: number;
  midi: number;
  strength: number;
}

export class AudioFeatureExtractor {
  readonly sampleRate: number;
  readonly hopSize: number;
  readonly frameRate: number;
  beatsPerBar: number;

  private readonly silenceDb: number;
  private readonly keyDecay: number;
  private readonly minTempo: number;
  private readonly maxTempo: number;

  private readonly pitchSpec: Spectrum;
  private readonly onsetSpec: Spectrum;
  private readonly buffer: Float32Array;
  private pending = 0; // samples received since the last hop
  private samplesSeen = 0;

  // Per-hop history (circular).
  private readonly cap: number;
  private head = 0;
  private count = 0;
  private readonly hTime: Float64Array;
  private readonly hW: Float64Array;
  private readonly hWx: Float64Array;
  private readonly hWx2: Float64Array;
  private readonly hSilent: Uint8Array;

  // Onset detection.
  private prevLogMag: Float64Array;
  private readonly flux: Float64Array; // circular, same indexing as history
  private fluxMax = 1e-6;
  private lastOnsetTime = -1;
  private readonly onsets: Onset[] = [];
  private readonly newOnsets: NoteEvent[] = [];
  private frameMidi: Float64Array; // dominant pitch per hop, for tagging onsets

  // Key.
  private readonly chroma = new Float64Array(12);
  private key: KeyResult | null = null;

  // Tempo.
  private tempo = DEFAULT_TEMPO;
  private readonly tempoEstimates: number[] = [];

  private levelDb = -100;
  private lastAvgPitch = 60;
  private cached: FeatureFrame | null = null;

  constructor(sampleRate: number, opts: ExtractorOptions = {}) {
    this.sampleRate = sampleRate;
    this.hopSize = opts.hopSize ?? 512;
    this.frameRate = sampleRate / this.hopSize;
    this.silenceDb = opts.silenceDb ?? -60;
    this.keyDecay = Math.exp(-1 / ((opts.keyMemory ?? 15) * this.frameRate));
    this.beatsPerBar = opts.beatsPerBar ?? DEFAULT_BEATS_PER_BAR;
    this.minTempo = opts.minTempo ?? 50;
    this.maxTempo = opts.maxTempo ?? 200;

    // Long window for pitch (fine frequency resolution), short one for onsets (fine timing).
    const pitchN = opts.pitchFftSize ?? (sampleRate > 32000 ? 8192 : 4096);
    const onsetN = opts.onsetFftSize ?? 1024;
    this.pitchSpec = new Spectrum(pitchN);
    this.onsetSpec = new Spectrum(onsetN);
    this.buffer = new Float32Array(pitchN);
    this.prevLogMag = new Float64Array(onsetN / 2 + 1);

    this.cap = Math.ceil(HISTORY_SECONDS * this.frameRate) + 1;
    this.hTime = new Float64Array(this.cap);
    this.hW = new Float64Array(this.cap);
    this.hWx = new Float64Array(this.cap);
    this.hWx2 = new Float64Array(this.cap);
    this.hSilent = new Uint8Array(this.cap);
    this.flux = new Float64Array(this.cap);
    this.frameMidi = new Float64Array(this.cap);
  }

  /** Current analysis time in seconds (end of the last processed hop). */
  get time(): number {
    return this.samplesSeen / this.sampleRate;
  }

  get detectedKey(): KeyResult | null {
    return this.key;
  }

  /** Feeds mono samples. Any block size is accepted. */
  push(samples: Float32Array): void {
    let offset = 0;
    while (offset < samples.length) {
      const take = Math.min(this.hopSize - this.pending, samples.length - offset);
      const buf = this.buffer;
      buf.copyWithin(0, take);
      buf.set(samples.subarray(offset, offset + take), buf.length - take);
      this.pending += take;
      this.samplesSeen += take;
      offset += take;
      if (this.pending === this.hopSize) {
        this.pending = 0;
        this.processHop();
      }
    }
  }

  /** Onsets detected since the previous call. */
  drainOnsets(): NoteEvent[] {
    return this.newOnsets.splice(0, this.newOnsets.length);
  }

  private idx(back: number): number {
    // Index of the frame `back` hops before the newest one.
    return (this.head - 1 - back + this.cap * 2) % this.cap;
  }

  private processHop(): void {
    const t = this.time;
    const buf = this.buffer;

    // Loudness over the last hop.
    let sum = 0;
    for (let i = buf.length - this.hopSize; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / this.hopSize);
    this.levelDb = 20 * Math.log10(rms + 1e-12);
    const silent = this.levelDb < this.silenceDb;

    // Pitch peaks.
    const peaks = silent ? [] : this.findPitchPeaks();
    let w = 0;
    let wx = 0;
    let wx2 = 0;
    let domMidi = -1;
    let domW = 0;
    const frameChroma = new Float64Array(12);
    for (const p of peaks) {
      w += p.weight;
      wx += p.weight * p.midi;
      wx2 += p.weight * p.midi * p.midi;
      frameChroma[((Math.round(p.midi) % 12) + 12) % 12] += p.weight;
      if (p.weight > domW) {
        domW = p.weight;
        domMidi = p.midi;
      }
    }
    if (w > 0) {
      // Normalise so every sounding frame carries equal weight in the window statistics.
      wx /= w;
      wx2 /= w;
      for (let i = 0; i < 12; i++) frameChroma[i] /= w;
      w = 1;
    }
    for (let i = 0; i < 12; i++) this.chroma[i] = this.chroma[i] * this.keyDecay + frameChroma[i];

    // Spectral flux on log magnitudes for onsets and the tempo envelope.
    const mag = this.onsetSpec.compute(buf);
    let fl = 0;
    for (let i = 1; i < mag.length; i++) {
      const lm = Math.log1p(1000 * mag[i]);
      const d = lm - this.prevLogMag[i];
      if (d > 0) fl += d;
      this.prevLogMag[i] = lm;
    }
    fl /= mag.length;
    if (silent) fl = 0;

    const h = this.head;
    this.hTime[h] = t;
    this.hW[h] = w;
    this.hWx[h] = wx;
    this.hWx2[h] = wx2;
    this.hSilent[h] = silent ? 1 : 0;
    this.flux[h] = fl;
    this.frameMidi[h] = domMidi;
    this.head = (h + 1) % this.cap;
    this.count = Math.min(this.count + 1, this.cap);

    this.detectOnset();

    const hopIndex = Math.round(t * this.frameRate);
    if (hopIndex % 32 === 0) {
      this.updateKey();
      this.updateTempo();
    }
    this.cached = null;
  }

  private findPitchPeaks(): { midi: number; mag: number; weight: number }[] {
    const mag = this.pitchSpec.compute(this.buffer);
    const binHz = this.sampleRate / this.pitchSpec.fft.n;
    const lo = Math.max(2, Math.floor(MIN_FREQ / binHz));
    const hi = Math.min(mag.length - 2, Math.ceil(MAX_FREQ / binHz));
    let max = 0;
    for (let i = lo; i <= hi; i++) if (mag[i] > max) max = mag[i];
    const floor = Math.max(max * 0.05, 1e-4);
    const cands: { freq: number; mag: number }[] = [];
    for (let i = lo; i <= hi; i++) {
      const m = mag[i];
      if (m > floor && m >= mag[i - 1] && m > mag[i + 1]) {
        // Parabolic interpolation on log magnitude for a sub-bin frequency estimate.
        const a = Math.log(mag[i - 1] + 1e-12);
        const b = Math.log(m + 1e-12);
        const c = Math.log(mag[i + 1] + 1e-12);
        const den = a - 2 * b + c;
        const off = den !== 0 ? (0.5 * (a - c)) / den : 0;
        cands.push({ freq: (i + Math.max(-0.5, Math.min(0.5, off))) * binHz, mag: m });
      }
    }
    cands.sort((x, y) => y.mag - x.mag);
    const top = cands.slice(0, MAX_PEAKS).sort((x, y) => x.freq - y.freq);

    // Down-weight peaks that look like harmonics of a stronger-or-similar lower peak,
    // so overtones do not drag the average pitch upwards.
    return top.map((p, j) => {
      let weight = p.mag;
      for (let i = 0; i < j; i++) {
        const q = top[i];
        if (q.mag < 0.2 * p.mag) continue;
        const ratio = p.freq / q.freq;
        const k = Math.round(ratio);
        if (k >= 2 && k <= 6 && Math.abs(1200 * Math.log2(ratio / k)) < 40) {
          weight *= 0.05;
          break;
        }
      }
      return { midi: freqToMidi(p.freq), mag: p.mag, weight };
    });
  }

  private detectOnset(): void {
    // Peak-pick the flux with a two-hop look-ahead.
    const look = 2;
    if (this.count < 16) return;
    const c = this.idx(look);
    const v = this.flux[c];
    this.fluxMax = Math.max(v, this.fluxMax * 0.9995);
    for (let k = 0; k <= 2 * look; k++) {
      if (k !== look && this.flux[this.idx(k)] > v) return;
    }
    const meanWindow = Math.min(this.count - 1, Math.round(0.3 * this.frameRate));
    let mean = 0;
    for (let k = 0; k < meanWindow; k++) mean += this.flux[this.idx(k)];
    mean /= meanWindow;
    if (v <= mean * 1.4 + 0.06 * this.fluxMax) return;
    const time = this.hTime[c];
    if (time - this.lastOnsetTime < 0.06) return;
    this.lastOnsetTime = time;
    // Tag with the dominant pitch shortly after the attack.
    let midi = -1;
    for (let k = 0; k <= look && midi < 0; k++) midi = this.frameMidi[this.idx(look - k)];
    const onset = { time, midi: midi < 0 ? this.lastAvgPitch : midi, strength: Math.min(1, v / this.fluxMax) };
    this.onsets.push(onset);
    while (this.onsets.length && this.onsets[0].time < time - HISTORY_SECONDS) this.onsets.shift();
    this.newOnsets.push({ time, midi: onset.midi, velocity: onset.strength });
  }

  private updateKey(): void {
    const found = findKey(this.chroma);
    if (!found) return;
    if (!this.key) {
      this.key = found;
      return;
    }
    // Hysteresis: only change key when the new one is clearly better.
    const current = keyCorrelation(this.chroma, this.key.tonic, this.key.mode);
    this.key = found.correlation > current + 0.05 ? found : { ...this.key, correlation: current };
  }

  private updateTempo(): void {
    const n = Math.min(this.count, Math.round(TEMPO_ENVELOPE_SECONDS * this.frameRate));
    if (n < this.frameRate * 3) return;
    const env = new Float64Array(n);
    let mean = 0;
    for (let k = 0; k < n; k++) {
      env[n - 1 - k] = this.flux[this.idx(k)];
      mean += env[n - 1 - k];
    }
    mean /= n;
    let energy = 0;
    for (let i = 0; i < n; i++) {
      env[i] -= mean;
      energy += env[i] * env[i];
    }
    if (energy <= 1e-12) return;

    const minLag = Math.floor((60 / this.maxTempo) * this.frameRate);
    const maxLag = Math.min(n - 1, Math.ceil((60 / this.minTempo) * this.frameRate));
    const ac = new Float64Array(maxLag + 2);
    for (let lag = minLag - 1; lag <= maxLag + 1 && lag < n; lag++) {
      let s = 0;
      for (let i = lag; i < n; i++) s += env[i] * env[i - lag];
      ac[lag] = s / (n - lag);
    }
    let best = -1;
    let bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (!(ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1])) continue;
      const bpm = (60 * this.frameRate) / lag;
      // Log-Gaussian prior around 120 BPM reduces octave errors.
      const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
      const score = ac[lag] * prior;
      if (score > bestScore) {
        bestScore = score;
        best = lag;
      }
    }
    if (best < 0 || ac[best] / (energy / n) < 0.1) return; // no clear pulse: carry tempo forward
    const a = ac[best - 1];
    const b = ac[best];
    const c = ac[best + 1];
    const den = a - 2 * b + c;
    const lag = best + (den !== 0 ? (0.5 * (a - c)) / den : 0);
    this.tempoEstimates.push((60 * this.frameRate) / lag);
    if (this.tempoEstimates.length > 5) this.tempoEstimates.shift();
    const sorted = [...this.tempoEstimates].sort((x, y) => x - y);
    this.tempo = sorted[Math.floor(sorted.length / 2)];
  }

  /** Features over the most recent 4-bar window. */
  current(): FeatureFrame {
    if (this.cached) return this.cached;
    const now = this.time;
    const barSec = (this.beatsPerBar * 60) / this.tempo;
    const winSec = Math.min(BARS_PER_SEGMENT * barSec, HISTORY_SECONDS);
    const start = now - winSec;
    const mid = now - winSec / 2;

    const all = { w: 0, wx: 0, wx2: 0 };
    const first = { w: 0, wx: 0, wx2: 0 };
    const second = { w: 0, wx: 0, wx2: 0 };
    let oldest = now;
    let recentSilent = true;
    for (let k = 0; k < this.count; k++) {
      const i = this.idx(k);
      const ft = this.hTime[i];
      if (ft <= start) break;
      oldest = ft;
      const half = ft > mid ? second : first;
      for (const acc of [all, half]) {
        acc.w += this.hW[i];
        acc.wx += this.hWx[i];
        acc.wx2 += this.hWx2[i];
      }
      if (now - ft < 1.5 && !this.hSilent[i]) recentSilent = false;
    }
    const stats = (a: { w: number; wx: number; wx2: number }, fallback: number) => {
      if (a.w <= 0) return { mean: fallback, variance: 0 };
      const mean = a.wx / a.w;
      return { mean, variance: Math.max(0, a.wx2 / a.w - mean * mean) };
    };
    const whole = stats(all, this.lastAvgPitch);
    this.lastAvgPitch = whole.mean;

    // Covered duration matters while the history is still filling up.
    const covered = Math.max(now - oldest, 1 / this.frameRate);
    const halfCovered = (span: number) => Math.max(span, 1e-3) / barSec;
    const inWindow = this.onsets.filter((o) => o.time > start);
    const firstCount = inWindow.filter((o) => o.time <= mid).length;
    const secondCount = inWindow.length - firstCount;
    const coveredFirst = Math.max(0, Math.min(mid, now) - Math.max(oldest, start));
    const coveredSecond = Math.min(covered, winSec / 2);

    // Motif: pitch classes of onsets grouped into bars.
    const bars: number[][] = Array.from({ length: BARS_PER_SEGMENT }, () => []);
    for (const o of inWindow) {
      const b = Math.min(BARS_PER_SEGMENT - 1, Math.floor((o.time - start) / barSec));
      bars[b].push(Math.round(o.midi));
    }

    const key = this.key;
    const keyMode = !key || key.correlation < 0.2 ? 0.5 : key.mode === 'major' ? 1 : 0;

    const features = scoreFeatures({
      avgPitch: whole.mean,
      pitchVar: whole.variance,
      density: inWindow.length / (covered / barSec),
      tempo: this.tempo,
      key: key ? key.sharps : 0,
      keyMode,
      beatsPerBar: this.beatsPerBar,
      motifScore: computeMotifScore(bars),
      pitchVarFirst: stats(first, whole.mean).variance,
      pitchVarSecond: stats(second, whole.mean).variance,
      densityFirst: coveredFirst > 0 ? firstCount / halfCovered(coveredFirst) : 0,
      densitySecond: secondCount / halfCovered(coveredSecond),
    });

    this.cached = {
      ...features,
      time: now,
      level: Math.min(1, Math.max(0, (this.levelDb + 60) / 50)),
      silent: recentSilent,
      tonic: key ? key.tonic : -1,
    };
    return this.cached;
  }
}
