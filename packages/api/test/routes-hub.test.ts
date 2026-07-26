import { CHAMPION_PRICES } from '@mini-clash/data';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { migrate, openDb, type Sql } from '../src/db';

/**
 * The hub endpoints over HTTP (TECH §9, UI_UX §13).
 *
 * The module tests already prove the rules; these prove the *wiring* — that
 * `/champions` really is public, that `/shop/purchase` really does read the
 * `Idempotency-Key` header, and that every other endpoint really is behind the
 * session and CSRF gate rather than merely intended to be.
 */

let app: FastifyInstance;
let sql: Sql;

beforeAll(async () => {
  sql = await openDb();
  await migrate(sql);
  app = await buildApp({ db: sql, quiet: true });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

interface Signed {
  cookie: string;
  csrf: string;
  id: string;
}
let me: Signed;

beforeEach(async () => {
  await sql`delete from users`;
  await sql`delete from matches`;
  const res = await app.inject({
    method: 'POST',
    url: '/auth/guest',
    payload: { name: 'Rook', deviceKey: 'device-key-0123456789abcdef' },
  });
  const raw = String(
    Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie'][0]
      : res.headers['set-cookie'],
  );
  const body = res.json();
  me = { cookie: raw.split(';')[0], csrf: body.csrf, id: body.user.id };
});

const authed = (): Record<string, string> => ({ cookie: me.cookie, 'x-csrf-token': me.csrf });
const fund = (coins: number): Promise<unknown> =>
  sql`update profiles set coins = ${coins} where user_id = ${me.id}`;

describe('GET /champions', () => {
  it('serves the catalog to a visitor with no account at all', async () => {
    const res = await app.inject({ method: 'GET', url: '/champions' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.champions.length).toBeGreaterThan(0);
    expect(body.rotation.length).toBeGreaterThan(0);
    expect(body.champions.every((c: { owned: boolean }) => !c.owned)).toBe(true);
  });

  it('personalises it when the cookie is there', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/champions',
      headers: { cookie: me.cookie },
    });
    const body = res.json();
    expect(body.champions.filter((c: { owned: boolean }) => c.owned).length).toBe(4);
  });
});

describe('GET /profile', () => {
  it('needs a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/profile' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('no_session');
  });

  it('returns the whole hub payload in one round trip', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: me.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe(me.id);
    expect(body.profile).toMatchObject({ coins: 0, level: 1, showcase: [] });
    expect(body.unlocks.champion).toHaveLength(4);
    expect(body.mastery).toEqual([]);
    expect(body.lifetime).toMatchObject({ matches: 0, wins: 0 });
  });
});

