export interface RawFeatures {
  avgPitch: number;
  pitchVar: number;
  density: number;
  tempo: number;
  key: number;
  keyMode: number;
  beatsPerBar: number;
  motifScore: number;
  pitchVarFirst: number;
  pitchVarSecond: number;
  densityFirst: number;
  densitySecond: number;
}

export interface SegmentFeatures extends RawFeatures {
  valence: number;
  arousal: number;
  complexity: number;
  cadence: number;
}

export interface FeatureFrame extends SegmentFeatures {
  time: number; // seconds on the audio clock
  level: number; // 0-1 short-term loudness, for themes that want instant response
  silent: boolean;
  tonic: number; // detected key tonic pitch class, for display only
}

/** A detected onset in live audio. Stands in for a MIDI note-on. */
export interface NoteEvent {
  time: number;
  midi: number; // dominant pitch at the onset
  velocity: number; // 0-1 onset strength
}
