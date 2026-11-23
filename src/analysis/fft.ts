/** In-place iterative radix-2 complex FFT. Size must be a power of two. */
export class FFT {
  readonly n: number;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint32Array;

  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${n}`);
    this.n = n;
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  forward(re: Float64Array, im: Float64Array): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step];
          const wi = this.sin[k * step];
          const a = start + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }
}

export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Windowed magnitude spectrum (bins 0..n/2), normalised so a full-scale sine peaks near 1. */
export class Spectrum {
  readonly fft: FFT;
  readonly window: Float64Array;
  readonly mag: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly scale: number;

  constructor(n: number) {
    this.fft = new FFT(n);
    this.window = hann(n);
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.mag = new Float64Array(n / 2 + 1);
    this.scale = 2 / this.window.reduce((s, x) => s + x, 0);
  }

  /** Analyses the last n samples of `src` ending at `end`. */
  compute(src: Float32Array, end = src.length): Float64Array {
    const n = this.fft.n;
    const start = end - n;
    for (let i = 0; i < n; i++) {
      this.re[i] = src[start + i] * this.window[i];
      this.im[i] = 0;
    }
    this.fft.forward(this.re, this.im);
    for (let i = 0; i <= n / 2; i++) {
      this.mag[i] = Math.hypot(this.re[i], this.im[i]) * this.scale;
    }
    return this.mag;
  }
}
