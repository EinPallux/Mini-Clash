import { STARTER_CHAMPIONS } from '@mini-clash/data';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AuthError,
  checkCsrf,
  deleteAccount,
  guest,
  login,
  logout,
  rename,
  revokeOtherSessions,
  sessionFor,
  upgrade,
  validName,
} from '../src/auth';
import { migrate, openDb, type Sql } from '../src/db';

/**
 * Identity's promises (TECH §9–§10).
 *
 * The one that matters most is the last section's: **signing up must not cost
 * you anything you earned as a guest.** That is not a policy the service
 * remembers to honour, it is a consequence of the upgrade being an UPDATE — so
 * the test spends the coins and buys the unlock *first*, then upgrades, then
 * checks the row is still the same row.
 */

let sql: Sql;

beforeAll(async () => {
  sql = await openDb();
  await migrate(sql);
});

beforeEach(async () => {
  await sql`delete from users`;
});

const DEVICE = 'device-key-0123456789abcdef';

describe('names', () => {
  it('accepts what a player would plausibly type and rejects the rest', () => {
    for (const ok of ['Rook', 'a b', "O'Neil", 'Ünïcödé', '玩家一号', 'dot.dash-under_1']) {
      expect(validName(ok), ok).toBe(true);
    }
    for (const bad of ['x', '', '   ', 'x'.repeat(17), 'no<script>', 'semi;colon', 'tab\there']) {
      expect(validName(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('trims before measuring, so padding cannot smuggle a long name through', () => {
    expect(validName('  Rook  ')).toBe(true);
    expect(validName(`  ${'x'.repeat(17)}  `)).toBe(false);
  });
});

describe('guest sign-in', () => {
  it('creates the account and everything it starts with in one step', async () => {
    const s = await guest(sql, 'Newbie', DEVICE);
    expect(s.user.kind).toBe('guest');
    expect(s.user.name).toBe('Newbie');
    expect(s.user.email).toBeNull();
    expect(s.token).not.toBe(s.csrf);

    const [p] = await sql<{ coins: number; level: number }>`
      select coins, level from profiles where user_id = ${s.user.id}`;
    expect(p).toBeDefined();
    expect(p.coins).toBe(0);
    expect(p.level).toBe(1);

    const owned = await sql<{ ref_id: string }>`
      select ref_id from unlocks where user_id = ${s.user.id} and kind = 'champion'`;
    expect(owned.map((r) => r.ref_id).sort()).toEqual([...STARTER_CHAMPIONS].sort());
  });

  it('recognises the returning device instead of forking a second account', async () => {
    const first = await guest(sql, 'Newbie', DEVICE);
    const second = await guest(sql, 'Someone Else', DEVICE);
    expect(second.user.id).toBe(first.user.id);
    // The name the device offers on a later visit does not overwrite the one
    // the player may have deliberately changed since.
    expect(second.user.name).toBe('Newbie');
    expect(second.token).not.toBe(first.token);

    const [n] = await sql<{ c: string }>`select count(*) c from users`;
    expect(Number(n.c)).toBe(1);
  });

  it('does not duplicate the starter unlocks on a second visit', async () => {
    await guest(sql, 'Newbie', DEVICE);
    await guest(sql, 'Newbie', DEVICE);
    const [n] = await sql<{ c: string }>`select count(*) c from unlocks`;
    expect(Number(n.c)).toBe(STARTER_CHAMPIONS.length);
  });

  it('rejects a junk name or a device key too short to be a credential', async () => {
    await expect(guest(sql, 'x', DEVICE)).rejects.toThrow(/bad_name/);
    await expect(guest(sql, 'Fine', 'short')).rejects.toThrow(/bad_device_key/);
    const [n] = await sql<{ c: string }>`select count(*) c from users`;
    expect(Number(n.c)).toBe(0);
  });

  it('leaves nothing behind when seeding fails part-way', async () => {
    // Force the seed to blow up by colliding on the unlocks primary key.
    const s = await guest(sql, 'First', DEVICE);
    await expect(
      sql.begin(async (tx) => {
        await tx`insert into users (id, kind, name, device_key)
                 values ('half', 'guest', 'Half', 'device-key-half-0123456789')`;
        await tx`insert into unlocks (user_id, kind, ref_id) values ('half', 'champion', 'rook')`;
        await tx`insert into unlocks (user_id, kind, ref_id) values ('half', 'champion', 'rook')`;
      }),
    ).rejects.toThrow();
    const rows = await sql<{ id: string }>`select id from users`;
    expect(rows.map((r) => r.id)).toEqual([s.user.id]);
  });
});

describe('sessions', () => {
  it('resolves a live token to its player and forgets it on logout', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    const found = await sessionFor(sql, s.token);
    expect(found?.user.id).toBe(s.user.id);
    expect(found?.csrf).toBe(s.csrf);

    await logout(sql, s.token);
    expect(await sessionFor(sql, s.token)).toBeNull();
  });

  it('treats a missing, unknown or expired token as no session at all', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    expect(await sessionFor(sql, undefined)).toBeNull();
    expect(await sessionFor(sql, 'not-a-real-token')).toBeNull();

    await sql`update sessions set expires_at = now() - interval '1 second'
              where token = ${s.token}`;
    expect(await sessionFor(sql, s.token)).toBeNull();
  });

  it('reflects a rename without needing a fresh sign-in', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    await rename(sql, s.user.id, '  Rookie  ');
    expect((await sessionFor(sql, s.token))?.user.name).toBe('Rookie');
    await expect(rename(sql, s.user.id, '!!')).rejects.toThrow(/bad_name/);
  });

  it('drops the other devices but keeps the one asking', async () => {
    const a = await guest(sql, 'Rook', DEVICE);
    const b = await guest(sql, 'Rook', DEVICE);
    const c = await guest(sql, 'Rook', DEVICE);
    await revokeOtherSessions(sql, a.user.id, b.token);
    expect(await sessionFor(sql, b.token)).not.toBeNull();
    expect(await sessionFor(sql, a.token)).toBeNull();
    expect(await sessionFor(sql, c.token)).toBeNull();
  });

  it('takes the sessions down with the account', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    await deleteAccount(sql, s.user.id);
    expect(await sessionFor(sql, s.token)).toBeNull();
    const [n] = await sql<{ c: string }>`select count(*) c from profiles`;
    expect(Number(n.c)).toBe(0);
  });
});

describe('csrf', () => {
  it('passes the matching token and refuses everything else', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    expect(() => checkCsrf(s, s.csrf)).not.toThrow();
    expect(() => checkCsrf(s, undefined)).toThrow(/bad_csrf/);
    expect(() => checkCsrf(s, '')).toThrow(/bad_csrf/);
    expect(() => checkCsrf(s, `${s.csrf}x`)).toThrow(/bad_csrf/);
    expect(() => checkCsrf(s, s.token)).toThrow(/bad_csrf/);
  });
});

