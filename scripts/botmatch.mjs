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
const JSON_OUT = opt('json', '');
/** Balance A/B: pin this team's bots to one half of their duo (no Tag Swap). */
const NO_SWAP_TEAM = opt('no-swap-team', '') === '' ? null : Number(opt('no-swap-team', '0'));
/** Draw duos per-seat instead of exhausting the roster (see dealFreeDuos). */
const FREE_DUOS = args.includes('--free-duos');

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

/**
 * Draw duos independently per seat instead of exhausting the roster.
 *
 * Why this mode exists: champion select deals 8 *team-unique* halves, so at a
 * roster of exactly 8 both teams field every champion and every match is a
 * mirror — champion winrate is pinned at 50% by construction and measures
 * nothing. `--free-duos` lets teams differ so champion-level strength is
 * actually observable. It is a measurement instrument, not how the game deals.
 */
function dealFreeDuos() {
  const pool = CHAMPION_LIST.map((c) => c.id);
  const duos = [];
  for (let s = 0; s < 4; s++) {
    const a = pool[Math.floor(rand() * pool.length)];
    let b = pool[Math.floor(rand() * pool.length)];
    while (b === a && pool.length > 1) b = pool[Math.floor(rand() * pool.length)];
    duos.push([a, b]);
  }
  return duos;
}

/** Deal one team's four duos the way champion select does: 8 team-unique halves. */
function dealTeamDuos() {
  const pool = CHAMPION_LIST.map((c) => c.id);
  // Fisher-Yates on the harness LCG (the sim's own RNG stays untouched).
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const duos = [];
  for (let s = 0; s < 4; s++) {
    // Wrap when the roster is smaller than 8 — never repeat inside one duo.
    const a = pool[(s * 2) % pool.length];
    const b = pool[(s * 2 + 1) % pool.length];
    duos.push([a, b === a ? pool[(s * 2 + 2) % pool.length] : b]);
  }
  return duos;
}

function rosterFor(seed) {
  const players = [];
  const deal = FREE_DUOS ? dealFreeDuos : dealTeamDuos;
  const duosByTeam = [deal(), deal()];
  for (let i = 0; i < 8; i++) {
    const team = i < 4 ? 0 : 1;
    const [champ, bench] = duosByTeam[team][i % 4];
    const tier = MIXED ? TIERS[Math.floor(rand() * TIERS.length)] : team === 0 ? TIER_A : TIER_B;
    players.push({
      id: i + 1,
      championId: champ,
      benchId: bench,
      team,
      bot: tier,
      name: `${tier}-${champ}-${i + 1}`,
    });
  }
  const cfg = { mode: 'bridge', seed, mapId: 'shatterbridge', players };
  if (NO_SWAP_TEAM !== null) cfg.rig = { noSwapTeam: NO_SWAP_TEAM };
  return cfg;
}

const capTicks = CAP_MIN * 60 * 30;
const results = [];
const champStats = new Map();
const allP95 = [];
/** Tag Swaps per seat across the whole run, and split by match outcome. */
const swapCounts = [];
const duoSwaps = { win: [], loss: [] };
/** Winrate per duo PAIRING — the thing that actually varies between teams. */
const duoStats = new Map();

for (let m = 0; m < MATCHES; m++) {
  const cfg = rosterFor(BASE_SEED + m * 7919);
  const sim = new Sim(cfg);
  // Count swaps per seat from the sim's own fx stream (`duo.swap`, source = entity).
  const swapsByPlayer = new Map();
  const playerOfEntity = new Map();
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
    for (const ev of snap.events) {
      if (ev.t === 'fx' && ev.key === 'duo.swap' && ev.source !== undefined) {
        const pid = playerOfEntity.get(ev.source);
        if (pid !== undefined) swapsByPlayer.set(pid, (swapsByPlayer.get(pid) ?? 0) + 1);
      }
    }
    if (playerOfEntity.size === 0) {
      for (const en of snap.entities) {
        if (en.kind === 'champion') playerOfEntity.set(en.id, en.player);
      }
    }
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
    // A duo's result belongs to BOTH halves — crediting only whichever kit
    // happened to be active at the final tick would be a coin flip per seat.
    // K/D/A is shared by construction (one seat, one scoreline).
    const halves = c.duo ? [c.def.id, c.duo.def.id] : [c.def.id];
    for (const id of halves) {
      const s = champStats.get(id) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0, swaps: 0 };
      s.games++;
      if (over && over.over.winner === e.team) s.wins++;
      s.k += c.kills;
      s.d += c.deaths;
      s.a += c.assists;
      champStats.set(id, s);
    }
    if (c.duo) {
      const key = [c.def.id, c.duo.def.id].sort().join(' + ');
      const ds = duoStats.get(key) ?? { games: 0, wins: 0, k: 0, d: 0 };
      ds.games++;
      if (over && over.over.winner === e.team) ds.wins++;
      ds.k += c.kills;
      ds.d += c.deaths;
      duoStats.set(key, ds);
    }
    swapCounts.push(swapsByPlayer.get(c.player) ?? 0);
    if (over) {
      const side = over.over.winner === e.team ? 'win' : 'loss';
      duoSwaps[side].push(swapsByPlayer.get(c.player) ?? 0);
    }
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
if (swapCounts.length > 0) {
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  console.info(
    `tag swaps: ${mean(swapCounts).toFixed(1)}/seat avg  ·  winners ${mean(duoSwaps.win).toFixed(1)}  ·  losers ${mean(duoSwaps.loss).toFixed(1)}`,
  );
}
for (const [id, s] of [...champStats.entries()].sort()) {
  console.info(
    `  ${id.padEnd(8)} games ${String(s.games).padStart(3)}  win ${((100 * s.wins) / s.games).toFixed(0).padStart(3)}%  avg KDA ${(s.k / s.games).toFixed(1)}/${(s.d / s.games).toFixed(1)}/${(s.a / s.games).toFixed(1)}`,
  );
}
if (duoStats.size > 0) {
  const rows = [...duoStats.entries()]
    .filter(([, s]) => s.games >= 6)
    .map(([k, s]) => ({ k, s, wr: (100 * s.wins) / s.games }))
    .sort((a, b) => b.wr - a.wr);
  console.info(`\n  duo pairings seen: ${duoStats.size} (showing n>=6, best→worst)`);
  for (const { k, s, wr } of rows) {
    console.info(
      `  ${k.padEnd(20)} n ${String(s.games).padStart(3)}  win ${wr.toFixed(0).padStart(3)}%  K/D ${(s.k / s.games).toFixed(1)}/${(s.d / s.games).toFixed(1)}`,
    );
  }
  if (!FREE_DUOS) {
    console.info(
      '  (select-accurate dealing: at 8 champions both teams field the whole roster,\n   so per-CHAMPION winrate is pinned at 50% by construction — read the pairings,\n   or use --free-duos to isolate champion strength.)',
    );
  }
}
if (JSON_OUT) {
  const champs = {};
  for (const [id, st] of champStats.entries()) champs[id] = st;
  writeFileSync(
    JSON_OUT,
    JSON.stringify({
      seed: BASE_SEED,
      matches: done.length,
      requested: MATCHES,
      avgMins: avg,
      t0wins,
      champs,
    }),
  );
  console.info(`json summary → ${JSON_OUT}`);
}
if (done.length < MATCHES) process.exitCode = 1;
