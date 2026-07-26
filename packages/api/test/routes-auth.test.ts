import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { migrate, openDb, type Sql } from '../src/db';

/**
 * `/auth/*` over real HTTP (via Fastify's `inject`, which runs the full
 * lifecycle — hooks, parsers, serialisers — without opening a socket).
 *
 * These test the wiring the unit tests cannot: that the session travels in an
 * httpOnly cookie rather than a response body, that a mutating call without the
 * CSRF header is refused *before* it reaches any handler, and that nothing ever
 * hands the client a session token it could read from JavaScript.
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

beforeEach(async () => {
  await sql`delete from users`;
});

const DEVICE = 'device-key-0123456789abcdef';

interface Signed {
  cookie: string;
  csrf: string;
  id: string;
}

/** Sign in and keep what a browser would keep: the cookie and the CSRF token. */
async function signIn(name = 'Rook', deviceKey = DEVICE): Promise<Signed> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/guest',
    payload: { name, deviceKey },
  });
  expect(res.statusCode, res.body).toBe(200);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);
  const body = res.json();
  return { cookie: raw.split(';')[0], csrf: body.csrf, id: body.user.id };
}

const auth = (s: Signed): Record<string, string> => ({
  cookie: s.cookie,
  'x-csrf-token': s.csrf,
});

describe('health', () => {
  it('answers without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

describe('POST /auth/guest', () => {
  it('sets an httpOnly session cookie and never returns the token in the body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/guest',
      payload: { name: 'Rook', deviceKey: DEVICE },
    });
    expect(res.statusCode).toBe(200);

    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);
    expect(raw).toMatch(/^mc_session=/);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\//i);

    const body = res.json();
    expect(body.user.name).toBe('Rook');
    expect(body.csrf).toBeTruthy();
    // The session token is the credential; only the cookie carries it.
    expect(JSON.stringify(body)).not.toContain(raw.split('=')[1].split(';')[0]);
    expect(body.token).toBeUndefined();
  });

  it('rejects a body that is missing fields, with a readable code', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/guest', payload: { name: 'Rook' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
  });

  it('turns a domain rule into its own status, not a 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/guest',
      payload: { name: 'x', deviceKey: DEVICE },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_name');
  });

  it('refuses a form-encoded post, so a cross-site form cannot reach it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/guest',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'name=Rook&deviceKey=device-key-0123456789abcdef',
    });
    expect(res.statusCode).toBe(415);
  });
});

describe('GET /auth/me', () => {
  it('says "nobody" with a 200 rather than failing on a first visit', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: null, csrf: null });
  });

  it('recognises the cookie and reports what a rename would cost', async () => {
    const s = await signIn();
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: s.cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe(s.id);
    expect(body.renamePrice).toBe(0);
  });

  it('forgets an unknown or tampered cookie instead of erroring', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: 'mc_session=totally-made-up' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toBeNull();
  });
});

