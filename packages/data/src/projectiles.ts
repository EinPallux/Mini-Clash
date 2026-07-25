import type { ProjectileDef } from './types';

export const PROJECTILES: Record<string, ProjectileDef> = {
  fathom_q_ball: {
    id: 'fathom_q_ball',
    speed: 15,
    radius: 0.35,
    maxRange: 7.5,
    pierces: 'all',
    // Skipshot: three impact zones at fixed travel marks, -15% per skip already spent.
    pulses: [
      { atDistance: 2.5, radius: 1.1, damageMul: 1.0 },
      { atDistance: 5.0, radius: 1.1, damageMul: 0.85 },
      { atDistance: 7.5, radius: 1.1, damageMul: 0.7 },
    ],
    damage: { amount: { base: 75, perLevel: 6, adRatio: 0.7 }, type: 'physical' },
    pulseFx: 'fathom.q.skip',
    visual: {
      kind: 'model',
      model: 'pirate/cannon-ball',
      size: 0.5,
      color: 0x30343c,
      trail: { color: 0x9aa3ad, width: 0.22, life: 0.35 },
      spin: 6,
      arcHeight: 0.55,
    },
  },

  mortis_q_bolt: {
    id: 'mortis_q_bolt',
    speed: 13,
    radius: 0.32,
    maxRange: 7,
    // Overkill carries the wisp-skull through slain Minis (wave-timing reward).
    pierceOnKill: true,
    damage: { amount: { base: 85, perLevel: 7, apRatio: 0.6 }, type: 'arcane' },
    visual: {
      kind: 'orb',
      size: 0.34,
      color: 0x8ff0d8,
      trail: { color: 0x59c9ad, width: 0.2, life: 0.4 },
    },
  },

  rattle_q_dagger: {
    id: 'rattle_q_dagger',
    speed: 16,
    radius: 0.22,
    maxRange: 5,
    damage: { amount: { base: 55, perLevel: 5, adRatio: 0.45 }, type: 'physical' },
    visual: {
      kind: 'orb',
      size: 0.2,
      color: 0xd8e6f2,
      trail: { color: 0xa8b8c8, width: 0.12, life: 0.22 },
      spin: 12,
    },
  },

  sylva_q_dart: {
    id: 'sylva_q_dart',
    speed: 14,
    radius: 0.26,
    maxRange: 6.5,
    damage: { amount: { base: 70, perLevel: 6, apRatio: 0.55 }, type: 'arcane' },
    cc: { kind: 'slow', duration: 1, strength: 0.2 },
    visual: {
      kind: 'orb',
      size: 0.26,
      color: 0x8ade6a,
      trail: { color: 0xf2a5c8, width: 0.16, life: 0.35 },
      spin: 9,
    },
  },

  wisp_q_boo: {
    id: 'wisp_q_boo',
    speed: 13,
    radius: 0.3,
    maxRange: 6.5,
    // A wailing spook-bolt: extra bite against Chilled targets, and it startles Minis.
    bonusVsBuff: { buff: 'wisp_chilled', mul: 1.25 },
    damage: { amount: { base: 84, perLevel: 7, apRatio: 0.6 }, type: 'arcane' },
    cc: { kind: 'fear', duration: 1 },
    visual: {
      kind: 'orb',
      size: 0.32,
      color: 0xd8f4ff,
      trail: { color: 0x8fb8d8, width: 0.2, life: 0.4 },
      spin: 4,
    },
  },
};
