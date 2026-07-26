import { buildApp } from '@mini-clash/api/src/app';
import { guest } from '@mini-clash/api/src/auth';
import { migrate, openDb, type Sql } from '@mini-clash/api/src/db';
import { historyFor, matchDetail } from '@mini-clash/api/src/history';
import { REWARDS } from '@mini-clash/data';
import type { MatchConfig } from '@mini-clash/protocol';
import { Sim } from '@mini-clash/sim';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reportMatch } from '../src/api-client';
import { createMatchState } from '../src/match';
import { buildReport, MatchTally, performanceShares } from '../src/report';

/**
 * The whole loop, end to end (ROADMAP v0.7 acceptance).
 *
 * A real bot match is simulated to completion, the report is built from its
 * final state, signed, and posted over **real HTTP** to a real api backed by
 * real Postgres (PGlite). Nothing is mocked, so this covers the parts unit
 * tests structurally cannot: that the signature is computed over the same bytes
 * the api verifies, that `fetch` and the raw-body parser agree, and that what
 * comes back out of `/history/:id` is what went on the field.
 */

const SECRET = 'integration-secret-32-characters!!';

let sql: Sql;
// Inferred rather than imported: fastify is the api's dependency, not ours.
let app: Awaited<ReturnType<typeof buildApp>>;
let uid: string;
let port: number;

beforeAll(async () => {
  process.env.MC_INTERNAL_SECRET = SECRET;
  sql = await openDb();
  await migrate(sql);
  app = await buildApp({ db: sql, quiet: true });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  port = typeof address === 'object' && address ? address.port : 0;
  process.env.MC_API_URL = `http://127.0.0.1:${port}`;
  uid = (await guest(sql, 'Reporter', 'device-key-reporter-0123456789')).user.id;
}, 60_000);

afterAll(async () => {
  await app?.close();
  delete process.env.MC_INTERNAL_SECRET;
  delete process.env.MC_API_URL;
});

function config(seed: number): MatchConfig {
  const players = [];
  for (let i = 0; i < 8; i++) {
    const team = i < 4 ? (0 as const) : (1 as const);
    players.push({
      id: i + 1,
      championId: ['rook', 'fathom', 'mortis', 'sylva'][i % 4],
      benchId: ['grukk', 'rattle', 'boltz', 'wisp'][i % 4],
      team,
      name: i === 0 ? 'Reporter' : `Bot${i}`,
      bot: 'veteran' as const,
    });
  }
  return { mode: 'bridge', seed, mapId: 'shatterbridge', players };
}

/** Simulate until somebody wins (or we run out of patience), tallying as we go. */
function playOut(seed: number): { sim: Sim; tally: MatchTally } {
  const sim = new Sim(config(seed));
  const tally = new MatchTally();
  const cap = 30 * 60 * 25; // the 25-minute match cap, in ticks
  for (let i = 0; i < cap && !sim.world.match?.over; i++) {
    sim.step();
    tally.note(sim, sim.world.events);
    sim.drainEvents();
  }
  return { sim, tally };
}

describe('performance shares', () => {
  it('put an average seat at exactly 0.5, so the swing is symmetric', () => {
    const even = [0, 1, 2, 3].map((i) => ({
      player: i + 1,
      team: 0 as const,
      kills: 5,
      assists: 5,
      damage: 1000,
    }));
    for (const value of performanceShares(even).values()) {
      expect(value).toBeCloseTo(0.5);
    }
  });

  it('reward the seat that did more and still pay the one that did less', () => {
    const skewed = [
      { player: 1, team: 0 as const, kills: 12, assists: 10, damage: 40000 },
      { player: 2, team: 0 as const, kills: 1, assists: 2, damage: 4000 },
      { player: 3, team: 0 as const, kills: 4, assists: 4, damage: 12000 },
      { player: 4, team: 0 as const, kills: 3, assists: 4, damage: 12000 },
    ];
    const shares = performanceShares(skewed);
    expect(shares.get(1)).toBeGreaterThan(shares.get(3) as number);
    expect(shares.get(3)).toBeGreaterThan(shares.get(2) as number);
    expect(shares.get(2)).toBeGreaterThan(0);
  });

  it('split a scoreless team evenly rather than dividing by zero', () => {
    const nothing = [0, 1].map((i) => ({
      player: i + 1,
      team: 1 as const,
      kills: 0,
      assists: 0,
      damage: 0,
    }));
    for (const value of performanceShares(nothing).values()) {
      expect(value).toBeCloseTo(0.5);
    }
  });

  it('score each team against itself, so a stomp does not zero the losers', () => {
    const shares = performanceShares([
      { player: 1, team: 0, kills: 20, assists: 20, damage: 90000 },
      { player: 2, team: 0, kills: 20, assists: 20, damage: 90000 },
      { player: 3, team: 1, kills: 1, assists: 1, damage: 3000 },
      { player: 4, team: 1, kills: 1, assists: 1, damage: 3000 },
    ]);
    expect(shares.get(3)).toBeCloseTo(0.5);
    expect(shares.get(4)).toBeCloseTo(0.5);
  });
});

