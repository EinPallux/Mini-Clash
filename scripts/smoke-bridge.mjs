#!/usr/bin/env node
/**
 * Bridge Brawl acceptance smoke (ROADMAP v0.2): boot → champion select (reroll,
 * bench swap, lock) → rigged match (?rig=win) → victory slab → podium → summary,
 * plus the airplane-mode check: after first cache, an offline reload still boots
 * to the hub and reaches champion select. Screenshots land in test-results/smoke-bridge.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startApi } from './lib/api-harness.mjs';

const OUT = process.env.SMOKE_OUT ?? 'test-results/smoke-bridge';
mkdirSync(OUT, { recursive: true });
const url = 'http://127.0.0.1:4173';

async function serverUp() {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

let preview = null;
async function waitForServer() {
  if (await serverUp()) return;
  preview = spawn(
    'pnpm',
    ['--filter', '@mini-clash/client', 'preview', '--port', '4173', '--strictPort'],
    { stdio: 'inherit', detached: true },
  );
  for (let i = 0; i < 60; i++) {
    if (await serverUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server never came up');
}

const LOCAL_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = process.env.SMOKE_CHROME || (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);

// The client boots through an account (v0.7), so the smokes run the shipped
// topology: a real api on the port vite's /api proxy points at.
const platform = await startApi({ name: 'bridge' });

const errors = [];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  let offlinePhase = false;
  page.on('console', (m) => {
    // While offline, resource-load failures are the expected path the SW recovers
    // from — only surface them as smoke errors when the network is up. Any
    // net:: error counts: the client polls the platform api as well as fetching
    // assets, and a disconnected fetch reports ERR_INTERNET_DISCONNECTED rather
    // than the ERR_FAILED the service worker's own requests produce.
    if (offlinePhase && /ERR_FAILED|net::ERR_/.test(m.text())) return;
    if (m.type() === 'error' && !m.text().includes('WebGL')) {
      errors.push(`console: ${m.text().slice(0, 200)}`);
    }
  });

  // Boot → name → hub (first visit also installs the offline service worker).
  await page.goto(`${url}/?rig=win`);
  await page.waitForTimeout(1500);
  const name = page.locator('input');
  if (await name.count()) {
    await name.fill('Smoke');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/1-hub.png` });

  // Champion select: deal → reroll → bench swap back → lock.
  await page.getByText('Bridge Brawl', { exact: true }).click({ timeout: 8000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/2-select.png` });
  // Duo deal (GAME_DESIGN §7.1): two chained cards, per-slot reroll + bench.
  const duoNames = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.duo-slot .dc-nm')].map((n) => n.textContent),
    );
  const before = await duoNames();
  if (before.length !== 2) errors.push(`expected a duo pair, saw ${before.length} card(s)`);
  if (before[0] === before[1]) errors.push(`duo holds the same champion twice (${before[0]})`);
  // Reroll the benched half; the active half must be untouched.
  await page.locator('.duo-slot').nth(1).locator('.slot-reroll').click();
  await page.waitForTimeout(900);
  const after = await duoNames();
  if (after[1] === before[1]) errors.push(`reroll did not change the card (${before[1]})`);
  if (after[0] !== before[0]) errors.push('reroll disturbed the other half of the duo');
  // The rerolled champion sits on the team bench — swap it back into that slot.
  await page.locator('.bench-card').first().click();
  await page.waitForTimeout(400);
  const back = await duoNames();
  if (back[1] !== before[1]) errors.push(`bench swap did not restore (${back[1]})`);
  await page.getByText('LOCK IN', { exact: true }).click();

  // Match loads; rigged enemy structures make the push land in ~1-2 min.
  await page.waitForTimeout(14000);
  const hasStrip = await page.evaluate(() => !!document.querySelector('.match-strip'));
  if (!hasStrip) errors.push('match strip missing after load');
  await page.screenshot({ path: `${OUT}/3-match.png` });

  let over = false;
  for (let i = 0; i < 90 && !over; i++) {
    await page.waitForTimeout(2000);
    over = await page.evaluate(() => !!document.querySelector('.end-veil'));
  }
  if (!over) errors.push('match never reached the end sequence');
  await page.screenshot({ path: `${OUT}/4-end-slab.png` });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/5-podium.png` });
  const cont = page.getByText('Continue', { exact: true });
  if (await cont.count()) await cont.click();
  else errors.push('podium Continue missing');
  await page.waitForTimeout(800);
  const summaryOk = await page.evaluate(
    () => document.body.textContent?.includes('Match summary') ?? false,
  );
  if (!summaryOk) errors.push('summary screen missing');
  await page.screenshot({ path: `${OUT}/6-summary.png` });
  const history = await page.evaluate(() => localStorage.getItem('mc.history'));
  if (!history?.includes('"result"')) errors.push('match history not written');

  // Airplane mode: the SW precaches the full build at install — wait for the
  // worker to be active and its cache populated, then cut the network.
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 40; i++) {
      const keys = await caches.keys();
      const name = keys.find((k) => k.startsWith('mini-clash-'));
      if (name) {
        const store = await caches.open(name);
        const entries = await store.keys();
        if (entries.length > 50) return entries.length;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return 0;
  });
  if (!cached) errors.push('service worker never finished precaching');
  offlinePhase = true;
  await context.setOffline(true);
  // The first offline reload can race the service worker's cold start under
  // CDP-emulated offline (observed on SwiftShader runners) — allow one retry.
  let offlineHub = false;
  for (let attempt = 0; attempt < 2 && !offlineHub; attempt++) {
    await page.reload().catch(() => {});
    await page.waitForTimeout(3000);
    offlineHub = await page.evaluate(
      () => document.body.textContent?.includes('MINI CLASH') ?? false,
    );
  }
  if (!offlineHub) errors.push('offline reload did not reach the app shell');
  try {
    await page.getByText('Bridge Brawl', { exact: true }).click({ timeout: 8000 });
    await page.waitForTimeout(2000);
    const offlineSelect = await page.evaluate(() => !!document.querySelector('.deal-card'));
    if (!offlineSelect) errors.push('offline champion select missing');
  } catch {
    errors.push('offline hub never showed the Bridge Brawl card');
  }
  await page.screenshot({ path: `${OUT}/7-offline-select.png` });
  await context.setOffline(false);
} finally {
  await browser?.close();
  await platform.stop();
  if (preview) {
    try {
      process.kill(-preview.pid);
    } catch {
      /* already gone */
    }
  }
}

if (errors.length > 0) {
  console.error(`bridge smoke FAILED:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.info('bridge smoke OK — select, rigged win, podium, summary, history, offline');
