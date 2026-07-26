import type { Sql } from './db';
import { ApiError } from './errors';

/**
 * Match history (UI_UX §13).
 *
 * The list view is deliberately thin — a card's worth of columns per match, so
 * scrolling thirty of them costs one small query. The detail view returns the
 * summary blob the game server wrote at match end, unmodified: the scoreboard
 * a player sees a week later is byte-for-byte the one they saw on the podium,
 * which is what makes the "reproduces any finished match exactly" acceptance
 * check meaningful rather than a re-derivation that could drift.
 */

export interface HistoryEntry {
  matchId: string;
  mode: string;
  startedAt: string;
  duration: number;
  won: boolean;
  teamId: number;
  duo: unknown;
  stats: Record<string, unknown>;
  augments: unknown[];
}

export async function historyFor(
  sql: Sql,
  userId: string,
  limit = 30,
  before?: string,
): Promise<HistoryEntry[]> {
  const capped = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await sql<{
    match_id: string;
    mode: string;
    started_at: Date | string;
    duration: number;
    won: boolean;
    team_id: number;
    duo: unknown;
    stats: Record<string, unknown>;
    augments: unknown[];
  }>`select mp.match_id, m.mode, m.started_at, m.duration,
            mp.won, mp.team_id, mp.duo, mp.stats, mp.augments
       from match_players mp join matches m on m.id = mp.match_id
      where mp.user_id = ${userId}
        and (${before ?? null}::text is null or m.started_at < (
              select started_at from matches where id = ${before ?? null}))
      order by m.started_at desc
      limit ${capped}`;
  return rows.map((r) => ({
    matchId: r.match_id,
    mode: r.mode,
    startedAt: new Date(r.started_at).toISOString(),
    duration: r.duration,
    won: r.won,
    teamId: r.team_id,
    duo: r.duo,
    stats: r.stats ?? {},
    augments: Array.isArray(r.augments) ? r.augments : [],
  }));
}

/**
 * One match in full.
 *
 * Scoped to a participant: a match id is guessable, and the scoreboard of a
 * game you were not in is not yours to read.
 */
export async function matchDetail(
  sql: Sql,
  userId: string,
  matchId: string,
): Promise<{
  matchId: string;
  mode: string;
  seed: string;
  startedAt: string;
  duration: number;
  result: unknown;
  players: {
    seat: number;
    userId: string | null;
    name: string | null;
    botTier: string | null;
    teamId: number;
    won: boolean;
    duo: unknown;
    stats: Record<string, unknown>;
    augments: unknown[];
  }[];
}> {
  const [mine] = await sql<{ seat: number }>`
    select seat from match_players where match_id = ${matchId} and user_id = ${userId}`;
  if (!mine) throw new ApiError(404, 'no_match');

  const [m] = await sql<{
    id: string;
    mode: string;
    seed: string | number;
    started_at: Date | string;
    duration: number;
    result: unknown;
  }>`select id, mode, seed, started_at, duration, result from matches where id = ${matchId}`;
  if (!m) throw new ApiError(404, 'no_match');

  const players = await sql<{
    seat: number;
    user_id: string | null;
    name: string | null;
    bot_tier: string | null;
    team_id: number;
    won: boolean;
    duo: unknown;
    stats: Record<string, unknown>;
    augments: unknown[];
  }>`select mp.seat, mp.user_id, u.name, mp.bot_tier, mp.team_id, mp.won,
            mp.duo, mp.stats, mp.augments
       from match_players mp left join users u on u.id = mp.user_id
      where mp.match_id = ${matchId}
      order by mp.seat`;

  return {
    matchId: m.id,
    // bigint: a seed past 2^53 would lose precision as a JSON number.
    seed: String(m.seed),
    mode: m.mode,
    startedAt: new Date(m.started_at).toISOString(),
    duration: m.duration,
    result: m.result,
    players: players.map((p) => ({
      seat: p.seat,
      userId: p.user_id,
      name: p.name,
      botTier: p.bot_tier,
      teamId: p.team_id,
      won: p.won,
      duo: p.duo,
      stats: p.stats ?? {},
      augments: Array.isArray(p.augments) ? p.augments : [],
    })),
  };
}

export interface LifetimeStats {
  matches: number;
  wins: number;
  winrate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  favoriteDuo: { ids: string[]; matches: number } | null;
  topAugment: { id: string; picks: number } | null;
  topChampion: { id: string; matches: number } | null;
}

/**
 * The profile's lifetime panel.
 *
 * Aggregated in SQL rather than by reading every match into memory — a player
 * with a thousand games should cost the same as one with ten.
 */
export async function lifetimeStats(sql: Sql, userId: string): Promise<LifetimeStats> {
  const [totals] = await sql<{
    matches: string;
    wins: string;
    kills: string;
    deaths: string;
    assists: string;
  }>`select count(*)                                        as matches,
            count(*) filter (where won)                     as wins,
            coalesce(sum((stats->>'kills')::int), 0)        as kills,
            coalesce(sum((stats->>'deaths')::int), 0)       as deaths,
            coalesce(sum((stats->>'assists')::int), 0)      as assists
       from match_players where user_id = ${userId}`;

  const matches = Number(totals?.matches ?? 0);
  const wins = Number(totals?.wins ?? 0);
  const kills = Number(totals?.kills ?? 0);
  const deaths = Number(totals?.deaths ?? 0);
  const assists = Number(totals?.assists ?? 0);

  const [duo] = await sql<{ ids: string[]; n: string }>`
    select array(select jsonb_array_elements_text(duo) order by 1) as ids, count(*) as n
      from match_players
     where user_id = ${userId} and jsonb_typeof(duo) = 'array'
     group by ids order by n desc, ids limit 1`;

  const [aug] = await sql<{ id: string; n: string }>`
    select a.id, count(*) as n
      from match_players mp,
           lateral jsonb_array_elements_text(
             case when jsonb_typeof(mp.augments) = 'array' then mp.augments else '[]'::jsonb end
           ) as a(id)
     where mp.user_id = ${userId}
     group by a.id order by n desc, a.id limit 1`;

  const [champ] = await sql<{ id: string; n: string }>`
    select c.id, count(*) as n
      from match_players mp,
           lateral jsonb_array_elements_text(
             case when jsonb_typeof(mp.duo) = 'array' then mp.duo else '[]'::jsonb end
           ) as c(id)
     where mp.user_id = ${userId}
     group by c.id order by n desc, c.id limit 1`;

  return {
    matches,
    wins,
    winrate: matches ? wins / matches : 0,
    kills,
    deaths,
    assists,
    // The convention every scoreboard uses: a deathless game divides by 1.
    kda: (kills + assists) / Math.max(1, deaths),
    favoriteDuo: duo ? { ids: duo.ids, matches: Number(duo.n) } : null,
    topAugment: aug ? { id: aug.id, picks: Number(aug.n) } : null,
    topChampion: champ ? { id: champ.id, matches: Number(champ.n) } : null,
  };
}
