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

  /* ------------------------------ Mortis ------------------------------ */
  'mortis.q.windup': {
    id: 'mortis.q.windup',
    events: [
      { time: 0, op: { t: 'sound', cue: 'mortis_q_charge' } },
      { time: 0, op: { t: 'flash', at: 'self', color: 0x8ff0d8, life: 0.14 } },
    ],
  },
  'mortis.q.cast': {
    id: 'mortis.q.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'mortis_q_fire' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 14,
          color: 0x8ff0d8,
          color2: 0x59c9ad,
          size: 0.09,
          speed: 3.2,
          spread: 0.5,
          life: 0.3,
          shape: 'spark',
        },
      },
    ],
  },
  'mortis.w.windup': {
    id: 'mortis.w.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'mortis_w_open' } }],
  },
  'mortis.w.telegraph': {
    id: 'mortis.w.telegraph',
    events: [
      {
        time: 0,
        op: { t: 'decal', at: 'origin', kind: 'crack', color: 0x59c9ad, radius: 2, life: 0.7 },
      },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: 0x8ff0d8, radius: 2, width: 0.12, life: 0.7 },
      },
      {
        time: 0.35,
        op: {
          t: 'burst',
          at: 'origin',
          count: 10,
          color: 0xd8cfae,
          size: 0.07,
          speed: 1.6,
          up: 2.2,
          life: 0.4,
          shape: 'puff',
        },
      },
    ],
  },
  'mortis.w.cast': {
    id: 'mortis.w.cast',
    events: [
      { time: 0.7, op: { t: 'sound', cue: 'mortis_w_erupt' } },
      {
        time: 0.7,
        op: {
          t: 'burst',
          at: 'aim',
          count: 30,
          color: 0xe8e2cf,
          color2: 0x59c9ad,
          size: 0.13,
          speed: 4.2,
          up: 3.4,
          life: 0.55,
          gravity: 8,
          shape: 'shard',
        },
      },
      {
        time: 0.7,
        op: {
          t: 'prop',
          model: 'graveyard/gravestone',
          at: 'aim',
          scale: 0.8,
          life: 0.9,
          riseFrom: -0.7,
          sink: true,
        },
      },
      { time: 0.7, op: { t: 'shake', power: 'm' } },
    ],
  },
  'mortis.r.windup': {
    id: 'mortis.r.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'mortis_r_start' } }],
  },
  'mortis.r.cast': {
    id: 'mortis.r.cast',
    events: [
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: 0x8ff0d8, radius: 4.5, width: 0.16, life: 3 },
      },
      {
        time: 0,
        op: { t: 'light', at: 'self', color: 0x59c9ad, intensity: 2.2, radius: 6, life: 3 },
      },
    ],
  },
  'mortis.r.tick': {
    id: 'mortis.r.tick',
    events: [
      { time: 0, op: { t: 'sound', cue: 'mortis_r_tick', volume: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 12,
          color: 0xe8e2cf,
          color2: 0x8ff0d8,
          size: 0.09,
          speed: 3.6,
          spread: 4.2,
          life: 0.4,
          shape: 'shard',
        },
      },
    ],
  },
  'mortis.passive.brand': {
    id: 'mortis.passive.brand',
    events: [
      { time: 0, op: { t: 'sound', cue: 'mortis_brand', volume: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 8,
          color: 0x8ff0d8,
          size: 0.07,
          speed: 1.6,
          up: 1.8,
          life: 0.3,
          shape: 'spark',
        },
      },
    ],
  },
  'mortis.entrance': {
    id: 'mortis.entrance',
    events: [
      { time: 0, op: { t: 'sound', cue: 'mortis_w_erupt', volume: 0.7 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 20,
          color: 0xb5a98f,
          size: 0.11,
          speed: 3,
          up: 2.6,
          life: 0.5,
          gravity: 7,
          shape: 'puff',
        },
      },
      {
        time: 0,
        op: { t: 'decal', at: 'self', kind: 'crack', color: 0x59c9ad, radius: 1.5, life: 1.2 },
      },
    ],
  },

  /* ------------------------------ Rattle ------------------------------ */
  'rattle.q.windup': {
    id: 'rattle.q.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'rattle_q_draw' } }],
  },
  'rattle.q.cast': {
    id: 'rattle.q.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rattle_q_throw' } },
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'self', color: 0xd8e6f2, radius: 2, angleDeg: 30, life: 0.16 },
      },
    ],
  },
  'rattle.w.cast': {
    id: 'rattle.w.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rattle_dash' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 16,
          color: 0xe8eef5,
          size: 0.08,
          speed: 2.6,
          spread: 1.2,
          life: 0.35,
          shape: 'shard',
        },
      },
    ],
  },
  'rattle.skull.place': {
    id: 'rattle.skull.place',
    events: [{ time: 0, op: { t: 'sound', cue: 'rattle_bones', volume: 0.7 } }],
  },
  'rattle.skull.return.out': {
    id: 'rattle.skull.return.out',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rattle_return' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 18,
          color: 0xe8eef5,
          size: 0.09,
          speed: 4.5,
          spread: 0.8,
          life: 0.3,
          shape: 'shard',
        },
      },
    ],
  },
  'rattle.skull.return.in': {
    id: 'rattle.skull.return.in',
    events: [
      { time: 0, op: { t: 'flash', at: 'self', color: 0xd8e6f2, life: 0.14 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 14,
          color: 0xe8eef5,
          size: 0.08,
          speed: 2.2,
          spread: 0.6,
          life: 0.28,
          shape: 'shard',
        },
      },
    ],
  },
  'rattle.r.cast': {
    id: 'rattle.r.cast',
    events: [{ time: 0, op: { t: 'flash', at: 'self', color: 0xd8e6f2, life: 0.1 } }],
  },
  'rattle.r.vanish': {
    id: 'rattle.r.vanish',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rattle_r_vanish' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 20,
          color: 0xd8e6f2,
          size: 0.08,
          speed: 3.4,
          spread: 0.7,
          life: 0.3,
          shape: 'shard',
        },
      },
    ],
  },
  'rattle.r.strike': {
    id: 'rattle.r.strike',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rattle_r_strike' } },
      {
        time: 0,
        op: {
          t: 'ribbonSweep',
          at: 'target',
          color: 0xffffff,
          radius: 1.4,
          angleDeg: 140,
          life: 0.18,
        },
      },
      { time: 0, op: { t: 'hitstop', ms: 70 } },
      { time: 0, op: { t: 'shake', power: 'm' } },
    ],
  },
  'rattle.r.confirm': {
    id: 'rattle.r.confirm',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rattle_r_confirm' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 22,
          color: 0xffffff,
          color2: 0xd8e6f2,
          size: 0.1,
          speed: 4.2,
          up: 2.4,
          life: 0.45,
          shape: 'shard',
        },
      },
    ],
  },
  'rattle.passive.shards': {
    id: 'rattle.passive.shards',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 6,
          color: 0xe8eef5,
          size: 0.07,
          speed: 1.8,
          up: 1.4,
          life: 0.5,
          gravity: 6,
          shape: 'shard',
        },
      },
    ],
  },
  'rattle.passive.consume': {
    id: 'rattle.passive.consume',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rattle_bones', volume: 0.8 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 10,
          color: 0xe8eef5,
          size: 0.08,
          speed: 2.8,
          life: 0.3,
          shape: 'shard',
        },
      },
    ],
  },

  /* ------------------------------ Grukk ------------------------------ */
  'grukk.q.windup': {
    id: 'grukk.q.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'grukk_q_lunge' } }],
  },
  'grukk.q.cast': {
    id: 'grukk.q.cast',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 12,
          color: 0xb5a98f,
          size: 0.1,
          speed: 2.4,
          spread: 0.8,
          life: 0.35,
          shape: 'puff',
        },
      },
      { time: 0.12, op: { t: 'flash', at: 'aim', color: 0xffd077, life: 0.1 } },
    ],
  },
  'grukk.w.windup': {
    id: 'grukk.w.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'grukk_w_inhale', volume: 0.7 } }],
  },
  'grukk.w.cast': {
    id: 'grukk.w.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'grukk_w_roar' } },
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'self', color: 0x7fae52, radius: 4, angleDeg: 70, life: 0.3 },
      },
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: 0xb5a98f, radius: 2.2, width: 0.2, life: 0.35 },
      },
      { time: 0, op: { t: 'shake', power: 's' } },
    ],
  },
  'grukk.r.windup': {
    id: 'grukk.r.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'grukk_r_lift', volume: 0.7 } }],
  },
  'grukk.r.cast': {
    id: 'grukk.r.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'grukk_r_slam' } },
      {
        time: 0,
        op: { t: 'decal', at: 'aim', kind: 'crack', color: 0x8a6f4c, radius: 1.5, life: 6 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'aim',
          count: 24,
          color: 0xb5a98f,
          color2: 0x8a6f4c,
          size: 0.12,
          speed: 3.8,
          up: 2.8,
          life: 0.5,
          gravity: 8,
          shape: 'shard',
        },
      },
      { time: 0, op: { t: 'shake', power: 'l' } },
      { time: 0, op: { t: 'hitstop', ms: 60 } },
    ],
  },
  'grukk.r.recast': {
    id: 'grukk.r.recast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'grukk_r_slam' } },
      {
        time: 0,
        op: { t: 'decal', at: 'aim', kind: 'crack', color: 0x8a6f4c, radius: 1.5, life: 6 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'aim',
          count: 24,
          color: 0xb5a98f,
          color2: 0x8a6f4c,
          size: 0.12,
          speed: 3.8,
          up: 2.8,
          life: 0.5,
          gravity: 8,
          shape: 'shard',
        },
      },
      { time: 0, op: { t: 'shake', power: 'l' } },
    ],
  },
  'grukk.entrance': {
    id: 'grukk.entrance',
    events: [
      { time: 0, op: { t: 'sound', cue: 'grukk_w_roar', volume: 0.5 } },
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: 0xffd077, radius: 2.5, width: 0.14, life: 0.8 },
      },
    ],
  },

  /* ------------------------------ Sylva ------------------------------ */
  'sylva.q.windup': {
    id: 'sylva.q.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'sylva_q_flick', volume: 0.8 } }],
  },
  'sylva.q.cast': {
    id: 'sylva.q.cast',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 10,
          color: 0xf2a5c8,
          color2: 0x8ade6a,
          size: 0.07,
          speed: 2,
          spread: 0.5,
          life: 0.3,
          shape: 'spark',
        },
      },
    ],
  },
  'sylva.w.windup': {
    id: 'sylva.w.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'sylva_w_plant', volume: 0.8 } }],
  },
  'sylva.w.cast': {
    id: 'sylva.w.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'sylva_w_grow' } },
      { time: 0, op: { t: 'ring', at: 'aim', color: 0x8ade6a, radius: 2.2, width: 0.14, life: 3 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'aim',
          count: 18,
          color: 0x8ade6a,
          color2: 0xf2a5c8,
          size: 0.08,
          speed: 1.6,
          up: 1.8,
          spread: 2,
          life: 0.6,
          shape: 'puff',
        },
      },
      {
        time: 0,
        op: { t: 'light', at: 'aim', color: 0x9de07a, intensity: 1.6, radius: 4, life: 3 },
      },
    ],
  },
  'sylva.r.windup': {
    id: 'sylva.r.windup',
    events: [
      { time: 0, op: { t: 'sound', cue: 'sylva_r_gather' } },
      { time: 0, op: { t: 'flash', at: 'self', color: 0x8ade6a, life: 0.4 } },
    ],
  },
  'sylva.r.cast': {
    id: 'sylva.r.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'sylva_r_lash' } },
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'self', color: 0x8ade6a, radius: 6, angleDeg: 60, life: 0.35 },
      },
      {
        time: 0.1,
        op: {
          t: 'burst',
          at: 'self',
          count: 30,
          color: 0x8ade6a,
          color2: 0x5c9c43,
          size: 0.1,
          speed: 5,
          spread: 3,
          life: 0.5,
          shape: 'shard',
        },
      },
      { time: 0, op: { t: 'shake', power: 's' } },
    ],
  },
  'sylva.flower.plant': {
    id: 'sylva.flower.plant',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 5,
          color: 0xf2a5c8,
          size: 0.06,
          speed: 1,
          up: 1.2,
          life: 0.35,
          shape: 'puff',
        },
      },
    ],
  },
  'sylva.flower.bloom': {
    id: 'sylva.flower.bloom',
    events: [
      { time: 0, op: { t: 'sound', cue: 'sylva_bloom', volume: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 14,
          color: 0xf2a5c8,
          color2: 0xffffff,
          size: 0.08,
          speed: 2.4,
          up: 2,
          life: 0.45,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: 0x8ade6a, radius: 2, width: 0.1, life: 0.4 },
      },
    ],
  },

  /* --------------------------- Bridge structures --------------------------- */
  'tower.fire': {
    id: 'tower.fire',
    events: [
      { time: 0, op: { t: 'sound', cue: 'tower_fire', volume: 0.7 } },
      { time: 0, op: { t: 'flash', at: 'origin', color: 0xffc72e, life: 0.1 } },
    ],
  },
  'structure.death': {
    id: 'structure.death',
    events: [
      { time: 0, op: { t: 'sound', cue: 'structure_fall' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 40,
          color: 0xc7cdd9,
          color2: 0x8a94a6,
          size: 0.16,
          speed: 5,
          up: 3.5,
          life: 0.8,
          gravity: 9,
          shape: 'shard',
        },
      },
      { time: 0, op: { t: 'shake', power: 'l' } },
      { time: 0, op: { t: 'hitstop', ms: 90 } },
    ],
  },
  'core.exposed': {
    id: 'core.exposed',
    events: [
      { time: 0, op: { t: 'sound', cue: 'core_exposed' } },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: 0xff5a3c, radius: 3, width: 0.2, life: 0.9 },
      },
    ],
  },
  'core.pulse': {
    id: 'core.pulse',
    events: [
      { time: 0, op: { t: 'sound', cue: 'core_pulse', volume: 0.6 } },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: 0x9fe8ff, radius: 8, width: 0.25, life: 0.5 },
      },
    ],
  },
  'core.destroyed': {
    id: 'core.destroyed',
    events: [
      { time: 0, op: { t: 'sound', cue: 'core_destroyed' } },
      { time: 0, op: { t: 'flash', at: 'origin', color: 0xffffff, life: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 60,
          color: 0x9fe8ff,
          color2: 0xffc72e,
          size: 0.2,
          speed: 7,
          up: 4,
          life: 1.2,
          gravity: 6,
          shape: 'shard',
        },
      },
      { time: 0, op: { t: 'shake', power: 'l' } },
      { time: 0, op: { t: 'hitstop', ms: 140 } },
    ],
  },
  'core.overtime': {
    id: 'core.overtime',
    events: [
      { time: 0, op: { t: 'sound', cue: 'overtime_horn' } },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: 0xff5a3c, radius: 4, width: 0.25, life: 1.2 },
      },
    ],
  },
  'barrier.drop': {
    id: 'barrier.drop',
    events: [
      { time: 0, op: { t: 'sound', cue: 'barrier_drop', volume: 0.8 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 24,
          color: 0x9fe8ff,
          size: 0.1,
          speed: 3,
          spread: 6,
          life: 0.5,
          shape: 'spark',
        },
      },
    ],
  },
  'wave.spawn': {
    id: 'wave.spawn',
    events: [{ time: 0, op: { t: 'sound', cue: 'wave_horn', volume: 0.45 } }],
  },
  'orb.spawn': {
    id: 'orb.spawn',
    events: [
      { time: 0, op: { t: 'sound', cue: 'orb_spawn', volume: 0.6 } },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: 0x6fe0a8, radius: 1, width: 0.1, life: 0.6 },
      },
    ],
  },
  'orb.pickup': {
    id: 'orb.pickup',
    events: [
      { time: 0, op: { t: 'sound', cue: 'orb_pickup' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 16,
          color: 0x6fe0a8,
          color2: 0xffffff,
          size: 0.09,
          speed: 2.6,
          up: 2.4,
          life: 0.4,
          shape: 'spark',
        },
      },
    ],
  },
  'mini.zap.fire': {
    id: 'mini.zap.fire',
    events: [{ time: 0, op: { t: 'sound', cue: 'mini_zap', volume: 0.35 } }],
  },
  'mini.bruiser.death': {
    id: 'mini.bruiser.death',
    events: [
      { time: 0, op: { t: 'sound', cue: 'mini_pop', volume: 0.4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 12,
          color: 0xd8dde8,
          color2: 0x8a94a6,
          size: 0.11,
          speed: 3,
          up: 2.6,
          life: 0.45,
          gravity: 8,
          shape: 'shard',
        },
      },
    ],
  },
  'mini.zapper.death': {
    id: 'mini.zapper.death',
    events: [
      { time: 0, op: { t: 'sound', cue: 'mini_pop', volume: 0.4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 14,
          color: 0x9fe8ff,
          color2: 0xffffff,
          size: 0.09,
          speed: 3.2,
          up: 2.4,
          life: 0.4,
          shape: 'spark',
        },
      },
    ],
  },
  'mini.ram.death': {
    id: 'mini.ram.death',
    events: [
      { time: 0, op: { t: 'sound', cue: 'mini_pop', volume: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 22,
          color: 0xa9773f,
          color2: 0x6e4a24,
          size: 0.15,
          speed: 4,
          up: 3,
          life: 0.6,
          gravity: 9,
          shape: 'shard',
        },
      },
      { time: 0, op: { t: 'shake', power: 's' } },
      {
        time: 0.02,
        op: { t: 'prop', at: 'origin', model: 'castle/siege-ram-broken', scale: 1, life: 1.4 },
      },
    ],
  },
  'mini.melee.hit': {
    id: 'mini.melee.hit',
    events: [{ time: 0, op: { t: 'sound', cue: 'mini_thump', volume: 0.3 } }],
  },
  'item.nullwave': {
    id: 'item.nullwave',
    events: [
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: 0x9fe8ff, radius: 0.9, width: 0.08, life: 0.4 },
      },
    ],
  },
  'item.dragonfang': {
    id: 'item.dragonfang',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 8,
          color: 0xffa13b,
          size: 0.08,
          speed: 2.4,
          life: 0.3,
          shape: 'spark',
        },
      },
    ],
  },
  'relic.blink.out': {
    id: 'relic.blink.out',
    events: [
      { time: 0, op: { t: 'sound', cue: 'relic_blink' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 14,
          color: 0x9fe8ff,
          size: 0.09,
          speed: 2.6,
          life: 0.3,
          shape: 'spark',
        },
      },
    ],
  },
  'relic.blink.in': {
    id: 'relic.blink.in',
    events: [{ time: 0, op: { t: 'flash', at: 'self', color: 0x9fe8ff, life: 0.15 } }],
  },
  'relic.purge': {
    id: 'relic.purge',
    events: [
      { time: 0, op: { t: 'sound', cue: 'relic_purge' } },
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: 0xffffff, radius: 1.2, width: 0.12, life: 0.4 },
      },
    ],
  },
  'relic.ember': {
    id: 'relic.ember',
    events: [
      { time: 0, op: { t: 'sound', cue: 'relic_ember' } },
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'self', color: 0xff7a3c, radius: 4, angleDeg: 70, life: 0.3 },
      },
    ],
  },
  'relic.horn': {
    id: 'relic.horn',
    events: [
      { time: 0, op: { t: 'sound', cue: 'relic_horn' } },
      { time: 0, op: { t: 'ring', at: 'self', color: 0x3ba7ff, radius: 6, width: 0.2, life: 0.6 } },
    ],
  },
};
