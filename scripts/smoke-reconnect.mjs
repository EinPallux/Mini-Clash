#!/usr/bin/env node
/**
 * Reconnect smoke (ROADMAP v0.3): kill the tab mid-match → the rejoin ticket in
 * sessionStorage puts the SAME match back on screen after a refresh — the clock
 * keeps counting (not a new match) and no hub detour happens. Server-side the
 * seat was bot-covered meanwhile (covered by the room test suite).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startApi } from './lib/api-harness.mjs';

const OUT = process.env.SMOKE_OUT ?? 'test-results/smoke-reconnect';
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
  env: { ...process.env, PORT: '2567' },
});
for (let i = 0; i < 60; i++) {
  if ((await up(url)) && (await up('http://127.0.0.1:2567/healthz'))) break;
  await new Promise((r) => setTimeout(r, 500));
}

const LOCAL_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = process.env.SMOKE_CHROME || (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);
// The client boots through an account (v0.7), so the smokes run the shipped
// topology: a real api on the port vite's /api proxy points at.
const platform = await startApi({ name: 'reconnect' });

const errors = [];
let browser;

function parseClock(text) {
  const m = /(\d+):(\d\d)/.exec(text ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

try {
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 140)}`));
  // Applies on every navigation — survives the mid-match reload below.
  await page.addInitScript(() => {
    globalThis.__mcDebugWanted = true;
  });

  await page.goto(`${url}/?online=1`);
  await page.waitForTimeout(1500);
  const name = page.locator('input');
  if (await name.count()) {
    await name.fill('Refresher');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(1000);
  await page.getByText('Bridge Brawl', { exact: true }).click({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.getByText('LOCK IN', { exact: true }).click({ timeout: 5000 });
  await page.waitForSelector('.match-strip', { timeout: 45000 });
  // Play until the gates are open and the armies are actually fighting — the
  // acceptance is a mid-teamfight refresh, not a spawn-screen one.
  await page.mouse.click(900, 300, { button: 'right' });
  for (let i = 0; i < 40; i++) {
    const t = parseClock(await page.locator('.match-strip .clock').textContent());
    if (t >= 25) break;
    await page.waitForTimeout(1000);
  }
  const beforeClock = parseClock(await page.locator('.match-strip .clock').textContent());
  const ticket = await page.evaluate(() => sessionStorage.getItem('mc.rejoin'));
  console.info('clock before refresh:', beforeClock, 's · ticket present:', !!ticket);
  if (!ticket) errors.push('no rejoin ticket in sessionStorage');
  await page.screenshot({ path: `${OUT}/1-before.png` });

  // The refresh: boot must route straight back into the SAME match.
  const reloadedAt = Date.now();
  await page.reload();
  await page.waitForSelector('.match-strip', { timeout: 45000 });
  const resumeMs = Date.now() - reloadedAt;
  const afterClock = parseClock(await page.locator('.match-strip .clock').textContent());
  console.info(`resumed in ${(resumeMs / 1000).toFixed(1)}s · clock after: ${afterClock}s`);
  if (afterClock <= beforeClock) {
    errors.push(`clock went backwards (${beforeClock} → ${afterClock}) — looks like a NEW match`);
  }
  const sawHub = await page.evaluate(() => !!document.querySelector('.mode-row'));
  if (sawHub) errors.push('reload detoured through the hub instead of rejoining');
  // Orders still work on the reclaimed seat.
  const p0 = await page.evaluate(() => globalThis.__mcDebug?.self ?? null);
  await page.mouse.click(500, 320, { button: 'right' });
  await page.waitForTimeout(1500);
  const p1 = await page.evaluate(() => globalThis.__mcDebug?.self ?? null);
  const moved = p0 && p1 ? Math.hypot((p1.x ?? 0) - (p0.x ?? 0), (p1.z ?? 0) - (p0.z ?? 0)) : 0;
  if (moved < 0.3) errors.push(`champion unresponsive after rejoin (moved ${moved.toFixed(2)}u)`);
  await page.screenshot({ path: `${OUT}/2-after.png` });

  // Clean failure: kill the game server mid-match → the veil lands ≤ 10 s and
  // the player routes home — never a stuck client (the 0.3 contract).
  try {
    process.kill(-gameServer.pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
  const killedAt = Date.now();
  await page.waitForSelector('text=Match lost to the void', { timeout: 10000 });
  console.info(`failure veil in ${((Date.now() - killedAt) / 1000).toFixed(1)}s`);
  await page.screenshot({ path: `${OUT}/3-veil.png` });
  await page.getByText('Back', { exact: true }).first().click({ timeout: 5000 });
  await page.waitForSelector('.mode-row', { timeout: 8000 });
} catch (e) {
  errors.push(`smoke flow failed: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
} finally {
  await browser?.close();
  await platform.stop();
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
  console.error(`reconnect smoke FAILED:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.info('reconnect smoke OK — refresh rejoins the same match, seat responsive');
