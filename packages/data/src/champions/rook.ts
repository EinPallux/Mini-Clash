import type { ChampionDef } from '../types';

/** ROOK — the Wandering Rampart. Vanguard starter. Numbers per docs/CHAMPIONS.md §4. */
export const ROOK: ChampionDef = {
  id: 'rook',
  name: 'Rook',
  title: 'the Wandering Rampart',
  role: 'vanguard',
  difficulty: 1,
  stats: {
    hp: 1050,
    hpPerLevel: 120,
    regenPctPerSec: 0.006,
    ad: 58,
    adPerLevel: 5.1,
    attackSpeed: 0.72,
    attackSpeedPerLevel: 0.012,
    moveSpeed: 3.5,
    range: 1.8,
    armor: 32,
    armorPerLevel: 3.3,
    ward: 30,
    wardPerLevel: 3.1,
    radius: 0.55,
  },
  attack: { kind: 'melee', windupFrac: 0.38 },
  passive: {
    id: 'stonewall',
    name: 'Stonewall',
    description:
      'Every {icd}s, Rook’s next incoming hit is reduced by {base} (+{perLevel} per level).',
    params: { icd: 8, base: 40, perLevel: 8 },
  },
  abilities: {
    q: {
      id: 'rook_q',
      slot: 'q',
      name: 'Bash & Batter',
      description:
        'Slam your shield in an arc: {dmg} physical damage and a 25% slow for 1.5s. Recast within 3s: a sword backswing for {dmg2} physical damage.',
      cost: 25,
      cooldown: 7,
      castTime: 0.25,
      range: 2.6,
      aim: 'direction',
      indicator: { kind: 'cone', radius: 2.6, angleDeg: 100 },
      actions: [
        {
          t: 'areaDamage',
          at: 'self',
          shape: { kind: 'cone', radius: 2.6, angleDeg: 100 },
          amount: { base: 70, perLevel: 6, adRatio: 0.65 },
          type: 'physical',
          cc: { kind: 'slow', duration: 1.5, strength: 0.25 },
        },
      ],
      recast: {
        window: 3,
        name: 'Batter',
        actions: [
          {
            t: 'areaDamage',
            at: 'self',
            shape: { kind: 'cone', radius: 2.6, angleDeg: 100 },
            amount: { base: 55, perLevel: 5, adRatio: 0.5 },
            type: 'physical',
          },
        ],
      },
    },
    w: {
      id: 'rook_w',
      slot: 'w',
      name: 'Rampart',
      description:
        'Raise a 3u stone wall for 2.5s. It blocks enemy movement; allies passing it gain 15% move speed.',
      cost: 35,
      cooldown: 14,
      castTime: 0.3,
      range: 3,
      aim: 'point',
      indicator: { kind: 'rect', length: 0.8, width: 3 },
      actions: [
        { t: 'wall', length: 3, thickness: 0.6, duration: 2.5, allyBuff: 'rook_rampart_haste' },
      ],
    },
    r: {
      id: 'rook_r',
      slot: 'r',
      name: "Keep's Wrath",
      description:
        'Leap and land as a fortress: {dmg} physical damage and a 1s knock-up in 2.5u. Allies near you take 25% less damage for 3s.',
      cost: 0,
      cooldown: 70,
      castTime: 0.15,
      range: 4,
      aim: 'point',
      indicator: { kind: 'circle', radius: 2.5 },
      actions: [
        {
          t: 'leap',
          toAim: true,
          duration: 0.6,
          onLand: [
            {
              t: 'areaDamage',
              at: 'self',
              shape: { kind: 'circle', radius: 2.5 },
              amount: { base: 160, perLevel: 14, adRatio: 0.9 },
              type: 'physical',
              cc: { kind: 'knockup', duration: 1 },
            },
            {
              t: 'buff',
              buff: 'rook_keeps_wrath',
              who: 'alliesInShape',
              at: 'self',
              shape: { kind: 'circle', radius: 4 },
            },
          ],
        },
      ],
    },
  },
  entrance: {
    id: 'shieldwall',
    name: 'Shieldwall',
    description: 'On arrival, block the first incoming hit entirely for 1s.',
    params: { duration: 1 },
  },
  botBuild: {
    relic: 'purge_bell',
    items: [
      'iron_plate',
      'juggernaut_mail',
      'titans_bastion',
      'bulwark_scrap',
      'hex_charm',
      'nullwave_cloak',
    ],
  },
  visual: {
    model: 'arena/character-soldier',
    scale: 1,
    props: [
      { model: 'arena/weapon-sword', socket: 'handRight', scale: 1.35 },
      { model: 'dungeon/shield-rectangle', socket: 'handLeft', scale: 1.3 },
    ],
    anim: {
      idle: { clip: 'idle', loop: true },
      run: { clip: 'sprint', loop: true },
      attack: { clip: 'attack-melee-right' },
      cast_q: { clip: 'attack-melee-left', speed: 1.15 },
      cast_q_recast: { clip: 'attack-melee-right', speed: 1.15 },
      cast_w: { clip: 'interact-right', speed: 1.2 },
      cast_r: { clip: 'jump', speed: 1.0 },
      death: { clip: 'die' },
      dance: { clip: 'emote-yes', loop: true },
      fidget: { clip: 'emote-no' },
      spawn: { clip: 'pick-up', speed: 1.3 },
    },
    portraitColor: 0x8a94a6,
  },
};
