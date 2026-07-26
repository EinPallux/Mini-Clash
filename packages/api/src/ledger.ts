import type { Sql } from './db';
import { ApiError } from './errors';

/**
 * The coin ledger (TECH §9: *coins are ledgered, balance is derived+cached*).
 *
 * Every movement writes a `transactions` row; `profiles.coins` is a cache kept
 * in step in the same statement. Two properties fall out of that and both are
 * load-bearing:
 *
 * - **Nothing appears from nowhere.** The balance can always be re-derived by
 *   summing the ledger, which is exactly what `reconcile()` does and what the
 *   economy tests assert after a few hundred random operations.
 * - **A double-click cannot charge twice.** Purchases carry an idempotency key;
 *   the partial unique index on `(user_id, idem_key)` is what enforces that,
 *   so the guarantee holds even when two tabs race in separate connections.
 *
 * `spend` deliberately does *not* read the balance and then write it. It writes
 * `coins = coins - amount` and lets the `coins >= 0` CHECK reject an overdraft,
 * so two concurrent purchases of the last 500 coins cannot both succeed.
 */

export interface Movement {
  delta: number;
  reason: string;
  refId?: string | null;
  idemKey?: string | null;
}

/**
 * Raised when a purchase would overdraw.
 *
 * `held` is null when the CHECK constraint caught it rather than the balance
 * read — at that point the transaction is aborted and cannot be asked anything
 * more, and inventing a number would be worse than admitting we do not have one.
 */
export class InsufficientCoins extends ApiError {
  constructor(
    readonly needed: number,
    readonly held: number | null,
  ) {
    super(402, 'insufficient_coins');
  }
}

/** Thrown when an idempotency key has already been used by this player. */
export class DuplicateRequest extends ApiError {
  constructor(readonly idemKey: string) {
    super(409, 'duplicate_request');
  }
}

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' &&
  e !== null &&
  ((e as { code?: string }).code === '23505' ||
    /duplicate key|unique constraint/i.test(String((e as Error).message ?? '')));

const isCheckViolation = (e: unknown): boolean =>
  typeof e === 'object' &&
  e !== null &&
  ((e as { code?: string }).code === '23514' ||
    /check constraint|coins_check/i.test(String((e as Error).message ?? '')));

export async function balance(sql: Sql, userId: string): Promise<number> {
  const rows = await sql<{ coins: number }>`select coins from profiles where user_id = ${userId}`;
  return rows[0]?.coins ?? 0;
}

/**
 * Move coins. Positive credits, negative debits; the caller has already decided
 * this is allowed, and this function makes it atomic and auditable.
 *
 * Must run inside a transaction whenever it is paired with anything else (an
 * unlock row, a quest claim) — otherwise the pairing is not atomic and a crash
 * can pay for a thing nobody received.
 */
export async function move(sql: Sql, userId: string, m: Movement): Promise<number> {
  try {
    await sql`insert into transactions (user_id, delta, reason, ref_id, idem_key)
              values (${userId}, ${m.delta}, ${m.reason}, ${m.refId ?? null}, ${m.idemKey ?? null})`;
  } catch (e) {
    if (m.idemKey && isUniqueViolation(e)) throw new DuplicateRequest(m.idemKey);
    throw e;
  }
  try {
    const rows = await sql<{ coins: number }>`
      update profiles set coins = coins + ${m.delta} where user_id = ${userId} returning coins`;
    if (!rows[0]) throw new ApiError(404, 'no_profile');
    return rows[0].coins;
  } catch (e) {
    // The CHECK fired: someone else spent the coins between the caller's read
    // and this write. Do not query for the balance to report — the transaction
    // is already aborted, and a second statement on it fails too.
    if (isCheckViolation(e)) throw new InsufficientCoins(-m.delta, null);
    throw e;
  }
}

export async function grant(
  sql: Sql,
  userId: string,
  amount: number,
  reason: string,
  refId?: string,
  idemKey?: string,
): Promise<number> {
  if (amount < 0) throw new ApiError(500, 'bad_grant');
  return move(sql, userId, { delta: amount, reason, refId, idemKey });
}

/**
 * Debit, refusing rather than overdrawing.
 *
 * The `for update` read is what produces a *useful* error — it can say what the
 * player actually holds. Inside a transaction it also serialises two concurrent
 * purchases so the second one sees the first one's balance; called bare it is
 * only advisory, which is why the CHECK constraint is still there behind it.
 */
export async function spend(
  sql: Sql,
  userId: string,
  amount: number,
  reason: string,
  refId?: string,
  idemKey?: string,
): Promise<number> {
  if (amount < 0) throw new ApiError(500, 'bad_spend');
  const rows = await sql<{ coins: number }>`
    select coins from profiles where user_id = ${userId} for update`;
  if (!rows[0]) throw new ApiError(404, 'no_profile');
  if (rows[0].coins < amount) throw new InsufficientCoins(amount, rows[0].coins);
  return move(sql, userId, { delta: -amount, reason, refId, idemKey });
}

/**
 * Re-derive the cached balance from the ledger and report any drift.
 *
 * Run by the economy tests after randomised traffic, and available to an
 * operator as `pnpm --filter @mini-clash/api reconcile` when a bug is suspected.
 */
export async function reconcile(
  sql: Sql,
): Promise<{ userId: string; cached: number; ledger: number }[]> {
  return sql<{ userId: string; cached: number; ledger: number }>`
    select p.user_id       as "userId",
           p.coins         as cached,
           coalesce(sum(t.delta), 0)::int as ledger
      from profiles p
      left join transactions t on t.user_id = p.user_id
     group by p.user_id, p.coins
    having p.coins <> coalesce(sum(t.delta), 0)`;
}
