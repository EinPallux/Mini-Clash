#!/usr/bin/env node
/**
 * Visual verification for new champion kits: boots Training Grounds as each
 * champion, fires Q/W/R at a dummy, and captures a screenshot per beat.
 * Not a CI gate — a reviewer tool for "does this actually look right".
 *
 *   node scripts/shot-champions.mjs boltz wisp
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const CHAMPS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['boltz', 'wisp'];
const OUT = process.env.SHOT_OUT ?? 'test-results/champions';
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
  for (let i = 0; i < 60; i++) {
    if (await up(url)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
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
  for (const champ of CHAMPS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errors.push(`${champ}: ${e.message.slice(0, 160)}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${champ} console: ${m.text().slice(0, 160)}`);
    });
    await page.goto(url);
    await page.waitForTimeout(1200);
    const name = page.locator('input');
    if (await name.count()) {
      await name.fill('Shots');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(800);
    // Hub → Training Grounds.
    await page.getByText('Training Grounds', { exact: false }).first().click({ timeout: 8000 });
    await page.waitForTimeout(8000);

    // The trainer's champion switcher is a chip row, one button per champion.
    const label = champ[0].toUpperCase() + champ.slice(1);
    await page.getByRole('button', { name: label, exact: true }).click({ timeout: 8000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${champ}-idle.png` });
    // Zoomed crop around the champion: props and rig details are unreviewable at
    // the default battle camera distance.
    await page.screenshot({
      path: `${OUT}/${champ}-closeup.png`,
      clip: { x: 470, y: 220, width: 260, height: 260 },
    });

    // Walk toward the dummy line, then cast each slot with a beat between.
    await page.mouse.click(760, 330, { button: 'right' });
    await page.waitForTimeout(1800);
    for (const key of ['q', 'w', 'r']) {
      await page.mouse.move(900, 300);
      await page.keyboard.press(key);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${champ}-${key}.png` });
      // Second beat: telegraphed ultimates (Boltz's droppod) haven't landed yet
      // at 900 ms — catch the payload too, not just the warning.
      await page.waitForTimeout(1100);
      await page.screenshot({ path: `${OUT}/${champ}-${key}-late.png` });
      await page.waitForTimeout(600);
    }
    console.info(`${champ}: shots in ${OUT}`);
    await page.close();
  }
} finally {
  await browser?.close();
  if (preview) {
    try {
      process.kill(-preview.pid);
    } catch {
      /* gone */
    }
  }
}

if (errors.length > 0) {
  console.error(`champion shots had page errors:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.info('champion shots OK — no page errors');
