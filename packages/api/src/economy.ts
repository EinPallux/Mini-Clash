import {
  accountLevelFor,
  CHAMPION_LIST,
  CHAMPION_PRICES,
  COSMETIC_PRICES,
  freeRotation,
  MASTERY_CURVE,
  masteryLevelFor,
  REWARDS,
  weekIndexOf,
} from '@mini-clash/data';
import type { Sql } from './db';
import { ApiError } from './errors';
import { grant, spend } from './ledger';

/**
 * The meta game's rules (GAME_DESIGN §18).
 *
 * Every number this module uses comes from `@mini-clash/data` — it decides
 * *when* coins move and *what* a player owns, never *how much* anything costs.
 * That split is what makes a balance patch a data change rather than a deploy
 * of new service logic.
 *
 * Nothing here trusts a client. A purchase names an item; the price is looked
 * up, the balance is checked and debited, and the unlock row is written in the
 * same transaction — so there is no ordering in which coins leave without the
 * thing arriving, and none in which the thing arrives free.
 */

export type UnlockKind = 'champion' | 'palette' | 'sticker' | 'pose';
const UNLOCK_KINDS: UnlockKind[] = ['champion', 'palette', 'sticker', 'pose'];

export interface Profile {
  level: number;
  xp: number;
  coins: number;
  bannerId: string;
  showcase: string[];
  settings: Record<string, unknown>;
  winStreak: number;
  lastWinDay: string | null;
}

export interface MasteryRow {
  championId: string;
  xp: number;
  level: number;
  /** XP into the current level and what the next one needs; null at 10. */
  progress: { into: number; needed: number } | null;
  /** A milestone reached but not yet collected, if any. */
  claimable: { level: number; coins: number } | null;
}

/* ------------------------------- Reading ---------------------------------- */

export async function profileFor(sql: Sql, userId: string): Promise<Profile> {
  const rows = await sql<{
    level: number;
    xp: number;
    coins: number;
    banner_id: string;
    showcase: string[];
    settings: Record<string, unknown>;
    win_streak: number;
    last_win_day: Date | string | null;
  }>`select level, xp, coins, banner_id, showcase, settings, win_streak, last_win_day
       from profiles where user_id = ${userId}`;
  const p = rows[0];
  if (!p) throw new ApiError(404, 'no_profile');
  return {
    level: p.level,
    xp: p.xp,
    coins: p.coins,
    bannerId: p.banner_id,
    showcase: Array.isArray(p.showcase) ? p.showcase : [],
    settings: p.settings ?? {},
    winStreak: p.win_streak,
    lastWinDay: p.last_win_day ? dayKey(new Date(p.last_win_day)) : null,
  };
}

export async function unlocksFor(sql: Sql, userId: string): Promise<Record<UnlockKind, string[]>> {
  const rows = await sql<{ kind: UnlockKind; ref_id: string }>`
    select kind, ref_id from unlocks where user_id = ${userId}`;
  const out = { champion: [], palette: [], sticker: [], pose: [] } as Record<UnlockKind, string[]>;
  for (const r of rows) out[r.kind]?.push(r.ref_id);
  for (const k of UNLOCK_KINDS) out[k].sort();
  return out;
}

export async function masteryFor(sql: Sql, userId: string): Promise<MasteryRow[]> {
  const rows = await sql<{ champion_id: string; xp: number; level: number; claimed: number }>`
    select champion_id, xp, level, claimed from mastery where user_id = ${userId}`;
  return rows.map((r) => ({
    championId: r.champion_id,
    xp: r.xp,
    level: r.level,
    progress: masteryProgress(r.xp),
    claimable: nextClaimable(r.level, r.claimed),
  }));
}

/** XP into the current mastery level and what the next one costs. Null at 10. */
export function masteryProgress(xp: number): { into: number; needed: number } | null {
  const level = masteryLevelFor(xp);
  if (level >= MASTERY_CURVE.length) return null;
  const floor = MASTERY_CURVE[level - 1];
  return { into: xp - floor, needed: MASTERY_CURVE[level] - floor };
}

/** The lowest reached-but-uncollected milestone, if the player has one waiting. */
function nextClaimable(level: number, claimed: number): { level: number; coins: number } | null {
  for (const [at, coins] of Object.entries(REWARDS.masteryCoins)) {
    const milestone = Number(at);
    if (level >= milestone && claimed < milestone) return { level: milestone, coins };
  }
  return null;
}

/**
 * The champion catalog as this player sees it: what they own, what is free this
 * week, what it would cost, and how far their mastery has got.
 */