describe('upgrading a guest to a registered account', () => {
  it('keeps the same row — coins, unlocks and mastery all survive', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    // Play a bit first: this is the whole point of the test.
    await sql`update profiles set coins = 4200, xp = 900, level = 3 where user_id = ${s.user.id}`;
    await sql`insert into unlocks (user_id, kind, ref_id) values (${s.user.id}, 'champion', 'boltz')`;
    await sql`insert into mastery (user_id, champion_id, xp, level)
              values (${s.user.id}, 'rook', 2500, 5)`;

    await upgrade(sql, s.user.id, '  Rook@Example.COM ', 'correct horse battery');

    const [u] = await sql<{ id: string; kind: string; email: string }>`
      select id, kind, email from users`;
    expect(u.id).toBe(s.user.id);
    expect(u.kind).toBe('registered');
    expect(u.email).toBe('rook@example.com');

    const [p] = await sql<{ coins: number; xp: number }>`
      select coins, xp from profiles where user_id = ${s.user.id}`;
    expect(p.coins).toBe(4200);
    expect(p.xp).toBe(900);

    const owned = await sql<{ ref_id: string }>`
      select ref_id from unlocks where user_id = ${s.user.id}`;
    expect(owned.map((r) => r.ref_id)).toContain('boltz');
    const [m] = await sql<{ level: number }>`
      select level from mastery where user_id = ${s.user.id}`;
    expect(m.level).toBe(5);
  });

  it('leaves the session — and the device key — working afterwards', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    await upgrade(sql, s.user.id, 'rook@example.com', 'correct horse battery');

    const still = await sessionFor(sql, s.token);
    expect(still?.user.id).toBe(s.user.id);
    expect(still?.user.kind).toBe('registered');
    expect(still?.user.email).toBe('rook@example.com');

    // Same browser, same device key: still this account, not a new one.
    const again = await guest(sql, 'Rook', DEVICE);
    expect(again.user.id).toBe(s.user.id);
  });

  it('refuses a malformed email or a password anyone could guess', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    await expect(upgrade(sql, s.user.id, 'nope', 'correct horse battery')).rejects.toThrow(
      /bad_email/,
    );
    await expect(upgrade(sql, s.user.id, 'a@b.co', 'short')).rejects.toThrow(/weak_password/);
    const [u] = await sql<{ kind: string }>`select kind from users`;
    expect(u.kind).toBe('guest');
  });

  it('refuses an email somebody already registered, and says which failure it was', async () => {
    const a = await guest(sql, 'Ava', 'device-key-aaaaaaaaaaaaaaaa');
    await upgrade(sql, a.user.id, 'taken@example.com', 'correct horse battery');
    const b = await guest(sql, 'Bex', 'device-key-bbbbbbbbbbbbbbbb');
    const err = await upgrade(sql, b.user.id, 'TAKEN@example.com', 'another good one').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).status).toBe(409);
    expect((err as AuthError).code).toBe('email_taken');
    const [u] = await sql<{ kind: string }>`select kind from users where id = ${b.user.id}`;
    expect(u.kind).toBe('guest');
  });

  it('refuses to upgrade twice or to upgrade a stranger', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    await upgrade(sql, s.user.id, 'rook@example.com', 'correct horse battery');
    await expect(
      upgrade(sql, s.user.id, 'other@example.com', 'correct horse battery'),
    ).rejects.toThrow(/already_registered/);
    await expect(upgrade(sql, 'u_nobody', 'x@y.zz', 'correct horse battery')).rejects.toThrow(
      /no_user/,
    );
  });
});

