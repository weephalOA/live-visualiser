// Ambient: slow drifting soft blobs with long easing and almost no hard edges (B6).
// Arousal barely changes speed; valence shifts colour temperature through the shared palette.
import { hsvCss } from '../mapping/colour';
import { applyCoolClamp, shapeHue, wrapHue } from '../mapping/harmony';
import { Drift } from '../engine/drift';
import { Simplex2 } from '../engine/noise';
import { easeFactor } from '../engine/smoothing';
import type { RenderFrame, Theme } from './types';

const MAX_BLOBS = 7;
const MAX_BLOOMS = 24;
const BLOOM_LIFE = 4.5;

interface Bloom {
  x: number;
  y: number;
  age: number;
  strength: number;
  hue: number;
}

export class AmbientTheme implements Theme {
  readonly id = 'ambient';
  readonly name = 'Ambient';
  readonly context = '2d' as const;
  readonly maxPixelRatio = 1; // everything is soft, so full resolution buys nothing
  readonly preset = { tau: 3, drift: 0.7, driftSpeed: 0.03 };

  private ctx: CanvasRenderingContext2D | null = null;
  private width = 1;
  private height = 1;
  private readonly noise = new Simplex2(9031);
  private readonly shapeDrift = new Drift(4242);
  private readonly blobAlpha = new Array(MAX_BLOBS).fill(0);
  private blooms: Bloom[] = [];
  private lastBloom = -1;
  private flow = 0;
  private fade = 0;
  private time = 0;

  init(canvas: HTMLCanvasElement): void {
    this.ctx = canvas.getContext('2d', { alpha: false });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  render({ params: p, notes, dt, drift, level, silent }: RenderFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width: w, height: h } = this;
    const minSide = Math.min(w, h);
    this.time += dt;
    this.flow += (0.012 + 0.012 * p.arousal) * dt; // arousal barely moves speed
    this.fade += ((silent ? 0.4 : 1) - this.fade) * easeFactor(dt, 2);
    const cool = (hue: number) => applyCoolClamp(wrapHue(hue), p.valence);
    const bright = p.brightness * this.fade * (0.92 + 0.08 * level);

    // Background: vertical wash in the base hue.
    ctx.globalCompositeOperation = 'source-over';
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, hsvCss(cool(p.hue), p.saturation * 0.55, bright * 0.32));
    bg.addColorStop(1, hsvCss(cool(p.hue + 0.04), p.saturation * 0.6, bright * 0.14));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Blobs: count follows complexity, fading in and out rather than popping.
    ctx.globalCompositeOperation = 'screen';
    const target = 3 + Math.round(4 * p.complexity);
    const k = easeFactor(dt, 4);
    for (let i = 0; i < MAX_BLOBS; i++) {
      this.blobAlpha[i] += ((i < target ? 1 : 0) - this.blobAlpha[i]) * k;
      const a = this.blobAlpha[i];
      if (a < 0.01) continue;
      const sd = this.shapeDrift.shape(i, this.time, p.valence, this.preset.drift);
      const x = (0.5 + 0.4 * this.noise.noise(this.flow, i * 3.1) + drift.figureOffsetX + sd.dx) * w;
      const y = (0.5 + 0.4 * this.noise.noise(this.flow, i * 3.1 + 50) + drift.figureOffsetY + sd.dy) * h;
      const r = minSide * (0.3 + 0.14 * this.noise.noise(this.flow * 0.7, i + 9)) * drift.shapeSizeScale * sd.sizeMult;
      const hue = cool(shapeHue(p.palette, i, p.varNorm) + drift.shapeHueDelta);
      const v = Math.min(1, bright * 0.9);
      const alpha = a * 0.5 * Math.min(1.5, drift.shapeAlphaScale);
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
      g.addColorStop(0, hsvCss(hue, p.saturation * 0.85, v, alpha));
      g.addColorStop(0.45, hsvCss(hue, p.saturation * 0.85, v, alpha * 0.45));
      g.addColorStop(1, hsvCss(hue, p.saturation * 0.85, v, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Gentle blooms on onsets: low notes to the left, high to the right.
    for (const n of notes) {
      if (n.time - this.lastBloom < 0.12 || n.velocity < 0.15) continue;
      this.lastBloom = n.time;
      const jitter = this.noise.noise(n.time * 3.7, n.midi);
      this.blooms.push({
        x: Math.min(0.92, Math.max(0.08, (n.midi - 36) / 60)),
        y: 0.5 + 0.3 * jitter,
        age: 0,
        strength: n.velocity,
        hue: cool(shapeHue(p.palette, Math.round(n.midi), p.varNorm)),
      });
      if (this.blooms.length > MAX_BLOOMS) this.blooms.shift();
    }
    this.blooms = this.blooms.filter((b) => (b.age += dt) < BLOOM_LIFE);
    for (const b of this.blooms) {
      const life = b.age / BLOOM_LIFE;
      const r = minSide * (0.06 + 0.3 * Math.sqrt(life));
      const alpha = b.strength * 0.22 * (1 - life) ** 2;
      const x = b.x * w;
      const y = b.y * h;
      const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      const v = Math.min(1, bright * 1.1);
      g.addColorStop(0, hsvCss(b.hue, p.saturation * 0.7, v, 0));
      g.addColorStop(0.7, hsvCss(b.hue, p.saturation * 0.7, v, alpha));
      g.addColorStop(1, hsvCss(b.hue, p.saturation * 0.7, v, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Dynamics vignette (A8 layer 6): music that thins out darkens the edges.
    ctx.globalCompositeOperation = 'source-over';
    const strength = Math.min(0.7, Math.max(0.05, 0.4 * (2 - p.dynamicsRatio * drift.vignetteScale)));
    const corner = Math.hypot(w, h) / 2;
    const vg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, corner);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) vg.addColorStop(t, `rgba(0,0,0,${strength * t ** 1.8})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  dispose(): void {
    this.ctx = null;
    this.blooms = [];
  }
}
