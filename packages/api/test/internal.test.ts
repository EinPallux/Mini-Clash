import { REWARDS } from '@mini-clash/data';
import {
  type MatchResultPayload,
  type MatchResultSeat,
  readTicket,
  signRequest,
} from '@mini-clash/protocol';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { guest } from '../src/auth';
import { migrate, openDb, type Sql } from '../src/db';
import { masteryFor, profileFor } from '../src/economy';
import { questsFor } from '../src/quests';

/**
 * The service boundary (TECH §9–§10).
 *
 * `/internal/match-result` is the only door coins can come through, so most of
 * this file is about the door rather than the room behind it: an unsigned
 * request, a replayed one, a tampered one and a stale one must all bounce, and
 * bounce before anything is written.
 */

const SECRET = 'test-secret-at-least-16-chars-long';

let app: FastifyInstance;
let sql: Sql;
let uid: string;

beforeAll(async () => {
  process.env.MC_INTERNAL_SECRET = SECRET;
  sql = await openDb();
  await migrate(sql);
  app = await buildApp({ db: sql, quiet: true });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  delete process.env.MC_INTERNAL_SECRET;
});

beforeEach(async () => {
  await sql`delete from users`;
  await sql`delete from matches`;
  uid = (await guest(sql, 'Rook', 'device-key-0123456789abcdef')).user.id;
});

/* --------------------------------- Helpers -------------------------------- */

const stats = (over: Partial<MatchResultSeat['stats']> = {}): MatchResultSeat['stats'] => ({
  kills: 5,
  deaths: 3,
  assists: 7,
  damage: 24000,
  gold: 11000,
  level: 14,
  towers: 2,
  golems: 1,
  swaps: 9,
  ...over,
});

function payload(over: Partial<MatchResultPayload> = {}): MatchResultPayload {
  const seats: MatchResultSeat[] = [
    {
      seat: 0,
      userId: uid,
      botTier: null,
      team: 0,
      won: true,
      duo: ['rook', 'fathom'],
      stats: stats(),
      augments: ['a_one', 'a_two', 'a_three'],
      performance: 0.5,
    },
    ...Array.from({ length: 7 }, (_, i) => ({
      seat: i + 1,
      userId: null,
      botTier: 'veteran' as const,
      team: (i < 3 ? 0 : 1) as 0 | 1,
      won: i < 3,
      duo: ['grukk', 'wisp'],
      stats: stats(),
      augments: [],
      performance: 0.5,
    })),
  ];
  return {
    matchId: 'match-1',
    mode: 'bridge',
    seed: 1234567,
    startedAt: '2026-07-26T10:00:00.000Z',
    duration: 940,
    result: { winner: 0, cores: [1, 0] },
    seats,
    ...over,
  };
}

type Injected = Awaited<ReturnType<FastifyInstance['inject']>>;

async function post(
  body: MatchResultPayload | string,
  opts: { secret?: string; at?: number; signBody?: string } = {},
): Promise<Injected> {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const at = opts.at ?? Math.floor(Date.now() / 1000);
  const headers = await signRequest(opts.secret ?? SECRET, opts.signBody ?? raw, at);
  return app.inject({
    method: 'POST',
    url: '/internal/match-result',
    headers: { ...headers, 'content-type': 'application/json' },
    payload: raw,
  });
}

/* ------------------------------- The door --------------------------------- */

describe('authentication', () => {
  it('refuses a request with no signature at all', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/match-result',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(payload()),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('no_signature');
    const [n] = await sql<{ c: string }>`select count(*) c from matches`;
    expect(Number(n.c)).toBe(0);
  });

  it('refuses a signature made with the wrong secret', async () => {
    const res = await post(payload(), { secret: 'a-completely-different-secret' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('bad_signature');
  });

  it('refuses a body edited after it was signed', async () => {
    const honest = payload();
    const tampered = JSON.stringify(payload({ matchId: 'match-evil' }));
    const res = await post(tampered, { signBody: JSON.stringify(honest) });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('bad_signature');
  });

  it('refuses a correctly-signed request that is too old to be live', async () => {
    const res = await post(payload(), { at: Math.floor(Date.now() / 1000) - 3600 });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('stale');
  });

  it('refuses one from too far in the future, too', async () => {
    const res = await post(payload(), { at: Math.floor(Date.now() / 1000) + 3600 });
    expect(res.statusCode).toBe(401);
  });

  it('is not reachable with a player session instead of a signature', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/guest',
      payload: { name: 'Cheat', deviceKey: 'device-key-cheater-0123456' },
    });
    const cookie = String(
      Array.isArray(signIn.headers['set-cookie'])
        ? signIn.headers['set-cookie'][0]
        : signIn.headers['set-cookie'],
    ).split(';')[0];
    const res = await app.inject({
      method: 'POST',
      url: '/internal/match-result',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': signIn.json().csrf },
      payload: JSON.stringify(payload()),
    });
    expect(res.statusCode).toBe(401);
  });

  it('answers 503 rather than running open when no secret is configured', async () => {
    const saved = process.env.MC_INTERNAL_SECRET;
    process.env.MC_INTERNAL_SECRET = '';
    try {
      const res = await post(payload());
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toBe('no_service_secret');
    } finally {
      process.env.MC_INTERNAL_SECRET = saved;
    }
  });
});

