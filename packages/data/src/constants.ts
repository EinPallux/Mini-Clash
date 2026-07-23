/** Global gameplay constants (GAME_DESIGN.md §10–§11). */
export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

export const ENERGY_MAX = 100;
export const ENERGY_REGEN_PER_SEC = 4;

export const LEVEL_MAX = 10;
/** Cumulative XP per level 1..10 (index 0 = level 1 = 0 XP). */
export const XP_CURVE = [0, 80, 200, 360, 560, 800, 1090, 1430, 1820, 2260] as const;
export const LEVELUP_HEAL_PCT = 0.04;

/** Post-mitigation = raw * 100 / (100 + resist). */
export const RESIST_CONSTANT = 100;

/** Hard-CC diminishing returns: repeat within window takes this duration factor. */
export const CC_DR_WINDOW = 5;
export const CC_DR_FACTOR = 0.5;

/** Movement */
export const TURN_SPEED_DEG = 900;
export const ARRIVE_EPS = 0.05;

/** Melee attack reach arc beyond listed range. */
export const MELEE_ARC_DEG = 70;

/** Cast-feel: fraction of recovery that is move-cancellable. */
export const CAST_CANCEL_TAIL = 0.3;

export const PROTOCOL_VERSION = 1;
