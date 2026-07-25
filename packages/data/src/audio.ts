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
  /** Tag Swap: a quick card-flip whoosh with a bright arrival chime. */
  duo_swap: {
    id: 'duo_swap',
    layers: [
      { wave: 'sine', freq: 620, freqEnd: 240, attack: 0.005, decay: 0.16, volume: 0.2 },
      {
        wave: 'triangle',
        freq: 340,
        freqEnd: 1240,
        attack: 0.005,
        decay: 0.3,
        volume: 0.18,
        delay: 0.14,
      },
      { wave: 'sine', freq: 1560, attack: 0.001, decay: 0.16, volume: 0.1, delay: 0.3 },
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

  /* Mortis */
  mortis_q_charge: {
    id: 'mortis_q_charge',
    layers: [{ wave: 'sine', freq: 340, freqEnd: 620, attack: 0.02, decay: 0.16, volume: 0.14 }],
  },
  mortis_q_fire: {
    id: 'mortis_q_fire',
    layers: [
      {
        wave: 'triangle',
        freq: 720,
        freqEnd: 320,
        attack: 0.002,
        decay: 0.18,
        volume: 0.2,
        slide: 'exp',
      },
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.09, volume: 0.1, lowpass: 2400 },
    ],
  },
  mortis_w_open: {
    id: 'mortis_w_open',
    layers: [{ wave: 'sawtooth', freq: 140, freqEnd: 90, attack: 0.01, decay: 0.3, volume: 0.12 }],
  },
  mortis_w_erupt: {
    id: 'mortis_w_erupt',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.004, decay: 0.28, volume: 0.3, lowpass: 750 },
      { wave: 'square', freq: 180, freqEnd: 70, attack: 0.002, decay: 0.22, volume: 0.16 },
    ],
  },
  mortis_r_start: {
    id: 'mortis_r_start',
    layers: [{ wave: 'sawtooth', freq: 110, freqEnd: 240, attack: 0.05, decay: 0.5, volume: 0.14 }],
  },
  mortis_r_tick: {
    id: 'mortis_r_tick',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.08, volume: 0.12, lowpass: 1600 },
      { wave: 'triangle', freq: 500, freqEnd: 380, attack: 0.002, decay: 0.07, volume: 0.08 },
    ],
  },
  mortis_brand: {
    id: 'mortis_brand',
    layers: [{ wave: 'sine', freq: 880, freqEnd: 1180, attack: 0.002, decay: 0.09, volume: 0.12 }],
  },

  /* Rattle */
  rattle_q_draw: {
    id: 'rattle_q_draw',
    layers: [{ wave: 'noise', freq: 1, attack: 0.002, decay: 0.05, volume: 0.1, lowpass: 5200 }],
  },
  rattle_q_throw: {
    id: 'rattle_q_throw',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.1, volume: 0.16, lowpass: 4200 },
      { wave: 'square', freq: 900, freqEnd: 640, attack: 0.001, decay: 0.06, volume: 0.08 },
    ],
  },
  rattle_dash: {
    id: 'rattle_dash',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.12, volume: 0.14, lowpass: 3000 },
      { wave: 'square', freq: 2200, freqEnd: 1400, attack: 0.001, decay: 0.05, volume: 0.05 },
    ],
  },
  rattle_bones: {
    id: 'rattle_bones',
    layers: [
      { wave: 'square', freq: 1900, freqEnd: 1500, attack: 0.001, decay: 0.045, volume: 0.09 },
      {
        wave: 'square',
        freq: 1400,
        freqEnd: 1100,
        attack: 0.001,
        decay: 0.05,
        volume: 0.08,
        delay: 0.04,
      },
      {
        wave: 'square',
        freq: 1700,
        freqEnd: 1250,
        attack: 0.001,
        decay: 0.045,
        volume: 0.07,
        delay: 0.09,
      },
    ],
  },
  rattle_return: {
    id: 'rattle_return',
    layers: [
      {
        wave: 'triangle',
        freq: 380,
        freqEnd: 980,
        attack: 0.002,
        decay: 0.16,
        volume: 0.16,
        slide: 'exp',
      },
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.1, volume: 0.08, lowpass: 3600 },
    ],
  },
  rattle_r_vanish: {
    id: 'rattle_r_vanish',
    layers: [
      {
        wave: 'triangle',
        freq: 700,
        freqEnd: 180,
        attack: 0.002,
        decay: 0.16,
        volume: 0.16,
        slide: 'exp',
      },
    ],
  },
  rattle_r_strike: {
    id: 'rattle_r_strike',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.12, volume: 0.24, lowpass: 2600 },
      { wave: 'sawtooth', freq: 420, freqEnd: 150, attack: 0.001, decay: 0.1, volume: 0.14 },
    ],
  },
  rattle_r_confirm: {
    id: 'rattle_r_confirm',
    layers: [
      { wave: 'square', freq: 620, freqEnd: 930, attack: 0.002, decay: 0.09, volume: 0.14 },
      {
        wave: 'square',
        freq: 930,
        freqEnd: 1240,
        attack: 0.002,
        decay: 0.12,
        volume: 0.12,
        delay: 0.07,
      },
    ],
  },

  /* Grukk */
  grukk_q_lunge: {
    id: 'grukk_q_lunge',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.003, decay: 0.12, volume: 0.18, lowpass: 1400 },
      { wave: 'sawtooth', freq: 190, freqEnd: 120, attack: 0.002, decay: 0.09, volume: 0.12 },
    ],
  },
  grukk_w_inhale: {
    id: 'grukk_w_inhale',
    layers: [{ wave: 'noise', freq: 1, attack: 0.06, decay: 0.16, volume: 0.1, lowpass: 900 }],
  },
  grukk_w_roar: {
    id: 'grukk_w_roar',
    layers: [
      { wave: 'sawtooth', freq: 150, freqEnd: 70, attack: 0.01, decay: 0.4, volume: 0.22 },
      { wave: 'noise', freq: 1, attack: 0.01, decay: 0.3, volume: 0.14, lowpass: 700 },
    ],
  },
  grukk_r_lift: {
    id: 'grukk_r_lift',
    layers: [{ wave: 'noise', freq: 1, attack: 0.03, decay: 0.12, volume: 0.1, lowpass: 1100 }],
  },
  grukk_r_slam: {
    id: 'grukk_r_slam',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.3, volume: 0.3, lowpass: 520 },
      { wave: 'sine', freq: 95, freqEnd: 45, attack: 0.002, decay: 0.28, volume: 0.24 },
    ],
  },

  /* Sylva */
  sylva_q_flick: {
    id: 'sylva_q_flick',
    layers: [
      { wave: 'triangle', freq: 560, freqEnd: 820, attack: 0.002, decay: 0.08, volume: 0.12 },
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.05, volume: 0.06, lowpass: 5200 },
    ],
  },
  sylva_w_plant: {
    id: 'sylva_w_plant',
    layers: [{ wave: 'sine', freq: 300, freqEnd: 420, attack: 0.01, decay: 0.12, volume: 0.1 }],
  },
  sylva_w_grow: {
    id: 'sylva_w_grow',
    layers: [
      {
        wave: 'sine',
        freq: 420,
        freqEnd: 700,
        attack: 0.03,
        decay: 0.35,
        volume: 0.14,
        slide: 'lin',
      },
      {
        wave: 'triangle',
        freq: 840,
        freqEnd: 1050,
        attack: 0.06,
        decay: 0.3,
        volume: 0.07,
        delay: 0.1,
      },
    ],
  },
  sylva_r_gather: {
    id: 'sylva_r_gather',
    layers: [{ wave: 'sawtooth', freq: 90, freqEnd: 200, attack: 0.05, decay: 0.4, volume: 0.12 }],
  },
  sylva_r_lash: {
    id: 'sylva_r_lash',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.003, decay: 0.2, volume: 0.2, lowpass: 1800 },
      { wave: 'sawtooth', freq: 260, freqEnd: 110, attack: 0.002, decay: 0.18, volume: 0.14 },
    ],
  },
  sylva_bloom: {
    id: 'sylva_bloom',
    layers: [
      { wave: 'sine', freq: 720, freqEnd: 1080, attack: 0.004, decay: 0.14, volume: 0.12 },
      {
        wave: 'sine',
        freq: 1080,
        freqEnd: 1440,
        attack: 0.004,
        decay: 0.16,
        volume: 0.08,
        delay: 0.06,
      },
    ],
  },

  /* Bridge structures & match beats */
  tower_fire: {
    id: 'tower_fire',
    layers: [
      { wave: 'square', freq: 480, freqEnd: 300, attack: 0.002, decay: 0.1, volume: 0.14 },
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.07, volume: 0.08, lowpass: 2400 },
    ],
  },
  structure_fall: {
    id: 'structure_fall',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.004, decay: 0.5, volume: 0.32, lowpass: 480 },
      { wave: 'sine', freq: 80, freqEnd: 38, attack: 0.002, decay: 0.45, volume: 0.26 },
      {
        wave: 'noise',
        freq: 1,
        attack: 0.002,
        decay: 0.2,
        volume: 0.14,
        lowpass: 1600,
        delay: 0.12,
      },
    ],
  },
  core_exposed: {
    id: 'core_exposed',
    layers: [
      { wave: 'sawtooth', freq: 220, freqEnd: 160, attack: 0.01, decay: 0.4, volume: 0.16 },
      {
        wave: 'square',
        freq: 440,
        freqEnd: 330,
        attack: 0.01,
        decay: 0.35,
        volume: 0.1,
        delay: 0.08,
      },
    ],
  },
  core_pulse: {
    id: 'core_pulse',
    layers: [{ wave: 'sine', freq: 220, freqEnd: 140, attack: 0.004, decay: 0.25, volume: 0.16 }],
  },
  core_destroyed: {
    id: 'core_destroyed',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.8, volume: 0.34, lowpass: 420 },
      { wave: 'sine', freq: 70, freqEnd: 30, attack: 0.002, decay: 0.7, volume: 0.3 },
      {
        wave: 'triangle',
        freq: 880,
        freqEnd: 1760,
        attack: 0.02,
        decay: 0.5,
        volume: 0.1,
        delay: 0.2,
      },
    ],
  },
  overtime_horn: {
    id: 'overtime_horn',
    layers: [
      { wave: 'sawtooth', freq: 196, freqEnd: 196, attack: 0.03, decay: 0.5, volume: 0.18 },
      {
        wave: 'sawtooth',
        freq: 247,
        freqEnd: 247,
        attack: 0.03,
        decay: 0.5,
        volume: 0.14,
        delay: 0.05,
      },
    ],
  },
  barrier_drop: {
    id: 'barrier_drop',
    layers: [
      {
        wave: 'triangle',
        freq: 660,
        freqEnd: 330,
        attack: 0.002,
        decay: 0.3,
        volume: 0.16,
        slide: 'exp',
      },
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.16, volume: 0.1, lowpass: 2800 },
    ],
  },
  wave_horn: {
    id: 'wave_horn',
    layers: [{ wave: 'square', freq: 330, freqEnd: 392, attack: 0.02, decay: 0.28, volume: 0.12 }],
  },
  orb_spawn: {
    id: 'orb_spawn',
    layers: [{ wave: 'sine', freq: 520, freqEnd: 780, attack: 0.01, decay: 0.2, volume: 0.12 }],
  },
  orb_pickup: {
    id: 'orb_pickup',
    layers: [
      { wave: 'sine', freq: 660, freqEnd: 990, attack: 0.002, decay: 0.14, volume: 0.16 },
      {
        wave: 'sine',
        freq: 990,
        freqEnd: 1320,
        attack: 0.002,
        decay: 0.16,
        volume: 0.1,
        delay: 0.06,
      },
    ],
  },
  mini_zap: {
    id: 'mini_zap',
    layers: [
      { wave: 'square', freq: 1200, freqEnd: 700, attack: 0.001, decay: 0.06, volume: 0.09 },
    ],
  },
  mini_thump: {
    id: 'mini_thump',
    layers: [{ wave: 'noise', freq: 1, attack: 0.002, decay: 0.06, volume: 0.1, lowpass: 1200 }],
  },
  shop_buy: {
    id: 'shop_buy',
    layers: [
      { wave: 'square', freq: 950, freqEnd: 700, attack: 0.001, decay: 0.05, volume: 0.16 },
      { wave: 'triangle', freq: 1420, attack: 0.001, decay: 0.11, volume: 0.12, delay: 0.05 },
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.04, volume: 0.06, lowpass: 4200 },
    ],
  },
  ping_mark: {
    id: 'ping_mark',
    layers: [
      { wave: 'sine', freq: 880, freqEnd: 1320, attack: 0.002, decay: 0.09, volume: 0.12 },
      { wave: 'sine', freq: 1760, attack: 0.03, decay: 0.12, volume: 0.06 },
    ],
  },
  ping_danger: {
    id: 'ping_danger',
    layers: [
      { wave: 'square', freq: 720, freqEnd: 430, attack: 0.002, decay: 0.16, volume: 0.1 },
      { wave: 'square', freq: 360, freqEnd: 215, attack: 0.05, decay: 0.16, volume: 0.08 },
    ],
  },
  mini_pop: {
    id: 'mini_pop',
    layers: [
      { wave: 'square', freq: 340, freqEnd: 120, attack: 0.001, decay: 0.11, volume: 0.1 },
      { wave: 'noise', freq: 1, attack: 0.001, decay: 0.08, volume: 0.07, lowpass: 2400 },
    ],
  },
  relic_blink: {
    id: 'relic_blink',
    layers: [
      {
        wave: 'triangle',
        freq: 520,
        freqEnd: 1560,
        attack: 0.002,
        decay: 0.14,
        volume: 0.16,
        slide: 'exp',
      },
    ],
  },
  relic_purge: {
    id: 'relic_purge',
    layers: [
      { wave: 'sine', freq: 780, freqEnd: 1170, attack: 0.002, decay: 0.18, volume: 0.14 },
      { wave: 'noise', freq: 1, attack: 0.002, decay: 0.08, volume: 0.06, lowpass: 4200 },
    ],
  },
  relic_ember: {
    id: 'relic_ember',
    layers: [
      { wave: 'noise', freq: 1, attack: 0.004, decay: 0.28, volume: 0.2, lowpass: 1500 },
      { wave: 'sawtooth', freq: 220, freqEnd: 90, attack: 0.002, decay: 0.22, volume: 0.12 },
    ],
  },
  relic_horn: {
    id: 'relic_horn',
    layers: [
      { wave: 'square', freq: 262, freqEnd: 262, attack: 0.02, decay: 0.35, volume: 0.14 },
      {
        wave: 'square',
        freq: 330,
        freqEnd: 330,
        attack: 0.02,
        decay: 0.35,
        volume: 0.1,
        delay: 0.06,
      },
    ],
  },
};