/* ------------------------------ What it writes ---------------------------- */

describe('recording a match', () => {
  it('writes the match, the scoreboard, and pays the human seat', async () => {
    const res = await post(payload());
    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    const body = res.json<{ duplicate: boolean; awards: { coins: number }[] }>();
    expect(body.duplicate).toBe(false);
    expect(body.awards).toHaveLength(1);

    const [m] = await sql<{ mode: string; duration: number }>`
      select mode, duration from matches where id = 'match-1'`;
    expect(m).toMatchObject({ mode: 'bridge', duration: 940 });
    const [n] = await sql<{ c: string }>`select count(*) c from match_players`;
    expect(Number(n.c)).toBe(8);

    // A win, average performance, first of the day: base plus the bonus.
    const profile = await profileFor(sql, uid);
    expect(profile.coins).toBe(REWARDS.win + REWARDS.firstWinOfDay);
    expect(profile.winStreak).toBe(1);
    expect(profile.xp).toBeGreaterThan(0);
  });

  it('splits mastery across both halves of the duo', async () => {
    await post(payload());
    const mastery = await masteryFor(sql, uid);
    expect(mastery.map((m) => m.championId).sort()).toEqual(['fathom', 'rook']);
    expect(mastery[0].xp).toBe(mastery[1].xp);
    expect(mastery[0].xp).toBeGreaterThan(0);
  });

  it('moves quest progress for the metrics the match reported', async () => {
    const before = await questsFor(sql, uid, new Date());
    await post(payload());
    const after = await questsFor(sql, uid, new Date());
    // Every metric in the pool is reported by this payload, so all four move.
    for (const q of [...after.daily, ...after.weekly]) {
      expect(q.progress, q.id).toBeGreaterThan(0);
    }
    expect(after.daily.map((q) => q.id)).toEqual(before.daily.map((q) => q.id));
  });

  it('pays nothing twice when the same match is reported again', async () => {
    await post(payload());
    const coinsAfterFirst = (await profileFor(sql, uid)).coins;

    const again = await post(payload());
    expect(again.statusCode).toBe(200);
    expect(again.json<{ duplicate: boolean }>().duplicate).toBe(true);
    expect((await profileFor(sql, uid)).coins).toBe(coinsAfterFirst);
    const [n] = await sql<{ c: string }>`select count(*) c from match_players`;
    expect(Number(n.c)).toBe(8);
  });

  it('pays a loss less than a win, and no day bonus', async () => {
    const seats = payload().seats.map((s) =>
      s.userId ? { ...s, won: false, team: 1 as const } : s,
    );
    await post(payload({ matchId: 'loss-1', seats }));
    expect((await profileFor(sql, uid)).coins).toBe(REWARDS.loss);
    expect((await profileFor(sql, uid)).winStreak).toBe(0);
  });

  it('scales the payout by the reported performance', async () => {
    const seats = payload().seats.map((s) => (s.userId ? { ...s, performance: 1 } : s));
    await post(payload({ matchId: 'perf-1', seats }));
    const expected = Math.round(REWARDS.win * (1 + REWARDS.performanceSwing));
    expect((await profileFor(sql, uid)).coins).toBe(expected + REWARDS.firstWinOfDay);
  });

  it('pays the first win of the day once, then only the base', async () => {
    await post(payload({ matchId: 'day-1' }));
    const first = (await profileFor(sql, uid)).coins;
    await post(payload({ matchId: 'day-2' }));
    expect((await profileFor(sql, uid)).coins).toBe(first + REWARDS.win);
  });

  it('keeps a whole match rather than dropping it when a player has vanished', async () => {
    const seats = payload().seats.map((s) => (s.userId ? { ...s, userId: 'u_deleted' } : s));
    const res = await post(payload({ matchId: 'ghost-1', seats }));
    expect(res.statusCode).toBe(200);
    const [n] = await sql<{ c: string }>`
      select count(*) c from match_players where match_id = 'ghost-1'`;
    expect(Number(n.c)).toBe(8);
    // The seat survives; it just belongs to nobody now.
    const [orphan] = await sql<{ user_id: string | null }>`
      select user_id from match_players where match_id = 'ghost-1' and seat = 0`;
    expect(orphan.user_id).toBeNull();
  });

  it('refuses a payload that seats one account twice', async () => {
    const seats = payload().seats.map((s, i) => (i < 2 ? { ...s, userId: uid } : s));
    const res = await post(payload({ matchId: 'dupe-1', seats }));
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('duplicate_user');
    const [n] = await sql<{ c: string }>`select count(*) c from matches where id = 'dupe-1'`;
    expect(Number(n.c)).toBe(0);
  });

  it('refuses obviously broken payloads without writing anything', async () => {
    for (const bad of [
      payload({ matchId: '' }),
      payload({ seats: [] }),
      payload({ duration: -5 }),
      payload({ startedAt: 'not a date' }),
    ]) {
      const res = await post(bad);
      expect(res.statusCode, JSON.stringify(res.json())).toBe(400);
    }
    expect((await profileFor(sql, uid)).coins).toBe(0);
  });

  it('refuses a body that is not json at all', async () => {
    const res = await post('{definitely not json');
    expect(res.statusCode).toBe(400);
  });
});