describe('POST /shop/purchase', () => {
  it('is refused without the CSRF token', async () => {
    await fund(9000);
    const res = await app.inject({
      method: 'POST',
      url: '/shop/purchase',
      headers: { cookie: me.cookie },
      payload: { kind: 'champion', refId: 'boltz' },
    });
    expect(res.statusCode).toBe(403);
    const [n] = await sql<{ c: string }>`select count(*) c from transactions`;
    expect(Number(n.c)).toBe(0);
  });

  it('buys, debits, and shows up in the profile', async () => {
    await fund(9000);
    const res = await app.inject({
      method: 'POST',
      url: '/shop/purchase',
      headers: authed(),
      payload: { kind: 'champion', refId: 'boltz' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      paid: CHAMPION_PRICES.boltz,
      coins: 9000 - CHAMPION_PRICES.boltz,
    });

    const profile = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: me.cookie },
    });
    expect(profile.json().unlocks.champion).toContain('boltz');
  });

  it('honours the Idempotency-Key header across a retry', async () => {
    await fund(20000);
    const buy = (): Promise<{ statusCode: number }> =>
      app.inject({
        method: 'POST',
        url: '/shop/purchase',
        headers: { ...authed(), 'idempotency-key': 'tab-1' },
        payload: { kind: 'champion', refId: 'boltz' },
      });
    expect((await buy()).statusCode).toBe(200);
    const second = await buy();
    expect([409]).toContain(second.statusCode);
    const [n] = await sql<{ c: string }>`select count(*) c from transactions`;
    expect(Number(n.c)).toBe(1);
  });

  it('answers 402 with a readable code when the coins are short', async () => {
    await fund(10);
    const res = await app.inject({
      method: 'POST',
      url: '/shop/purchase',
      headers: authed(),
      payload: { kind: 'champion', refId: 'boltz' },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().error).toBe('insufficient_coins');
  });

  it('rejects a kind that is not a thing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/shop/purchase',
      headers: authed(),
      payload: { kind: 'battlepass', refId: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('quests over http', () => {
  it('deals on the first GET and claims through the whole round trip', async () => {
    const dealt = await app.inject({
      method: 'GET',
      url: '/quests',
      headers: { cookie: me.cookie },
    });
    expect(dealt.statusCode).toBe(200);
    const view = dealt.json();
    expect(view.daily).toHaveLength(3);
    expect(view.rerollAvailable).toBe(true);

    // Finish one the way a match would.
    const target = view.daily[0];
    await sql`update quests set progress = ${target.target}, state = 'ready'
               where user_id = ${me.id} and quest_id = ${target.id}`;

    const claim = await app.inject({
      method: 'POST',
      url: '/quests/claim',
      headers: authed(),
      payload: { questId: target.id },
    });
    expect(claim.statusCode, claim.body).toBe(200);
    expect(claim.json().coins).toBe(target.coins);

    const again = await app.inject({
      method: 'POST',
      url: '/quests/claim',
      headers: authed(),
      payload: { questId: target.id },
    });
    expect(again.statusCode).toBe(409);
  });

  it('rerolls once and then says so', async () => {
    const view = (
      await app.inject({ method: 'GET', url: '/quests', headers: { cookie: me.cookie } })
    ).json();
    const first = await app.inject({
      method: 'POST',
      url: '/quests/reroll',
      headers: authed(),
      payload: { questId: view.daily[0].id },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().quest.id).not.toBe(view.daily[0].id);

    const second = await app.inject({
      method: 'POST',
      url: '/quests/reroll',
      headers: authed(),
      payload: { questId: view.daily[1].id },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('reroll_used');
  });

  it('needs the CSRF token to claim', async () => {
    const view = (
      await app.inject({ method: 'GET', url: '/quests', headers: { cookie: me.cookie } })
    ).json();
    const res = await app.inject({
      method: 'POST',
      url: '/quests/claim',
      headers: { cookie: me.cookie },
      payload: { questId: view.daily[0].id },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('mastery over http', () => {
  it('claims a reached milestone and refuses a second time', async () => {
    await sql`insert into mastery (user_id, champion_id, xp, level)
              values (${me.id}, 'rook', 3400, 6)`;
    const first = await app.inject({
      method: 'POST',
      url: '/mastery/claim',
      headers: authed(),
      payload: { championId: 'rook' },
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().level).toBe(5);

    const second = await app.inject({
      method: 'POST',
      url: '/mastery/claim',
      headers: authed(),
      payload: { championId: 'rook' },
    });
    expect(second.statusCode).toBe(409);
  });
});

describe('profile writes', () => {
  it('persists settings and reads them back', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/profile/settings',
      headers: authed(),
      payload: { settings: { quality: 'high', shake: false, volume: { master: 0.7 } } },
    });
    expect(res.statusCode, res.body).toBe(200);
    const profile = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: me.cookie },
    });
    expect(profile.json().profile.settings).toEqual({
      quality: 'high',
      shake: false,
      volume: { master: 0.7 },
    });
  });

  it('refuses a showcase of champions the player does not own', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/profile/showcase',
      headers: authed(),
      payload: { showcase: ['vex'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('not_owned');
  });

  it('takes a showcase of owned champions', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/profile/showcase',
      headers: authed(),
      payload: { showcase: ['rook', 'sylva'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().showcase).toEqual(['rook', 'sylva']);
  });

  it('rejects a body with the wrong shape before it reaches the handler', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/profile/showcase',
      headers: authed(),
      payload: { showcase: 'rook' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
  });
});

describe('history over http', () => {
  it('is an empty list, not a 404, for a player with no matches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/history',
      headers: { cookie: me.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().matches).toEqual([]);
  });

  it('lists matches and opens one of them', async () => {
    await sql`insert into matches (id, mode, seed, started_at, duration, result)
              values ('m1', 'bridge', 42, now(), 900, '{"winner":0}'::jsonb)`;
    await sql`insert into match_players
                (match_id, user_id, seat, team_id, won, duo, stats)
              values ('m1', ${me.id}, 0, 0, true, '["rook","fathom"]'::jsonb,
                      '{"kills":9,"deaths":1,"assists":3}'::jsonb)`;

    const list = await app.inject({
      method: 'GET',
      url: '/history?limit=5',
      headers: { cookie: me.cookie },
    });
    expect(list.json().matches).toHaveLength(1);

    const detail = await app.inject({
      method: 'GET',
      url: '/history/m1',
      headers: { cookie: me.cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().result).toEqual({ winner: 0 });
    expect(detail.json().players[0].name).toBe('Rook');
  });

  it('404s a match the caller was not in', async () => {
    await sql`insert into matches (id, mode, seed, started_at, duration, result)
              values ('m2', 'bridge', 42, now(), 900, '{}'::jsonb)`;
    const res = await app.inject({
      method: 'GET',
      url: '/history/m2',
      headers: { cookie: me.cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('no_match');
  });
});
