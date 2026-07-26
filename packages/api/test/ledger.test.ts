import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDb, type Sql } from '../src/db';
import {
  balance,
  DuplicateRequest,
  grant,
  InsufficientCoins,
  move,
  reconcile,
  spend,
} from '../src/ledger';

/**
 * The coin ledger (TECH §9).
 *
 * The load-bearing claim is that `profiles.coins` is only ever a *cache* of the
 * `transactions` sum. `reconcile()` is the assertion of that claim, and the
 * randomised test at the bottom runs a few hundred mixed operations before
 * demanding the two still agree — which is the only way a drift bug that needs
 * an unusual interleaving ever shows itself.
 */

let sql: Sql;

beforeAll(async () => {
  sql = await openDb();
  await migrate(sql);
});

beforeEach(async () => {
  await sql`delete from users`;
});

async function player(id: string, coins = 0): Promise<string> {
  await sql`insert into users (id, kind, name, device_key)
            values (${id}, 'guest', ${`P-${id}`}, ${`dk-${id}`})`;
  await sql`insert into profiles (user_id, coins) values (${id}, ${coins})`;
  return id;
}

describe('granting', () => {
  it('credits the cache and writes the reason down', async () => {
    const u = await player('a');
    expect(await grant(sql, u, 120, 'match_win', 'm_1')).toBe(120);
    expect(await balance(sql, u)).toBe(120);
    const [t] = await sql<{ delta: number; reason: string; ref_id: string }>`
      select delta, reason, ref_id from transactions where user_id = ${u}`;
    expect(t).toEqual({ delta: 120, reason: 'match_win', ref_id: 'm_1' });
  });

  it('refuses a negative grant rather than quietly stealing coins', async () => {
    const u = await player('a', 500);
    await expect(grant(sql, u, -100, 'oops')).rejects.toThrow(/bad_grant/);
    expect(await balance(sql, u)).toBe(500);
  });

  it('rejects a movement for an account that no longer exists', async () => {
    await expect(grant(sql, 'ghost', 100, 'match_win')).rejects.toThrow();
  });
});

describe('spending', () => {
  it('debits and leaves an audit trail', async () => {
    const u = await player('a', 1000);
    expect(await spend(sql, u, 350, 'purchase', 'champion:boltz')).toBe(650);
    expect(await balance(sql, u)).toBe(650);
  });

  it('refuses an overdraft and says what was needed and held', async () => {
    const u = await player('a', 100);
    const err = await spend(sql, u, 350, 'purchase').then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(InsufficientCoins);
    expect((err as InsufficientCoins).status).toBe(402);
    expect((err as InsufficientCoins).needed).toBe(350);
    expect((err as InsufficientCoins).held).toBe(100);
    // Nothing was written: a refused purchase leaves no ledger row.
    expect(await balance(sql, u)).toBe(100);
    const [n] = await sql<{ c: string }>`select count(*) c from transactions`;
    expect(Number(n.c)).toBe(0);
  });

  it('allows spending the balance down to exactly zero', async () => {
    const u = await player('a', 800);
    expect(await spend(sql, u, 800, 'purchase')).toBe(0);
    await expect(spend(sql, u, 1, 'purchase')).rejects.toThrow(/insufficient_coins/);
  });

  it('still refuses when the CHECK is the only thing looking', async () => {
    // `move` is the raw primitive — no balance read, straight to the write. The
    // constraint is what stands between a bug here and an invented coin.
    const u = await player('a', 10);
    const err = await move(sql, u, { delta: -999, reason: 'purchase' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(InsufficientCoins);
    expect((err as InsufficientCoins).held).toBeNull();
  });
});

describe('idempotency', () => {
  it('charges once no matter how many times the button is clicked', async () => {
    const u = await player('a', 1000);
    await spend(sql, u, 300, 'purchase', 'champion:boltz', 'idem-1');
    for (let i = 0; i < 3; i++) {
      await expect(
        spend(sql, u, 300, 'purchase', 'champion:boltz', 'idem-1'),
      ).rejects.toBeInstanceOf(DuplicateRequest);
    }
    expect(await balance(sql, u)).toBe(700);
  });

  it('survives two tabs racing on the same key', async () => {
    const u = await player('a', 1000);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => spend(sql, u, 200, 'purchase', 'boltz', 'race')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateRequest);
    }
    expect(await balance(sql, u)).toBe(800);
  });

  it('scopes the key per player — two people may click the same offer', async () => {
    const a = await player('a', 1000);
    const b = await player('b', 1000);
    await spend(sql, a, 300, 'purchase', 'boltz', 'shared-key');
    await expect(spend(sql, b, 300, 'purchase', 'boltz', 'shared-key')).resolves.toBe(700);
  });

  it('never deduplicates rewards, which have no key', async () => {
    const u = await player('a');
    await grant(sql, u, 120, 'match_win', 'm_1');
    await grant(sql, u, 120, 'match_win', 'm_2');
    expect(await balance(sql, u)).toBe(240);
  });
});

describe('atomicity', () => {
  it('takes the coins and the thing they bought together, or neither', async () => {
    const u = await player('a', 1000);
    await expect(
      sql.begin(async (tx) => {
        await spend(tx, u, 500, 'purchase', 'champion:boltz');
        await tx`insert into unlocks (user_id, kind, ref_id) values (${u}, 'champion', 'boltz')`;
        throw new Error('crashed after the charge');
      }),
    ).rejects.toThrow('crashed after the charge');

    expect(await balance(sql, u)).toBe(1000);
    const [n] = await sql<{ c: string }>`select count(*) c from transactions where user_id = ${u}`;
    expect(Number(n.c)).toBe(0);
    const owned = await sql<{ ref_id: string }>`select ref_id from unlocks where user_id = ${u}`;
    expect(owned).toEqual([]);
  });

  it('serialises two purchases of the last coins inside transactions', async () => {
    const u = await player('a', 500);
    const buy = (): Promise<number> => sql.begin((tx) => spend(tx, u, 400, 'purchase'));
    const results = await Promise.allSettled([buy(), buy()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balance(sql, u)).toBe(100);
  });
});

describe('reconciliation', () => {
  it('reports nothing when the cache tracks the ledger', async () => {
    const u = await player('a');
    await grant(sql, u, 500, 'match_win');
    await spend(sql, u, 120, 'purchase');
    expect(await reconcile(sql)).toEqual([]);
  });

  it('names the account when somebody writes the balance behind the ledger', async () => {
    const u = await player('a');
    await grant(sql, u, 500, 'match_win');
    // Exactly the mistake the ledger exists to catch: a bare UPDATE.
    await sql`update profiles set coins = 9999 where user_id = ${u}`;
    expect(await reconcile(sql)).toEqual([{ userId: u, cached: 9999, ledger: 500 }]);
  });

  it('holds after a few hundred mixed operations', async () => {
    const ids = await Promise.all([player('a'), player('b'), player('c')]);
    // Deterministic pseudo-random so a failure is reproducible.
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 300; i++) {
      const u = ids[Math.floor(next() * ids.length)];
      if (next() < 0.55) {
        await grant(sql, u, Math.floor(next() * 200) + 1, 'match_win', `m_${i}`);
      } else {
        const amount = Math.floor(next() * 300) + 1;
        await spend(sql, u, amount, 'purchase', undefined, `k_${i}`).catch((e: unknown) => {
          if (!(e instanceof InsufficientCoins)) throw e;
        });
      }
    }
    expect(await reconcile(sql)).toEqual([]);
    for (const u of ids) expect(await balance(sql, u)).toBeGreaterThanOrEqual(0);
  });
});