/* -------------------------------- Tickets --------------------------------- */

describe('POST /play/ticket', () => {
  async function signIn(): Promise<{ cookie: string; csrf: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/guest',
      payload: { name: 'Ticketed', deviceKey: 'device-key-ticket-0123456789' },
    });
    const raw = String(
      Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie'][0]
        : res.headers['set-cookie'],
    );
    return { cookie: raw.split(';')[0], csrf: res.json().csrf };
  }

  it('needs a session and a csrf token', async () => {
    const anon = await app.inject({ method: 'POST', url: '/play/ticket', payload: {} });
    expect(anon.statusCode).toBe(401);

    const s = await signIn();
    const noCsrf = await app.inject({
      method: 'POST',
      url: '/play/ticket',
      headers: { cookie: s.cookie },
      payload: {},
    });
    expect(noCsrf.statusCode).toBe(403);
  });

  it('mints a ticket the game server can verify, naming the player', async () => {
    const s = await signIn();
    const res = await app.inject({
      method: 'POST',
      url: '/play/ticket',
      headers: { cookie: s.cookie, 'x-csrf-token': s.csrf },
      payload: { mode: 'bridge' },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();

    const claims = await readTicket(SECRET, body.ticket, Math.floor(Date.now() / 1000));
    expect(claims).not.toBeNull();
    expect(claims?.name).toBe('Ticketed');
    expect(claims?.mode).toBe('bridge');
    // Starters plus this week's rotation — never the whole roster by default.
    expect(claims?.champions.length).toBeGreaterThanOrEqual(4);
    expect(claims?.champions.length).toBeLessThan(20);
  });

  it('mints one nobody else can forge', async () => {
    const s = await signIn();
    const res = await app.inject({
      method: 'POST',
      url: '/play/ticket',
      headers: { cookie: s.cookie, 'x-csrf-token': s.csrf },
      payload: {},
    });
    const ticket = res.json().ticket as string;
    expect(
      await readTicket('some-other-secret-16+', ticket, Math.floor(Date.now() / 1000)),
    ).toBeNull();
    // Editing the claims breaks the signature.
    const [claims, sig] = ticket.split('.');
    expect(await readTicket(SECRET, `${claims}x.${sig}`, Math.floor(Date.now() / 1000))).toBeNull();
  });

  it('mints one that expires', async () => {
    const s = await signIn();
    const res = await app.inject({
      method: 'POST',
      url: '/play/ticket',
      headers: { cookie: s.cookie, 'x-csrf-token': s.csrf },
      payload: {},
    });
    const ticket = res.json().ticket as string;
    const later = Math.floor(Date.now() / 1000) + 3600;
    expect(await readTicket(SECRET, ticket, later)).toBeNull();
  });

  it('includes a champion the player buys, on the next ticket', async () => {
    const s = await signIn();
    const uid2 = (await sql<{ id: string }>`select id from users where name = 'Ticketed'`)[0].id;
    const mint = async (): Promise<string[]> => {
      const res = await app.inject({
        method: 'POST',
        url: '/play/ticket',
        headers: { cookie: s.cookie, 'x-csrf-token': s.csrf },
        payload: {},
      });
      return res.json().champions;
    };
    const before = await mint();
    const locked = ['piper', 'vex', 'boltz', 'wisp'].find((c) => !before.includes(c));
    expect(locked).toBeDefined();
    await sql`insert into unlocks (user_id, kind, ref_id)
              values (${uid2}, 'champion', ${locked as string})`;
    expect(await mint()).toContain(locked);
  });
});
