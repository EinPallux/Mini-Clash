import type { SynthCue } from './types';

/**
 * Procedural SFX bank — sfxr-style recipes baked to buffers by the client audio engine.
 * Tuned for the cartoon-with-weight direction (ART_DIRECTION §9): square pops for zaps,
 * low-passed noise for booms, triangle chirps for UI.
 */
export const SOUND_CUES: Record<string, SynthCue> = {
  ui_click: {
    id: 'ui_click',
    layers: [{ wave: 'square', freq: 880, freqEnd: 620, attack: 0.001, decay: 0.07, volume: 0.22 }],
  },
  ui_hover: {
    id: 'ui_hover',
    layers: [{ wave: 'sine', freq: 540, freqEnd: 600, attack: 0.001, decay: 0.045, volume: 0.1 }],
  },
  ui_back: {
    id: 'ui_back',
    layers: [{ wave: 'square', freq: 620, freqEnd: 420, attack: 0.001, decay: 0.08, volume: 0.18 }],
  },
  move_ping: {
    id: 'move_ping',
    layers: [{ wave: 'sine', freq: 960, freqEnd: 720, attack: 0.001, decay: 0.09, volume: 0.13 }],
  },

  rook_q_swing: {
    id: 'rook_q_swing',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.005, decay: 0.13, volume: 0.26, lowpass: 900 },
      { wave: 'sawtooth', freq: 220, freqEnd: 90, attack: 0.001, decay: 0.11, volume: 0.16 },
    ],
  },
  rook_q_hit: {
    id: 'rook_q_hit',
    layers: [
      { wave: 'square', freq: 165, freqEnd: 70, attack: 0.001, decay: 0.12, volume: 0.34 },
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.09, volume: 0.24, lowpass: 520 },
    ],
  },
  rook_q2_swing: {
    id: 'rook_q2_swing',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.003, decay: 0.1, volume: 0.22, lowpass: 1300 },
      { wave: 'sawtooth', freq: 320, freqEnd: 130, attack: 0.001, decay: 0.09, volume: 0.16 },
    ],
  },
  wall_rise: {
    id: 'wall_rise',
    layers: [
      { wave: 'sawtooth', freq: 55, freqEnd: 170, attack: 0.01, decay: 0.36, volume: 0.3 },
      { wave: 'noise', freq: 1, attack: 0.01, decay: 0.4, volume: 0.26, lowpass: 320 },
    ],
  },
  wall_fall: {
    id: 'wall_fall',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.005, decay: 0.5, volume: 0.26, lowpass: 260 },
      { wave: 'square', freq: 120, freqEnd: 55, attack: 0.001, decay: 0.3, volume: 0.16 },
    ],
  },
  rook_r_leap: {
    id: 'rook_r_leap',
    layers: [
      { wave: 'sawtooth', freq: 190, freqEnd: 540, attack: 0.02, decay: 0.32, volume: 0.18 },
    ],
  },
  rook_r_slam: {
    id: 'rook_r_slam',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.5, volume: 0.42, lowpass: 220 },
      { wave: 'sine', freq: 90, freqEnd: 42, attack: 0.001, decay: 0.42, volume: 0.42 },
      { wave: 'square', freq: 70, freqEnd: 38, attack: 0.001, decay: 0.2, volume: 0.22 },
    ],
  },

  aa_cannon_fire: {
    id: 'aa_cannon_fire',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.1, volume: 0.28, lowpass: 1500 },
      { wave: 'square', freq: 300, freqEnd: 135, attack: 0.001, decay: 0.08, volume: 0.2 },
    ],
  },
  aa_cannon_hit: {
    id: 'aa_cannon_hit',
    layers: [
      { wave: 'square', freq: 500, freqEnd: 240, attack: 0.001, decay: 0.055, volume: 0.16 },
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.05, volume: 0.12, lowpass: 900 },
    ],
  },
  powder_blast: {
    id: 'powder_blast',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.2, volume: 0.3, lowpass: 720 },
      { wave: 'square', freq: 230, freqEnd: 85, attack: 0.001, decay: 0.16, volume: 0.24 },
    ],
  },
  skip_splash: {
    id: 'skip_splash',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.13, volume: 0.24, lowpass: 1100 },
      { wave: 'triangle', freq: 680, freqEnd: 290, attack: 0.001, decay: 0.11, volume: 0.15 },
    ],
  },
  keg_toss: {
    id: 'keg_toss',
    layers: [
      { wave: 'triangle', freq: 290, freqEnd: 520, attack: 0.005, decay: 0.16, volume: 0.16 },
    ],
  },
  keg_fuse: {
    id: 'keg_fuse',
    layers: [{ wave: 'noise', freq: 1, attack: 0.02, decay: 0.55, volume: 0.09, lowpass: 3200 }],
  },
  explosion_big: {
    id: 'explosion_big',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.6, volume: 0.44, lowpass: 400 },
      { wave: 'sine', freq: 72, freqEnd: 34, attack: 0.001, decay: 0.5, volume: 0.4 },
      { wave: 'square', freq: 110, freqEnd: 48, attack: 0.001, decay: 0.25, volume: 0.22 },
    ],
  },
  ship_horn: {
    id: 'ship_horn',
    layers: [
      { wave: 'sawtooth', freq: 110, attack: 0.06, decay: 1.0, volume: 0.26 },
      { wave: 'sawtooth', freq: 165, attack: 0.06, decay: 0.95, volume: 0.18, delay: 0.05 },
      { wave: 'sine', freq: 55, attack: 0.05, decay: 1.0, volume: 0.2 },
    ],
  },
  volley_boom: {
    id: 'volley_boom',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.32, volume: 0.32, lowpass: 520 },
      { wave: 'sine', freq: 88, freqEnd: 44, attack: 0.001, decay: 0.3, volume: 0.32 },
    ],
  },

  hit_generic: {
    id: 'hit_generic',
    layers: [{ wave: 'square', freq: 430, freqEnd: 180, attack: 0.001, decay: 0.06, volume: 0.16 }],
  },
  death_poof: {
    id: 'death_poof',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.32, volume: 0.28, lowpass: 640 },
      { wave: 'triangle', freq: 520, freqEnd: 110, attack: 0.001, decay: 0.3, volume: 0.2 },
    ],
  },
  levelup: {
    id: 'levelup',
    layers: [
      { wave: 'triangle', freq: 523, attack: 0.002, decay: 0.14, volume: 0.22 },
      { wave: 'triangle', freq: 659, attack: 0.002, decay: 0.14, volume: 0.22, delay: 0.09 },
      { wave: 'triangle', freq: 784, attack: 0.002, decay: 0.2, volume: 0.24, delay: 0.18 },
    ],
  },
  spawn_beam: {
    id: 'spawn_beam',
    layers: [
      { wave: 'sine', freq: 290, freqEnd: 880, attack: 0.01, decay: 0.42, volume: 0.2 },
      { wave: 'triangle', freq: 1180, attack: 0.001, decay: 0.22, volume: 0.12, delay: 0.26 },
    ],
  },
  block_clang: {
    id: 'block_clang',
    layers: [
      { wave: 'square', freq: 720, freqEnd: 500, attack: 0.001, decay: 0.16, volume: 0.26 },
      { wave: 'triangle', freq: 1420, freqEnd: 880, attack: 0.001, decay: 0.1, volume: 0.14 },
    ],
  },
  dummy_reset: {
    id: 'dummy_reset',
    layers: [
      { wave: 'triangle', freq: 390, freqEnd: 660, attack: 0.004, decay: 0.16, volume: 0.16 },
    ],
  },
  cast_denied: {
    id: 'cast_denied',
    layers: [{ wave: 'square', freq: 210, freqEnd: 160, attack: 0.001, decay: 0.09, volume: 0.14 }],
  },
};
