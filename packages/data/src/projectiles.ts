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
};
