#!/usr/bin/env node
/**
 * Power Surge draft shots (ROADMAP v0.5): opens the Training Grounds, deals a
 * draft with the trainer button, and captures the dock, the reroll, a hover and
 * the confirmation slab. Also asserts the acceptance line that the overlay never
 * eats a game input — WASD and Q/W/R still reach the game with the dock open.
 * Screenshots land in test-results/draft.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.env.SHOT_OUT ?? 'test-results/draft';
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
const CHROME = process.env.SHOT_CHROME || (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);

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
  await page.addInitScript(() => {
    globalThis.__mcDebugWanted = true;
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('WebGL')) {
      errors.push(`console: ${m.text().slice(0, 200)}`);
    }
  });

  await page.goto(url);
  await page.waitForTimeout(1500);
  const name = page.locator('input');
  if (await name.count()) {
    await name.fill('Drafter');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(1200);

  // Training Grounds — the on-demand draft lives in the trainer panel.
  await page.getByText('Training Grounds', { exact: true }).click({ timeout: 8000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/1-grounds.png` });

  // Give the draft the widest possible hand: a duo has both champions'
  // signatures in the pool, so the offer set shows a champion-specific card.
  await page.getByText('Vex', { exact: true }).first().click();
  await page.waitForTimeout(600);

  const dealt = async () => {
    await page.getByText('Deal augment draft', { exact: true }).click({ timeout: 8000 });
    await page.waitForSelector('.draft-card', { timeout: 8000 });
    await page.waitForTimeout(500);
  };
  await dealt();
  await page.screenshot({ path: `${OUT}/2-draft.png` });
  await page.locator('.draft-dock').screenshot({ path: `${OUT}/2b-dock.png` });

  // The dock must clear the HUD it informs: no overlap with the health/energy
  // bars or the ability cluster (UI_UX §9).
  const overlap = await page.evaluate(() => {
    const dock = document.querySelector('.draft-dock')?.getBoundingClientRect();
    const hit = [];
    for (const sel of ['.hud-bottom', '.bars', '.ability-row', '.augment-strip']) {
      const el = document.querySelector(sel);
      if (!el || !dock) continue;
      const r = el.getBoundingClientRect();
      if (
        dock.bottom > r.top &&
        dock.top < r.bottom &&
        dock.right > r.left &&
        dock.left < r.right
      ) {
        hit.push(sel);
      }
    }
    return hit;
  });
  if (overlap.length) errors.push(`dock overlaps ${overlap.join(', ')}`);

  const cards = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.draft-card')].map((c) => ({
        rarity: [...c.classList].find((k) => ['silver', 'gold', 'prismatic'].includes(k)),
        name: c.querySelector('.draft-name')?.textContent ?? '',
        owner: c.querySelector('.draft-owner')?.textContent ?? null,
      })),
    );
  const first = await cards();
  if (first.length !== 3) errors.push(`expected 3 offers, got ${first.length}`);
  if (!first.some((c) => c.owner)) errors.push('no champion-specific card in the offer set');
  console.info('offers:', JSON.stringify(first));

  // The dock must not eat game input (ROADMAP v0.5 acceptance): hold W and cast
  // Q with the draft open; the champion has to move and the cooldown has to go.
  const dbg = () => page.evaluate(() => globalThis.__mcDebug ?? null);
  const before = await dbg();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(400);
  const after = await dbg();
  if (before?.self && after?.self) {
    const moved = Math.hypot(after.self.x - before.self.x, after.self.z - before.self.z);
    if (moved < 0.5) errors.push(`overlay ate movement: moved only ${moved.toFixed(2)}u`);
    const cdQ = after.cds?.q ?? 0;
    if (cdQ <= 0) errors.push('overlay ate the Q cast (no cooldown started)');
    console.info(`input-through: moved ${moved.toFixed(2)}u, Q cd ${cdQ.toFixed(1)}s`);
  } else {
    errors.push('__mcDebug hook missing — cannot verify input pass-through');
  }
  await page.screenshot({ path: `${OUT}/3-draft-while-playing.png` });

  // Reroll swaps the whole hand for the one token.
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(700);
  const second = await cards();
  if (JSON.stringify(second) === JSON.stringify(first)) errors.push('reroll returned the same set');
  const spent = await page.evaluate(
    () => document.querySelector('.draft-reroll')?.disabled ?? false,
  );
  if (!spent) errors.push('reroll chip stayed enabled after spending the token');
  await page.screenshot({ path: `${OUT}/4-rerolled.png` });

  // Hover state, then take card 1 and catch the confirmation slab.
  await page.locator('.draft-card').first().hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/5-hover.png` });

  const takenName = second[0]?.name ?? '';
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(450);
  const slab = await page.evaluate(() => {
    const el = document.querySelector('.draft-slab');
    if (!el) return null;
    return {
      kicker: el.querySelector('.draft-slab-kicker')?.textContent ?? '',
      name: el.querySelector('.draft-slab-name')?.textContent ?? '',
      cls: el.className,
    };
  });
  if (!slab) errors.push('no confirmation slab after picking');
  else {
    if (slab.kicker !== 'ACQUIRED') errors.push(`a manual pick read "${slab.kicker}"`);
    if (slab.name !== takenName) errors.push(`slab shows "${slab.name}", took "${takenName}"`);
    console.info('slab:', JSON.stringify(slab));
  }
  await page.screenshot({ path: `${OUT}/6-taken.png` });
  // The slab animates out, so a clip beats an element screenshot (which waits
  // for stability that never arrives).
  const slabBox = await page.evaluate(() => {
    const r = document.querySelector('.draft-slab')?.getBoundingClientRect();
    return r ? { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 } : null;
  });
  if (slabBox) await page.screenshot({ path: `${OUT}/6b-slab.png`, clip: slabBox });

  await page.waitForTimeout(2600);
  const held = await page.evaluate(() => globalThis.__mcDebug?.augments ?? []);
  if (held.length !== 1) errors.push(`expected 1 held augment, got ${held.length}`);
  const pips = await page.evaluate(() => document.querySelectorAll('.aug-pip').length);
  if (pips !== 1) errors.push(`expected 1 augment pip after the slab, got ${pips}`);
  if (await page.locator('.draft-slab').count()) errors.push('slab never cleared');
  await page.screenshot({ path: `${OUT}/7-strip.png` });
  const stripBox = await page.evaluate(() => {
    const r = document.querySelector('.hud-bottom')?.getBoundingClientRect();
    return r ? { x: r.x - 6, y: r.y - 30, width: r.width + 12, height: r.height + 36 } : null;
  });
  if (stripBox) await page.screenshot({ path: `${OUT}/7b-strip.png`, clip: stripBox });

  // A second draft stacks on the first — patches accumulate, nothing resets.
  await dealt();
  const third = await cards();
  if (third.some((c) => c.name === takenName)) errors.push('a taken augment was offered again');
  await page.screenshot({ path: `${OUT}/8-second-draft.png` });
  console.info('second draft:', JSON.stringify(third));

  // Take it, then check the surfaces the trio has to reach.
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(3200);
  const both = await page.evaluate(() => globalThis.__mcDebug?.augments ?? []);
  if (both.length !== 2) errors.push(`expected 2 held augments, got ${both.length}`);
  const strip = await page.evaluate(() => document.querySelectorAll('.augment-strip .aug-pip').length);
  if (strip !== 2) errors.push(`augment strip shows ${strip} pips, expected 2`);
  await page.screenshot({ path: `${OUT}/9-two-augments.png` });
} catch (e) {
  errors.push(`fatal: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser?.close();
  if (preview) process.kill(-preview.pid, 'SIGTERM');
}

if (errors.length) {
  console.error(`\n✗ draft shots: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.info(`\n✓ draft shots clean → ${OUT}`);
