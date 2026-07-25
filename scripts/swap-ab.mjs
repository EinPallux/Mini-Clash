#!/usr/bin/env node
/**
 * Tag Swap A/B (ROADMAP v0.4 acceptance): do bots that swap actually beat
 * identical bots that can't?
 *
 * Both teams are the same tier with the same duo deal; one team's brains are
 * pinned to a single half (`rig.noSwapTeam`). The swap-enabled side alternates
 * between team 0 and team 1 across matches so any side bias cancels out — the
 * harness reports the swapping side's winrate against the 55% acceptance bar.
 *
 *   node scripts/swap-ab.mjs --matches 40 --tier elite --seed 700
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const MATCHES = Number(opt('matches', '40'));
const TIER = opt('tier', 'elite');
const BASE_SEED = Number(opt('seed', '700'));
const CAP_MIN = Number(opt('cap', '25'));
const BAR = Number(opt('bar', '55'));

const outDir = 'test-results';
mkdirSync(outDir, { recursive: true });
const driverPath = join(outDir, '.swapab-driver.mjs');
writeFileSync(
  driverPath,
  `export { Sim } from '@mini-clash/sim';\nexport { CHAMPION_LIST } from '@mini-clash/data';\n`,
);
const esbuild = await import('esbuild');
const bundlePath = join(outDir, '.swapab-bundle.mjs');
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

let lcg = BASE_SEED >>> 0;
const rand = () => {
  lcg = (lcg * 1664525 + 1013904223) >>> 0;
  return lcg / 0x100000000;
};

/** Select-accurate deal: 8 team-unique halves as four duos. */
function dealTeamDuos() {
  const pool = CHAMPION_LIST.map((c) => c.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const duos = [];
  for (let s = 0; s < 4; s++) {
    const a = pool[(s * 2) % pool.length];
    const b = pool[(s * 2 + 1) % pool.length];
    duos.push([a, b === a ? pool[(s * 2 + 2) % pool.length] : b]);
  }
  return duos;
}

const capTicks = CAP_MIN * 60 * 30;
let swapWins = 0;
let finished = 0;
const swapSideSwaps = [];
const pinnedSideSwaps = [];

for (let m = 0; m < MATCHES; m++) {
  // Alternate which side may swap so the measurement is side-symmetric.
  const noSwapTeam = m % 2 === 0 ? 1 : 0;
  const swapTeam = 1 - noSwapTeam;

  // BOTH teams get the SAME duo deal, so the only difference is the swap itself.
  const duos = dealTeamDuos();
  const players = [];
  for (let i = 0; i < 8; i++) {
    const team = i < 4 ? 0 : 1;
    const [champ, bench] = duos[i % 4];
    players.push({
      id: i + 1,
      championId: champ,
      benchId: bench,
      team,
      bot: TIER,
      name: `${team === swapTeam ? 'swap' : 'pinned'}-${champ}`,
    });
  }
  const sim = new Sim({
    mode: 'bridge',
    seed: BASE_SEED + m * 7919,
    mapId: 'shatterbridge',
    players,
    rig: { noSwapTeam },
  });

  const playerOfEntity = new Map();
  const swapsByPlayer = new Map();
  let over = null;
  for (let t = 0; t < capTicks; t++) {
    const snap = sim.tick();
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

  for (const e of sim.world.entities) {
    if (e.kind !== 'champion' || !e.champ) continue;
    const n = swapsByPlayer.get(e.champ.player) ?? 0;
    (e.team === swapTeam ? swapSideSwaps : pinnedSideSwaps).push(n);
  }

  if (over) {
    finished++;
    if (over.over.winner === swapTeam) swapWins++;
    console.info(
      `match ${String(m + 1).padStart(3)}  swap side = T${swapTeam}  winner = T${over.over.winner}  ${
        over.over.winner === swapTeam ? '✔ swap' : '· pinned'
      }`,
    );
  } else {
    console.info(`match ${String(m + 1).padStart(3)}  CAP HIT (no result)`);
  }
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const wr = (100 * swapWins) / Math.max(1, finished);
console.info('\n===== Tag Swap A/B =====');
console.info(`tier ${TIER} · ${finished}/${MATCHES} matches finished · identical duo deals`);
console.info(`swap-enabled side won ${swapWins}/${finished} (${wr.toFixed(1)}%)`);
console.info(
  `swaps per seat: enabled ${mean(swapSideSwaps).toFixed(1)} · pinned ${mean(pinnedSideSwaps).toFixed(1)} (must be 0)`,
);

if (mean(pinnedSideSwaps) > 0) {
  console.error('FAILED: the pinned side swapped — rig.noSwapTeam is not being honored');
  process.exit(1);
}
if (finished < MATCHES * 0.9) {
  console.error(`FAILED: only ${finished}/${MATCHES} matches resolved`);
  process.exit(1);
}
if (wr < BAR) {
  console.error(`FAILED: swapping side at ${wr.toFixed(1)}% — acceptance bar is ${BAR}%`);
  process.exit(1);
}
console.info(`OK — swapping bots clear the ${BAR}% bar`);
