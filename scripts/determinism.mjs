#!/usr/bin/env node
/**
 * Cross-environment determinism check (TECH §4, v0.1 acceptance):
 * bundles a fixed seeded intent script against @mini-clash/sim, runs it in
 * Node AND in headless Chromium, and fails if the state hashes diverge.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DRIVER = `
import { Sim, stateHash } from '@mini-clash/sim';

export function run() {
  const cfg = { mode: 'training', seed: 987654321, mapId: 'training', players: [{ id: 1, championId: 'fathom', team: 0 }] };
  const sim = new Sim(cfg);
  let seq = 0;
  const send = (intent) => sim.applyIntents([{ seq: seq++, player: 1, intent }]);
  const ticks = (n) => { for (let i = 0; i < n; i++) sim.tick(); };

  send({ t: 'move', x: 3, z: 1 });
  ticks(90);
  send({ t: 'cast', slot: 'q', x: 9, z: 0 });
  ticks(30);
  send({ t: 'cast', slot: 'w', x: 6, z: 2 });
  ticks(60);
  send({ t: 'attackMove', x: 12, z: 0 });
  ticks(150);
  send({ t: 'cast', slot: 'r', x: 14, z: 0 });
  ticks(120);
  send({ t: 'trainer', cmd: { k: 'switchChampion', championId: 'rook' } });
  send({ t: 'move', x: 5.8, z: 0 });
  ticks(120);
  send({ t: 'cast', slot: 'q', x: 8, z: 0 });
  ticks(20);
  send({ t: 'cast', slot: 'q', x: 8, z: 0 });
  ticks(60);
  return stateHash(sim);
}
`;

const outDir = 'test-results';
mkdirSync(outDir, { recursive: true });
const driverPath = join(outDir, '.determinism-driver.mjs');
writeFileSync(driverPath, DRIVER);

// Bundle driver + sim into one self-contained ESM file.
const esbuild = await import('esbuild');
const bundlePath = join(outDir, '.determinism-bundle.mjs');
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

// Node run.
const { run } = await import(`file://${process.cwd()}/${bundlePath}`);
const nodeHash = run();

// Browser run.
const { chromium } = await import('playwright');
const { readFileSync, existsSync } = await import('node:fs');
const LOCAL_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROME || (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined),
  args: ['--no-sandbox'],
});
let browserHash;
try {
  const page = await browser.newPage();
  const bundleSrc = readFileSync(bundlePath, 'utf8');
  browserHash = await page.evaluate(async (src) => {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const mod = await import(url);
    return mod.run();
  }, bundleSrc);
} finally {
  await browser.close();
}

if (nodeHash !== browserHash) {
  console.error(`DETERMINISM DRIFT: node=${nodeHash} chromium=${browserHash}`);
  process.exit(1);
}
console.info(`determinism: OK (${nodeHash}) — node and chromium agree`);
