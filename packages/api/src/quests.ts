import { createHash } from 'node:crypto';
import { QUEST_POOL, QUESTS, type QuestDef, type QuestMetric } from '@mini-clash/data';
import type { Sql } from './db';
import { dayKey } from './economy';
import { ApiError } from './errors';
import { grant } from './ledger';

/**
 * Quests (GAME_DESIGN §18, UI_UX §13): three dailies and one weekly.
 *
 * The deal is **derived, not stored**: which quests you have follows from your
 * user id and the current period, so there is no cron job that has to have run
 * for a player to have today's quests — a server that was switched off all week
 * deals the right ones the moment somebody logs in. Rerolls are the one piece of
 * real state, because they are a choice rather than a function of the calendar.
 *
 * Progress only ever arrives from a finished match the server itself simulated
 * (`/internal/match-result`). Every metric in the pool is something the match
 * summary already reports, so a quest can never ask for a thing we cannot check.
 */

const DAILY_COUNT = 3;
const WEEKLY_COUNT = 1;

export interface QuestView extends QuestDef {
  progress: number;
  state: 'active' | 'ready' | 'claimed';
  rerolled: boolean;
  resetAt: string;
}

export interface QuestsView {
  daily: QuestView[];
  weekly: QuestView[];
  /** One reroll per day, across all three dailies. */
  rerollAvailable: boolean;
  streak: number;
  lastWinDay: string | null;
}

/* -------------------------------- Periods --------------------------------- */

const DAY = 24 * 3600 * 1000;

export function dailyPeriod(now: Date): { key: string; resetAt: Date } {
  const reset = new Date(now);
  reset.setUTCHours(0, 0, 0, 0);
  return { key: dayKey(now), resetAt: new Date(reset.getTime() + DAY) };
}

/** Weeks run Monday→Monday UTC, matching the free rotation's clock. */
export function weeklyPeriod(now: Date): { key: string; resetAt: Date } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  // getUTCDay: 0 = Sunday, so Monday-relative offset is (day + 6) % 7.
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return { key: `w:${dayKey(start)}`, resetAt: new Date(start.getTime() + 7 * DAY) };
}

/* --------------------------------- Dealing -------------------------------- */

/** Stable per-player shuffle: the same player gets the same deal all period. */
function shuffled(pool: QuestDef[], seedText: string): QuestDef[] {
  const scored = pool.map((q) => ({
    q,
    key: createHash('sha256').update(`${seedText}:${q.id}`).digest('hex'),
  }));
  scored.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return scored.map((s) => s.q);
}

export function dealFor(
  userId: string,
  cadence: 'daily' | 'weekly',
  periodKey: string,
  exclude: ReadonlySet<string> = new Set(),
): QuestDef[] {
  const pool = QUEST_POOL.filter((q) => q.cadence === cadence && !exclude.has(q.id));
  const count = cadence === 'daily' ? DAILY_COUNT : WEEKLY_COUNT;
  return shuffled(pool, `${userId}:${periodKey}`).slice(0, count);
}

/**
 * Return this player's quests, dealing the period's set on first sight.
 *
 * Rows from a finished period are deleted rather than archived: a claimed quest
 * has already paid, and keeping it would only make "3 dailies" ambiguous.
 */
export async function questsFor(sql: Sql, userId: string, now: Date): Promise<QuestsView> {
  const daily = dailyPeriod(now);
  const weekly = weeklyPeriod(now);

  await sql.begin(async (tx) => {
    await tx`delete from quests where user_id = ${userId} and reset_at <= ${now}`;
    for (const [cadence, period] of [
      ['daily', daily],
      ['weekly', weekly],
    ] as const) {
      const have = await tx<{ quest_id: string }>`
        select quest_id from quests where user_id = ${userId} and cadence = ${cadence}`;
      const want = cadence === 'daily' ? DAILY_COUNT : WEEKLY_COUNT;
      if (have.length >= want) continue;
      // Top up rather than replace: a reroll already swapped one out, and
      // re-dealing from scratch would undo it.
      const held = new Set(have.map((r) => r.quest_id));
      for (const q of dealFor(userId, cadence, period.key, held)) {
        if (held.size >= want) break;
        held.add(q.id);
        await tx`insert into quests (user_id, quest_id, cadence, reset_at)
                 values (${userId}, ${q.id}, ${cadence}, ${period.resetAt})
                 on conflict (user_id, quest_id) do nothing`;
      }
    }
  });

  const rows = await sql<{
    quest_id: string;
    cadence: 'daily' | 'weekly';
    progress: number;
    state: 'active' | 'ready' | 'claimed';
    rerolled: boolean;
    reset_at: Date | string;
  }>`select quest_id, cadence, progress, state, rerolled, reset_at
       from quests where user_id = ${userId}`;

  const view = (r: (typeof rows)[number]): QuestView | null => {
    const def = QUESTS[r.quest_id];
    // A quest removed from the pool by a patch simply disappears rather than
    // rendering as a blank card nobody can complete.
    if (!def) return null;
    return {
      ...def,
      progress: Math.min(r.progress, def.target),
      state: r.state,
      rerolled: r.rerolled,
      resetAt: new Date(r.reset_at).toISOString(),
    };
  };
  const kept = rows.map(view).filter((v): v is QuestView => v !== null);
  const byId = new Map(rows.map((r) => [r.quest_id, r]));

  const [profile] = await sql<{ win_streak: number; last_win_day: Date | string | null }>`
    select win_streak, last_win_day from profiles where user_id = ${userId}`;

  return {
    daily: kept.filter((q) => q.cadence === 'daily').sort(byQuestId),
    weekly: kept.filter((q) => q.cadence === 'weekly').sort(byQuestId),
    rerollAvailable: ![...byId.values()].some((r) => r.cadence === 'daily' && r.rerolled),
    streak: profile?.win_streak ?? 0,
    lastWinDay: profile?.last_win_day ? dayKey(new Date(profile.last_win_day)) : null,
  };
}

