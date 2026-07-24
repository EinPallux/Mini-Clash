/** Watchtower + Clash Core numbers (GAME_DESIGN §13.2–§13.3). */

export interface TowerDef {
  hp: number;
  armor: number;
  ward: number;
  damage: number;
  /** Seconds between shots. */
  interval: number;
  range: number;
  /** Damage multiplier gained per consecutive shot on the same champion. */
  rampPct: number;
  /** Damage-taken reduction while no enemy Minis are within backdoorRange. */
  backdoorDr: number;
  backdoorRange: number;
  radius: number;
  missile: { speed: number; size: number; color: number };
}

export interface CoreDef {
  hp: number;
  armor: number;
  ward: number;
  pulseDamage: number;
  pulseRadius: number;
  pulseInterval: number;
  radius: number;
}

export const TOWER_DEF: TowerDef = {
  hp: 2400,
  armor: 40,
  ward: 40,
  damage: 180,
  interval: 1.2,
  range: 8.5,
  rampPct: 0.4,
  backdoorDr: 0.5,
  backdoorRange: 11,
  radius: 0.9,
  missile: { speed: 16, size: 0.28, color: 0xffc72e },
};

export const CORE_DEF: CoreDef = {
  hp: 3600,
  armor: 30,
  ward: 30,
  pulseDamage: 120,
  pulseRadius: 8,
  pulseInterval: 2,
  radius: 1.3,
};
