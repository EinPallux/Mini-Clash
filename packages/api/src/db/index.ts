import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Database access (TECH §9).
 *
 * One tiny interface over two drivers: **postgres.js** against a real server in
 * production, and **PGlite** — Postgres compiled to WASM, running in-process —
 * for tests and offline development. PGlite is not a mock: it is the same
 * engine, so a CHECK constraint, a unique partial index and `SELECT … FOR
 * UPDATE` all behave in the test suite exactly as they will on the VPS. That
 * matters here more than usual, because this service leans on the storage layer
 * to make a negative coin balance *impossible* rather than merely unlikely.
 */

export interface Sql {
  /** Tagged-template query returning rows. */
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  /** Run `fn` inside a transaction; throwing rolls it back. */
  begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  /** Execute raw SQL (migrations only — never user input). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/* ------------------------------- PGlite ---------------------------------- */

interface PgliteLike {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
  transaction<T>(fn: (tx: PgliteTx) => Promise<T>): Promise<T>;
}
interface PgliteTx {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

/** Template strings + values → a `$1, $2 …` statement. */
function build(
  strings: TemplateStringsArray,
  values: unknown[],
): { text: string; args: unknown[] } {
  let text = strings[0];
  const args: unknown[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    // `sql.raw`-style fragments splice in literally; everything else binds.
    if (v !== null && typeof v === 'object' && 'raw' in (v as Record<string, unknown>)) {
      text += String((v as { raw: unknown }).raw);
    } else {
      args.push(v);
      text += `$${args.length}`;
    }
    text += strings[i + 1];
  }
  return { text, args };
}

/** Splice a trusted SQL fragment (identifiers we control, never user input). */
export function raw(fragment: string): { raw: string } {
  return { raw: fragment };
}

function wrapPglite(db: PgliteLike): Sql {
  const runner = (q: PgliteLike | PgliteTx): Sql => {
    const fn = (async <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
      const { text, args } = build(strings, values);
      const res = await q.query<T>(text, args);
      return res.rows;
    }) as Sql;
    fn.exec = async (sql: string) => {
      await q.exec(sql);
    };
    fn.begin = async <T>(inner: (tx: Sql) => Promise<T>): Promise<T> => {
      if ('transaction' in q) return q.transaction((tx) => inner(runner(tx)));
      // Already inside one: Postgres has no real nesting we need here, and the
      // outer transaction's atomicity is what callers actually want.
      return inner(runner(q));
    };
    fn.close = async () => {
      if ('close' in q) await q.close();
    };
    return fn;
  };
  return runner(db);
}

/* ------------------------------ postgres.js ------------------------------- */

type PostgresJs = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
  begin: <T>(fn: (tx: PostgresJs) => Promise<T>) => Promise<T>;
  unsafe: (sql: string) => Promise<unknown>;
  end: () => Promise<void>;
};

function wrapPostgres(pg: PostgresJs): Sql {
  const fn = (async <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> =>
    (await pg(strings, ...values)) as T[]) as Sql;
  fn.exec = async (sql: string) => {
    await pg.unsafe(sql);
  };
  fn.begin = <T>(inner: (tx: Sql) => Promise<T>): Promise<T> =>
    pg.begin((tx) => inner(wrapPostgres(tx)));
  fn.close = () => pg.end();
  return fn;
}

/**
 * Open a connection. `DATABASE_URL` picks the real server; without it we fall
 * back to an in-memory PGlite, which is what makes `pnpm test` and a first
 * `pnpm dev` work on a laptop with nothing installed.
 */
export async function openDb(url = process.env.DATABASE_URL): Promise<Sql> {
  if (url) {
    const { default: postgres } = await import('postgres');
    return wrapPostgres(postgres(url, { max: 10, onnotice: () => {} }) as unknown as PostgresJs);
  }
  const { PGlite } = await import('@electric-sql/pglite');
  return wrapPglite(new PGlite() as unknown as PgliteLike);
}

/* ------------------------------ Migrations -------------------------------- */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Find the migrations directory by walking up from wherever this module ended
 * up. It runs from three different places — `src/db/`, the dev bundle in
 * `.dev/`, and next to `api.mjs` in the container — and a relative path that is
 * right for one is wrong for the others. `MIGRATIONS_DIR` overrides.
 */
function findMigrations(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  let dir = HERE;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'migrations');
    if (existsSync(join(candidate, '0001_init.sql'))) return candidate;
    dir = join(dir, '..');
  }
  throw new Error('migrations directory not found (set MIGRATIONS_DIR)');
}

/**
 * Apply every migration not yet recorded, each inside its own transaction.
 *
 * Plain ordered `.sql` files rather than a codegen step: a deploy script should
 * be able to run this with nothing but Node, and an operator should be able to
 * read exactly what is about to happen to their database. `schema.test.ts`
 * keeps the result honest against what the code expects.
 */
export async function migrate(sql: Sql, dir = findMigrations()): Promise<string[]> {
  await sql.exec(`create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );`);
  const done = new Set(
    (await sql<{ name: string }>`select name from _migrations`).map((r) => r.name),
  );
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const body = readFileSync(join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.exec(body);
      await tx`insert into _migrations (name) values (${file})`;
    });
    applied.push(file);
  }
  return applied;
}
