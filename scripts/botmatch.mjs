#!/usr/bin/env node
/**
 * Balance harness (ROADMAP v0.2 acceptance): headless bot-vs-bot Bridge Brawls.
 * Reports match lengths, winners, champion winrates and K/D/A spreads.
 *
 *   node scripts/botmatch.mjs --matches 20 --tier elite --vs elite --seed 1000
 *   node scripts/botmatch.mjs --matches 100 --mixed        # random tier pools
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const MATCHES = Number(opt('matches', '10'));
const TIER_A = opt('tier', 'elite');
const TIER_B = opt('vs', TIER_A);
const BASE_SEED = Number(opt('seed', '42'));
const MIXED = args.includes('--mixed');
const CAP_MIN = Number(opt('cap', '25'));

const outDir = 'test-results';
mkdirSync(outDir, { recursive: true });
const driverPath = join(outDir, '.botmatch-driver.mjs');
writeFileSync(
  driverPath,
  `export { Sim } from '@mini-clash/sim';\nexport { CHAMPION_LIST } from '@mini-clash/data';\n`,
);
const esbuild = await import('esbuild');
const bundlePath = join(outDir, '.botmatch-bundle.mjs');
await esbuild.build({
  entryPoints: [driverPath],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['import'],
  outfile: bundlePath,
  logLevel: 'silent',
  alias: {
    '@mini-clash/sim': join(process.cwd(), 'packages/sim/src/index.ts'),
    '@mini-clash/data': join(process.cwd(), 'packages/data/src/index.ts'),
    '@mini-clash/protocol': join(process.cwd(), 'packages/protocol/src/index.ts'),
  },
});
const { Sim, CHAMPION_LIST } = await import(`file://${process.cwd()}/${bundlePath}`);

const TIERS = ['recruit', 'veteran', 'elite'];
// Tiny deterministic LCG for roster shuffles (harness-side only; sim stays seeded).
let lcg = BASE_SEED >>> 0;
const rand = () => {
  lcg = (lcg * 1664525 + 1013904223) >>> 0;
  return lcg / 0x100000000;
};

function rosterFor(seed) {
  const players = [];
  for (let i = 0; i < 8; i++) {
    const team = i < 4 ? 0 : 1;
    const champ = CHAMPION_LIST[Math.floor(rand() * CHAMPION_LIST.length)].id;
    const tier = MIXED ? TIERS[Math.floor(rand() * TIERS.length)] : team === 0 ? TIER_A : TIER_B;
    players.push({
      id: i + 1,
      championId: champ,
      team,
      bot: tier,
      name: `${tier}-${champ}-${i + 1}`,
    });
  }
  return { mode: 'bridge', seed, mapId: 'shatterbridge', players };
}

const capTicks = CAP_MIN * 60 * 30;
const results = [];
const champStats = new Map();
const allP95 = [];

for (let m = 0; m < MATCHES; m++) {
  const cfg = rosterFor(BASE_SEED + m * 7919);
  const sim = new Sim(cfg);
  const t0 = performance.now();
  let over = null;
  let ticks = 0;
  let events = 0;
  const tickMs = [];
  while (ticks < capTicks) {
    const tt = performance.now();
    const snap = sim.tick();
    tickMs.push(performance.now() - tt);
    ticks++;
    events += snap.events.length;
    if (snap.match.over) {
      over = snap.match;
      break;
    }
  }
  const wallMs = performance.now() - t0;
  tickMs.sort((a, b) => a - b);
  const p95 = tickMs[Math.floor(tickMs.length * 0.95)] ?? 0;
  allP95.push(p95);
  const mins = ticks / 30 / 60;
  const w = sim.world;
  for (const e of w.entities) {
    if (e.kind !== 'champion' || !e.champ) continue;
    const c = e.champ;
    const s = champStats.get(c.def.id) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
    s.games++;
    if (over && over.over.winner === e.team) s.wins++;
    s.k += c.kills;
    s.d += c.deaths;
    s.a += c.assists;
    champStats.set(c.def.id, s);
  }
  const kills = over ? over.teamKills.join('-') : '?';
  results.push({ seed: cfg.seed, mins, winner: over ? over.over.winner : null, kills, wallMs });
  const label = over ? `winner=T${over.over.winner}` : 'CAP HIT (no result)';
  console.info(
    `match ${String(m + 1).padStart(3)}  ${mins.toFixed(1).padStart(5)} min  kills ${kills.padStart(7)}  ${label}  (${(wallMs / 1000).toFixed(1)}s wall, ${(wallMs / ticks).toFixed(3)}ms/tick, ${events} events)`,
  );
}

const done = results.filter((r) => r.winner !== null);
const avg = done.reduce((s, r) => s + r.mins, 0) / Math.max(1, done.length);
const t0wins = done.filter((r) => r.winner === 0).length;
console.info('\n===== summary =====');
console.info(`${done.length}/${MATCHES} matches finished (cap ${CAP_MIN} min)`);
console.info(
  `avg length ${avg.toFixed(1)} min  ·  min ${Math.min(...done.map((r) => r.mins)).toFixed(1)}  ·  max ${Math.max(...done.map((r) => r.mins)).toFixed(1)}`,
);
console.info(
  `team 0 wins ${t0wins}/${done.length} (${((100 * t0wins) / Math.max(1, done.length)).toFixed(0)}%)`,
);
for (const [id, s] of [...champStats.entries()].sort()) {
  console.info(
    `  ${id.padEnd(8)} games ${String(s.games).padStart(3)}  win ${((100 * s.wins) / s.games).toFixed(0).padStart(3)}%  avg KDA ${(s.k / s.games).toFixed(1)}/${(s.d / s.games).toFixed(1)}/${(s.a / s.games).toFixed(1)}`,
  );
}
if (done.length < MATCHES) process.exitCode = 1;
