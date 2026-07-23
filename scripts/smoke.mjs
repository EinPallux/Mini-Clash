#!/usr/bin/env node
/**
 * Visual smoke test: boots the built client in headless Chromium, plays through
 * name → hub → Training Grounds, drives real gameplay input, and captures
 * screenshots to scratch for verification. Exits non-zero on console errors or
 * missing HUD.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.env.SMOKE_OUT ?? 'test-results/smoke';
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
  if (await serverUp()) return; // reuse an already-running preview
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
const CHROME =
  process.env.SMOKE_CHROME ||
  ((await import('node:fs')).existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);

const errors = [];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto(url);
  // Boot → name screen.
  await page.waitForSelector('input[type=text]', { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/01-name.png` });
  await page.fill('input[type=text]', 'SmokeTester');
  await page.click('button.primary');
  // Hub.
  await page.waitForSelector('.mode-card', { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/02-hub.png` });
  // Start training (Rook is default selection).
  await page.click('.mode-card');
  await page.waitForSelector('.hud-bottom', { timeout: 40000 });
  await page.waitForTimeout(1800); // spawn fx settle
  await page.screenshot({ path: `${OUT}/03-arena-spawn.png` });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Walk toward the dummies (right-click toward screen right).
  await page.mouse.move(cx + 420, cy - 40);
  await page.waitForTimeout(120);
  await page.mouse.click(cx + 420, cy - 40, { button: 'right' });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/04-walked.png` });

  // Attack-move into the dummies, let autos land.
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/05-attacking.png` });

  // Cast Q at cursor (shield bash), then W wall, then R leap.
  await page.mouse.move(cx + 260, cy - 20);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/06-rook-q.png` });
  await page.keyboard.press('KeyQ'); // recast
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/07-rook-wall.png` });
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/08-rook-ult.png` });

  // Switch to Fathom and fire the kit.
  await page.click('.hud-topleft .hud-chip:nth-child(2)');
  await page.waitForTimeout(900);
  await page.mouse.move(cx + 380, cy - 30);
  await page.keyboard.press('KeyQ'); // skipshot
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/09-fathom-q.png` });
  await page.keyboard.press('KeyW'); // keg
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/10-fathom-keg.png` });
  await page.keyboard.press('KeyR'); // broadside
  await page.waitForTimeout(1700);
  await page.screenshot({ path: `${OUT}/11-fathom-broadside.png` });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/12-late.png` });

  // HUD sanity.
  const hpText = await page.locator('.bar.hp .txt').textContent();
  if (!hpText || !/\d+ \/ \d+/.test(hpText)) throw new Error(`HUD hp bar broken: '${hpText}'`);

  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('Failed to load resource'),
  );
  if (fatal.length > 0) {
    console.error(`CONSOLE ERRORS:\n${fatal.map((e) => `  ${e}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.info('smoke: OK — screenshots in', OUT);
  }
} catch (err) {
  console.error('smoke FAILED:', err);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (preview?.pid) {
    try {
      process.kill(-preview.pid, 'SIGTERM'); // whole pnpm→vite tree
    } catch {
      preview.kill();
    }
  }
}
