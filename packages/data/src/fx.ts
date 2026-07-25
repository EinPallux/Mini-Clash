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
const ELEC = 0x8fd8ff; // Boltz tesla blue
const CHILL = 0x9fd8ff; // Wisp chill
const GHOSTC = 0xbfe8ff; // Wisp spook-white
const VOID = 0x8a5fb0; // Wisp curse purple
const FOX = 0xe8944a; // Chomp orange
const SNACK = 0xf2c46a; // Piper's snacks
const CRIMSON = 0xb0304a; // Vex blood
const PETAL = 0xff6f8a; // Vex rose petals
const AUG_SILVER = 0xc6d2e0; // Power Surge rarities
const AUG_GOLD = 0xffc23c;
const AUG_PRISM_A = 0xff6fd8;
const AUG_PRISM_B = 0x6ee6ff;

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
  /** Tag Swap morph (GAME_DESIGN §7.2): puff out, chime in — 0.35 s total. */
  'duo.swap': {
    id: 'duo.swap',
    events: [
      { time: 0, op: { t: 'sound', cue: 'duo_swap', volume: 0.8 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 22,
          color: 0xffffff,
          color2: 0xffc72e,
          size: 0.13,
          speed: 3.4,
          up: 2.2,
          life: 0.4,
          shape: 'puff',
        },
      },
      { time: 0.16, op: { t: 'ring', at: 'self', color: 0xffc72e, radius: 1.5, life: 0.35 } },
      {
        time: 0.18,
        op: { t: 'light', at: 'self', color: 0xffc72e, intensity: 2.4, radius: 4, life: 0.3 },
      },
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

  /* ------------------------------ Boltz ------------------------------ */
  'boltz.aa.fire': {
    id: 'boltz.aa.fire',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_aa', volume: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 6,
          color: ELEC,
          size: 0.08,
          speed: 4.5,
          spread: 18,
          life: 0.16,
          shape: 'spark',
        },
      },
    ],
  },
  'boltz.aa.hit': {
    id: 'boltz.aa.hit',
    events: [
      { time: 0, op: { t: 'flash', at: 'target', color: ELEC, life: 0.07 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 7,
          color: ELEC,
          color2: 0xffffff,
          size: 0.08,
          speed: 3.6,
          life: 0.2,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'boltz_zap_hit', volume: 0.55 } },
    ],
  },
  'boltz.passive.charge': {
    // Capacitor primed: the chained shot cracks between targets.
    id: 'boltz.passive.charge',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_charge', volume: 0.7 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 12,
          color: ELEC,
          color2: 0xffffff,
          size: 0.1,
          speed: 5,
          up: 1.4,
          life: 0.3,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'ring', at: 'target', color: ELEC, radius: 1, width: 0.1, life: 0.28 } },
    ],
  },
  'boltz.q.windup': {
    id: 'boltz.q.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'boltz_charge', volume: 0.5 } }],
  },
  'boltz.q.cast': {
    id: 'boltz.q.cast',
    events: [{ time: 0, op: { t: 'flash', at: 'self', color: ELEC, life: 0.08 } }],
  },
  'boltz.q.beam': {
    id: 'boltz.q.beam',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_zap' } },
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'self', color: ELEC, radius: 6, angleDeg: 12, life: 0.18 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 18,
          color: ELEC,
          color2: 0xffffff,
          size: 0.1,
          speed: 8,
          spread: 8,
          life: 0.25,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'light', at: 'self', color: ELEC, intensity: 2.6, radius: 5, life: 0.14 },
      },
      { time: 0.02, op: { t: 'shake', power: 's' } },
    ],
  },
  'boltz.w.cast': {
    id: 'boltz.w.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_dome_up' } },
      { time: 0, op: { t: 'ring', at: 'aim', color: ELEC, radius: 2.5, width: 0.16, life: 2.5 } },
      {
        time: 0,
        op: { t: 'light', at: 'aim', color: ELEC, intensity: 1.8, radius: 5, life: 0.4 },
      },
    ],
  },
  'boltz.dome.block': {
    // A projectile pops on the shell — the signature zap.
    id: 'boltz.dome.block',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_dome_pop', volume: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 8,
          color: ELEC,
          color2: 0xffffff,
          size: 0.09,
          speed: 4,
          life: 0.22,
          shape: 'spark',
        },
      },
    ],
  },
  'boltz.r.windup': {
    id: 'boltz.r.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'boltz_pod_warn', volume: 0.7 } }],
  },
  'boltz.r.cast': {
    id: 'boltz.r.cast',
    events: [{ time: 0, op: { t: 'flash', at: 'self', color: ELEC, life: 0.1 } }],
  },
  'boltz.r.telegraph': {
    id: 'boltz.r.telegraph',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_pod_warn' } },
      {
        time: 0,
        op: { t: 'decal', at: 'aim', kind: 'scorch', color: 0xff7a3c, radius: 2.5, life: 1.3 },
      },
      {
        time: 0,
        op: { t: 'ring', at: 'aim', color: 0xff7a3c, radius: 2.5, width: 0.16, life: 1.2 },
      },
    ],
  },
  'boltz.r.impact': {
    id: 'boltz.r.impact',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_pod_land' } },
      { time: 0, op: { t: 'flash', at: 'aim', color: 0xffffff, life: 0.08 } },
      { time: 0, op: { t: 'ring', at: 'aim', color: 0xffb14b, radius: 2.5, life: 0.4 } },
      // The pod body itself belongs to the zone actor (it has to survive the full
      // 4 s bunker and launch away) — a prop here would render a second one.
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'aim',
          count: 40,
          color: 0xffb14b,
          color2: DUST,
          size: 0.2,
          speed: 8,
          up: 3,
          life: 0.6,
          gravity: 8,
          shape: 'shard',
        },
      },
      {
        time: 0,
        op: { t: 'decal', at: 'aim', kind: 'scorch', color: 0x3a352c, radius: 2.5, life: 4 },
      },
      {
        time: 0,
        op: { t: 'light', at: 'aim', color: 0xffb14b, intensity: 4, radius: 7, life: 0.2 },
      },
      { time: 0, op: { t: 'shake', power: 'l' } },
      { time: 0, op: { t: 'hitstop', ms: 60 } },
    ],
  },
  'boltz.pod.launch': {
    id: 'boltz.pod.launch',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_pod_launch' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 26,
          color: 0xffb14b,
          color2: DUST,
          size: 0.16,
          speed: 5,
          up: 5,
          life: 0.7,
          gravity: 3,
          shape: 'puff',
        },
      },
      {
        time: 0,
        op: { t: 'light', at: 'origin', color: 0xffb14b, intensity: 2.4, radius: 5, life: 0.4 },
      },
    ],
  },
  'boltz.entrance': {
    id: 'boltz.entrance',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_hop', volume: 0.7 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 12,
          color: ELEC,
          color2: 0xffffff,
          size: 0.1,
          speed: 3,
          up: 2,
          life: 0.4,
          shape: 'spark',
        },
      },
    ],
  },

  /* ------------------------------ Wisp ------------------------------ */
  'wisp.aa.fire': {
    id: 'wisp.aa.fire',
    events: [{ time: 0, op: { t: 'sound', cue: 'wisp_aa', volume: 0.5 } }],
  },
  'wisp.aa.hit': {
    id: 'wisp.aa.hit',
    events: [
      { time: 0, op: { t: 'flash', at: 'target', color: GHOSTC, life: 0.07 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 6,
          color: GHOSTC,
          size: 0.08,
          speed: 3,
          life: 0.22,
          shape: 'spark',
        },
      },
      { time: 0, op: { t: 'sound', cue: 'wisp_aa_hit', volume: 0.45 } },
    ],
  },
  'wisp.passive.chill': {
    id: 'wisp.passive.chill',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_chill', volume: 0.4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 8,
          color: CHILL,
          color2: 0xffffff,
          size: 0.08,
          speed: 1.6,
          up: 1.6,
          life: 0.4,
          shape: 'puff',
        },
      },
    ],
  },
  'wisp.q.windup': {
    id: 'wisp.q.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'wisp_boo_charge', volume: 0.5 } }],
  },
  'wisp.q.cast': {
    id: 'wisp.q.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_boo' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 12,
          color: GHOSTC,
          color2: 0xffffff,
          size: 0.09,
          speed: 3.2,
          spread: 0.6,
          life: 0.3,
          shape: 'puff',
        },
      },
    ],
  },
  'wisp.w.cast': {
    id: 'wisp.w.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_slip' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 16,
          color: GHOSTC,
          size: 0.1,
          speed: 3,
          spread: 4,
          life: 0.35,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'flash', at: 'self', color: 0xffffff, life: 0.12 } },
    ],
  },
  'wisp.decoy.place': {
    id: 'wisp.decoy.place',
    events: [{ time: 0, op: { t: 'sound', cue: 'wisp_slip', volume: 0.4 } }],
  },
  'wisp.decoy.break': {
    id: 'wisp.decoy.break',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_aa_hit', volume: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 18,
          color: 0xe8f2ff,
          size: 0.12,
          speed: 3.4,
          up: 1.6,
          life: 0.4,
          shape: 'puff',
        },
      },
    ],
  },
  'wisp.r.windup': {
    id: 'wisp.r.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'wisp_curse_start', volume: 0.7 } }],
  },
  'wisp.r.cast': {
    id: 'wisp.r.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_curse' } },
      { time: 0, op: { t: 'ring', at: 'aim', color: VOID, radius: 3, width: 0.18, life: 4 } },
      {
        time: 0,
        op: { t: 'decal', at: 'aim', kind: 'scorch', color: 0x2a1f38, radius: 3, life: 4 },
      },
      {
        time: 0,
        op: { t: 'light', at: 'aim', color: VOID, intensity: 1.8, radius: 6, life: 4 },
      },
    ],
  },
  'wisp.r.tick': {
    id: 'wisp.r.tick',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_curse_tick', volume: 0.4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 10,
          color: VOID,
          color2: CHILL,
          size: 0.09,
          speed: 2,
          up: 2.4,
          spread: 3,
          life: 0.5,
          shape: 'puff',
        },
      },
    ],
  },
  'wisp.r.gong': {
    // The midnight gong: everyone left inside is Feared away.
    id: 'wisp.r.gong',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_gong' } },
      { time: 0, op: { t: 'ring', at: 'origin', color: VOID, radius: 3, width: 0.24, life: 0.7 } },
      { time: 0, op: { t: 'shake', power: 'm' } },
    ],
  },
  'wisp.fear': {
    id: 'wisp.fear',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 10,
          color: VOID,
          color2: 0xffffff,
          size: 0.09,
          speed: 2.4,
          up: 2,
          life: 0.4,
          shape: 'spark',
        },
      },
    ],
  },
  'wisp.entrance': {
    id: 'wisp.entrance',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_chill', volume: 0.6 } },
      { time: 0, op: { t: 'ring', at: 'self', color: CHILL, radius: 1.5, width: 0.12, life: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 14,
          color: CHILL,
          color2: 0xffffff,
          size: 0.1,
          speed: 2.6,
          up: 1.8,
          life: 0.45,
          shape: 'puff',
        },
      },
    ],
  },

  /* ------------------------------ Piper ------------------------------ */
  'piper.pet.nip': {
    id: 'piper.pet.nip',
    events: [
      { time: 0, op: { t: 'sound', cue: 'piper_nip', volume: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 7,
          color: FOX,
          color2: 0xffffff,
          size: 0.08,
          speed: 3,
          life: 0.22,
          shape: 'spark',
        },
      },
    ],
  },
  'piper.pet.empowered': {
    id: 'piper.pet.empowered',
    events: [
      { time: 0, op: { t: 'sound', cue: 'piper_chomp', volume: 0.7 } },
      { time: 0, op: { t: 'ring', at: 'target', color: FOX, radius: 1.1, life: 0.3 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 16,
          color: FOX,
          color2: SNACK,
          size: 0.12,
          speed: 4.4,
          up: 1.6,
          life: 0.35,
          shape: 'spark',
        },
      },
    ],
  },
  'piper.q.windup': {
    id: 'piper.q.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'piper_whistle_short', volume: 0.6 } }],
  },
  'piper.q.cast': {
    id: 'piper.q.cast',
    events: [{ time: 0, op: { t: 'sound', cue: 'piper_fetch' } }],
  },
  'piper.q.dash': {
    id: 'piper.q.dash',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 10,
          color: DUST,
          size: 0.1,
          speed: 2.6,
          spread: 40,
          life: 0.3,
          shape: 'puff',
        },
      },
    ],
  },
  'piper.q.steal': {
    id: 'piper.q.steal',
    events: [
      { time: 0, op: { t: 'sound', cue: 'piper_snack_grab', volume: 0.7 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 12,
          color: SNACK,
          color2: 0xffffff,
          size: 0.1,
          speed: 3,
          up: 2,
          life: 0.4,
          shape: 'spark',
        },
      },
    ],
  },
  'piper.w.cast': {
    id: 'piper.w.cast',
    events: [{ time: 0, op: { t: 'sound', cue: 'piper_toss', volume: 0.7 } }],
  },
  'piper.w.toss': {
    id: 'piper.w.toss',
    events: [{ time: 0, op: { t: 'ring', at: 'origin', color: SNACK, radius: 0.7, life: 0.3 } }],
  },
  'piper.w.eaten': {
    id: 'piper.w.eaten',
    events: [
      { time: 0, op: { t: 'sound', cue: 'piper_crunch' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 16,
          color: 0xff86b0,
          color2: SNACK,
          size: 0.1,
          speed: 2.6,
          up: 2.2,
          life: 0.45,
          shape: 'spark',
        },
      },
    ],
  },
  'piper.w.foxtax': {
    id: 'piper.w.foxtax',
    events: [
      { time: 0, op: { t: 'sound', cue: 'piper_crunch', volume: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 10,
          color: FOX,
          size: 0.09,
          speed: 2,
          up: 1.6,
          life: 0.4,
          shape: 'puff',
        },
      },
    ],
  },
  'piper.r.windup': {
    id: 'piper.r.windup',
    events: [
      { time: 0, op: { t: 'sound', cue: 'piper_whistle' } },
      { time: 0.35, op: { t: 'shake', power: 's' } },
    ],
  },
  'piper.r.cast': {
    id: 'piper.r.cast',
    events: [{ time: 0, op: { t: 'sound', cue: 'piper_rumble' } }],
  },
  'piper.r.wave': {
    // One wave of the menagerie: a dust wall and a lot of hooves.
    id: 'piper.r.wave',
    events: [
      { time: 0, op: { t: 'sound', cue: 'piper_stampede' } },
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'self', color: DUST, radius: 8, angleDeg: 55, life: 0.4 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 34,
          color: DUST,
          color2: 0xd8c8a8,
          size: 0.18,
          speed: 7,
          spread: 55,
          up: 2.4,
          life: 0.55,
          gravity: 7,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'shake', power: 'm' } },
    ],
  },
  'piper.entrance': {
    id: 'piper.entrance',
    events: [
      { time: 0, op: { t: 'sound', cue: 'piper_yip', volume: 0.7 } },
      { time: 0, op: { t: 'ring', at: 'self', color: FOX, radius: 1.6, width: 0.1, life: 0.5 } },
    ],
  },

  /* ------------------------------- Vex ------------------------------- */
  'vex.q.windup': {
    id: 'vex.q.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'vex_lash_wind', volume: 0.6 } }],
  },
  'vex.q.cast': {
    id: 'vex.q.cast',
    events: [{ time: 0, op: { t: 'flash', at: 'self', color: CRIMSON, life: 0.08 } }],
  },
  'vex.q.lash': {
    id: 'vex.q.lash',
    events: [
      { time: 0, op: { t: 'sound', cue: 'vex_lash' } },
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'self', color: CRIMSON, radius: 4, angleDeg: 22, life: 0.2 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 18,
          color: CRIMSON,
          color2: PETAL,
          size: 0.11,
          speed: 6,
          spread: 20,
          life: 0.4,
          gravity: 3,
          shape: 'shard',
        },
      },
    ],
  },
  'vex.q.lunge': {
    id: 'vex.q.lunge',
    events: [
      { time: 0, op: { t: 'sound', cue: 'vex_lunge', volume: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 10,
          color: CRIMSON,
          size: 0.09,
          speed: 3.4,
          life: 0.25,
          shape: 'shard',
        },
      },
    ],
  },
  'vex.w.cast': {
    id: 'vex.w.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'vex_bats' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 26,
          color: 0x2a1420,
          color2: CRIMSON,
          size: 0.13,
          speed: 4,
          up: 2.4,
          spread: 360,
          life: 0.5,
          shape: 'shard',
        },
      },
    ],
  },
  'vex.r.windup': {
    id: 'vex.r.windup',
    events: [{ time: 0, op: { t: 'sound', cue: 'vex_goblet', volume: 0.7 } }],
  },
  'vex.r.cast': {
    id: 'vex.r.cast',
    events: [
      { time: 0, op: { t: 'sound', cue: 'vex_banquet' } },
      { time: 0, op: { t: 'ring', at: 'self', color: CRIMSON, radius: 4, width: 0.2, life: 3 } },
      {
        time: 0,
        op: { t: 'decal', at: 'self', kind: 'scorch', color: 0x59101f, radius: 4, life: 3 },
      },
      {
        time: 0,
        op: { t: 'light', at: 'self', color: CRIMSON, intensity: 2.2, radius: 6, life: 1.2 },
      },
    ],
  },
  'vex.r.invite': {
    id: 'vex.r.invite',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 14,
          color: CRIMSON,
          color2: PETAL,
          size: 0.1,
          speed: 2.4,
          up: 2.6,
          life: 0.6,
          shape: 'spark',
        },
      },
    ],
  },
  'vex.r.guest': {
    id: 'vex.r.guest',
    events: [
      { time: 0, op: { t: 'sound', cue: 'vex_goblet' } },
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: PETAL, radius: 1.4, width: 0.12, life: 0.45 },
      },
    ],
  },
  'vex.passive.drain': {
    id: 'vex.passive.drain',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 6,
          color: CRIMSON,
          size: 0.08,
          speed: 1.4,
          up: 2.2,
          life: 0.4,
          shape: 'spark',
        },
      },
    ],
  },
  'vex.entrance': {
    id: 'vex.entrance',
    events: [
      { time: 0, op: { t: 'sound', cue: 'vex_bats', volume: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 16,
          color: 0x2a1420,
          color2: CRIMSON,
          size: 0.11,
          speed: 3,
          up: 2,
          life: 0.5,
          shape: 'puff',
        },
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
  /* ----------------------------- Augments -----------------------------
   * Pick flourishes (AUGMENTS §1). Rarity escalates the *whole* moment —
   * colour, ring count, particle mass and camera — so a prismatic reads from
   * across the bridge without anyone having to look at the dock.
   */
  'augment.silver': {
    id: 'augment.silver',
    events: [
      { time: 0, op: { t: 'sound', cue: 'augment_take', volume: 0.7 } },
      { time: 0, op: { t: 'flash', at: 'self', color: AUG_SILVER, life: 0.1 } },
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: AUG_SILVER, radius: 1.5, width: 0.1, life: 0.45 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 16,
          color: AUG_SILVER,
          color2: 0xffffff,
          size: 0.11,
          speed: 3.2,
          up: 3,
          life: 0.5,
          shape: 'spark',
        },
      },
    ],
  },
  'augment.gold': {
    id: 'augment.gold',
    events: [
      { time: 0, op: { t: 'sound', cue: 'augment_take' } },
      { time: 0, op: { t: 'flash', at: 'self', color: 0xffffff, life: 0.09 } },
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: AUG_GOLD, radius: 1.9, width: 0.14, life: 0.55 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 30,
          color: AUG_GOLD,
          color2: 0xfff3d6,
          size: 0.13,
          speed: 4.2,
          up: 4.5,
          life: 0.65,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'light', at: 'self', color: AUG_GOLD, intensity: 2.6, radius: 5, life: 0.4 },
      },
      { time: 0, op: { t: 'shake', power: 's' } },
      {
        time: 0.16,
        op: { t: 'ring', at: 'self', color: AUG_GOLD, radius: 2.8, width: 0.09, life: 0.45 },
      },
    ],
  },
  'augment.prismatic': {
    id: 'augment.prismatic',
    events: [
      { time: 0, op: { t: 'sound', cue: 'augment_prismatic' } },
      { time: 0, op: { t: 'flash', at: 'self', color: 0xffffff, life: 0.12 } },
      { time: 0, op: { t: 'hitstop', ms: 45 } },
      { time: 0, op: { t: 'shake', power: 'm' } },
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: AUG_PRISM_A, radius: 2.2, width: 0.18, life: 0.6 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 52,
          color: AUG_PRISM_A,
          color2: AUG_PRISM_B,
          size: 0.15,
          speed: 5.5,
          up: 6,
          life: 0.9,
          gravity: 3,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'light', at: 'self', color: AUG_PRISM_A, intensity: 3.6, radius: 7, life: 0.5 },
      },
      // Two more rings chase outward: the tell that this one was the chase card.
      {
        time: 0.14,
        op: { t: 'ring', at: 'self', color: AUG_PRISM_B, radius: 3.4, width: 0.14, life: 0.55 },
      },
      {
        time: 0.28,
        op: { t: 'ring', at: 'self', color: AUG_GOLD, radius: 4.6, width: 0.1, life: 0.5 },
      },
      {
        time: 0.3,
        op: {
          t: 'burst',
          at: 'self',
          count: 24,
          color: AUG_PRISM_B,
          color2: 0xffffff,
          size: 0.1,
          speed: 2.4,
          up: 5,
          life: 1.1,
          gravity: 1.5,
          shape: 'puff',
        },
      },
      {
        time: 0.34,
        op: { t: 'light', at: 'self', color: AUG_PRISM_B, intensity: 2, radius: 6, life: 0.5 },
      },
    ],
  },
  /** Chain Shot's filament arcing to a second target (generic `onBasic` rider). */
  'augment.chain': {
    id: 'augment.chain',
    events: [
      { time: 0, op: { t: 'sound', cue: 'boltz_zap_hit', volume: 0.45 } },
      { time: 0, op: { t: 'flash', at: 'target', color: AUG_PRISM_B, life: 0.06 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 9,
          color: AUG_PRISM_B,
          color2: 0xffffff,
          size: 0.08,
          speed: 3.6,
          life: 0.22,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'ring', at: 'target', color: AUG_PRISM_B, radius: 0.8, width: 0.07, life: 0.24 },
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
