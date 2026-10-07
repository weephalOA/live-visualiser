import type { FeatureSource } from '../engine/loop';
import { AudioFeatureExtractor } from './extractor';
import type { FeatureFrame, NoteEvent } from './types';

export type InputKind = 'microphone' | 'system';

// Music needs the raw signal: browser voice processing would gate and filter it.
const RAW_AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Tab/system audio capture works in desktop Chromium browsers (and partly Firefox/Safari). */
export function systemCaptureSupported(): boolean {
  return !!navigator.mediaDevices?.getDisplayMedia && !isMobile();
}

export function microphoneSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia;
}

export class InputError extends Error {}

async function openStream(kind: InputKind): Promise<MediaStream> {
  if (kind === 'microphone') {
    return navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO, video: false });
  }
  // Chromium requires video to be requested; it is discarded straight away.
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { ...RAW_AUDIO, suppressLocalAudioPlayback: false } as MediaTrackConstraints,
    // Hints for Chromium's picker; ignored elsewhere.
    systemAudio: 'include',
    preferCurrentTab: false,
  } as DisplayMediaStreamOptions);
  stream.getVideoTracks().forEach((t) => {
    t.stop();
    stream.removeTrack(t);
  });
  if (stream.getAudioTracks().length === 0) {
    throw new InputError(
      'No audio was shared. Choose a tab (or the entire screen on Windows/ChromeOS) and turn on "Share audio".',
    );
  }
  return stream;
}

/** Live mic or tab/system audio, analysed in real time. */
export class LiveAudioInput implements FeatureSource {
  readonly extractor: AudioFeatureExtractor;
  onEnded: (() => void) | null = null;
  private stopped = false;

  private constructor(
    readonly kind: InputKind,
    private readonly ctx: AudioContext,
    private readonly stream: MediaStream,
    private readonly node: AudioWorkletNode,
    private readonly sourceNode: MediaStreamAudioSourceNode,
    private readonly sink: GainNode,
  ) {
    this.extractor = new AudioFeatureExtractor(ctx.sampleRate);
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.extractor.push(e.data);
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (!this.stopped) this.onEnded?.();
      });
    }
  }

  /** Must be called from a user gesture so the AudioContext may start (B8.5). */
  static async create(kind: InputKind): Promise<LiveAudioInput> {
    if (typeof AudioWorkletNode === 'undefined') {
      throw new InputError('This browser does not support AudioWorklet. Try a recent Chrome, Edge, Firefox or Safari.');
    }
    // Create and resume inside the gesture, before any await, so Safari allows it.
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const resumed = ctx.resume();
    let stream: MediaStream;
    try {
      stream = await openStream(kind);
    } catch (err) {
      await ctx.close();
      throw err;
    }
    try {
      await resumed;
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-worklet.js`);
      const sourceNode = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'capture', { numberOfOutputs: 1, outputChannelCount: [1] });
      // The node must reach the destination to be pulled, but silently: the user already hears
      // the music, and routing a mic to the speakers would feed back.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      sourceNode.connect(node).connect(sink).connect(ctx.destination);
      return new LiveAudioInput(kind, ctx, stream, node, sourceNode, sink);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
      throw err;
    }
  }

  time(): number {
    return this.extractor.time;
  }

  current(): FeatureFrame {
    return this.extractor.current();
  }

  drainOnsets(): NoteEvent[] {
    return this.extractor.drainOnsets();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.node.port.onmessage = null;
    this.sourceNode.disconnect();
    this.node.disconnect();
    this.sink.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
    await this.ctx.close();
  }
}

export function describeInputError(err: unknown, kind: InputKind): string {
  if (err instanceof InputError) return err.message;
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return kind === 'microphone'
      ? 'Microphone access was blocked. Allow it in your browser\'s site settings and try again.'
      : 'Sharing was cancelled or blocked.';
  }
  if (name === 'NotFoundError') return 'No microphone was found.';
  if (name === 'NotSupportedError' || name === 'TypeError') {
    return 'This browser cannot capture that audio source.';
  }
  return `Could not start audio: ${(err as Error)?.message ?? String(err)}`;
}
