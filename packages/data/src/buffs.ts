import type { BuffDef } from './types';

export const BUFFS: Record<string, BuffDef> = {
  rook_q_slow: {
    id: 'rook_q_slow',
    name: 'Battered',
    duration: 1.5,
    mul: { moveSpeed: 0.75 },
  },
  rook_rampart_haste: {
    id: 'rook_rampart_haste',
    name: 'Rampart Momentum',
    duration: 1.0,
    mul: { moveSpeed: 1.15 },
  },
  rook_keeps_wrath: {
    id: 'rook_keeps_wrath',
    name: "Keep's Wrath",
    duration: 3.0,
    damageReduction: 0.25,
  },
  rook_entrance_shieldwall: {
    // Shieldwall: block-one-hit is handled by the stonewall passive charge; this marks the visual window.
    id: 'rook_entrance_shieldwall',
    name: 'Shieldwall',
    duration: 1.0,
  },
  fathom_w_slow: {
    id: 'fathom_w_slow',
    name: 'Powder-Scorched',
    duration: 2.0,
    mul: { moveSpeed: 0.7 },
  },
  fathom_entrance_luck: {
    id: 'fathom_entrance_luck',
    name: 'Lucky Doubloon',
    duration: 2.0,
  },
  spawn_haste: {
    id: 'spawn_haste',
    name: 'Fresh Legs',
    duration: 1.0,
    decayingMsBonus: 0.2,
  },
  // Boltz — Bubble Dome: allies inside fire faster (refreshed each tick they stay).
  boltz_dome: {
    id: 'boltz_dome',
    name: 'Overshielded',
    duration: 0.3,
    mul: { attackSpeed: 1.1 },
  },
  // Wisp — Chilled mark: no stats of its own; Boo hits it harder and R renews it.
  wisp_chilled: {
    id: 'wisp_chilled',
    name: 'Chilled',
    duration: 3.0,
  },
  // Wisp — Sheet Slip: invisible for a beat (the sim drops it on cast/attack).
  wisp_invis: {
    id: 'wisp_invis',
    name: 'Slipped Away',
    duration: 1.0,
  },
  // Wisp entrance Cold Spot: untargetable through the 0.35 s swap morph.
  wisp_untargetable: {
    id: 'wisp_untargetable',
    name: 'Cold Spot',
    duration: 0.35,
  },
};