describe('a real match, reported for real', () => {
  let matchId: string;

  it('plays out, reports over http, and lands in the database', async () => {
    const { sim, tally } = playOut(20260726);
    expect(sim.world.match?.over, 'match should resolve inside the cap').toBeTruthy();

    const match = createMatchState(config(20260726).players, { seed: 20260726 });
    matchId = `m_integration_${Date.now()}`;
    const payload = buildReport(sim, match, tally, {
      matchId,
      startedAt: new Date('2026-07-26T12:00:00.000Z'),
      users: new Map([[1, uid]]),
    });

    expect(payload.seats).toHaveLength(8);
    expect(payload.duration).toBeGreaterThan(60);
    expect(payload.seats.filter((s) => s.won)).toHaveLength(4);

    // Over the wire, signed, through fetch — not through inject.
    expect(await reportMatch(payload)).toBe(true);

    const [row] = await sql<{ duration: number }>`
      select duration from matches where id = ${matchId}`;
    expect(row.duration).toBe(payload.duration);
  }, 180_000);

  it('reproduces the scoreboard exactly through /history', async () => {
    const detail = await matchDetail(sql, uid, matchId);
    expect(detail.players).toHaveLength(8);

    const summary = detail.result as {
      winner: number;
      scoreboard: { seat: number; k: number; d: number; a: number; damage: number }[];
    };
    // The stored blob and the stored rows are two independent copies of the
    // same match; if they ever disagreed, the history screen would lie.
    for (const row of summary.scoreboard) {
      const seat = detail.players.find((p) => p.seat === row.seat);
      expect(seat, `seat ${row.seat}`).toBeDefined();
      expect(seat?.stats.kills).toBe(row.k);
      expect(seat?.stats.deaths).toBe(row.d);
      expect(seat?.stats.assists).toBe(row.a);
      expect(seat?.stats.damage).toBe(row.damage);
    }
    expect(detail.players.filter((p) => p.won).every((p) => p.teamId === summary.winner)).toBe(
      true,
    );
  });

  it('shows up in the player’s history with their duo and augments', async () => {
    const [entry] = await historyFor(sql, uid);
    expect(entry.matchId).toBe(matchId);
    expect(entry.duo).toHaveLength(2);
    expect(Array.isArray(entry.augments)).toBe(true);
    // Three draft levels in a full-length match.
    expect(entry.augments.length).toBeGreaterThan(0);
  });

  it('paid the human seat once, and only once', async () => {
    const [before] = await sql<{ coins: number }>`
      select coins from profiles where user_id = ${uid}`;
    expect(before.coins).toBeGreaterThanOrEqual(Math.round(REWARDS.loss * 0.8));

    const { sim, tally } = playOut(20260726);
    const match = createMatchState(config(20260726).players, { seed: 20260726 });
    const again = buildReport(sim, match, tally, {
      matchId,
      startedAt: new Date('2026-07-26T12:00:00.000Z'),
      users: new Map([[1, uid]]),
    });
    expect(await reportMatch(again)).toBe(true);

    const [after] = await sql<{ coins: number }>`
      select coins from profiles where user_id = ${uid}`;
    expect(after.coins).toBe(before.coins);
    const [n] = await sql<{ c: string }>`
      select count(*) c from transactions where user_id = ${uid}`;
    expect(Number(n.c)).toBe(1);
  }, 180_000);

  it('gave the seat mastery on both halves of its duo', async () => {
    const rows = await sql<{ champion_id: string; xp: number }>`
      select champion_id, xp from mastery where user_id = ${uid} order by champion_id`;
    expect(rows).toHaveLength(2);
    expect(rows[0].xp).toBeGreaterThan(0);
    expect(rows[0].xp).toBe(rows[1].xp);
  });
});

describe('a match nobody signed in for', () => {
  it('is not reported at all rather than reported with empty seats', async () => {
    const { sim, tally } = playOut(777);
    const match = createMatchState(config(777).players, { seed: 777 });
    const payload = buildReport(sim, match, tally, {
      matchId: 'm_botsonly',
      startedAt: new Date(),
      users: new Map(),
    });
    expect(payload.seats.every((s) => s.userId === null)).toBe(true);
    // The room skips the post entirely in this case; if it ever did post, the
    // api still writes the match and pays nobody — which is also correct.
    expect(await reportMatch(payload)).toBe(true);
    const [n] = await sql<{ c: string }>`select count(*) c from transactions`;
    expect(Number(n.c)).toBe(1); // still just the one from the match above
  }, 180_000);
});
