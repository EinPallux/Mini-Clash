#!/usr/bin/env node
/**
 * Lag-simulation smoke (ROADMAP v0.3 acceptance): an online match through the
 * real server with 150 ms one-way delay + jitter + simulated loss. Verifies the
 * game stays playable — predicted movement starts near-instantly, corrections
 * stay under the visibility budget, and no page errors surface.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.env.SMOKE_OUT ?? 'test-results/smoke-lag';
mkdirSync(OUT, { recursive: true });
const url = 'http://127.0.0.1:4173';

async function up(u) {
  try {
    return (await fetch(u)).ok;
  } catch {
    return false;
  }
}

let preview = null;
if (!(await up(url))) {
  preview = spawn(
    'pnpm',
    ['--filter', '@mini-clash/client', 'preview', '--port', '4173', '--strictPort'],
    { stdio: 'inherit', detached: true },
  );
}
const gameServer = spawn('node', ['run.mjs'], {
  cwd: 'packages/server',
  detached: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '2567',
    MC_FAKE_LAG_MS: '150',
    MC_FAKE_JITTER_MS: '30',
    MC_FAKE_LOSS: '0.02',
  },
});
for (let i = 0; i < 60; i++) {
  if ((await up(url)) && (await up('http://127.0.0.1:2567/healthz'))) break;
  await new Promise((r) => setTimeout(r, 500));
}

const LOCAL_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = process.env.SMOKE_CHROME || (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);
const errors = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 150)}`));
  await page.addInitScript(() => {
    globalThis.__mcDebugWanted = true;
  });
  await page.goto(`${url}/?online=1`);
  await page.waitForTimeout(1500);
  const name = page.locator('input');
  if (await name.count()) {
    await name.fill('Laggy');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(1000);
  await page.getByText('Bridge Brawl', { exact: true }).click({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.getByText('LOCK IN', { exact: true }).click({ timeout: 5000 });
  await page.waitForTimeout(16000);

  const strip = await page.evaluate(() => !!document.querySelector('.match-strip'));
  if (!strip) errors.push('match never started under lag');

  // Predicted responsiveness: order a walk, sample position quickly — the local
  // champion must move well before a 300 ms round trip could confirm it.
  const p0 = await page.evaluate(() => globalThis.__mcDebug?.self ?? null);
  await page.mouse.click(900, 300, { button: 'right' });
  await page.waitForTimeout(250);
  const p1 = await page.evaluate(() => globalThis.__mcDebug?.self ?? null);
  const early = p0 && p1 ? Math.hypot((p1.x ?? 0) - (p0.x ?? 0), (p1.z ?? 0) - (p0.z ?? 0)) : 0;
  console.info('moved within 250ms of the click:', early.toFixed(2), 'u');
  if (early < 0.3) errors.push(`prediction unresponsive under lag (moved ${early.toFixed(2)}u)`);

  // Tag Swap must start on the keypress, not a round trip later (ROADMAP v0.4:
  // input → morph start ≤ 50 ms at 80 ms RTT; this runs at 150 ms + jitter).
  // Measured in-page (keypress → first morph frame): CDP round trips are far
  // too coarse to resolve a 350 ms morph window.
  await page.keyboard.press('Space');
  await page.waitForTimeout(1200);
  const swapMs = await page.evaluate(() => globalThis.__mcDebug?.swapLatencyMs ?? -1);
  console.info('swap: input → morph start', swapMs, 'ms');
  if (swapMs < 0) errors.push('swap morph never started');
  else if (swapMs > 50) errors.push(`swap felt laggy (${swapMs}ms input → morph)`);

  // Keep playing ~20 s of orders and watch the correction budget.
  for (let i = 0; i < 20; i++) {
    await page.mouse.click(700 + (i % 5) * 90, 280 + (i % 3) * 60, { button: 'right' });
    await page.waitForTimeout(900);
  }
  const dbg = await page.evaluate(() => globalThis.__mcDebug ?? null);
  console.info(
    `rtt: ${dbg?.rtt} ms · maxCorrection: ${dbg?.maxCorrection} u/step · maxError: ${dbg?.maxError} u`,
  );
  if ((dbg?.rtt ?? 0) < 250) errors.push(`fake lag not in effect (rtt ${dbg?.rtt})`);
  // Corrections drain rate-capped: no single step may read as a jump (TECH §6),
  // and raw divergence must never run away toward the 8u emergency snap.
  if ((dbg?.maxCorrection ?? 99) > 1.0) {
    errors.push(`correction step visible as a jump (${dbg?.maxCorrection}u)`);
  }
  if ((dbg?.maxError ?? 99) > 5.0) {
    errors.push(`prediction divergence ran away under lag (${dbg?.maxError}u)`);
  }
  await page.screenshot({ path: `${OUT}/lag-match.png` });
} finally {
  await browser?.close();
  if (preview) {
    try {
      process.kill(-preview.pid);
    } catch {
      /* gone */
    }
  }
  try {
    process.kill(-gameServer.pid, 'SIGKILL');
  } catch {
    /* gone */
  }
}

if (errors.length > 0) {
  console.error(`lag smoke FAILED:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.info('lag smoke OK — playable at 150ms +jitter +loss, corrections within budget');