const byQuestId = (a: QuestView, b: QuestView): number => (a.id < b.id ? -1 : 1);

/* -------------------------------- Progress -------------------------------- */

export type QuestCounters = Partial<Record<QuestMetric, number>>;

/**
 * Fold one match's contribution into every quest that counts it.
 *
 * Called from the match-result writer inside its transaction, so a match either
 * lands whole — row, coins, mastery, quest progress — or not at all.
 */
export async function bumpQuests(
  sql: Sql,
  userId: string,
  counters: QuestCounters,
  now: Date,
): Promise<string[]> {
  const rows = await sql<{ quest_id: string; progress: number; state: string }>`
    select quest_id, progress, state from quests
     where user_id = ${userId} and state = 'active' and reset_at > ${now}`;
  const completed: string[] = [];
  for (const r of rows) {
    const def = QUESTS[r.quest_id];
    if (!def) continue;
    const add = counters[def.metric] ?? 0;
    if (add <= 0) continue;
    const progress = r.progress + add;
    const state = progress >= def.target ? 'ready' : 'active';
    await sql`update quests set progress = ${progress}, state = ${state}
               where user_id = ${userId} and quest_id = ${r.quest_id}`;
    if (state === 'ready') completed.push(r.quest_id);
  }
  return completed;
}

/* --------------------------------- Claim ---------------------------------- */

export async function claimQuest(
  sql: Sql,
  userId: string,
  questId: string,
  now: Date,
): Promise<{ questId: string; coins: number; balance: number }> {
  const def = QUESTS[questId];
  if (!def) throw new ApiError(404, 'unknown_quest');
  return sql.begin(async (tx) => {
    const rows = await tx<{ state: string; progress: number }>`
      select state, progress from quests
       where user_id = ${userId} and quest_id = ${questId} and reset_at > ${now} for update`;
    if (!rows[0]) throw new ApiError(404, 'no_quest');
    if (rows[0].state === 'claimed') throw new ApiError(409, 'already_claimed');
    if (rows[0].progress < def.target) throw new ApiError(409, 'not_complete');
    // The row's state is the idempotency guard, held under `for update` — two
    // clicks cannot both find it unclaimed.
    await tx`update quests set state = 'claimed'
              where user_id = ${userId} and quest_id = ${questId}`;
    const balance = await grant(tx, userId, def.coins, 'quest', questId);
    return { questId, coins: def.coins, balance };
  });
}

/**
 * Swap one daily for another you are not already holding — once a day.
 *
 * A quest already finished cannot be rerolled: that would be a way to farm the
 * pool rather than a way out of a quest you do not want to play.
 */
export async function rerollQuest(
  sql: Sql,
  userId: string,
  questId: string,
  now: Date,
): Promise<QuestView> {
  const def = QUESTS[questId];
  if (!def) throw new ApiError(404, 'unknown_quest');
  if (def.cadence !== 'daily') throw new ApiError(400, 'not_rerollable');
  const period = dailyPeriod(now);

  return sql.begin(async (tx) => {
    const held = await tx<{ quest_id: string; state: string; rerolled: boolean }>`
      select quest_id, state, rerolled from quests
       where user_id = ${userId} and cadence = 'daily' and reset_at > ${now} for update`;
    const mine = held.find((r) => r.quest_id === questId);
    if (!mine) throw new ApiError(404, 'no_quest');
    if (mine.state !== 'active') throw new ApiError(409, 'already_complete');
    if (held.some((r) => r.rerolled)) throw new ApiError(409, 'reroll_used');

    const exclude = new Set(held.map((r) => r.quest_id));
    const [replacement] = dealFor(userId, 'daily', `${period.key}:reroll`, exclude);
    if (!replacement) throw new ApiError(409, 'pool_exhausted');

    await tx`delete from quests where user_id = ${userId} and quest_id = ${questId}`;
    await tx`insert into quests (user_id, quest_id, cadence, reset_at, rerolled)
             values (${userId}, ${replacement.id}, 'daily', ${period.resetAt}, true)`;
    return {
      ...replacement,
      progress: 0,
      state: 'active' as const,
      rerolled: true,
      resetAt: period.resetAt.toISOString(),
    };
  });
}
