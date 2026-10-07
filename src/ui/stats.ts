import type { RenderFrame } from '../themes/types';
import { hsvCss } from '../mapping/colour';

const PITCH_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const midiName = (m: number) => `${PITCH_NAMES[((Math.round(m) % 12) + 12) % 12]}${Math.floor(Math.round(m) / 12) - 1}`;

/** Analysis overlay: live valence-arousal position plus the raw features behind it. */
export class StatsPanel {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly trail: { v: number; a: number }[] = [];
  private lastUpdate = -1;
  visible = false;

  constructor(
    private readonly root: HTMLElement,
    canvas: HTMLCanvasElement,
    private readonly list: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.hidden = !v;
  }

  update(frame: RenderFrame): void {
    if (!this.visible || frame.t - this.lastUpdate < 0.1) return;
    this.lastUpdate = frame.t;
    const f = frame.features;
    this.trail.push({ v: f.valence, a: f.arousal });
    if (this.trail.length > 80) this.trail.shift();
    this.draw(frame);

    const key = f.tonic < 0 ? '—' : `${PITCH_NAMES[f.tonic]} ${f.keyMode === 1 ? 'major' : f.keyMode === 0 ? 'minor' : '?'}`;
    const rows: [string, string][] = [
      ['Valence', f.valence.toFixed(2)],
      ['Arousal', f.arousal.toFixed(2)],
      ['Tempo', `${f.tempo.toFixed(0)} bpm`],
      ['Key', key],
      ['Pitch', `${midiName(f.avgPitch)} ± ${Math.sqrt(f.pitchVar).toFixed(1)}`],
      ['Density', `${f.density.toFixed(1)} / bar`],
      ['Complexity', f.complexity.toFixed(2)],
      ['Cadence', f.cadence.toFixed(2)],
      ['Motif', f.motifScore.toFixed(2)],
      ['Harmony', frame.params.harmony.replace('_', ' ')],
      ['Input', f.silent ? 'silent' : `${Math.round(f.level * 100)}%`],
    ];
    this.list.replaceChildren(
      ...rows.flatMap(([k, v]) => {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        return [dt, dd];
      }),
    );
  }

  private draw(frame: RenderFrame): void {
    const ctx = this.ctx;
    const { width: w, height: h } = ctx.canvas;
    const pad = 22;
    const x = (v: number) => pad + v * (w - 2 * pad);
    const y = (a: number) => h - pad - a * (h - 2 * pad);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);
    ctx.beginPath();
    ctx.moveTo(x(0.5), pad);
    ctx.lineTo(x(0.5), h - pad);
    ctx.moveTo(pad, y(0.5));
    ctx.lineTo(w - pad, y(0.5));
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('valence →', w / 2, h - 4);
    ctx.save();
    ctx.translate(14, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('arousal →', 0, 0);
    ctx.restore();

    this.trail.forEach((p, i) => {
      ctx.fillStyle = `rgba(255,255,255,${(0.35 * i) / this.trail.length})`;
      ctx.beginPath();
      ctx.arc(x(p.v), y(p.a), 2, 0, Math.PI * 2);
      ctx.fill();
    });
    const p = frame.params;
    ctx.fillStyle = hsvCss(p.hue, Math.max(0.5, p.saturation), 1);
    ctx.beginPath();
    ctx.arc(x(p.valence), y(p.arousal), 8, 0, Math.PI * 2);
    ctx.fill();
  }
}
