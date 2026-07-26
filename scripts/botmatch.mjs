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
  `export { Sim } from '@mini-clash/sim';\nexport { AUGMENTS, CHAMPION_LIST, EVENTS } from '@mini-clash/data';\n`,
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
const { Sim, AUGMENTS, CHAMPION_LIST, EVENTS } = await import(
  `file://${process.cwd()}/${bundlePath}`
);
const EVENTS_SIEGE = EVENTS.clashGolem.params.siegeSeconds;

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
/**
 * Augment report (ROADMAP v0.5 acceptance): per card, how often it was taken
 * when it appeared in an offer set, and the winrate of the seats that took it
 * against the winrate of the seats that were offered it and passed.
 */
const augStats = new Map();

/**
 * Event report (ROADMAP v0.6 acceptance). Three questions:
 *  - does the Living Bridge resolve, or does it stall matches past Sudden Death?
 *  - does taking the golem win you the game *too* reliably (< 65%)?
 *  - does a Collapse stage ever strand a unit on ground that has gone?
 */
const eventStats = new Map();
const eventRow = (kind) => {
  const r = eventStats.get(kind) ?? { ran: 0 };
  eventStats.set(kind, r);
  return r;
};
const golemGames = { total: 0, takerWon: 0, elderTotal: 0, elderWon: 0 };
const golemEnds = { expired: 0, killed: 0 };
const golemLives = [];
let strandedTotal = 0;
let stampOverlaps = 0;
let collapseStages = 0;
const augRow = (id) =>
  augStats.get(id) ??
  augStats
    .set(id, { offered: 0, taken: 0, tookGames: 0, tookWins: 0, passGames: 0, passWins: 0 })
    .get(id);

