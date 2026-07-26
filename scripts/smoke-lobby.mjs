#!/usr/bin/env node
/**
 * Custom-lobby smoke (ROADMAP v0.3): two real browsers against the real server.
 * Leader creates a lobby; a friend joins via the ?join= deep link; leader adds
 * a bot and starts; both run the server-dealt champion select and land in the
 * same online match. Also proves the friendly dead-code error.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startApi } from './lib/api-harness.mjs';

const OUT = process.env.SMOKE_OUT ?? 'test-results/smoke-lobby';
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
const platform = await startApi({ name: 'lobby' });

const errors = [];
let browser;

async function enterHub(page, name) {
  await page.waitForTimeout(1500);
  const input = page.locator('input');
  if (await input.count()) {
    await input.first().fill(name);
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(800);
}

try {
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();
  p1.on('pageerror', (e) => errors.push(`p1 pageerror: ${e.message.slice(0, 140)}`));
  p2.on('pageerror', (e) => errors.push(`p2 pageerror: ${e.message.slice(0, 140)}`));

  // Leader creates the lobby.
  await p1.goto(`${url}/`);
  await enterHub(p1, 'Leader');
  await p1.getByText('Play with friends', { exact: true }).click({ timeout: 8000 });
  await p1.getByText('CREATE LOBBY', { exact: true }).click({ timeout: 5000 });
  await p1.waitForSelector('.lobby-code', { timeout: 8000 });
  const code = (await p1.locator('.lobby-code').textContent())?.trim() ?? '';
  console.info('lobby code:', code);
  if (!/^[A-Z2-9]{6}$/.test(code)) errors.push(`bad lobby code: ${code}`);
  await p1.screenshot({ path: `${OUT}/1-created.png` });

  // Friend joins via the copy-link form (?join=CODE deep link).
  await p2.goto(`${url}/?join=${code}`);
  await enterHub(p2, 'Friend');
  await p2.waitForSelector('.fm-code', { timeout: 8000 });
  const prefilled = await p2.locator('.fm-code').inputValue();
  if (prefilled !== code) errors.push(`deep link did not prefill (${prefilled})`);
  await p2.getByText('JOIN', { exact: true }).click({ timeout: 5000 });
  await p2.waitForSelector('.lobby-code', { timeout: 8000 });

  // Both see two humans seated.
  for (const [label, page] of [
    ['p1', p1],
    ['p2', p2],
  ]) {
    const humans = await page.locator('.lobby-seat.human').count();
    if (humans !== 2) errors.push(`${label} sees ${humans} humans, expected 2`);
  }

  // Leader drops an explicit bot on a seat; both pages see it.
  await p1.locator('.ls-addbot').first().click();
  await p1.waitForSelector('.lobby-seat.bot', { timeout: 5000 });
  await p2.waitForSelector('.lobby-seat.bot', { timeout: 5000 });

  // Friend readies; leader starts; both get the server-dealt select ceremony.
  await p2.getByText('READY UP', { exact: true }).click({ timeout: 5000 });
  await p1.waitForSelector('.lobby-start:not([disabled])', { timeout: 5000 });
  await p1.getByText('START MATCH', { exact: true }).click({ timeout: 5000 });
  await p1.waitForSelector('.select-root .lock-btn', { timeout: 8000 });
  await p2.waitForSelector('.select-root .lock-btn', { timeout: 8000 });
  await p1.screenshot({ path: `${OUT}/2-select.png` });

  await p1.locator('.lock-btn').click();
  await p2.locator('.lock-btn').click();

  // Both land in the same online match (loading two WebGL clients takes a bit).
  await p1.waitForSelector('.match-strip', { timeout: 60000 });
  await p2.waitForSelector('.match-strip', { timeout: 60000 });
  await p1.screenshot({ path: `${OUT}/3-match-p1.png` });
  await p2.screenshot({ path: `${OUT}/4-match-p2.png` });

  // Dead-code join gets the friendly error, not a hang.
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p3 = await ctx3.newPage();
  await p3.goto(`${url}/?join=ZZZZZZ`);
  await enterHub(p3, 'Lost');
  await p3.waitForSelector('.fm-code', { timeout: 8000 });
  await p3.getByText('JOIN', { exact: true }).click({ timeout: 5000 });
  await p3.waitForSelector('.fm-error', { timeout: 8000 });
  const err = await p3.locator('.fm-error').textContent();
  console.info('dead-code error shown:', err?.slice(0, 60));
  await p3.screenshot({ path: `${OUT}/5-dead-code.png` });
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
  console.error(`lobby smoke FAILED:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.info('lobby smoke OK — create/join by code, bots, ready/start, select, shared match');
