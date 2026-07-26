#!/usr/bin/env node
/**
 * The Living Bridge presentation shots (ROADMAP v0.6). Starts offline bridge
 * matches parked just before each event window (`?clock=`), and photographs the
 * announce banner, the live ticker, the minimap glow and the world layer for
 * every one of the four events plus the Overtime collapse.
 *
 * It also asserts the things a screenshot cannot: that the banner actually
 * appears and clears, that the ticker counts down, that the isles open real
 * ground, that the golem reaches the field, and that the deck narrows.
 * Screenshots land in test-results/events.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.env.SHOT_OUT ?? 'test-results/events';
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

/**
 * Boot into an offline bridge match with the clock parked at `clock` seconds.
 * `a11y` runs the accessibility case: sound fully off and reduced-VFX on, which
 * the phase has to be readable under (ROADMAP v0.6 acceptance).
 */
async function openMatch(context, clock, a11y = false) {
  const page = await context.newPage();
  await page.addInitScript((quiet) => {
    globalThis.__mcDebugWanted = true;
    if (!quiet) return;
    localStorage.setItem(
      'mc.settings',
      JSON.stringify({
        state: {
          reducedVfx: true,
          screenShake: false,
          volumes: { master: 0, music: 0, sfx: 0, ui: 0 },
        },
        version: 0,
      }),
    );
  }, a11y);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('WebGL')) {
      errors.push(`console: ${m.text().slice(0, 200)}`);
    }
  });
  await page.goto(`${url}/?clock=${clock}`);
  await page.waitForTimeout(1400);
  const name = page.locator('input');
  if (await name.count()) {
    await name.fill('Watcher');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(1000);
  await page.getByText('Bridge Brawl', { exact: true }).click({ timeout: 8000 });
  await page.waitForTimeout(2200);
  await page.getByText('LOCK IN', { exact: true }).click();
  await page.waitForSelector('.match-strip', { timeout: 30000 });
  await page.waitForTimeout(2500);
  return page;
}

/** Whatever the HUD believes about the timetable right now. */
const hud = (page) =>
  page.evaluate(() => {
    const banner = document.querySelector('.event-banner');
    return {
      banner: banner
        ? {
            name: banner.querySelector('.text > b')?.textContent ?? '',
            blurb: banner.querySelector('.text > em')?.textContent ?? '',
            count: banner.querySelector('.count')?.textContent ?? '',
          }
        : null,
      chips: [...document.querySelectorAll('.event-chip')].map((c) => ({
        name: c.querySelector('.name')?.textContent ?? '',
        left: c.querySelector('.left')?.textContent ?? '',
        cls: c.className,
      })),
      next: document.querySelector('.event-next .name')?.textContent ?? null,
      deck: globalThis.__mcDebug?.match?.deckHalf ?? null,
      events: globalThis.__mcDebug?.match?.events ?? [],
      golems: globalThis.__mcDebug?.golems ?? 0,
      coins: globalThis.__mcDebug?.coins ?? 0,
      isles: globalThis.__mcDebug?.isles ?? { raised: false, rise: -1, orbs: 0 },
    };
  });

/**
 * Walk the local champion toward mid, holding right-click on the far side of
 * the viewport. The camera follows the player, so a screenshot of an objective
 * at the altar means actually going there.
 */
async function walkToMid(page, seconds, stopAt = 5, yFrac = 0.52) {
  const box = await page.evaluate(() => {
    const r = document.querySelector('canvas')?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  if (!box) return;
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const self = await page.evaluate(() => globalThis.__mcDebug?.self ?? null);
    // Stop at the altar. Walking on past mid means walking into the enemy
    // Watchtower, and a death screen covers the thing we came to photograph.
    if (self && Math.abs(self.x) <= stopAt) break;
    const toRight = !self || self.x < 0;
    await page.mouse.move(box.x + (toRight ? box.w * 0.8 : box.w * 0.2), box.y + box.h * yFrac);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(500);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(250);
  }
}

/** Screenshot a HUD element with padding (element shots of tight canvases clip). */
async function shotOf(page, selector, path, pad = 10) {
  const box = await page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return r && r.width > 1 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  }, selector);
  if (!box) return false;
  await page.screenshot({
    path,
    clip: {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: box.width + pad * 2,
      height: box.height + pad * 2,
    },
  });
  return true;
}