for (let m = 0; m < MATCHES; m++) {
  const cfg = rosterFor(BASE_SEED + m * 7919);
  const sim = new Sim(cfg);
  // Count swaps per seat from the sim's own fx stream (`duo.swap`, source = entity).
  const swapsByPlayer = new Map();
  const playerOfEntity = new Map();
  /** player -> set of augment ids that were ever put in front of them. */
  const offeredTo = new Map();
  const t0 = performance.now();
  const golemTakers = [];
  const golemTakenAt = new Map();
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
      // Offers are counted once per (player, card) so a reroll cannot inflate
      // the denominator for a card that was shown twice to the same seat.
      if (ev.t === 'draftOpen' || ev.t === 'draftReroll') {
        const seen = offeredTo.get(ev.player) ?? new Set();
        for (const id of ev.offers) seen.add(id);
        offeredTo.set(ev.player, seen);
      }
      // The Living Bridge (v0.6).
      if (ev.t === 'eventStarted') eventRow(ev.kind).ran++;
      if (ev.t === 'golemTaken') {
        golemTakers.push({ team: ev.team, elder: ev.elder });
        golemTakenAt.set(`${ev.team}:${ev.elder}`, sim.world.time);
      }
      // How a converted golem ends: crumbled on its own timer, or killed. If
      // nothing ever crumbles the 90 s siege window is not doing any work.
      if (ev.t === 'golemExpired') {
        const at = golemTakenAt.get(`${ev.team}:${ev.elder}`);
        golemEnds.expired++;
        if (at !== undefined) golemLives.push(sim.world.time - at);
      }
      if (ev.t === 'golemDied' && ev.team !== null) {
        const at = golemTakenAt.get(`${ev.team}:${ev.elder}`);
        golemEnds.killed++;
        if (at !== undefined) golemLives.push(sim.world.time - at);
      }
      if (ev.t === 'collapse') {
        collapseStages++;
        // Acceptance: a stage must never leave a unit standing on ground that
        // is now void, or pathing into it. Checked on the tick it happens.
        // Stranded = left standing on ground the stage just deleted. A unit
        // inside an ally's wall stamp is a different (and normal) thing — that
        // cell comes back when the wall expires, and pathing already handles
        // it — so it is counted separately rather than failing the rail.
        const voided = [];
        let inStamp = 0;
        for (const u of sim.world.entities) {
          if (u.kind !== 'champion' && u.kind !== 'mini' && u.kind !== 'golem') continue;
          if (u.dead) continue;
          if (Math.abs(u.z) > ev.deckHalf)
            voided.push(`${u.kind}@${u.x.toFixed(1)},${u.z.toFixed(1)}`);
          else if (sim.world.nav.isBlockedAt(u.x, u.z)) inStamp++;
        }
        stampOverlaps += inStamp;
        if (voided.length > 0) {
          strandedTotal += voided.length;
          console.info(
            `  ! collapse stage ${ev.stage} (deck ±${ev.deckHalf}) stranded ${voided.length}: ${voided.slice(0, 6).join(' ')}`,
          );
        }
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
    // Augment report: every card this seat saw, and whether they took it.
    const took = new Set(c.augments);
    const won = !!over && over.over.winner === e.team;
    for (const id of offeredTo.get(c.player) ?? []) {
      const row = augRow(id);
      row.offered++;
      if (took.has(id)) {
        row.taken++;
        row.tookGames++;
        if (won) row.tookWins++;
      } else {
        row.passGames++;
        if (won) row.passWins++;
      }
    }
    swapCounts.push(swapsByPlayer.get(c.player) ?? 0);
    if (over) {
      const side = over.over.winner === e.team ? 'win' : 'loss';
      duoSwaps[side].push(swapsByPlayer.get(c.player) ?? 0);
    }
  }
  // Golem advantage: did landing the killing blow decide the match?
  for (const g of golemTakers) {
    golemGames.total++;
    if (over && over.over.winner === g.team) golemGames.takerWon++;
    if (g.elder) {
      golemGames.elderTotal++;
      if (over && over.over.winner === g.team) golemGames.elderWon++;
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
/* ------------------------- Augment report (v0.5) ------------------------- */
// Rails from the ROADMAP acceptance line: pick-when-offered <= 65% and
// win-delta <= 56% for GENERIC cards. Signatures are excluded by design —
// they are built for one kit and are supposed to be near-auto-picks there.
const AUG_PICK_CAP = 0.65;
const AUG_WIN_CAP = 0.56;
if (augStats.size > 0) {
  const rows = [...augStats.entries()]
    .map(([id, r]) => {
      const def = AUGMENTS[id];
      return {
        id,
        name: def?.name ?? id,
        generic: def ? def.category !== 'signature' : true,
        rarity: def?.rarity ?? '?',
        offered: r.offered,
        pick: r.offered > 0 ? r.taken / r.offered : 0,
        // Win-delta is the winrate of seats that TOOK it. With n this small a
        // took-vs-passed difference is mostly noise, so the rail is on the
        // absolute rate, which is what the acceptance line names.
        win: r.tookGames > 0 ? r.tookWins / r.tookGames : 0,
        n: r.tookGames,
      };
    })
    .sort((a, b) => b.pick - a.pick);
  const generics = rows.filter((r) => r.generic);
  const sigs = rows.filter((r) => !r.generic);
  const sigPick = sigs.length ? (100 * sigs.reduce((t, r) => t + r.pick, 0)) / sigs.length : 0;
  console.info(
    `\n  augment report — ${augStats.size}/${Object.keys(AUGMENTS).length} cards seen ` +
      `(rails apply to the ${generics.length} generics: pick <= 65%, win <= 56%)`,
  );
  console.info(
    `  signatures: ${sigs.length} seen, ${sigPick.toFixed(0)}% average pick-when-offered ` +
      '— near-auto-pick is the design, they are built for that one kit',
  );
  const MIN_N = 8;
  const flagged = generics.filter(
    (r) => (r.offered >= MIN_N && r.pick > AUG_PICK_CAP) || (r.n >= MIN_N && r.win > AUG_WIN_CAP),
  );
  console.info('  generics, most-taken first:');
  for (const r of generics.slice(0, 14)) {
    const thin = r.offered < MIN_N ? ' (thin)' : '';
    console.info(
      `  ${r.name.padEnd(22)} ${r.rarity.padEnd(9)} offered ${String(r.offered).padStart(3)}  pick ${(100 * r.pick).toFixed(0).padStart(3)}%  win ${(100 * r.win).toFixed(0).padStart(3)}% (n ${r.n})${thin}`,
    );
  }
  if (flagged.length > 0) {
    console.info(
      `  ⚠ over the rails (n>=${MIN_N}): ${flagged
        .map((r) => `${r.name} ${(100 * r.pick).toFixed(0)}%/${(100 * r.win).toFixed(0)}%`)
        .join(', ')}`,
    );
  } else {
    console.info(`  ✓ no generic card over the rails at n>=${MIN_N}`);
  }
}

/* ------------------ The Living Bridge report (v0.6) ---------------------- */
// Acceptance rails: no stalemate past Sudden Death, golem-winner advantage
// under 65%, and not one unit stranded by a Collapse stage.
const GOLEM_WIN_CAP = 0.65;
const stalemates = results.length - done.length;
const pastSuddenDeath = done.filter((r) => r.mins * 60 >= 1050).length;
console.info('\n  living bridge report');
for (const [kind, r] of [...eventStats.entries()].sort()) {
  console.info(`  ${kind.padEnd(12)} ran ${String(r.ran).padStart(3)}×`);
}
console.info(
  `  collapse stages ${collapseStages}, units stranded on void: ${strandedTotal}` +
    (strandedTotal === 0 ? ' ✓' : ' ⚠') +
    `  (standing inside a live wall stamp, unrelated: ${stampOverlaps})`,
);
if (golemGames.total > 0) {
  const wr = golemGames.takerWon / golemGames.total;
  const ewr = golemGames.elderTotal ? golemGames.elderWon / golemGames.elderTotal : 0;
  console.info(
    `  golem taken ${golemGames.total}× — taker won ${(100 * wr).toFixed(0)}%` +
      (golemGames.elderTotal
        ? ` (Elder ${golemGames.elderTotal}×, ${(100 * ewr).toFixed(0)}%)`
        : '') +
      (wr > GOLEM_WIN_CAP && golemGames.total >= 8 ? '  ⚠ over the 65% rail' : ' ✓'),
  );
  const mean = golemLives.length ? golemLives.reduce((a, b) => a + b, 0) / golemLives.length : 0;
  console.info(
    `  converted golems: ${golemEnds.expired} crumbled on the ${EVENTS_SIEGE}s timer` +
      (golemLives.length ? ` (mean life ${mean.toFixed(0)}s)` : '') +
      `, ${golemEnds.killed} killed, ${golemGames.total - golemEnds.expired - golemEnds.killed} still standing at the end`,
  );
} else {
  console.info('  golem never taken — the objective is not being contested');
}
console.info(
  `  matches reaching Sudden Death: ${pastSuddenDeath}/${done.length}; unresolved at the ${CAP_MIN} min cap: ${stalemates}` +
    (stalemates === 0 ? ' ✓' : ' ⚠'),
);

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
      augments: Object.fromEntries(augStats),
      events: Object.fromEntries(eventStats),
      golem: golemGames,
      collapse: { stages: collapseStages, stranded: strandedTotal, stampOverlaps },
      stalemates,
    }),
  );
  console.info(`json summary → ${JSON_OUT}`);
}
if (done.length < MATCHES) process.exitCode = 1;
