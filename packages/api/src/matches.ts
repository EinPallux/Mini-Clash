import type { MatchResultPayload, MatchResultSeat } from '@mini-clash/protocol';
import type { Sql } from './db';
import { addAccountXp, addMasteryXp, matchReward, matchXp, noteWin } from './economy';
import { ApiError } from './errors';
import { grant } from './ledger';
import { bumpQuests, type QuestCounters } from './quests';

/**
 * Recording a finished match (TECH §9).
 *
 * This is the **only** path by which coins, mastery and quest progress can
 * increase. The payload describes what happened on the field; every reward is
 * recomputed here from `packages/data`, so a compromised game server could lie
 * about a scoreline but never about a price, and a client — which never touches
 * this endpoint at all — cannot reach the economy by any route.
 *
 * The whole thing is one transaction keyed on `matchId`. A retry after a
 * timeout, a duplicated webhook, a game server restarting mid-report: all of
 * them re-post the same id and all of them are no-ops, because the match row's
 * primary key is the idempotency guard.
 */

export interface SeatAward {
  userId: string;
  coins: number;
  base: number;
  firstWinOfDay: number;
  streak: number;
  accountXp: number;
  accountLevel: number;
  levelledUp: boolean;
  masteryXp: number;
  mastery: { championId: string; xp: number; level: number; levelledUp: boolean }[];
  questsCompleted: string[];
}

export interface RecordResult {
  matchId: string;
  duplicate: boolean;
  awards: SeatAward[];
}

/** Mastery XP for one match: flat, plus a win bonus, split across the duo. */
const MASTERY_PER_MATCH = 260;
const MASTERY_WIN_BONUS = 140;

/**
 * Quest counters for one seat.
 *
 * Towers and golems are credited to the whole team rather than to whoever
 * landed the last hit: "Siege Engineer" is about playing the objective, and
 * making it a last-hit race would reward exactly the behaviour the objective is
 * meant to discourage.
 */
function countersFor(seat: MatchResultSeat): QuestCounters {
  return {
    matches: 1,
    wins: seat.won ? 1 : 0,
    kills: seat.stats.kills,
    assists: seat.stats.assists,
    augmentsDrafted: seat.augments.length,
    golemsTaken: seat.stats.golems,
    swaps: seat.stats.swaps,
    towers: seat.stats.towers,
  };
}

function validate(payload: MatchResultPayload): void {
  if (!payload.matchId || typeof payload.matchId !== 'string') {
    throw new ApiError(400, 'bad_match_id');
  }
  if (!Array.isArray(payload.seats) || payload.seats.length === 0) {
    throw new ApiError(400, 'no_seats');
  }
  if (!Number.isFinite(payload.duration) || payload.duration < 0) {
    throw new ApiError(400, 'bad_duration');
  }
  if (Number.isNaN(Date.parse(payload.startedAt))) throw new ApiError(400, 'bad_started_at');
  const seats = new Set<number>();
  for (const s of payload.seats) {
    if (seats.has(s.seat)) throw new ApiError(400, 'duplicate_seat');
    seats.add(s.seat);
    if (s.team !== 0 && s.team !== 1) throw new ApiError(400, 'bad_team');
  }
  // One account cannot occupy two seats — that would pay it twice.
  const users = payload.seats.map((s) => s.userId).filter((u): u is string => !!u);
  if (new Set(users).size !== users.length) throw new ApiError(400, 'duplicate_user');
}

export async function recordMatch(
  sql: Sql,
  payload: MatchResultPayload,
  now: Date,
): Promise<RecordResult> {
  validate(payload);

  return sql.begin(async (tx) => {
    const existing = await tx<{ id: string }>`select id from matches where id = ${payload.matchId}`;
    if (existing[0]) return { matchId: payload.matchId, duplicate: true, awards: [] };

    await tx`insert into matches (id, mode, seed, started_at, duration, result)
             values (${payload.matchId}, ${payload.mode}, ${Math.trunc(payload.seed)},
                     ${payload.startedAt}::timestamptz, ${Math.round(payload.duration)},
                     ${JSON.stringify(payload.result ?? {})}::jsonb)`;

    // Only accounts we actually know get a row pointing at them; a stale user
    // id (someone deleted their account mid-match) becomes a bot-shaped seat
    // rather than a failed report that would lose the whole match.
    const claimed = payload.seats.map((s) => s.userId).filter((u): u is string => !!u);
    const known = new Set(
      claimed.length === 0
        ? []
        : (await tx<{ id: string }>`select id from users where id = any(${claimed})`).map(
            (r) => r.id,
          ),
    );

    const awards: SeatAward[] = [];
    for (const seat of payload.seats) {
      const userId = seat.userId && known.has(seat.userId) ? seat.userId : null;
      await tx`insert into match_players
                 (match_id, user_id, bot_tier, seat, team_id, won, duo, stats, augments)
               values (${payload.matchId}, ${userId}, ${seat.botTier ?? null}, ${seat.seat},
                       ${seat.team}, ${seat.won},
                       ${JSON.stringify(seat.duo ?? [])}::jsonb,
                       ${JSON.stringify(seat.stats ?? {})}::jsonb,
                       ${JSON.stringify(seat.augments ?? [])}::jsonb)`;
      if (!userId) continue;
      awards.push(await payOut(tx, userId, seat, payload.matchId, now));
    }

    return { matchId: payload.matchId, duplicate: false, awards };
  });
}

async function payOut(
  tx: Sql,
  userId: string,
  seat: MatchResultSeat,
  matchId: string,
  now: Date,
): Promise<SeatAward> {
  const streak = seat.won ? await noteWin(tx, userId, now) : { firstOfDay: false, streak: 0 };
  const reward = matchReward({
    won: seat.won,
    performance: seat.performance ?? 0.5,
    firstWinOfDay: streak.firstOfDay,
  });
  // The match id is the idempotency key: even if the guard above were somehow
  // bypassed, the ledger would refuse to pay twice for the same match.
  await grant(tx, userId, reward.coins, seat.won ? 'match_win' : 'match_loss', matchId, matchId);

  const xp = matchXp(seat.won);
  const account = await addAccountXp(tx, userId, xp);

  // Split mastery across both halves: you played the duo, not one champion.
  const total = MASTERY_PER_MATCH + (seat.won ? MASTERY_WIN_BONUS : 0);
  const halves = seat.duo.length > 0 ? seat.duo : [];
  const per = halves.length > 0 ? Math.round(total / halves.length) : 0;
  const mastery = [];
  for (const championId of halves) {
    const m = await addMasteryXp(tx, userId, championId, per);
    mastery.push({ championId, ...m });
  }

  const questsCompleted = await bumpQuests(tx, userId, countersFor(seat), now);

  return {
    userId,
    coins: reward.coins,
    base: reward.base,
    firstWinOfDay: reward.bonus,
    streak: streak.streak,
    accountXp: xp,
    accountLevel: account.level,
    levelledUp: account.levelledUp,
    masteryXp: per,
    mastery,
    questsCompleted,
  };
}
