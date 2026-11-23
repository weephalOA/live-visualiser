import type { FeatureFrame, NoteEvent } from '../analysis/types';
import type { DriftState } from '../engine/drift';
import type { VisualParams } from '../mapping/params';

export interface RenderFrame {
  params: VisualParams; // eased, with drift applied
  notes: NoteEvent[]; // onsets since the previous frame
  t: number; // audio time in seconds
  dt: number; // seconds since previous frame
  // Additions for live audio input, not in the original MIDI design:
  drift: DriftState; // non-colour drift (size, offsets, alpha) for themes to apply
  level: number; // instantaneous loudness 0-1
  silent: boolean;
  features: FeatureFrame; // raw, uneased features
}

export interface ThemePreset {
  /** Easing time constant in seconds. */
  tau: number;
  /** Drift amount 0-1, scaled by valence before use. */
  drift: number;
  /** Drift noise speed in cycles per second. */
  driftSpeed: number;
}

export interface Theme {
  id: string;
  name: string;
  preset: ThemePreset;
  /** '2d' or 'webgl'; a canvas cannot switch context type, so the engine makes a fresh one. */
  context: '2d' | 'webgl';
  /** Optional cap on device pixel ratio; soft themes can render at lower resolution. */
  maxPixelRatio?: number;
  init(canvas: HTMLCanvasElement): void;
  render(frame: RenderFrame): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
