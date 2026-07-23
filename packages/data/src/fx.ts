import type { FxTimeline } from './types';

/**
 * FX timelines — the visual grammar of every ability (ART_DIRECTION §6).
 * Keys follow sim event conventions: `<champ>.<slot>.windup|cast|recast`, pulse fxKeys, generic.*.
 * Times are seconds after the triggering event.
 */

const PHYS = 0xffa13b;
const STONE = 0xc7cdd9;
const DUST = 0xb5a98f;
const POWDER = 0x646b78;
const GOLD = 0xffd077;
const ALLY = 0x3ba7ff;
const GHOST = 0x9fe8ff;

export const FX: Record<string, FxTimeline> = {
  /* ------------------------------- Rook ------------------------------- */
  'rook.q.windup': {
    id: 'rook.q.windup',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rook_q_swing' } },
      { time: 0, op: { t: 'flash', at: 'self', color: STONE, life: 0.12 } },
    ],
  },
  'rook.q.cast': {
    id: 'rook.q.cast',
    events: [
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'self', color: STONE, radius: 2.5, angleDeg: 100, life: 0.22 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 26,
          color: DUST,
          color2: STONE,
          size: 0.16,
          speed: 5,
          spread: 55,
          up: 1.5,
          life: 0.4,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'rook_q_hit' } },
      { time: 0.02, op: { t: 'shake', power: 's' } },
    ],
  },
  'rook.q.recast': {
    id: 'rook.q.recast',
    events: [
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'self', color: PHYS, radius: 2.5, angleDeg: -100, life: 0.2 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 18,
          color: PHYS,
          size: 0.13,
          speed: 6,
          spread: 50,
          life: 0.3,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'rook_q2_swing' } },
    ],
  },
  'rook.w.cast': {
    id: 'rook.w.cast',
    events: [
      {
        time: 0,
        op: { t: 'decal', at: 'aim', kind: 'crack', color: 0x6b6f7a, radius: 1.9, life: 3.2 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'aim',
          count: 34,
          color: DUST,
          color2: STONE,
          size: 0.2,
          speed: 4,
          up: 3.2,
          life: 0.55,
          gravity: 8,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'wall_rise' } },
      { time: 0.05, op: { t: 'shake', power: 's' } },
      {
        time: 2.5,
        op: {
          t: 'burst',
          at: 'aim',
          count: 22,
          color: DUST,
          size: 0.18,
          speed: 3,
          up: 1.2,
          life: 0.5,
          gravity: 7,
          shape: 'shard',
        },
      },
      { time: 2.5, op: { t: 'sound', cue: 'wall_fall', volume: 0.7 } },
    ],
  },
  'rook.r.windup': {
    id: 'rook.r.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'rook_r_leap' } }],
  },
  'rook.r.cast': {
    // Leap launch: dust kick as he leaves the ground (landing spectacle lives in rook.r.land).
    id: 'rook.r.cast',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 16,
          color: DUST,
          size: 0.15,
          speed: 3.5,
          up: 2.5,
          life: 0.4,
          gravity: 6,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'ring', at: 'self', color: DUST, radius: 1.1, life: 0.3 } },
    ],
  },
  'rook.r.land': {
    id: 'rook.r.land',
    events: [
      {
        time: 0,
        op: { t: 'decal', at: 'self', kind: 'crack', color: 0x5c5f68, radius: 2.6, life: 4 },
      },
      { time: 0, op: { t: 'ring', at: 'self', color: STONE, radius: 2.6, life: 0.4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 46,
          color: DUST,
          color2: STONE,
          size: 0.22,
          speed: 7,
          up: 4,
          life: 0.6,
          gravity: 10,
          shape: 'shard',
        },
      },
      { time: 0, op: { t: 'flash', at: 'self', color: 0xffffff, life: 0.08 } },
      { time: 0, op: { t: 'shake', power: 'm' } },
      { time: 0, op: { t: 'hitstop', ms: 40 } },
      { time: 0, op: { t: 'sound', cue: 'rook_r_slam' } },
      { time: 0.1, op: { t: 'ring', at: 'self', color: ALLY, radius: 4, width: 0.18, life: 2.9 } },
      {
        time: 0.1,
        op: {
          t: 'prop',
          model: 'arena/banner',
          at: 'self',
          scale: 1.1,
          life: 2.9,
          offset: [0.7, 0, -0.4],
        },
      },
      {
        time: 0.1,
        op: {
          t: 'prop',
          model: 'arena/banner',
          at: 'self',
          scale: 1.1,
          life: 2.9,
          offset: [-0.7, 0, -0.4],
        },
      },
    ],
  },
  'rook.passive.block': {
    id: 'rook.passive.block',
    events: [
      { time: 0, op: { t: 'flash', at: 'self', color: STONE, life: 0.15 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 10,
          color: STONE,
          size: 0.12,
          speed: 4,
          life: 0.3,
          shape: 'shard',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'block_clang' } },
    ],
  },

  /* ------------------------------ Fathom ------------------------------ */
  'fathom.aa.fire': {
    id: 'fathom.aa.fire',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 8,
          color: GOLD,
          color2: POWDER,
          size: 0.1,
          speed: 5,
          spread: 25,
          life: 0.2,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'light', at: 'self', color: GOLD, intensity: 2.2, radius: 3, life: 0.1 },
      },
      { time: 0, op: { t: 'sound', cue: 'aa_cannon_fire' } },
    ],
  },
  'fathom.aa.hit': {
    id: 'fathom.aa.hit',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 7,
          color: GOLD,
          size: 0.09,
          speed: 4,
          life: 0.22,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'aa_cannon_hit', volume: 0.7 } },
    ],
  },
  'fathom.passive.blast': {
    id: 'fathom.passive.blast',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 20,
          color: GOLD,
          color2: POWDER,
          size: 0.15,
          speed: 6,
          life: 0.35,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'ring', at: 'target', color: GOLD, radius: 1.2, life: 0.3 } },
      { time: 0, op: { t: 'sound', cue: 'powder_blast' } },
      { time: 0, op: { t: 'shake', power: 's' } },
    ],
  },
  'fathom.q.windup': {
    id: 'fathom.q.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'keg_toss', volume: 0.5 } }],
  },
  'fathom.q.cast': {
    id: 'fathom.q.cast',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 14,
          color: POWDER,
          color2: GOLD,
          size: 0.14,
          speed: 5,
          spread: 30,
          life: 0.3,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'light', at: 'self', color: GOLD, intensity: 3, radius: 4, life: 0.12 } },
      { time: 0, op: { t: 'sound', cue: 'aa_cannon_fire' } },
      { time: 0, op: { t: 'shake', power: 's' } },
    ],
  },
  'fathom.q.skip': {
    id: 'fathom.q.skip',
    events: [
      { time: 0, op: { t: 'ring', at: 'origin', color: DUST, radius: 1.1, life: 0.3 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 16,
          color: DUST,
          color2: 0xd8d2c2,
          size: 0.13,
          speed: 4,
          up: 2.5,
          life: 0.4,
          gravity: 9,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'skip_splash' } },
    ],
  },
  'fathom.w.cast': {
    id: 'fathom.w.cast',
    events: [{ time: 0, op: { t: 'sound', cue: 'keg_toss' } }],
  },
  'keg.spawn': {
    id: 'keg.spawn',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 8,
          color: DUST,
          size: 0.1,
          speed: 2.5,
          life: 0.3,
          shape: 'puff',
        },
      },
      { time: 0.05, op: { t: 'sound', cue: 'keg_fuse', volume: 0.6 } },
    ],
  },
  'keg.explode': {
    id: 'keg.explode',
    events: [
      { time: 0, op: { t: 'flash', at: 'self', color: 0xffffff, life: 0.07 } },
      { time: 0, op: { t: 'ring', at: 'self', color: PHYS, radius: 2.2, life: 0.35 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 40,
          color: PHYS,
          color2: POWDER,
          size: 0.2,
          speed: 8,
          up: 3,
          life: 0.5,
          gravity: 6,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 14,
          color: 0x6b4a2f,
          size: 0.16,
          speed: 6,
          up: 4,
          life: 0.6,
          gravity: 10,
          shape: 'shard',
        },
      },
      {
        time: 0,
        op: { t: 'decal', at: 'self', kind: 'scorch', color: 0x3a352c, radius: 1.8, life: 3 },
      },
      { time: 0, op: { t: 'light', at: 'self', color: PHYS, intensity: 4, radius: 6, life: 0.18 } },
      { time: 0, op: { t: 'sound', cue: 'explosion_big' } },
      { time: 0, op: { t: 'shake', power: 'm' } },
    ],
  },
  'fathom.r.cast': {
    id: 'fathom.r.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'ship_horn' } },
      {
        time: 0,
        op: {
          t: 'prop',
          model: 'pirate/ship-ghost',
          at: 'origin',
          scale: 1.15,
          life: 4.6,
          riseFrom: -5,
          sink: true,
          offset: [4.5, 0, 6],
        },
      },
      {
        time: 0.1,
        op: {
          t: 'burst',
          at: 'origin',
          count: 30,
          color: GHOST,
          size: 0.2,
          speed: 2,
          up: 1.5,
          life: 1.2,
          shape: 'puff',
          offset: [4.5, 0, 6],
        },
      },
      { time: 0.9, op: { t: 'sound', cue: 'ship_horn', volume: 0.5 } },
    ],
  },
  'fathom.r.volley': {
    id: 'fathom.r.volley',
    events: [
      { time: 0, op: { t: 'flash', at: 'origin', color: GHOST, life: 0.06 } },
      { time: 0, op: { t: 'ring', at: 'origin', color: PHYS, radius: 1.8, life: 0.3 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 26,
          color: PHYS,
          color2: POWDER,
          size: 0.18,
          speed: 7,
          up: 3.5,
          life: 0.45,
          gravity: 8,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'decal', at: 'origin', kind: 'scorch', color: 0x3a352c, radius: 1.2, life: 2.2 },
      },
      { time: 0, op: { t: 'sound', cue: 'volley_boom' } },
      { time: 0, op: { t: 'shake', power: 's' } },
    ],
  },

  /* ------------------------------ Generic ------------------------------ */
  'generic.hit': {
    id: 'generic.hit',
    events: [
      { time: 0, op: { t: 'flash', at: 'target', color: 0xffffff, life: 0.07 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 6,
          color: 0xfff3d6,
          size: 0.08,
          speed: 3.5,
          life: 0.2,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'hit_generic', volume: 0.5 } },
    ],
  },
  'generic.melee.hit': {
    id: 'generic.melee.hit',
    events: [
      { time: 0, op: { t: 'flash', at: 'target', color: 0xffffff, life: 0.07 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 9,
          color: 0xfff3d6,
          size: 0.1,
          speed: 4,
          life: 0.22,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'rook_q_hit', volume: 0.45 } },
    ],
  },
  'generic.death': {
    id: 'generic.death',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 30,
          color: 0xcfd6e2,
          size: 0.18,
          speed: 5,
          up: 3,
          life: 0.6,
          gravity: 5,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'death_poof' } },
    ],
  },
  'generic.spawn': {
    id: 'generic.spawn',
    events: [
      { time: 0, op: { t: 'ring', at: 'self', color: ALLY, radius: 1.4, life: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 24,
          color: ALLY,
          color2: 0xd6f0ff,
          size: 0.14,
          speed: 3,
          up: 4,
          life: 0.6,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'light', at: 'self', color: ALLY, intensity: 3, radius: 5, life: 0.4 } },
      { time: 0, op: { t: 'sound', cue: 'spawn_beam' } },
    ],
  },
  'generic.levelup': {
    id: 'generic.levelup',
    events: [
      { time: 0, op: { t: 'ring', at: 'self', color: 0xffc24b, radius: 1.5, life: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 26,
          color: 0xffc24b,
          color2: 0xfff3d6,
          size: 0.13,
          speed: 3.5,
          up: 4.5,
          life: 0.7,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'levelup' } },
    ],
  },
  'generic.dummyreset': {
    id: 'generic.dummyreset',
    events: [
      { time: 0, op: { t: 'flash', at: 'self', color: 0xffffff, life: 0.12 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 12,
          color: 0xd6f0ff,
          size: 0.1,
          speed: 3,
          up: 2,
          life: 0.4,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'dummy_reset', volume: 0.6 } },
    ],
  },
};
