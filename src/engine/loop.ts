import type { FeatureFrame, NoteEvent } from '../analysis/types';
import { toVisualParams } from '../mapping/params';
import type { RenderFrame, Theme } from '../themes/types';
import { applyDrift, Drift } from './drift';
import { ParamSmoother } from './smoothing';

/** Anything that can supply live features. Lets other inputs (e.g. MIDI) plug in later (B12). */
export interface FeatureSource {
  /** Audio clock in seconds. Visuals follow this, never frame timestamps (B8.6). */
  time(): number;
  current(): FeatureFrame;
  drainOnsets(): NoteEvent[];
}

export interface EngineOptions {
  /** Upper bound on device pixel ratio, for performance. */
  maxPixelRatio?: number;
  onFrame?: (frame: RenderFrame) => void;
}

export class Engine {
  private theme: Theme | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private source: FeatureSource | null = null;
  private readonly smoother = new ParamSmoother();
  private readonly drift = new Drift();
  private raf = 0;
  private lastT = -1;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly host: HTMLElement, private readonly opts: EngineOptions = {}) {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
  }

  setSource(source: FeatureSource | null): void {
    this.source = source;
    this.smoother.reset();
    this.lastT = -1;
  }

  setTheme(theme: Theme): void {
    this.theme?.dispose();
    this.canvas?.remove();
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    this.host.appendChild(canvas);
    this.canvas = canvas;
    this.theme = theme;
    theme.init(canvas);
    this.resize();
  }

  get currentTheme(): Theme | null {
    return this.theme;
  }

  start(): void {
    if (this.raf) return;
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.frame();
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private resize(): void {
    if (!this.canvas || !this.theme) return;
    const cap = Math.min(this.theme.maxPixelRatio ?? 2, this.opts.maxPixelRatio ?? 2);
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    const w = Math.max(1, Math.round(this.host.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.host.clientHeight * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this.theme.resize(w, h);
  }

  private frame(): void {
    if (!this.theme || !this.source) return;
    const t = this.source.time();
    const dt = this.lastT < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const features = this.source.current();
    const preset = this.theme.preset;
    const eased = this.smoother.update(toVisualParams(features), dt, preset.tau);
    const drift = this.drift.sample(t, eased.valence, preset.drift, preset.driftSpeed);
    const frame: RenderFrame = {
      params: applyDrift(eased, drift),
      notes: this.source.drainOnsets(),
      t,
      dt,
      drift,
      level: features.level,
      silent: features.silent,
      features,
    };
    this.theme.render(frame);
    this.opts.onFrame?.(frame);
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.theme?.dispose();
    this.canvas?.remove();
  }
}