describe('login', () => {
  it('signs the player back in on a machine that has never seen them', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    await upgrade(sql, s.user.id, 'rook@example.com', 'correct horse battery');

    const back = await login(sql, ' ROOK@example.com ', 'correct horse battery');
    expect(back.user.id).toBe(s.user.id);
    expect(back.user.kind).toBe('registered');
    expect(back.token).not.toBe(s.token);
    expect(await sessionFor(sql, back.token)).not.toBeNull();
  });

  it('gives the same answer for a wrong password and an email nobody has', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    await upgrade(sql, s.user.id, 'rook@example.com', 'correct horse battery');

    const attempt = async (email: string): Promise<unknown> =>
      login(sql, email, 'not the password').then(
        () => null,
        (e: unknown) => e,
      );
    for (const e of [await attempt('rook@example.com'), await attempt('ghost@example.com')]) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).status).toBe(401);
      expect((e as AuthError).code).toBe('bad_credentials');
    }
    // Neither attempt may leave a session behind.
    const [n] = await sql<{ c: string }>`select count(*) c from sessions`;
    expect(Number(n.c)).toBe(1);
  });

  it('does not accept the stored hash as if it were the password', async () => {
    const s = await guest(sql, 'Rook', DEVICE);
    await upgrade(sql, s.user.id, 'rook@example.com', 'correct horse battery');
    const [u] = await sql<{ password_hash: string }>`select password_hash from users`;
    expect(u.password_hash).toMatch(/^\$argon2id\$/);
    await expect(login(sql, 'rook@example.com', u.password_hash)).rejects.toThrow(
      /bad_credentials/,
    );
  });

  it('salts, so two players sharing a password do not share a hash', async () => {
    const a = await guest(sql, 'Ava', 'device-key-aaaaaaaaaaaaaaaa');
    const b = await guest(sql, 'Bex', 'device-key-bbbbbbbbbbbbbbbb');
    await upgrade(sql, a.user.id, 'a@example.com', 'the same password');
    await upgrade(sql, b.user.id, 'b@example.com', 'the same password');
    const rows = await sql<{ password_hash: string }>`select password_hash from users order by id`;
    expect(rows[0].password_hash).not.toBe(rows[1].password_hash);
    await expect(login(sql, 'b@example.com', 'the same password')).resolves.toBeTruthy();
  });
});
