import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { guest } from '../src/auth';
import { migrate, openDb, type Sql } from '../src/db';
import { historyFor, lifetimeStats, matchDetail } from '../src/history';

/**
 * Match history (UI_UX §13).
 *
 * The detail view's promise is that a match you look at a week later reads
 * exactly as it did on the podium — so the interesting assertion is not that
 * the fields are present but that the summary blob comes back *untouched*.
 */

let sql: Sql;
let mine: string;
let other: string;

beforeAll(async () => {
  sql = await openDb();
  await migrate(sql);
});

beforeEach(async () => {
  await sql`delete from users`;
  await sql`delete from matches`;
  mine = (await guest(sql, 'Rook', 'device-key-mine-0123456789')).user.id;
  other = (await guest(sql, 'Vex', 'device-key-other-0123456789')).user.id;
});

interface SeatSpec {
  userId?: string | null;
  botTier?: string | null;
  team: number;
  won: boolean;
  duo: string[];
  stats?: Record<string, number>;
  augments?: string[];
}

/** Write a finished match the way `/internal/match-result` will (task #59). */
async function seedMatch(
  id: string,
  startedAt: string,
  seats: SeatSpec[],
  result: unknown = { winner: 0 },
): Promise<void> {
  await sql`insert into matches (id, mode, seed, started_at, duration, result)
            values (${id}, 'bridge', ${9007199254740993n.toString()}::bigint,
                    ${startedAt}::timestamptz, 900, ${JSON.stringify(result)}::jsonb)`;
  let seat = 0;
  for (const s of seats) {
    await sql`insert into match_players
                (match_id, user_id, bot_tier, seat, team_id, won, duo, stats, augments)
              values (${id}, ${s.userId ?? null}, ${s.botTier ?? null}, ${seat++},
                      ${s.team}, ${s.won},
                      ${JSON.stringify(s.duo)}::jsonb,
                      ${JSON.stringify(s.stats ?? { kills: 0, deaths: 0, assists: 0 })}::jsonb,
                      ${JSON.stringify(s.augments ?? [])}::jsonb)`;
  }
}

const bots = (team: number, won: boolean): SeatSpec[] =>
  Array.from({ length: 3 }, () => ({ botTier: 'veteran', team, won, duo: ['grukk', 'wisp'] }));

describe('the history list', () => {
  it('is empty for someone who has not played, rather than an error', async () => {
    expect(await historyFor(sql, mine)).toEqual([]);
    expect(await lifetimeStats(sql, mine)).toMatchObject({ matches: 0, wins: 0, winrate: 0 });
  });

  it('returns the player’s own row from each match, newest first', async () => {
    await seedMatch('m1', '2026-07-20T10:00:00Z', [
      {
        userId: mine,
        team: 0,
        won: true,
        duo: ['rook', 'fathom'],
        stats: { kills: 7, deaths: 2, assists: 5 },
      },
      { userId: other, team: 1, won: false, duo: ['vex', 'piper'] },
    ]);
    await seedMatch('m2', '2026-07-22T10:00:00Z', [
      { userId: mine, team: 1, won: false, duo: ['mortis', 'sylva'] },
      { userId: other, team: 0, won: true, duo: ['boltz', 'wisp'] },
    ]);

    const list = await historyFor(sql, mine);
    expect(list.map((m) => m.matchId)).toEqual(['m2', 'm1']);
    expect(list[1]).toMatchObject({ won: true, teamId: 0, duo: ['rook', 'fathom'] });
    expect(list[1].stats).toEqual({ kills: 7, deaths: 2, assists: 5 });
  });

  it('never shows a match somebody else played', async () => {
    await seedMatch('m1', '2026-07-20T10:00:00Z', [
      { userId: other, team: 0, won: true, duo: ['vex', 'piper'] },
    ]);
    expect(await historyFor(sql, mine)).toEqual([]);
  });

  it('caps the page and pages backwards from a given match', async () => {
    for (let i = 0; i < 8; i++) {
      await seedMatch(`m${i}`, `2026-07-${String(10 + i).padStart(2, '0')}T10:00:00Z`, [
        { userId: mine, team: 0, won: i % 2 === 0, duo: ['rook', 'fathom'] },
      ]);
    }
    const first = await historyFor(sql, mine, 3);
    expect(first.map((m) => m.matchId)).toEqual(['m7', 'm6', 'm5']);
    const next = await historyFor(sql, mine, 3, 'm5');
    expect(next.map((m) => m.matchId)).toEqual(['m4', 'm3', 'm2']);
  });

  it('refuses a silly page size instead of trying to serve it', async () => {
    for (let i = 0; i < 3; i++) {
      await seedMatch(`m${i}`, `2026-07-1${i}T10:00:00Z`, [
        { userId: mine, team: 0, won: true, duo: ['rook', 'fathom'] },
      ]);
    }
    expect(await historyFor(sql, mine, 99999)).toHaveLength(3);
    expect(await historyFor(sql, mine, 0)).toHaveLength(1);
    expect(await historyFor(sql, mine, -5)).toHaveLength(1);
  });
});

