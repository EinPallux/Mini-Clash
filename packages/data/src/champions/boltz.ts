import type { ChampionDef } from '../types';

/** BOLTZ — Salvage Unit 7. Gunner/Specialist, v0.4. Numbers per docs/CHAMPIONS.md §4. */
export const BOLTZ: ChampionDef = {
  id: 'boltz',
  name: 'Boltz',
  title: 'Salvage Unit 7',
  role: 'gunner',
  difficulty: 2,
  stats: {
    hp: 650,
    hpPerLevel: 75.56,
    regenPctPerSec: 0.0035,
    ad: 60,
    adPerLevel: 6.89,
    attackSpeed: 0.92,
    attackSpeedPerLevel: 0.02,
    moveSpeed: 3.6,
    range: 6.0,
    armor: 22,
    armorPerLevel: 2.44,
    ward: 22,
    wardPerLevel: 2.44,
    radius: 0.5,
  },
  attack: {
    kind: 'ranged',
    windupFrac: 0.3,
    missile: { speed: 24, size: 0.16, color: 0x8fd8ff },
  },
  passive: {
    id: 'capacitor',
    name: 'Capacitor',
    description:
      'After {idle}s without attacking, the next basic deals +{bonusBase} (+25% AD) arcane and arcs to 1 extra target.',
    params: { idle: 3, bonusBase: 18, bonusAdRatio: 0.25, chainRadius: 3.5 },
  },
  abilities: {
    q: {
      id: 'boltz_q',
      slot: 'q',
      name: 'Arc Zapper',
      description:
        'Snap-fire a tesla beam in a line: {dmg} arcane damage (+30% vs shielded targets). Refunds 10 Energy on champion hit.',
      cost: 30,
      cooldown: 6,
      castTime: 0.15,
      range: 6,
      aim: 'direction',
      indicator: { kind: 'line', length: 6, width: 1 },
      actions: [
        {
          t: 'beam',
          length: 6,
          width: 1,
          // Hitscan pays for never missing: lower per-hit than a comparable skillshot.
          amount: { base: 60, perLevel: 5, adRatio: 0.48 },
          type: 'arcane',
          vsShieldMul: 1.3,
          energyRefundOnChamp: 10,
          fx: 'boltz.q.beam',
        },
      ],
    },
    w: {
      id: 'boltz_w',
      slot: 'w',
      name: 'Bubble Dome',
      description:
        'Project a 2.5u energy dome for 2.5s: it pops enemy projectiles at the shell, and allies inside gain +10% attack speed.',
      cost: 35,
      cooldown: 13,
      castTime: 0.2,
      range: 4,
      aim: 'point',
      indicator: { kind: 'circle', radius: 2.5 },
      actions: [
        {
          t: 'field',
          at: 'aim',
          variant: 'dome',
          radius: 2.5,
          duration: 2.5,
          blocksProjectiles: true,
          allyBuff: 'boltz_dome',
        },
      ],
    },
    r: {
      id: 'boltz_r',
      slot: 'r',
      name: 'Orbital Droppod',
      description:
        'Call a droppod from orbit after 1.2s: {dmg} physical in 2.5u and a 0.8s knock-up. The pod stays 4s as a bunker that blocks movement and projectiles, then launches away.',
      cost: 0,
      cooldown: 85,
      castTime: 0.3,
      range: 7,
      aim: 'point',
      indicator: { kind: 'circle', radius: 2.5 },
      actions: [
        {
          t: 'field',
          at: 'aim',
          variant: 'pod',
          radius: 1.4,
          duration: 4,
          blocksProjectiles: true,
          blocksMovement: true,
          delay: 1.2,
          telegraphFx: 'boltz.r.telegraph',
          impact: {
            amount: { base: 170, perLevel: 12, adRatio: 0.8 },
            type: 'physical',
            radius: 2.5,
            cc: { kind: 'knockup', duration: 0.8 },
            fx: 'boltz.r.impact',
          },
        },
      ],
    },
  },
  entrance: {
    id: 'eva_hop',
    name: 'EVA Hop',
    description: 'A jetpack micro-hop on arrival — clears 1u, ignoring unit collision.',
    params: { dist: 1, dur: 0.4 },
  },
  botBuild: {
    relic: 'blink_prism',
    items: [
      'sharpened_fang',
      'whetstone',
      'dragonfang_blade',
      'stormweaver_focus',
      'executioners_edge',
      'phantom_anchor',
    ],
  },
  visual: {
    model: 'chars/character-male-c',
    scale: 1,
    // The SpaceKit gun is a small mesh (0.35 u long); 2× puts it on par with
    // Rook's sword (0.5 u at 1.35×) so it actually reads in the hand.
    props: [{ model: 'space/weapon-gun', socket: 'handRight', scale: 2 }],
    // The astronautA source mesh ships unrigged; Boltz rides the Kenney-Skinned rig
    // (full state machine) dressed as an astronaut — visor palette + bubble helmet.
    // radius/y are world units (the actor undoes the rig's normalization scale).
    helmet: { color: 0x8fd8ff, radius: 0.52, y: 1.35 },
    anim: {
      idle: { clip: 'idle', loop: true },
      run: { clip: 'sprint', loop: true },
      attack: { clip: 'holding-right-shoot' },
      cast_q: { clip: 'holding-right-shoot', speed: 1.35 },
      cast_w: { clip: 'interact-left', speed: 1.2 },
      cast_r: { clip: 'pick-up', speed: 0.9 },
      death: { clip: 'die' },
      dance: { clip: 'emote-yes', loop: true },
      fidget: { clip: 'emote-no' },
      spawn: { clip: 'jump', speed: 1.2 },
    },
    portraitColor: 0x59b7e8,
  },
};
