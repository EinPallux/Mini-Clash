/**
 * The meta game's numbers (GAME_DESIGN §18).
 *
 * Prices, rewards and quest definitions are **content**, not service logic —
 * they live here so a balance patch is a data change and the api keeps no
 * opinions of its own about what a champion costs.
 */

/** Owned by every account from the first boot: one per role family. */
export const STARTER_CHAMPIONS = ['rook', 'fathom', 'mortis', 'sylva'] as const;

/** Unlock price tiers: early roster / later / newest (§18). */
export const CHAMPION_PRICES: Record<string, number> = {
  rook: 0,
  fathom: 0,
  mortis: 0,
  sylva: 0,
  rattle: 3500,
  grukk: 3500,
  boltz: 5500,
  wisp: 5500,
  piper: 8000,
  vex: 8000,
};

export const COSMETIC_PRICES = { palette: 800, sticker: 400, pose: 600 } as const;

/**
 * After the one free change (UI_UX §13).
 *
 * Deliberately the cheapest thing in the shop — about two matches. The price
 * exists to stop name-churn, not to punish someone for a typo, and fixing your
 * own name should never cost more than buying a sticker.
 */
export const RENAME_PRICE = 300;

/** Coin rewards (§18). Performance scales the base, and a loss still pays. */
export const REWARDS = {
  win: 120,
  loss: 70,
  firstWinOfDay: 150,
  /** ±20% by match score, applied to the base only. */
  performanceSwing: 0.2,
  questDaily: [50, 65, 80] as const,
  questWeekly: 200,
  /** Mastery milestones that pay coins (level → amount). */
  masteryCoins: { 5: 300, 10: 750 } as const,
} as const;

/** Per-champion mastery: XP needed to reach each level, 1 → 10 (§18). */
export const MASTERY_CURVE = [0, 400, 900, 1500, 2300, 3300, 4500, 6000, 8000, 10500] as const;

export function masteryLevelFor(xp: number): number {
  let level = 1;
  for (let i = 1; i < MASTERY_CURVE.length; i++) {
    if (xp >= MASTERY_CURVE[i]) level = i + 1;
  }
  return Math.min(10, level);
}

/** Account level curve — flatter than mastery; this is a display of tenure. */
export function accountLevelFor(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 250)) + 1);
}

/**
 * The weekly free rotation (§18): four champions nobody has to own.
 *
 * Derived from the week number rather than stored, so every client and the
 * server agree without a sync — and a fresh deploy cannot lose track of which
 * week it is. Starters are excluded: rotating something everyone owns is not a
 * rotation.
 */
export function freeRotation(weekIndex: number, size = 4): string[] {
  // Derived from the price table rather than the champion roster: "champions
  // that can be owned" is exactly the right set here, and it keeps this module
  // free of an import cycle with the roster. `meta.test.ts` asserts the price
  // table covers the roster exactly, so the two cannot drift apart.
  const pool = Object.keys(CHAMPION_PRICES)
    .filter((id) => !(STARTER_CHAMPIONS as readonly string[]).includes(id))
    .sort();
  if (pool.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < Math.min(size, pool.length); i++) {
    // Stride by a co-prime-ish step so consecutive weeks do not overlap heavily.
    out.push(pool[(weekIndex * size + i * 3) % pool.length]);
  }
  return [...new Set(out)];
}

/** Weeks since the epoch Monday — the rotation's clock. */
export function weekIndexOf(at: Date): number {
  return Math.floor(at.getTime() / (7 * 24 * 3600 * 1000));
}

/* --------------------------------- Quests --------------------------------- */

export type QuestMetric =
  | 'matches'
  | 'wins'
  | 'kills'
  | 'assists'
  | 'augmentsDrafted'
  | 'golemsTaken'
  | 'swaps'
  | 'towers';

export interface QuestDef {
  id: string;
  cadence: 'daily' | 'weekly';
  name: string;
  /** What to count, and how much of it. */
  metric: QuestMetric;
  target: number;
  coins: number;
}

/**
 * The quest pool. Three dailies and one weekly are dealt per player per period;
 * every one of them counts something the match summary already reports, so a
 * quest can never ask for a thing the server cannot verify.
 */
export const QUEST_POOL: QuestDef[] = [
  { id: 'q_play_2', cadence: 'daily', name: 'Warm Up', metric: 'matches', target: 2, coins: 50 },
  { id: 'q_win_1', cadence: 'daily', name: 'Take One', metric: 'wins', target: 1, coins: 65 },
  {
    id: 'q_kills_12',
    cadence: 'daily',
    name: 'Skirmisher',
    metric: 'kills',
    target: 12,
    coins: 65,
  },
  {
    id: 'q_assists_15',
    cadence: 'daily',
    name: 'Wingman',
    metric: 'assists',
    target: 15,
    coins: 50,
  },
  {
    id: 'q_augments_6',
    cadence: 'daily',
    name: 'Power Surge',
    metric: 'augmentsDrafted',
    target: 6,
    coins: 65,
  },
  {
    id: 'q_swaps_25',
    cadence: 'daily',
    name: 'Tag Team',
    metric: 'swaps',
    target: 25,
    coins: 50,
  },
  {
    id: 'q_golem_2',
    cadence: 'daily',
    name: 'Golem Whisperer',
    metric: 'golemsTaken',
    target: 2,
    coins: 80,
  },
  {
    id: 'q_towers_8',
    cadence: 'daily',
    name: 'Siege Engineer',
    metric: 'towers',
    target: 8,
    coins: 80,
  },
  {
    id: 'q_weekly_wins',
    cadence: 'weekly',
    name: 'On a Roll',
    metric: 'wins',
    target: 8,
    coins: 200,
  },
  {
    id: 'q_weekly_play',
    cadence: 'weekly',
    name: 'Regular',
    metric: 'matches',
    target: 15,
    coins: 200,
  },
];

export const QUESTS: Record<string, QuestDef> = Object.fromEntries(
  QUEST_POOL.map((q) => [q.id, q]),
);