describe('csrf enforcement', () => {
  it('refuses a mutating call that has the cookie but no token', async () => {
    const s = await signIn();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/rename',
      headers: { cookie: s.cookie },
      payload: { name: 'Rookie' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('bad_csrf');
    // …and the handler never ran.
    const [u] = await sql<{ name: string }>`select name from users where id = ${s.id}`;
    expect(u.name).toBe('Rook');
  });

  it('refuses another session’s token', async () => {
    const a = await signIn('Rook', DEVICE);
    const b = await signIn('Other', 'device-key-bbbbbbbbbbbbbbbb');
    const res = await app.inject({
      method: 'POST',
      url: '/auth/rename',
      headers: { cookie: a.cookie, 'x-csrf-token': b.csrf },
      payload: { name: 'Rookie' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses a mutating call with a token but no session', async () => {
    const s = await signIn();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/rename',
      headers: { 'x-csrf-token': s.csrf },
      payload: { name: 'Rookie' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('no_session');
  });

  it('accepts the matching pair', async () => {
    const s = await signIn();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/rename',
      headers: auth(s),
      payload: { name: 'Rookie' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Rookie', charged: 0 });
  });
});

describe('rename pricing', () => {
  it('is free once, then costs coins the player must actually have', async () => {
    const s = await signIn();
    await app.inject({
      method: 'POST',
      url: '/auth/rename',
      headers: auth(s),
      payload: { name: 'One' },
    });

    // Second change, no coins: refused, and the name does not move.
    const broke = await app.inject({
      method: 'POST',
      url: '/auth/rename',
      headers: auth(s),
      payload: { name: 'Two' },
    });
    expect(broke.statusCode).toBe(402);
    expect(broke.json().error).toBe('insufficient_coins');
    const [still] = await sql<{ name: string }>`select name from users where id = ${s.id}`;
    expect(still.name).toBe('One');

    // With coins: charged exactly once, and the ledger says why.
    await sql`update profiles set coins = 1000 where user_id = ${s.id}`;
    const paid = await app.inject({
      method: 'POST',
      url: '/auth/rename',
      headers: auth(s),
      payload: { name: 'Two' },
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().charged).toBe(300);
    const [p] = await sql<{ coins: number }>`select coins from profiles where user_id = ${s.id}`;
    expect(p.coins).toBe(700);
    const led = await sql<{ delta: number; reason: string }>`
      select delta, reason from transactions where user_id = ${s.id}`;
    expect(led).toEqual([{ delta: -300, reason: 'rename' }]);

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: s.cookie } });
    expect(me.json().renamePrice).toBe(300);
  });
});

describe('upgrade and login over http', () => {
  it('keeps the same cookie working and lets the email sign in elsewhere', async () => {
    const s = await signIn();
    await sql`update profiles set coins = 900 where user_id = ${s.id}`;

    const up = await app.inject({
      method: 'POST',
      url: '/auth/upgrade',
      headers: auth(s),
      payload: { email: 'rook@example.com', password: 'correct horse battery' },
    });
    expect(up.statusCode, up.body).toBe(200);
    expect(up.json().user.kind).toBe('registered');

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: s.cookie } });
    expect(me.json().user.id).toBe(s.id);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'rook@example.com', password: 'correct horse battery' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.id).toBe(s.id);
    const [p] = await sql<{ coins: number }>`select coins from profiles where user_id = ${s.id}`;
    expect(p.coins).toBe(900);
  });

  it('answers a bad login with 401 and no cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ghost@example.com', password: 'whatever it is' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('bad_credentials');
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('signing out', () => {
  it('clears the cookie and kills the session server-side', async () => {
    const s = await signIn();
    const res = await app.inject({ method: 'POST', url: '/auth/logout', headers: auth(s) });
    expect(res.statusCode).toBe(200);
    const raw = String(res.headers['set-cookie']);
    expect(raw).toMatch(/mc_session=;/);

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: s.cookie } });
    expect(me.json().user).toBeNull();
  });

  it('drops the other devices on request but keeps this one', async () => {
    const first = await signIn();
    const second = await signIn();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout-others',
      headers: auth(second),
    });
    expect(res.statusCode).toBe(200);

    const mine = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: second.cookie },
    });
    expect(mine.json().user.id).toBe(second.id);
    const other = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: first.cookie },
    });
    expect(other.json().user).toBeNull();
  });
});

describe('deleting an account', () => {
  it('needs the name typed back before it will do anything', async () => {
    const s = await signIn('Rook');
    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/delete',
      headers: auth(s),
      payload: { confirm: 'rook' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toBe('confirm_mismatch');
    const [n] = await sql<{ c: string }>`select count(*) c from users`;
    expect(Number(n.c)).toBe(1);
  });

  it('takes the account, its profile and its sessions with it', async () => {
    const s = await signIn('Rook');
    const res = await app.inject({
      method: 'POST',
      url: '/auth/delete',
      headers: auth(s),
      payload: { confirm: 'Rook' },
    });
    expect(res.statusCode).toBe(200);
    for (const table of ['users', 'profiles', 'unlocks', 'sessions']) {
      const [n] = await sql<{ c: string }>`select count(*) c from ${{ raw: table } as never}`;
      expect(Number(n.c), table).toBe(0);
    }
  });
});

describe('unknown routes', () => {
  it('answer json, not html', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });
});