/**
 * Hold a move order toward the top of the viewport — north, across the light
 * bridge and onto a Flank Isle. Proves the route is walkable by a *player*,
 * not just openable in the nav grid, and puts the isle in frame.
 */
async function walkNorth(page, seconds) {
  const box = await page.evaluate(() => {
    const r = document.querySelector('canvas')?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  const zOf = () => page.evaluate(() => globalThis.__mcDebug?.self?.z ?? 0);
  if (!box) return zOf();
  // A modest offset up-screen, clicked repeatedly. Aiming near the top edge
  // looks faster but points the pick ray at the horizon, where it never meets
  // the ground plane — and there is no WASD to fall back on, W casts an
  // ability. Each order walks a few units north and the camera follows, so the
  // champion crosses the light bridge in steps.
  const target = { x: box.x + box.w * 0.5, y: box.y + box.h * 0.34 };
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until && Math.abs(await zOf()) < 13) {
    await page.mouse.move(target.x, target.y);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(600);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(250);
  }
  return zOf();
}

/** Wait for the timetable to put something on screen (announce or live). */
async function waitForEvent(page, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const state = await hud(page);
    if (state.events.length > 0) return state;
    await page.waitForTimeout(500);
  }
  return hud(page);
}

/**
 * Which window a seed rolled is a seed decision, so hunt for the one we want by
 * reloading rather than assuming. Returns the page sitting on that event.
 */
async function findWindow(context, kind, clock, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const page = await openMatch(context, clock);
    const state = await waitForEvent(page);
    if (state.events.some((e) => e.kind === kind)) return page;
    const rolled = state.events[0]?.kind ?? '(none)';
    await page.close();
    console.info(`  seed rolled ${rolled}, wanted ${kind} — retrying`);
  }
  return null;
}

