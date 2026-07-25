#!/usr/bin/env node
/**
 * Combine `botmatch.mjs --json` shard summaries into one winrate table
 * (the nightly balance sweep). Reports the 40–60% band per champion; exits
 * non-zero only when shards lost matches — the known tuning residual is a
 * report, not a red build.
 */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: balance-aggregate.mjs shard1.json [shard2.json …]');
  process.exit(2);
}

let matches = 0;
let requested = 0;
let minsWeighted = 0;
const champs = new Map();
for (const f of files) {
  const s = JSON.parse(readFileSync(f, 'utf8'));
  matches += s.matches;
  requested += s.requested;
  minsWeighted += s.avgMins * s.matches;
  for (const [id, st] of Object.entries(s.champs)) {
    const agg = champs.get(id) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
    agg.games += st.games;
    agg.wins += st.wins;
    agg.k += st.k;
    agg.d += st.d;
    agg.a += st.a;
    champs.set(id, agg);
  }
}

console.info(`# Nightly balance sweep — ${matches}/${requested} matches, ${files.length} shards`);
console.info(`avg length ${(minsWeighted / Math.max(1, matches)).toFixed(1)} min`);
console.info('');
console.info('| Champion | Games | Winrate | Band 40–60 | avg KDA |');
console.info('|---|---|---|---|---|');
let outOfBand = 0;
for (const [id, s] of [...champs.entries()].sort()) {
  const wr = (100 * s.wins) / s.games;
  const inBand = wr >= 40 && wr <= 60;
  if (!inBand) outOfBand++;
  console.info(
    `| ${id} | ${s.games} | ${wr.toFixed(1)}% | ${inBand ? '✅' : '⚠️'} | ${(s.k / s.games).toFixed(1)}/${(s.d / s.games).toFixed(1)}/${(s.a / s.games).toFixed(1)} |`,
  );
}
console.info('');
console.info(
  outOfBand === 0
    ? 'All champions inside the 40–60% band.'
    : `${outOfBand} champion(s) outside the band — see ROADMAP v0.2 acceptance note.`,
);
if (matches < requested) {
  console.error(`\n${requested - matches} match(es) failed to finish — investigate.`);
  process.exit(1);
}
