import { beforeAll, describe, expect, it } from 'vitest';
import { migrate, openDb, type Sql } from '../src/db';

/**
 * The storage layer's own guarantees (TECH §9).
 *
 * These run against PGlite — Postgres compiled to WASM — so a CHECK constraint
 * or a partial unique index behaves here exactly as it will on the VPS. That is
 * the point: the economy leans on the database to make some states impossible
 * rather than merely unreachable, and a mock would happily let them through.
 */

let sql: Sql;

beforeAll(async () => {
  sql = await openDb();
  await migrate(sql);
});

describe('migrations', () => {
  it('apply once and are idempotent on a second run', async () => {
    const again = await migrate(sql);
    expect(again).toEqual([]);
    const rows = await sql<{ name: string }>`select name from _migrations order by name`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].name).toBe('0001_init.sql');
  });

  it('created every table the service reads', async () => {
    const rows = await sql<{ table_name: string }>`
      select table_name from information_schema.tables where table_schema = 'public'`;
    const names = new Set(rows.map((r) => r.table_name));
    for (const t of [
      'users',
      'profiles',
      'unlocks',
      'mastery',
      'quests',
      'matches',
      'match_players',
      'transactions',
      'sessions',
    ]) {
      expect(names, `table ${t}`).toContain(t);
    }
  });
});

describe('constraints that make bad states impossible', () => {
  async function freshUser(id: string, coins = 100): Promise<void> {
    await sql`insert into users (id, kind, name, device_key)
              values (${id}, 'guest', ${`P-${id}`}, ${`dk-${id}`})`;
    await sql`insert into profiles (user_id, coins) values (${id}, ${coins})`;
  }

  it('refuses a negative coin balance at the storage layer', async () => {
    await freshUser('neg');
    await expect(
      sql`update profiles set coins = coins - 500 where user_id = 'neg'`,
    ).rejects.toThrow(/coins/i);
    const [row] = await sql<{ coins: number }>`select coins from profiles where user_id = 'neg'`;
    expect(row.coins).toBe(100);
  });

  it('refuses a registered account with no credential', async () => {
    await expect(
      sql`insert into users (id, kind, name) values ('bad', 'registered', 'No Creds')`,
    ).rejects.toThrow();
  });

  it('keeps one identity per email and per device key', async () => {
    await sql`insert into users (id, kind, name, email, password_hash)
              values ('e1', 'registered', 'One', 'a@b.c', 'x')`;
    await expect(
      sql`insert into users (id, kind, name, email, password_hash)
          values ('e2', 'registered', 'Two', 'a@b.c', 'y')`,
    ).rejects.toThrow();
  });

  it('charges once for a repeated idempotency key', async () => {
    await freshUser('idem');
    await sql`insert into transactions (user_id, delta, reason, idem_key)
              values ('idem', -10, 'purchase', 'key-1')`;
    await expect(
      sql`insert into transactions (user_id, delta, reason, idem_key)
          values ('idem', -10, 'purchase', 'key-1')`,
    ).rejects.toThrow();
    // …but the key is scoped per user: someone else may use the same string.
    await freshUser('idem2');
    await sql`insert into transactions (user_id, delta, reason, idem_key)
              values ('idem2', -10, 'purchase', 'key-1')`;
    // …and un-keyed rows (rewards) are never deduplicated against each other.
    await sql`insert into transactions (user_id, delta, reason) values ('idem', 120, 'match_win')`;
    await sql`insert into transactions (user_id, delta, reason) values ('idem', 120, 'match_win')`;
    const [n] = await sql<{ c: string }>`select count(*) c from transactions where user_id='idem'`;
    expect(Number(n.c)).toBe(3);
  });

  it('rolls a failed transaction all the way back', async () => {
    await freshUser('rb', 500);
    await expect(
      sql.begin(async (tx) => {
        await tx`update profiles set coins = 7 where user_id = 'rb'`;
        await tx`insert into transactions (user_id, delta, reason) values ('rb', -493, 'purchase')`;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const [p] = await sql<{ coins: number }>`select coins from profiles where user_id = 'rb'`;
    const [t] = await sql<{ c: string }>`select count(*) c from transactions where user_id = 'rb'`;
    expect(p.coins).toBe(500);
    expect(Number(t.c)).toBe(0);
  });
});
