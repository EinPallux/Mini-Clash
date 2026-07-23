import { SOUND_CUES, type SynthCue, type SynthLayer } from '@mini-clash/data';
import { useSettings } from '../state/settings';

/**
 * WebAudio engine (TECH §7): bus tree master→(music|sfx|ui), synth cues baked to
 * AudioBuffers on first use. Context unlocks on first user gesture.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buses = new Map<'music' | 'sfx' | 'ui', GainNode>();
const bufferCache = new Map<string, AudioBuffer>();
const SAMPLE_RATE = 44100;

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.connect(ctx.destination);
  for (const name of ['music', 'sfx', 'ui'] as const) {
    const g = ctx.createGain();
    g.connect(master);
    buses.set(name, g);
  }
  syncVolumes();
  useSettings.subscribe(syncVolumes);
  return ctx;
}

function syncVolumes(): void {
  if (!master) return;
  const v = useSettings.getState().volumes;
  master.gain.value = v.master;
  buses.get('music')!.gain.value = v.music;
  buses.get('sfx')!.gain.value = v.sfx;
  buses.get('ui')!.gain.value = v.ui;
}

/** Call from any pointer/key handler to satisfy autoplay policies. */
export function unlockAudio(): void {
  const c = ensureCtx();
  if (c && c.state === 'suspended') void c.resume();
}

function bakeCue(cue: SynthCue): AudioBuffer {
  const cached = bufferCache.get(cue.id);
  if (cached) return cached;
  const c = ensureCtx();
  if (!c) throw new Error('no audio');
  const total = Math.max(...cue.layers.map((l) => (l.delay ?? 0) + l.attack + l.decay)) + 0.05;
  const n = Math.ceil(total * SAMPLE_RATE);
  const buf = c.createBuffer(1, n, SAMPLE_RATE);
  const out = buf.getChannelData(0);
  for (const layer of cue.layers) renderLayer(out, layer);
  // Soft clip.
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i]);
  bufferCache.set(cue.id, buf);
  return buf;
}

function renderLayer(out: Float32Array, l: SynthLayer): void {
  const start = Math.floor((l.delay ?? 0) * SAMPLE_RATE);
  const dur = l.attack + l.decay;
  const n = Math.floor(dur * SAMPLE_RATE);
  let phase = 0;
  let lpState = 0;
  const lpAlpha = l.lowpass ? 1 - Math.exp((-2 * Math.PI * l.lowpass) / SAMPLE_RATE) : 1;
  // Deterministic noise (rendering only — not simulation).
  let noiseSeed = 1234567;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const frac = t / dur;
    const freq =
      l.freqEnd !== undefined
        ? l.slide === 'lin'
          ? l.freq + (l.freqEnd - l.freq) * frac
          : l.freq * (l.freqEnd / l.freq) ** frac
        : l.freq;
    phase += (freq / SAMPLE_RATE) * Math.PI * 2;
    let sample: number;
    switch (l.wave) {
      case 'sine':
        sample = Math.sin(phase);
        break;
      case 'square':
        sample = Math.sin(phase) > 0 ? 1 : -1;
        break;
      case 'sawtooth':
        sample = ((phase / Math.PI) % 2) - 1;
        break;
      case 'triangle':
        sample = Math.asin(Math.sin(phase)) * (2 / Math.PI);
        break;
      case 'noise': {
        noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
        sample = noiseSeed / 0x3fffffff - 1;
        break;
      }
    }
    if (l.lowpass) {
      lpState += lpAlpha * (sample - lpState);
      sample = lpState;
    }
    const env = t < l.attack ? t / Math.max(l.attack, 1e-4) : 1 - (t - l.attack) / l.decay;
    out[start + i] += sample * env * env * l.volume;
  }
}

export interface PlayOpts {
  volume?: number;
  /** -1 .. 1 stereo position (world-x relative to camera). */
  pan?: number;
  bus?: 'music' | 'sfx' | 'ui';
  /** Random-ish pitch variation for repetitive cues (rendering-side only). */
  detune?: number;
}

export function playCue(id: string, opts: PlayOpts = {}): void {
  const cue = SOUND_CUES[id];
  const c = ensureCtx();
  if (!cue || !c || c.state !== 'running') return;
  const src = c.createBufferSource();
  src.buffer = bakeCue(cue);
  if (opts.detune) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * opts.detune;
  const gain = c.createGain();
  gain.gain.value = opts.volume ?? 1;
  const pan = c.createStereoPanner();
  pan.pan.value = Math.max(-0.3, Math.min(0.3, opts.pan ?? 0));
  src
    .connect(gain)
    .connect(pan)
    .connect(buses.get(opts.bus ?? 'sfx')!);
  src.start();
}

export function uiSound(id: string): void {
  unlockAudio();
  playCue(id, { bus: 'ui' });
}