describe('the detail view', () => {
  it('returns the whole scoreboard, bots included, in seat order', async () => {
    await seedMatch(
      'm1',
      '2026-07-20T10:00:00Z',
      [
        { userId: mine, team: 0, won: true, duo: ['rook', 'fathom'], augments: ['a_1', 'a_2'] },
        ...bots(0, true),
        { userId: other, team: 1, won: false, duo: ['vex', 'piper'] },
        ...bots(1, false),
      ],
      { winner: 0, events: ['clashGolem'], cores: [1, 0] },
    );

    const detail = await matchDetail(sql, mine, 'm1');
    expect(detail.players).toHaveLength(8);
    expect(detail.players.map((p) => p.seat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(detail.players[0]).toMatchObject({ userId: mine, name: 'Rook', botTier: null });
    expect(detail.players[1]).toMatchObject({ userId: null, botTier: 'veteran' });
    expect(detail.players[4]).toMatchObject({ userId: other, name: 'Vex' });
    expect(detail.players[0].augments).toEqual(['a_1', 'a_2']);
  });

  it('hands back the summary blob exactly as it was written', async () => {
    const summary = {
      winner: 1,
      cores: [0, 1],
      events: [{ at: 120, kind: 'flankIsles', takenBy: 1 }],
      graphs: { gold: [0, 300, 900], xp: [0, 250, 800] },
      mvp: 'u_someone',
    };
    await seedMatch(
      'm1',
      '2026-07-20T10:00:00Z',
      [{ userId: mine, team: 1, won: true, duo: ['rook', 'fathom'] }],
      summary,
    );
    expect((await matchDetail(sql, mine, 'm1')).result).toEqual(summary);
  });

  it('keeps a big seed exact, as a string rather than a lossy number', async () => {
    await seedMatch('m1', '2026-07-20T10:00:00Z', [
      { userId: mine, team: 0, won: true, duo: ['rook', 'fathom'] },
    ]);
    const detail = await matchDetail(sql, mine, 'm1');
    expect(detail.seed).toBe('9007199254740993');
    // …and this is precisely why it is a string: a JS number cannot hold it.
    expect(String(Number(detail.seed))).toBe('9007199254740992');
  });

  it('refuses a match the caller was not in, and one that does not exist', async () => {
    await seedMatch('m1', '2026-07-20T10:00:00Z', [
      { userId: other, team: 0, won: true, duo: ['vex', 'piper'] },
    ]);
    await expect(matchDetail(sql, mine, 'm1')).rejects.toThrow(/no_match/);
    await expect(matchDetail(sql, mine, 'nope')).rejects.toThrow(/no_match/);
  });

  it('survives a teammate deleting their account', async () => {
    await seedMatch('m1', '2026-07-20T10:00:00Z', [
      { userId: mine, team: 0, won: true, duo: ['rook', 'fathom'] },
      { userId: other, team: 1, won: false, duo: ['vex', 'piper'] },
    ]);
    await sql`delete from users where id = ${other}`;
    const detail = await matchDetail(sql, mine, 'm1');
    expect(detail.players).toHaveLength(2);
    // Their seat and score survive; their identity does not.
    expect(detail.players[1]).toMatchObject({ userId: null, name: null, duo: ['vex', 'piper'] });
  });
});

describe('lifetime stats', () => {
  beforeEach(async () => {
    await seedMatch('m1', '2026-07-20T10:00:00Z', [
      {
        userId: mine,
        team: 0,
        won: true,
        duo: ['rook', 'fathom'],
        stats: { kills: 10, deaths: 2, assists: 4 },
        augments: ['a_surge', 'a_bulwark'],
      },
    ]);
    await seedMatch('m2', '2026-07-21T10:00:00Z', [
      {
        userId: mine,
        team: 0,
        won: false,
        duo: ['fathom', 'rook'],
        stats: { kills: 3, deaths: 6, assists: 8 },
        augments: ['a_surge'],
      },
    ]);
    await seedMatch('m3', '2026-07-22T10:00:00Z', [
      {
        userId: mine,
        team: 1,
        won: true,
        duo: ['mortis', 'sylva'],
        stats: { kills: 5, deaths: 5, assists: 5 },
        augments: ['a_bulwark'],
      },
    ]);
  });

  it('adds up matches, wins and the scoreline', async () => {
    const s = await lifetimeStats(sql, mine);
    expect(s).toMatchObject({ matches: 3, wins: 2, kills: 18, deaths: 13, assists: 17 });
    expect(s.winrate).toBeCloseTo(2 / 3);
    expect(s.kda).toBeCloseTo(35 / 13);
  });

  it('treats a duo as a pair regardless of which half was picked first', async () => {
    const s = await lifetimeStats(sql, mine);
    expect(s.favoriteDuo).toEqual({ ids: ['fathom', 'rook'], matches: 2 });
  });

  it('names the most-picked augment and the most-played champion', async () => {
    const s = await lifetimeStats(sql, mine);
    // a_surge and a_bulwark are tied at 2; the tiebreak is stable, not random.
    expect(s.topAugment).toEqual({ id: 'a_bulwark', picks: 2 });
    expect(s.topChampion).toEqual({ id: 'fathom', matches: 2 });
  });

  it('never divides by zero on a deathless record', async () => {
    await sql`delete from match_players where user_id = ${mine}`;
    await seedMatch('m9', '2026-07-25T10:00:00Z', [
      {
        userId: mine,
        team: 0,
        won: true,
        duo: ['rook', 'fathom'],
        stats: { kills: 4, deaths: 0, assists: 1 },
      },
    ]);
    expect((await lifetimeStats(sql, mine)).kda).toBe(5);
  });
});