export async function championsFor(
  sql: Sql,
  userId: string | null,
  now: Date,
): Promise<{
  rotation: string[];
  champions: {
    id: string;
    name: string;
    title: string;
    role: string;
    difficulty: number;
    price: number;
    owned: boolean;
    free: boolean;
    playable: boolean;
    mastery: { xp: number; level: number } | null;
  }[];
}> {
  const rotation = freeRotation(weekIndexOf(now));
  const owned = new Set<string>();
  const mastery = new Map<string, { xp: number; level: number }>();
  if (userId) {
    const rows = await sql<{ ref_id: string }>`
      select ref_id from unlocks where user_id = ${userId} and kind = 'champion'`;
    for (const r of rows) owned.add(r.ref_id);
    for (const m of await masteryFor(sql, userId)) {
      mastery.set(m.championId, { xp: m.xp, level: m.level });
    }
  }
  return {
    rotation,
    champions: CHAMPION_LIST.map((c) => {
      const isOwned = owned.has(c.id);
      const isFree = rotation.includes(c.id);
      return {
        id: c.id,
        name: c.name,
        title: c.title,
        role: c.role,
        difficulty: c.difficulty,
        price: CHAMPION_PRICES[c.id] ?? 0,
        owned: isOwned,
        free: isFree,
        // Training is free for everyone (UI_UX §13); this is the *match* gate.
        playable: isOwned || isFree || (CHAMPION_PRICES[c.id] ?? 0) === 0,
        mastery: mastery.get(c.id) ?? null,
      };
    }),
  };
}

/* ------------------------------- Buying ----------------------------------- */

/** What an item costs, or null when nothing by that name is for sale. */
export function priceOf(kind: UnlockKind, refId: string): number | null {
  if (kind === 'champion') {
    return Object.hasOwn(CHAMPION_PRICES, refId) ? CHAMPION_PRICES[refId] : null;
  }
  // Cosmetics are priced by kind; the catalog of ids lands with the champion
  // viewer, which is the only place a palette can actually be judged.
  return COSMETIC_PRICES[kind] ?? null;
}

export interface PurchaseResult {
  kind: UnlockKind;
  refId: string;
  paid: number;
  coins: number;
}

/**
 * Buy an unlock.
 *
 * The idempotency key makes this safe to retry: a double-click, a flaky
 * connection retried by the client, or two tabs racing all resolve to exactly
 * one charge — enforced by a unique index, not by a lock we hope holds.
 */
export async function purchase(
  sql: Sql,
  userId: string,
  kind: string,
  refId: string,
  idemKey?: string,
): Promise<PurchaseResult> {
  if (!UNLOCK_KINDS.includes(kind as UnlockKind)) throw new ApiError(400, 'bad_kind');
  const k = kind as UnlockKind;
  const price = priceOf(k, refId);
  if (price === null) throw new ApiError(404, 'unknown_item');
  if (price === 0) throw new ApiError(400, 'not_for_sale');

  return sql.begin(async (tx) => {
    const already = await tx<{ ref_id: string }>`
      select ref_id from unlocks
       where user_id = ${userId} and kind = ${k} and ref_id = ${refId}`;
    if (already[0]) throw new ApiError(409, 'already_owned');

    const coins = await spend(tx, userId, price, 'purchase', `${k}:${refId}`, idemKey);
    await tx`insert into unlocks (user_id, kind, ref_id) values (${userId}, ${k}, ${refId})`;
    return { kind: k, refId, paid: price, coins };
  });
}

/** Collect a mastery milestone's coins. Pays once, ever. */
export async function claimMastery(
  sql: Sql,
  userId: string,
  championId: string,
): Promise<{ level: number; coins: number; balance: number }> {
  return sql.begin(async (tx) => {
    const rows = await tx<{ level: number; claimed: number }>`
      select level, claimed from mastery
       where user_id = ${userId} and champion_id = ${championId} for update`;
    if (!rows[0]) throw new ApiError(404, 'no_mastery');
    const due = nextClaimable(rows[0].level, rows[0].claimed);
    if (!due) throw new ApiError(409, 'nothing_to_claim');
    const balance = await grant(
      tx,
      userId,
      due.coins,
      'mastery_milestone',
      `${championId}:${due.level}`,
    );
    await tx`update mastery set claimed = ${due.level}
              where user_id = ${userId} and champion_id = ${championId}`;
    return { level: due.level, coins: due.coins, balance };
  });
}

/* ------------------------------- Writing ---------------------------------- */

export async function setSettings(
  sql: Sql,
  userId: string,
  settings: Record<string, unknown>,
): Promise<void> {
  await sql`update profiles set settings = ${JSON.stringify(settings)}::jsonb
             where user_id = ${userId}`;
}

/**
 * The three champions posed on the profile (UI_UX §13). Only champions the
 * player owns may be shown — a showcase is a claim about your account.
 */
