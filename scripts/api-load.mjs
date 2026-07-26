#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
/**
 * Hub endpoint load test (ROADMAP v0.7 acceptance: *api p95 < 120 ms for hub
 * endpoints under 100 rps synthetic load*).
 *
 * Boots the real api over real HTTP and drives it at a target request rate with
 * a fixed population of signed-in accounts, mixing the endpoints a hub actually
 * hits: `/profile`, `/champions`, `/quests`, `/history`. Reports per-endpoint
 * and overall percentiles.
 *
 *   node scripts/api-load.mjs [--rps 100] [--seconds 20] [--users 40]
 *
 * PGlite runs the database in-process. That is a *harsher* test than the VPS
 * for latency purposes, not a kinder one: every query competes with the api's
 * own event loop instead of running on its own server, so a p95 that passes
 * here has headroom on real Postgres.
 */
import { build } from 'esbuild';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const RPS = arg('rps', 100);
const SECONDS = arg('seconds', 20);
const USERS = arg('users', 40);
const PORT = 3190;
const BUDGET_MS = 120;

/* ------------------------------- Boot the api ----------------------------- */

process.env.MC_INTERNAL_SECRET = 'load-test-secret-32-characters!!';
const root = new URL('../', import.meta.url).pathname;
const outdir = `${root}packages/api/.dev/load/`;
mkdirSync(outdir, { recursive: true });
await build({
  entryPoints: [
    `${root}packages/api/src/app.ts`,
    `${root}packages/api/src/ledger.ts`,
    `${root}packages/api/src/auth.ts`,
  ],
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  alias: {
    '@mini-clash/data': `${root}packages/data/src/index.ts`,
    '@mini-clash/protocol': `${root}packages/protocol/src/index.ts`,
  },
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
const { buildApp } = await import(`${outdir}app.js`);
const { grant } = await import(`${outdir}ledger.js`);
const { guest, SESSION_COOKIE } = await import(`${outdir}auth.js`);
const app = await buildApp({ quiet: true });
await app.listen({ port: PORT, host: '127.0.0.1' });
const base = `http://127.0.0.1:${PORT}`;

/* ------------------------------- Population ------------------------------- */

console.info(`seeding ${USERS} accounts…`);
// Seeded through the auth module rather than through POST /auth/guest, because
// that route is rate-limited to 20 new accounts an hour per address — correctly,
// and this test has no business defeating it. The endpoints under measurement
// are the hub reads, and those are driven over real HTTP below.
const sessions = [];
for (let i = 0; i < USERS; i++) {
  const session = await guest(app.db, `Load${i}`, `device-key-load-${String(i).padStart(12, '0')}`);
  const userId = session.user.id;
  // Give them something to read back: coins, mastery and a match each.
  await grant(app.db, userId, 5000, 'load_seed');
  await app.db`insert into mastery (user_id, champion_id, xp, level)
               values (${userId}, 'rook', ${900 + i}, 3)`;
  const matchId = `m_load_${i}`;
  await app.db`insert into matches (id, mode, seed, started_at, duration, result)
               values (${matchId}, 'bridge', ${1000 + i}, now(), 900, '{"winner":0}'::jsonb)`;
  await app.db`insert into match_players (match_id, user_id, seat, team_id, won, duo, stats, augments)
               values (${matchId}, ${userId}, 0, 0, true,
                       '["rook","fathom"]'::jsonb,
                       '{"kills":9,"deaths":2,"assists":4}'::jsonb,
                       '["a_one","a_two"]'::jsonb)`;
  sessions.push({ cookie: `${SESSION_COOKIE}=${session.token}`, id: userId });
}
// Deal everyone their quests once, so the run measures reads and not first-deal
// writes — which a real hub does exactly once a day per player.
await Promise.all(sessions.map((s) => fetch(`${base}/quests`, { headers: { cookie: s.cookie } })));
console.info('seeded.\n');

/* --------------------------------- Drive ---------------------------------- */

// The mix a hub actually generates: the profile on every screen change, the
// catalog whenever Champions or the Store opens, quests and history on theirs.
const MIX = [
  { path: '/profile', weight: 4 },
  { path: '/champions', weight: 3 },
  { path: '/quests', weight: 2 },
  { path: '/history?limit=30', weight: 2 },
];
const bag = MIX.flatMap((m) => Array(m.weight).fill(m.path));
const samples = new Map(MIX.map((m) => [m.path, []]));
let errors = 0;
let throttled = 0;
let sent = 0;

const started = performance.now();
const interval = 1000 / RPS;
const inflight = [];
let next = 0;

for (let i = 0; ; i++) {
  const due = started + i * interval;
  if (due - started > SECONDS * 1000) break;
  const wait = due - performance.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const path = bag[next++ % bag.length];
  const session = sessions[i % sessions.length];
  sent++;
  inflight.push(
    (async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${base}${path}`, { headers: { cookie: session.cookie } });
        if (res.status === 429) throttled++;
        else if (!res.ok) errors++;
        await res.arrayBuffer();
      } catch {
        errors++;
      }
      samples.get(path).push(performance.now() - t0);
    })(),
  );
}
await Promise.all(inflight);
const elapsed = (performance.now() - started) / 1000;

/* --------------------------------- Report --------------------------------- */

const pct = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};
const fmt = (n) => `${n.toFixed(1)} ms`.padStart(9);

console.info(`Mini Clash — hub api load`);
console.info(`  ${sent} requests over ${elapsed.toFixed(1)}s = ${(sent / elapsed).toFixed(1)} rps`);
console.info(`  ${USERS} signed-in accounts, ${errors} error(s), ${throttled} rate-limited\n`);
console.info('  endpoint                n        p50        p95        p99        max');
console.info('  ' + '─'.repeat(72));

const all = [];
let worstP95 = 0;
for (const [path, list] of samples) {
  all.push(...list);
  const p95 = pct(list, 0.95);
  worstP95 = Math.max(worstP95, p95);
  console.info(
    `  ${path.padEnd(20)} ${String(list.length).padStart(5)} ${fmt(pct(list, 0.5))} ${fmt(p95)} ${fmt(pct(list, 0.99))} ${fmt(Math.max(...list))}`,
  );
}
console.info('  ' + '─'.repeat(72));
const overallP95 = pct(all, 0.95);
console.info(
  `  ${'overall'.padEnd(20)} ${String(all.length).padStart(5)} ${fmt(pct(all, 0.5))} ${fmt(overallP95)} ${fmt(pct(all, 0.99))} ${fmt(Math.max(...all))}`,
);

await app.close();

console.info();
// Throttling counts as a failure here: a hub that answers a NAT'd household
// with 429s has not served the load, however fast the requests it did serve.
const ok = worstP95 < BUDGET_MS && errors === 0 && throttled === 0;
if (ok) {
  console.info(`  PASS — worst endpoint p95 ${worstP95.toFixed(1)} ms, budget ${BUDGET_MS} ms`);
  process.exit(0);
}
console.error(
  `  FAIL — worst endpoint p95 ${worstP95.toFixed(1)} ms against a ${BUDGET_MS} ms budget` +
    (errors ? `, ${errors} request(s) failed` : '') +
    (throttled ? `, ${throttled} rate-limited` : ''),
);
process.exit(1);