try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  /* ---------------- 1. The announce banner (fixed 2:00 isles) ---------------- */
  // 2:00 is a fixed anchor, so this window is the same every match. The clock
  // has to land *before* the 8 s announce (1:52) — the fast-forward treats an
  // announce that has already passed as a window you missed.
  let page = await openMatch(context, 100);
  // Start the walk to mid *now*, before the announce. The isles window is only
  // 60 s and the trip from the fountain is most of a minute; the 12 s before
  // the horn plus the 8 s of announce are the head start that makes it fit.
  await walkToMid(page, 30, 1.5, 0.4);
  let state = await waitForEvent(page);
  if (!state.banner) errors.push('no announce banner at the 2:00 window');
  else {
    if (state.banner.name !== 'FLANK ISLES') {
      errors.push(`2:00 announced "${state.banner.name}", expected FLANK ISLES`);
    }
    if (!state.banner.blurb) errors.push('announce banner has no blurb line');
    console.info('announce:', JSON.stringify(state.banner));
  }
  // Note: the "up next" line names the *following* window, and only inside the
  // 30 s reveal (GAME_DESIGN §9.1) — at 1:52 the 4:00 slot is still 2 minutes
  // out, so its absence here is correct. It is asserted at the 4:00 window.
  await page.screenshot({ path: `${OUT}/1-announce.png` });
  const bannerBox = await page.evaluate(() => {
    const r = document.querySelector('.event-banner')?.getBoundingClientRect();
    return r ? { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20 } : null;
  });
  if (bannerBox) await page.screenshot({ path: `${OUT}/1b-banner.png`, clip: bannerBox });

  // The banner must not sit on top of the match strip or the AFK banner slot.
  const bannerOverlap = await page.evaluate(() => {
    const b = document.querySelector('.event-banner')?.getBoundingClientRect();
    const hits = [];
    for (const sel of ['.match-strip', '.hud-bottom', '.minimap', '.wallet']) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (!b || !r) continue;
      if (b.bottom > r.top && b.top < r.bottom && b.right > r.left && b.left < r.right) {
        hits.push(sel);
      }
    }
    return hits;
  });
  if (bannerOverlap.length) errors.push(`announce banner overlaps ${bannerOverlap.join(', ')}`);

  /* --------------- 2. The isles actually rise and open ground --------------- */
  // 8 s of announce, then the platforms haul themselves up out of the void.
  // Under a software rasterizer that rise takes noticeably longer than the
  // 2 s it is authored for, so poll rather than guess.
  // Wait out the announce, then count the orbs the moment the platforms are
  // there — they are contested loot and do not stay long.
  for (let i = 0; i < 30; i++) {
    state = await hud(page);
    if (state.events.some((e) => e.kind === 'flankIsles' && e.phase === 'active')) break;
    await page.waitForTimeout(500);
  }
  const orbsAtOpen = (await hud(page)).isles.orbs;
  if (orbsAtOpen !== 2) errors.push(`expected 2 isle orbs at open, saw ${orbsAtOpen}`);
  state = await hud(page);
  if (state.banner) errors.push('announce banner never cleared after the window opened');
  const isleChip = state.chips.find((c) => c.name === 'FLANK ISLES');
  if (!isleChip) errors.push('no live chip for the running Flank Isles');
  else console.info('live chip:', JSON.stringify(isleChip));
  if (!state.isles.raised) errors.push('isle platforms never rose in the scene');
  console.info('isles:', JSON.stringify({ ...state.isles, orbsAtOpen }));
  // Walk the flank route: over the light bridge and onto the platform. If a
  // player cannot stand on it, it is scenery rather than a route.
  const isleZ = await walkNorth(page, 30);
  // Reported, not asserted. That the isles are *reachable* is proven properly
  // in `packages/sim/test/events.test.ts` (an A* path from mid to the platform,
  // and the grid restored afterwards). What this walk is for is framing — the
  // camera follows the player, so a flank route photographed from the fountain
  // is a photograph of the fountain. Failing the smoke on whether a scripted
  // click-mover crosses a 3 u light bridge inside a 60 s window would be
  // testing Playwright's aim, not the game.
  console.info(
    `walked to z=${isleZ.toFixed(1)} (deck edge 9, isle 11.5–17.5)` +
      (Math.abs(isleZ) > 9.5 ? ' — off the deck ✓' : ' — still on the deck'),
  );
  await page.screenshot({ path: `${OUT}/2-isles.png` });
  await shotOf(page, '.minimap', `${OUT}/2b-minimap.png`);
  await shotOf(page, '.event-ticker', `${OUT}/2c-ticker.png`);

  // The chip counts down rather than sitting still.
  const firstLeft = Number.parseInt(isleChip?.left ?? '0', 10);
  await page.waitForTimeout(4000);
  const later = (await hud(page)).chips.find((c) => c.name === 'FLANK ISLES');
  const secondLeft = Number.parseInt(later?.left ?? '0', 10);
  if (!(secondLeft < firstLeft)) {
    errors.push(`live chip did not count down (${firstLeft}s → ${secondLeft}s)`);
  }
  await page.close();

  /* ------------------------ 3. The Clash Golem (6:00) ----------------------- */
  page = await openMatch(context, 340);
  state = await waitForEvent(page);
  if (state.banner?.name !== 'CLASH GOLEM') {
    errors.push(`6:00 announced "${state.banner?.name}", expected CLASH GOLEM`);
  }
  await page.waitForTimeout(10000);
  state = await hud(page);
  if (state.golems < 1) errors.push('the golem never reached the field');
  console.info('golem:', JSON.stringify({ chips: state.chips, golems: state.golems }));
  // The camera follows the player, so walk to the altar before photographing
  // what stands on it.
  // Stop short of the altar: the golem aggros at 5.5 u, and a photograph of the
  // golem is more useful than a photograph of the damage numbers on top of it.
  await walkToMid(page, 40, 11);
  const near = await page.evaluate(() => ({
    d: globalThis.__mcDebug?.self ? Math.hypot(globalThis.__mcDebug.self.x, 0) : 999,
    dead: !!document.querySelector('.death-shop'),
  }));
  console.info(
    `golem shot taken ${near.d.toFixed(0)}u from the altar${near.dead ? ' (DEAD)' : ''}`,
  );
  if (near.d > 22) errors.push(`never reached the altar (${near.d.toFixed(0)}u away)`);
  if (near.dead) errors.push('died on the way to the altar — the golem shot is a death screen');
  await page.screenshot({ path: `${OUT}/3-golem.png` });
  await page.close();

  /* ------------------- 4. Coin Rain / Storm Front (pooled) ------------------ */
  for (const [kind, label, clock] of [
    ['coinRain', 'COIN RAIN', 220],
    ['stormFront', 'STORM FRONT', 220],
  ]) {
    const p = await findWindow(context, kind, clock);
    if (!p) {
      errors.push(`never rolled ${kind} in 6 tries at ${clock}s`);
      continue;
    }
    await p.waitForTimeout(9500);
    const s = await hud(p);
    if (!s.chips.some((c) => c.name === label)) errors.push(`no live chip for ${label}`);
    if (kind === 'coinRain' && s.coins < 1) errors.push('Coin Rain dropped no coins');
    console.info(`${kind}:`, JSON.stringify({ chips: s.chips, coins: s.coins }));
    await p.screenshot({ path: `${OUT}/4-${kind}.png` });
    await p.close();
  }

  /* ---------------- 4a. The "up next" line inside its reveal ---------------- */
  // 30 s before a window the ticker names it; before that the timetable is
  // something you have to remember (GAME_DESIGN §9.1). This is the line Orb
  // Sense extends, so it has to exist.
  page = await openMatch(context, 218);
  const upNext = (await hud(page)).next;
  if (!upNext) errors.push('no "up next" line inside the 30 s reveal');
  else console.info('up next:', upNext);
  await shotOf(page, '.event-ticker', `${OUT}/4a-upnext.png`);
  await page.close();

  /* ------- 4b. Readable with the sound off and reduced VFX on (a11y) ------- */
  // Particles are the first thing reduced-VFX thins, so the event has to be
  // legible from geometry and HUD alone: banner, ticker chip, minimap glow.
  page = await openMatch(context, 100, true);
  state = await waitForEvent(page);
  const quiet = await page.evaluate(() => ({
    reduced: JSON.parse(localStorage.getItem('mc.settings') ?? '{}')?.state?.reducedVfx === true,
    banner: !!document.querySelector('.event-banner'),
    minimap: !!document.querySelector('.minimap canvas'),
  }));
  if (!quiet.reduced) errors.push('reduced-VFX setting did not take');
  if (!quiet.banner) errors.push('no announce banner with reduced VFX + sound off');
  if (!quiet.minimap) errors.push('no minimap with reduced VFX + sound off');
  await page.screenshot({ path: `${OUT}/4b-announce-a11y.png` });
  await walkToMid(page, 40);
  for (let i = 0; i < 30; i++) {
    state = await hud(page);
    if (state.isles.raised) break;
    await page.waitForTimeout(600);
  }
  if (!state.chips.some((c) => c.name === 'FLANK ISLES')) {
    errors.push('no live ticker chip with reduced VFX + sound off');
  }
  if (!state.isles.raised) errors.push('isles did not rise with reduced VFX on');
  console.info('a11y:', JSON.stringify({ ...quiet, chips: state.chips.length }));
  await page.screenshot({ path: `${OUT}/4c-isles-a11y.png` });
  await page.close();

  /* ------------------- 5. Overtime: the deck falls away -------------------- */
  page = await openMatch(context, 895);
  await walkToMid(page, 40);
  const beforeDeck = (await hud(page)).deck;
  await page.screenshot({ path: `${OUT}/5-overtime.png` });
  // First stage lands 60 s into Overtime — wait for the deck to actually go,
  // rather than guessing how long the walk took.
  for (let i = 0; i < 45; i++) {
    state = await hud(page);
    if (state.deck < beforeDeck) break;
    await page.waitForTimeout(2000);
  }
  state = await hud(page);
  if (!(state.deck < beforeDeck)) {
    errors.push(`deck never narrowed (${beforeDeck} → ${state.deck})`);
  } else {
    console.info(`collapse: deck ${beforeDeck}u half → ${state.deck}u half`);
  }
  if (!state.chips.some((c) => c.cls.includes('collapse'))) {
    errors.push('no collapse chip on the ticker during Overtime');
  }
  await page.screenshot({ path: `${OUT}/6-collapsed.png` });
  await shotOf(page, '.minimap', `${OUT}/6b-minimap-narrow.png`);
  await page.close();
} catch (err) {
  errors.push(`fatal: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await browser?.close();
  if (preview) process.kill(-preview.pid, 'SIGTERM');
}

if (errors.length) {
  console.error(`event shots FAILED (${errors.length}):`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.info(`event shots OK — announce, isles, golem, coin/storm, collapse → ${OUT}`);