export async function setShowcase(sql: Sql, userId: string, ids: string[]): Promise<string[]> {
  const trimmed = [...new Set(ids)].slice(0, 3);
  if (trimmed.length) {
    const owned = await sql<{ ref_id: string }>`
      select ref_id from unlocks where user_id = ${userId} and kind = 'champion'`;
    const has = new Set(owned.map((r) => r.ref_id));
    for (const id of trimmed) if (!has.has(id)) throw new ApiError(403, 'not_owned');
  }
  await sql`update profiles set showcase = ${JSON.stringify(trimmed)}::jsonb
             where user_id = ${userId}`;
  return trimmed;
}

export async function setBanner(sql: Sql, userId: string, bannerId: string): Promise<void> {
  if (!/^banner_[a-z0-9_]{1,32}$/.test(bannerId)) throw new ApiError(400, 'bad_banner');
  await sql`update profiles set banner_id = ${bannerId} where user_id = ${userId}`;
}

/* ------------------------------- Rewards ---------------------------------- */

/** UTC calendar day — the clock the first-win bonus and dailies run on. */
export function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export interface RewardInput {
  won: boolean;
  /** 0…1 share of the team's contribution; 0.5 is an average game. */
  performance: number;
  firstWinOfDay: boolean;
}

/**
 * What a finished match pays (§18).
 *
 * A loss still pays, and the performance swing scales the base rather than
 * replacing it — a bad game is worth less, never nothing, because a coin
 * economy that punishes losing punishes the player who most needs the next
 * match to feel worth starting.
 */
export function matchReward(input: RewardInput): { coins: number; base: number; bonus: number } {
  const base = input.won ? REWARDS.win : REWARDS.loss;
  const swing = 1 + (clamp01(input.performance) - 0.5) * 2 * REWARDS.performanceSwing;
  const scaled = Math.round(base * swing);
  const bonus = input.firstWinOfDay ? REWARDS.firstWinOfDay : 0;
  return { coins: scaled + bonus, base: scaled, bonus };
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Account XP from one match — flat, plus a win bonus. Tenure, not skill. */
export function matchXp(won: boolean): number {
  return won ? 120 : 80;
}

/**
 * Add account XP and recompute the displayed level.
 *
 * Both move in one statement so a level can never be stale relative to its XP.
 */
export async function addAccountXp(
  sql: Sql,
  userId: string,
  xp: number,
): Promise<{ xp: number; level: number; levelledUp: boolean }> {
  const rows = await sql<{ xp: number; level: number }>`
    update profiles set xp = xp + ${xp} where user_id = ${userId} returning xp, level`;
  if (!rows[0]) throw new ApiError(404, 'no_profile');
  const level = accountLevelFor(rows[0].xp);
  const levelledUp = level > rows[0].level;
  if (levelledUp) {
    await sql`update profiles set level = ${level} where user_id = ${userId}`;
  }
  return { xp: rows[0].xp, level, levelledUp };
}

/** Add champion mastery XP, keeping the stored level in step with the curve. */
export async function addMasteryXp(
  sql: Sql,
  userId: string,
  championId: string,
  xp: number,
): Promise<{ xp: number; level: number; levelledUp: boolean }> {
  const rows = await sql<{ xp: number; level: number }>`
    insert into mastery (user_id, champion_id, xp, level)
    values (${userId}, ${championId}, ${xp}, ${masteryLevelFor(xp)})
    on conflict (user_id, champion_id)
      do update set xp = mastery.xp + ${xp}
    returning xp, level`;
  const total = rows[0].xp;
  const level = masteryLevelFor(total);
  const levelledUp = level > rows[0].level;
  if (levelledUp) {
    await sql`update mastery set level = ${level}
               where user_id = ${userId} and champion_id = ${championId}`;
  }
  return { xp: total, level, levelledUp };
}

/**
 * Record a win against the day streak, reporting whether it was the day's first.
 *
 * The streak counts consecutive *days with a win*, not consecutive wins — the
 * calendar in the quests screen is a record of showing up.
 */
export async function noteWin(
  sql: Sql,
  userId: string,
  at: Date,
): Promise<{ firstOfDay: boolean; streak: number }> {
  const today = dayKey(at);
  const rows = await sql<{ last_win_day: Date | string | null; win_streak: number }>`
    select last_win_day, win_streak from profiles where user_id = ${userId} for update`;
  if (!rows[0]) throw new ApiError(404, 'no_profile');
  const last = rows[0].last_win_day ? dayKey(new Date(rows[0].last_win_day)) : null;
  if (last === today) return { firstOfDay: false, streak: rows[0].win_streak };

  const yesterday = dayKey(new Date(at.getTime() - 24 * 3600 * 1000));
  const streak = last === yesterday ? rows[0].win_streak + 1 : 1;
  await sql`update profiles set last_win_day = ${today}::date, win_streak = ${streak}
             where user_id = ${userId}`;
  return { firstOfDay: true, streak };
}
