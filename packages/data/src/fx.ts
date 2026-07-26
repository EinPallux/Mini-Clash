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
const OBJECTIVE = 0xffc24b; // Living Bridge amber (ART_DIRECTION §3: golem, orbs, coins)
const ISLE = 0x7fd4ff; // Flank Isle light-bridge cyan
const STORM = 0xbfe4ff; // Storm Front lightning

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

  /* ---- Augment behaviours: every card has to show itself (§1 mandate) ---- */
  'augment.wall.block': {
    id: 'augment.wall.block',
    events: [
      { time: 0, op: { t: 'sound', cue: 'block_clang', volume: 0.4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 10,
          color: STONE,
          color2: DUST,
          size: 0.1,
          speed: 3.4,
          up: 1.2,
          life: 0.3,
          shape: 'shard',
        },
      },
    ],
  },
  'augment.castle': {
    id: 'augment.castle',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wall_rise', volume: 0.8 } },
      { time: 0, op: { t: 'ring', at: 'self', color: STONE, radius: 2.6, width: 0.26, life: 4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 30,
          color: DUST,
          color2: STONE,
          size: 0.18,
          speed: 3,
          up: 3.4,
          life: 0.6,
          gravity: 9,
          shape: 'shard',
        },
      },
      { time: 3.7, op: { t: 'sound', cue: 'wall_fall', volume: 0.6 } },
    ],
  },
  'augment.chainshot': {
    id: 'augment.chainshot',
    events: [
      { time: 0, op: { t: 'sound', cue: 'skip_splash', volume: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 14,
          color: GOLD,
          color2: POWDER,
          size: 0.1,
          speed: 5,
          spread: 60,
          life: 0.26,
          shape: 'spark',
        },
      },
    ],
  },
  'augment.debt': {
    id: 'augment.debt',
    events: [
      { time: 0, op: { t: 'sound', cue: 'vex_goblet', volume: 0.8 } },
      { time: 0, op: { t: 'flash', at: 'target', color: CRIMSON, life: 0.12 } },
      { time: 0, op: { t: 'hitstop', ms: 45 } },
      { time: 0, op: { t: 'ring', at: 'target', color: CRIMSON, radius: 1.2, life: 0.4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 20,
          color: CRIMSON,
          color2: PETAL,
          size: 0.11,
          speed: 4,
          up: 2,
          life: 0.45,
          shape: 'spark',
        },
      },
    ],
  },
  'augment.execute': {
    id: 'augment.execute',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rattle_r_confirm', volume: 0.9 } },
      { time: 0, op: { t: 'flash', at: 'target', color: 0xffffff, life: 0.1 } },
      { time: 0, op: { t: 'hitstop', ms: 55 } },
      { time: 0, op: { t: 'shake', power: 's' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 24,
          color: 0xd8e6f2,
          color2: 0xffffff,
          size: 0.12,
          speed: 6,
          up: 2,
          life: 0.4,
          shape: 'shard',
        },
      },
    ],
  },
  'augment.nettle': {
    id: 'augment.nettle',
    events: [
      { time: 0, op: { t: 'sound', cue: 'sylva_q_flick', volume: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 14,
          color: 0x5c9c43,
          color2: 0x8ade6a,
          size: 0.08,
          speed: 4,
          spread: 360,
          life: 0.3,
          shape: 'shard',
        },
      },
    ],
  },
  'augment.poltergeist': {
    id: 'augment.poltergeist',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_boo', volume: 0.9 } },
      { time: 0, op: { t: 'ring', at: 'origin', color: GHOSTC, radius: 2.2, life: 0.45 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 30,
          color: GHOSTC,
          color2: VOID,
          size: 0.13,
          speed: 6,
          up: 2.4,
          life: 0.5,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'shake', power: 's' } },
    ],
  },
  'augment.share': {
    id: 'augment.share',
    events: [
      { time: 0, op: { t: 'sound', cue: 'piper_toss', volume: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 12,
          color: SNACK,
          size: 0.09,
          speed: 3,
          up: 1.6,
          life: 0.35,
          shape: 'spark',
        },
      },
    ],
  },
  'augment.silence': {
    id: 'augment.silence',
    events: [
      { time: 0, op: { t: 'sound', cue: 'cast_denied', volume: 0.8 } },
      { time: 0, op: { t: 'ring', at: 'self', color: 0x8ff0d8, radius: 1, width: 0.1, life: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 10,
          color: 0x8ff0d8,
          size: 0.08,
          speed: 1.6,
          up: 2,
          life: 0.5,
          shape: 'puff',
        },
      },
    ],
  },
  'augment.society': {
    id: 'augment.society',
    events: [
      { time: 0, op: { t: 'sound', cue: 'wisp_curse_start', volume: 0.9 } },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: GHOSTC, radius: 2.4, width: 0.14, life: 0.7 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 26,
          color: GHOSTC,
          color2: VOID,
          size: 0.12,
          speed: 2.4,
          up: 3.4,
          life: 0.8,
          shape: 'puff',
        },
      },
    ],
  },
  'augment.waltz': {
    id: 'augment.waltz',
    events: [
      { time: 0, op: { t: 'sound', cue: 'vex_bats', volume: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 22,
          color: CRIMSON,
          color2: PETAL,
          size: 0.1,
          speed: 3,
          spread: 50,
          life: 0.5,
          gravity: 4,
          shape: 'puff',
        },
      },
    ],
  },
  'augment.counterweight': {
    id: 'augment.counterweight',
    events: [
      { time: 0, op: { t: 'sound', cue: 'block_clang', volume: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 12,
          color: STONE,
          color2: AUG_GOLD,
          size: 0.11,
          speed: 5,
          life: 0.28,
          shape: 'shard',
        },
      },
    ],
  },
  'augment.thorns': {
    id: 'augment.thorns',
    events: [
      { time: 0, op: { t: 'sound', cue: 'hit_generic', volume: 0.4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 14,
          color: 0x8ade6a,
          color2: 0xd8e6f2,
          size: 0.09,
          speed: 5.5,
          spread: 60,
          life: 0.26,
          shape: 'shard',
        },
      },
    ],
  },
  'augment.secondwind': {
    id: 'augment.secondwind',
    events: [
      { time: 0, op: { t: 'sound', cue: 'sylva_bloom', volume: 0.8 } },
      { time: 0, op: { t: 'ring', at: 'target', color: 0xffb14b, radius: 1.6, life: 0.6 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 26,
          color: 0xffb14b,
          color2: 0xfff3d6,
          size: 0.1,
          speed: 2.4,
          up: 4,
          life: 1.1,
          gravity: 1,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'light', at: 'target', color: 0xffb14b, intensity: 2, radius: 4, life: 0.6 },
      },
    ],
  },
  'augment.star.bank': {
    id: 'augment.star.bank',
    events: [
      { time: 0, op: { t: 'sound', cue: 'relic_purge', volume: 0.35 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 8,
          color: 0xbfe8ff,
          color2: 0xffffff,
          size: 0.08,
          speed: 1.4,
          up: 2.4,
          life: 0.5,
          shape: 'spark',
        },
      },
    ],
  },
  'augment.star.break': {
    id: 'augment.star.break',
    events: [
      { time: 0, op: { t: 'sound', cue: 'block_clang', volume: 0.7 } },
      { time: 0, op: { t: 'flash', at: 'target', color: 0xbfe8ff, life: 0.12 } },
      { time: 0, op: { t: 'ring', at: 'target', color: 0xbfe8ff, radius: 1.5, life: 0.4 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 22,
          color: 0xbfe8ff,
          color2: 0xffffff,
          size: 0.1,
          speed: 5,
          up: 2,
          life: 0.45,
          shape: 'shard',
        },
      },
    ],
  },
  'augment.deathblossom': {
    id: 'augment.deathblossom',
    events: [
      { time: 0, op: { t: 'sound', cue: 'explosion_big', volume: 0.7 } },
      {
        time: 0,
        op: { t: 'ring', at: 'target', color: PETAL, radius: 2.5, width: 0.2, life: 0.5 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 46,
          color: PETAL,
          color2: CRIMSON,
          size: 0.13,
          speed: 7,
          up: 3,
          life: 0.8,
          gravity: 4,
          shape: 'puff',
        },
      },
      { time: 0, op: { t: 'shake', power: 'm' } },
    ],
  },
  'augment.undying': {
    id: 'augment.undying',
    events: [
      { time: 0, op: { t: 'sound', cue: 'augment_prismatic', volume: 0.8 } },
      { time: 0, op: { t: 'flash', at: 'self', color: 0xffffff, life: 0.14 } },
      { time: 0, op: { t: 'hitstop', ms: 60 } },
      { time: 0, op: { t: 'shake', power: 'm' } },
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: AUG_GOLD, radius: 2.4, width: 0.2, life: 0.7 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 44,
          color: 0xfff3d6,
          color2: AUG_GOLD,
          size: 0.12,
          speed: 4.5,
          up: 6,
          life: 1,
          gravity: 3,
          shape: 'shard',
        },
      },
    ],
  },
  'augment.slipstream': {
    id: 'augment.slipstream',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 14,
          color: AUG_PRISM_B,
          size: 0.09,
          speed: 2,
          spread: 40,
          life: 0.4,
          shape: 'puff',
        },
      },
    ],
  },
  'augment.ghost': {
    id: 'augment.ghost',
    events: [
      { time: 0, op: { t: 'sound', cue: 'rattle_r_vanish', volume: 0.4 } },
      { time: 0, op: { t: 'ring', at: 'self', color: GHOSTC, radius: 1.2, width: 0.09, life: 2 } },
    ],
  },
  'augment.ghost.swing': {
    id: 'augment.ghost.swing',
    events: [
      { time: 0, op: { t: 'sound', cue: 'hit_generic', volume: 0.35 } },
      {
        time: 0,
        op: { t: 'ribbonSweep', at: 'origin', color: GHOSTC, radius: 1.6, angleDeg: 90, life: 0.2 },
      },
    ],
  },
  'augment.mirror': {
    id: 'augment.mirror',
    events: [
      { time: 0, op: { t: 'sound', cue: 'relic_blink', volume: 0.35 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 10,
          color: AUG_PRISM_A,
          color2: 0xffffff,
          size: 0.09,
          speed: 3,
          life: 0.3,
          shape: 'spark',
        },
      },
    ],
  },
  'augment.echo': {
    id: 'augment.echo',
    events: [
      { time: 0, op: { t: 'sound', cue: 'relic_purge', volume: 0.3 } },
      {
        time: 0,
        op: { t: 'ring', at: 'self', color: GHOSTC, radius: 1.3, width: 0.08, life: 0.3 },
      },
    ],
  },
  'augment.element.flame': {
    id: 'augment.element.flame',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 9,
          color: 0xff7a3c,
          color2: 0xffc23c,
          size: 0.09,
          speed: 2,
          up: 2.2,
          life: 0.4,
          shape: 'spark',
        },
      },
    ],
  },
  'augment.element.frost': {
    id: 'augment.element.frost',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 9,
          color: CHILL,
          color2: 0xffffff,
          size: 0.09,
          speed: 1.8,
          up: 1.6,
          life: 0.4,
          shape: 'shard',
        },
      },
    ],
  },
  'augment.element.storm': {
    id: 'augment.element.storm',
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'target',
          count: 9,
          color: ELEC,
          color2: 0xffffff,
          size: 0.08,
          speed: 4,
          life: 0.28,
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

  /* ---------------------- The Living Bridge (§9) ---------------------- */
  /*
   * Announces are deliberately audio-only at the world layer: the banner, the
   * ticker and the minimap glow carry the message (UI_UX §9), and a screen-wide
   * particle burst 8 s before anything happens would read as the event itself.
   */
  'event.flankIsles.announce': {
    id: 'event.flankIsles.announce',
    events: [{ time: 0, op: { t: 'sound', cue: 'event_horn' } }],
  },
  'event.coinRain.announce': {
    id: 'event.coinRain.announce',
    events: [{ time: 0, op: { t: 'sound', cue: 'event_horn' } }],
  },
  'event.stormFront.announce': {
    id: 'event.stormFront.announce',
    events: [{ time: 0, op: { t: 'sound', cue: 'event_horn' } }],
  },
  'event.clashGolem.announce': {
    id: 'event.clashGolem.announce',
    events: [
      { time: 0, op: { t: 'sound', cue: 'event_horn' } },
      // The altar stirs where the golem will stand — the one announce that
      // points at a place, because the whole map is about to walk there.
      {
        time: 0.5,
        op: { t: 'ring', at: 'origin', color: OBJECTIVE, radius: 3, width: 0.25, life: 1.2 },
      },
      {
        time: 2,
        op: { t: 'ring', at: 'origin', color: OBJECTIVE, radius: 4, width: 0.2, life: 1.2 },
      },
      {
        time: 4,
        op: { t: 'ring', at: 'origin', color: OBJECTIVE, radius: 5, width: 0.18, life: 1.4 },
      },
      { time: 6, op: { t: 'shake', power: 's' } },
      { time: 7, op: { t: 'shake', power: 's' } },
    ],
  },

  'event.isles.rise': {
    id: 'event.isles.rise',
    events: [
      { time: 0, op: { t: 'sound', cue: 'event_isles_rise' } },
      { time: 0, op: { t: 'shake', power: 'm' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 46,
          color: DUST,
          color2: STONE,
          size: 0.3,
          speed: 4,
          spread: 80,
          up: 3,
          life: 1.6,
          gravity: -2,
          shape: 'puff',
        },
      },
      // Chunks of the platform shoulder their way up through the dust.
      {
        time: 0.2,
        op: {
          t: 'burst',
          at: 'origin',
          count: 20,
          color: STONE,
          size: 0.24,
          speed: 6,
          spread: 55,
          up: 5,
          life: 1.4,
          gravity: 9,
          shape: 'shard',
        },
      },
      { time: 0.6, op: { t: 'shake', power: 's' } },
      {
        time: 1.4,
        op: { t: 'ring', at: 'origin', color: ISLE, radius: 5.5, width: 0.3, life: 0.7 },
      },
      {
        time: 1.9,
        op: { t: 'light', at: 'origin', color: ISLE, intensity: 3, radius: 12, life: 0.8 },
      },
    ],
  },
  'event.isles.fall': {
    id: 'event.isles.fall',
    events: [
      { time: 0, op: { t: 'sound', cue: 'event_isles_fall' } },
      { time: 0, op: { t: 'shake', power: 'm' } },
      {
        time: 0.1,
        op: {
          t: 'burst',
          at: 'origin',
          count: 34,
          color: STONE,
          color2: DUST,
          size: 0.26,
          speed: 3,
          spread: 70,
          up: -1,
          life: 1.8,
          gravity: 11,
          shape: 'shard',
        },
      },
      {
        time: 0.4,
        op: {
          t: 'burst',
          at: 'origin',
          count: 26,
          color: DUST,
          size: 0.34,
          speed: 2.5,
          spread: 90,
          up: 0.5,
          life: 1.4,
          gravity: -1,
          shape: 'puff',
        },
      },
    ],
  },

  'event.coin.zone': {
    id: 'event.coin.zone',
    events: [
      {
        time: 0,
        op: { t: 'decal', at: 'origin', kind: 'scorch', color: GOLD, radius: 4.4, life: 21 },
      },
      { time: 0, op: { t: 'ring', at: 'origin', color: GOLD, radius: 4, width: 0.28, life: 1 } },
      {
        time: 0,
        op: { t: 'light', at: 'origin', color: GOLD, intensity: 2.2, radius: 10, life: 1.2 },
      },
    ],
  },
  'event.coin.drop': {
    id: 'event.coin.drop',
    events: [
      { time: 0, op: { t: 'sound', cue: 'event_coin_drop', volume: 0.5 } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 5,
          color: GOLD,
          size: 0.1,
          speed: 2.4,
          spread: 60,
          up: 1.4,
          life: 0.4,
          gravity: 8,
          shape: 'spark',
        },
      },
    ],
  },
  'event.coin.pickup': {
    id: 'event.coin.pickup',
    events: [
      { time: 0, op: { t: 'sound', cue: 'event_coin_pickup' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 12,
          color: GOLD,
          color2: 0xfff2c0,
          size: 0.12,
          speed: 4,
          spread: 70,
          up: 2.2,
          life: 0.45,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: GOLD, radius: 0.9, width: 0.1, life: 0.28 },
      },
    ],
  },

  'event.storm.start': {
    id: 'event.storm.start',
    events: [
      { time: 0, op: { t: 'sound', cue: 'event_storm_roll' } },
      { time: 0.3, op: { t: 'shake', power: 's' } },
    ],
  },
  'event.storm.tick': {
    id: 'event.storm.tick',
    // Fires every 6 ticks along the wall's current centre — the crackle that
    // makes the band feel alive rather than a moving decal.
    events: [
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 7,
          color: STORM,
          color2: 0xffffff,
          size: 0.16,
          speed: 7,
          spread: 90,
          up: 3,
          life: 0.3,
          shape: 'spark',
          offset: [0, 0.4, 0],
        },
      },
      {
        time: 0,
        op: { t: 'light', at: 'origin', color: STORM, intensity: 1.6, radius: 9, life: 0.18 },
      },
    ],
  },
  'event.storm.end': {
    id: 'event.storm.end',
    events: [{ time: 0, op: { t: 'sound', cue: 'event_storm_crack', volume: 0.7 } }],
  },

  'event.golem.wake': {
    id: 'event.golem.wake',
    events: [
      { time: 0, op: { t: 'sound', cue: 'golem_wake' } },
      { time: 0, op: { t: 'shake', power: 'm' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 40,
          color: DUST,
          color2: STONE,
          size: 0.26,
          speed: 5,
          spread: 85,
          up: 2.4,
          life: 1.1,
          gravity: 6,
          shape: 'puff',
        },
      },
      {
        time: 0.1,
        op: { t: 'ring', at: 'origin', color: OBJECTIVE, radius: 3.4, width: 0.3, life: 0.8 },
      },
      { time: 0.75, op: { t: 'shake', power: 's' } },
      {
        time: 0.75,
        op: { t: 'light', at: 'origin', color: OBJECTIVE, intensity: 3.4, radius: 14, life: 0.9 },
      },
    ],
  },
  'event.golem.slam': {
    id: 'event.golem.slam',
    events: [
      { time: 0, op: { t: 'sound', cue: 'golem_slam' } },
      { time: 0, op: { t: 'shake', power: 'm' } },
      { time: 0, op: { t: 'hitstop', ms: 45 } },
      {
        time: 0,
        op: { t: 'decal', at: 'origin', kind: 'crack', color: STONE, radius: 2.2, life: 3.5 },
      },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: OBJECTIVE, radius: 2.2, width: 0.22, life: 0.35 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 26,
          color: STONE,
          color2: DUST,
          size: 0.2,
          speed: 8,
          spread: 40,
          up: 1.6,
          life: 0.6,
          gravity: 12,
          shape: 'shard',
        },
      },
    ],
  },
  'event.golem.convert': {
    id: 'event.golem.convert',
    events: [
      { time: 0, op: { t: 'sound', cue: 'golem_convert' } },
      { time: 0, op: { t: 'shake', power: 'm' } },
      { time: 0, op: { t: 'flash', at: 'self', color: 0xffffff, life: 0.3 } },
      {
        time: 0,
        op: { t: 'ring', at: 'origin', color: OBJECTIVE, radius: 4, width: 0.3, life: 0.7 },
      },
      {
        time: 0.12,
        op: { t: 'ring', at: 'origin', color: 0xffffff, radius: 6, width: 0.18, life: 0.6 },
      },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'self',
          count: 34,
          color: OBJECTIVE,
          color2: 0xfff0c8,
          size: 0.2,
          speed: 7,
          spread: 90,
          up: 4,
          life: 0.9,
          shape: 'spark',
        },
      },
      {
        time: 0,
        op: { t: 'light', at: 'self', color: OBJECTIVE, intensity: 4, radius: 16, life: 1 },
      },
    ],
  },
  'event.golem.aegis': {
    id: 'event.golem.aegis',
    events: [
      { time: 0, op: { t: 'sound', cue: 'golem_aegis', volume: 0.6 } },
      { time: 0, op: { t: 'ring', at: 'self', color: ALLY, radius: 6, width: 0.16, life: 0.5 } },
    ],
  },
  'event.golem.death': {
    id: 'event.golem.death',
    events: [
      { time: 0, op: { t: 'sound', cue: 'golem_death' } },
      { time: 0, op: { t: 'shake', power: 'm' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 40,
          color: STONE,
          color2: DUST,
          size: 0.28,
          speed: 6,
          spread: 85,
          up: 3,
          life: 1.3,
          gravity: 11,
          shape: 'shard',
        },
      },
      {
        time: 0.05,
        op: {
          t: 'prop',
          model: 'castle/rocks-large',
          at: 'origin',
          scale: 1.1,
          life: 6,
          sink: true,
        },
      },
    ],
  },

  'bridge.collapse': {
    id: 'bridge.collapse',
    // Fired once per edge strip per stage; `fz` says which side went.
    events: [
      { time: 0, op: { t: 'sound', cue: 'bridge_collapse' } },
      { time: 0, op: { t: 'shake', power: 'l' } },
      { time: 0.6, op: { t: 'shake', power: 'm' } },
      { time: 1.3, op: { t: 'shake', power: 's' } },
      {
        time: 0,
        op: {
          t: 'burst',
          at: 'origin',
          count: 60,
          color: STONE,
          color2: DUST,
          size: 0.36,
          speed: 3,
          spread: 90,
          up: -0.5,
          life: 2.4,
          gravity: 13,
          shape: 'shard',
        },
      },
      {
        time: 0.35,
        op: {
          t: 'burst',
          at: 'origin',
          count: 48,
          color: DUST,
          size: 0.5,
          speed: 2,
          spread: 90,
          up: 1,
          life: 2.6,
          gravity: -1.5,
          shape: 'puff',
        },
      },
    ],
  },
};
