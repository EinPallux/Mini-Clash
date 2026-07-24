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

/** Bridge Brawl match rules (GAME_DESIGN §5, §11–§13). */
export const BRIDGE = {
  /** Starting gold — exactly one Tier-1 item at 0:00. */
  startingGold: 500,
  ambientXpPerSec: 2,
  ambientGoldPerSec: 2.5,
  /** Dead players keep half ambient income (comeback rule). */
  deadIncomeFactor: 0.5,
  /** Mini kill gold splits / XP grants within this radius. */
  shareRadius: 10,
  killGold: 300,
  streakBounty: 50,
  streakBountyCap: 300,
  assistPool: 150,
  /** Takedown XP = this × victim level, full to killer and each assister. */
  takedownXpPerLevel: 60,
  towerGold: 150,
  towerXp: 90,
  /** Seconds a damager stays kill/assist-eligible. */
  assistWindow: 10,
  respawnBase: 5,
  respawnPerLevel: 2.5,
  respawnCap: 32,
  rUnlockLevel: 4,
  /** Fountain shop window after 0:00 (dead players always shop). */
  shopUntil: 60,
  shopRadius: 7,
  orb: { heal: 0.18, energy: 40, xp: 20, splashHeal: 0.06, splashRadius: 4, radius: 0.55 },
  wave: { bruisers: 3, zappers: 2, ramEvery: 2 },
  /** Fountain plate: rapid heal + energy while standing on it. */
  fountain: { radius: 4.5, hpPctPerSec: 0.09, energyPerSec: 15 },
  /** Champions cut through Minis (waves are speed bumps for heroes, walls for each other). */
  champVsMiniMul: 2,
  /** 16:00 Corebreaker: Cores take double damage, waves turn all-Ram (GAME_DESIGN §5/§9). */
  overtime: { at: 960, coreDamageMul: 2, waveRams: 4 },
  /** 20:00 Sudden Death: both Cores decay; higher-HP Core survives (§5). */
  /** Surrender unlocks at 8:00 (UI_UX §8). Solo-vs-bots concedes immediately. */
  surrenderAt: 480,
  suddenDeath: { at: 1200, decayPctPerSec: 0.01 },
  /** Brush: attacking/casting reveals you for this long. */
  brushRevealAfterAction: 1.5,
} as const;
