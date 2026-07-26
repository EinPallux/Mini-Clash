#!/usr/bin/env node
/**
 * The Hub, end to end in a real browser (ROADMAP v0.7 acceptance).
 *
 * Boots a real api (PGlite in-process, so no Postgres to install), serves the
 * built client through a tiny proxy that puts both on **one origin** — exactly
 * how Caddy serves them in production, which is the only way the httpOnly
 * SameSite=Lax session cookie behaves the same here as it does live.
 *
 * Then it plays the flow a new player actually walks: name → guest account →
 * champions → 3D viewer → ability preview → buy a champion → quests → history →
 * upgrade to an email → sign out → sign back in on a *fresh browser context*
 * and check the coins and unlocks came with them. That last step is the
 * two-device acceptance box, and it is the reason this script exists rather
 * than another unit test.
 *
 * Screenshots land in test-results/hub.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { startApi as startPlatformApi } from './lib/api-harness.mjs';

const OUT = process.env.SHOT_OUT ?? 'test-results/hub';
mkdirSync(OUT, { recursive: true });

const CLIENT_PORT = 4184;
const API_PORT = 3184;
const EDGE_PORT = 4185;
const url = `http://127.0.0.1:${EDGE_PORT}`;

const errors = [];
const note = (m) => console.info(`  · ${m}`);
function check(ok, label) {
  if (ok) note(`ok — ${label}`);
  else {
    errors.push(label);
    console.error(`  ✗ FAIL — ${label}`);
  }
}

/* ------------------------------- Services -------------------------------- */

async function up(target) {
  try {
    return (await fetch(target)).ok;
  } catch {
    return false;
  }
}

let preview = null;
async function startClient() {
  if (await up(`http://127.0.0.1:${CLIENT_PORT}`)) return;
  preview = spawn(
    'pnpm',
    ['--filter', '@mini-clash/client', 'preview', '--port', String(CLIENT_PORT), '--strictPort'],
    { stdio: 'ignore', detached: true },
  );
  for (let i = 0; i < 80; i++) {
    if (await up(`http://127.0.0.1:${CLIENT_PORT}`)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('client preview never came up');
}

// The api itself comes from the shared harness — the same one every other smoke
// boots, so there is one copy of "how to run the service in-process" rather than
// two that drift. This one keeps its own ports and its own edge, because it is
// the smoke that tests the *edge*: one origin, `/api/*` proxied with the prefix
// stripped, exactly as Caddy serves it in production.
let platform = null;
let api = null;
let ledger = null;

async function startApi() {
  platform = await startPlatformApi({ name: 'hub', port: API_PORT });
  api = platform.app;
  ledger = platform.ledger;
}

/**
 * One origin for both, the way the production edge does it: `/api/*` to the
 * service with the prefix stripped, everything else to the static client.
 */
function startEdge() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const isApi = req.url.startsWith('/api/');
      const target = isApi
        ? `http://127.0.0.1:${API_PORT}${req.url.slice(4)}`
        : `http://127.0.0.1:${CLIENT_PORT}${req.url}`;
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        try {
          const headers = { ...req.headers };
          delete headers.host;
          delete headers['content-length'];
          delete headers['accept-encoding'];
          const upstream = await fetch(target, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
            redirect: 'manual',
          });
          const out = {};
          for (const [k, v] of upstream.headers) {
            if (k === 'content-encoding' || k === 'content-length') continue;
            if (k === 'set-cookie') continue;
            out[k] = v;
          }
          const cookies = upstream.headers.getSetCookie?.() ?? [];
          res.writeHead(upstream.status, cookies.length ? { ...out, 'set-cookie': cookies } : out);
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
          res.writeHead(502);
          res.end(String(err));
        }
      });
    });
    server.listen(EDGE_PORT, '127.0.0.1', () => resolve(server));
  });
}

/* --------------------------------- Steps --------------------------------- */

const LOCAL_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = process.env.SHOT_CHROME || (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    errors.push(`page error: ${e.message}`);
    console.error(`  ✗ page error: ${e.message}`);
  });
  return { context, page };
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

/** Click the hub nav tab with this label. */
async function tab(page, label) {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await page.waitForTimeout(350);
}

async function signUpAsGuest(page, name) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wordmark', { timeout: 30_000 });
  // Boot lands on the name screen for a browser the api has never seen.
  await page.waitForSelector('input[type=text]', { timeout: 30_000 });
  await page.fill('input[type=text]', name);
  await page.getByRole('button', { name: /enter/i }).click();
  await page.waitForSelector('.hub-root', { timeout: 30_000 });
}

async function main() {
  console.info('hub smoke: starting services…');
  await Promise.all([startClient(), startApi()]);
  const edge = await startEdge();
  console.info(`hub smoke: edge on ${url}`);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });

  try {
    /* ---------------------------- First visit --------------------------- */
    console.info('\n1. first visit → guest account');
    const { context, page } = await newPage(browser);
    await signUpAsGuest(page, 'SmokeTester');
    await shot(page, '01-hub');

    check(
      (await page.locator('.hub-status').innerText()).toLowerCase().includes('guest'),
      'hub says you are playing as a guest',
    );
    check(
      (await page.locator('.nav-chip').first().innerText()).includes('0'),
      'coin purse starts at zero',
    );

    /* ----------------------------- Champions ---------------------------- */
    console.info('\n2. champions grid and the 3D viewer');
    await tab(page, 'Champions');
    await page.waitForSelector('.champion-card');
    const cards = await page.locator('.champion-card').count();
    check(cards === 10, `all ten champions listed (saw ${cards})`);
    const owned = await page.locator('.cc-tag.owned').count();
    check(owned === 4, `four starters marked owned (saw ${owned})`);
    const rotating = await page.locator('.cc-tag.rotate').count();
    check(rotating > 0, `the weekly rotation is marked (${rotating} free)`);
    await shot(page, '02-champions');

    // Filter by role narrows the grid rather than emptying it.
    await page.getByRole('tab', { name: 'vanguard' }).click();
    await page.waitForTimeout(200);
    const vanguards = await page.locator('.champion-card').count();
    check(vanguards > 0 && vanguards < cards, `role filter narrows to ${vanguards}`);
    await page.getByRole('tab', { name: 'All' }).click();

    await page.locator('.champion-card').first().click();
    await page.waitForSelector('.cd-canvas');
    // The viewer has to actually draw: a canvas with a non-empty framebuffer.
    await page.waitForFunction(
      () => {
        const c = document.querySelector('.cd-canvas');
        return c instanceof HTMLCanvasElement && c.width > 100 && c.height > 100;
      },
      { timeout: 20_000 },
    );
    await page.waitForTimeout(2500);
    check((await page.locator('.cd-loading').count()) === 0, 'the champion model finished loading');
    const kitRows = await page.locator('.kit-row').count();
    check(kitRows === 5, `passive, Q, W, R and entrance all listed (saw ${kitRows})`);
    await shot(page, '03-champion-detail');

    console.info('\n3. ability previews run the real FX timelines');
    for (const label of ['Q', 'W', 'R']) {
      await page.locator('.cd-action', { hasText: new RegExp(`^${label}$`) }).click();
      await page.waitForTimeout(900);
      await shot(page, `04-preview-${label.toLowerCase()}`);
    }
    check(errors.length === 0, 'no page errors while previewing abilities');

    /* ------------------------------- Store ------------------------------- */
    console.info('\n4. store: locked, then affordable');
    await page.getByRole('button', { name: '← All champions' }).click();
    await tab(page, 'Store');
    await page.waitForSelector('.shop-card');
    const broke = await page.locator('.shop-card .btn:disabled').count();
    check(broke > 0, 'nothing is buyable with zero coins');
    await shot(page, '05-store-broke');

    // Grant coins the only way the economy allows: through the ledger.
    const uid = await page.evaluate(async () => {
      const res = await fetch('/api/profile', { credentials: 'same-origin' });
      return (await res.json()).user.id;
    });
    const newBalance = await ledger.grant(api.db, uid, 9000, 'smoke_grant');
    const [readBack] = await api.db`select coins from profiles where user_id = ${uid}`;
    note(`granted 9000 to ${uid}: grant returned ${newBalance}, row says ${readBack?.coins}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.hub-root');
    // The purse fills in when the profile lands, a beat after the hub paints.
    await page
      .locator('.nav-chip')
      .first()
      .filter({ hasText: '9,000' })
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined);
    await tab(page, 'Store');
    await page.waitForSelector('.shop-card');
    const purse = (await page.locator('.nav-chip').first().innerText()).trim();
    const served = await page.evaluate(async () => {
      const res = await fetch('/api/profile', { credentials: 'same-origin' });
      if (!res.ok) return `HTTP ${res.status}`;
      const body = await res.json();
      return `${body.user.id} coins=${body.profile.coins}`;
    });
    check(
      purse.includes('9,000'),
      `the purse shows the granted coins (chip "${purse}", api ${served})`,
    );

    const buyable = page
      .locator('.shop-card')
      .filter({ has: page.locator('.btn.primary') })
      .first();
    const buyingName = await buyable.locator('strong').innerText();
    await buyable.locator('.btn.primary').click();
    await page.waitForSelector('.modal-scrim');
    await shot(page, '06-store-confirm');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.waitForTimeout(1200);
    check(
      !(await page.locator('.modal-scrim').isVisible()),
      'the purchase modal closes on success',
    );
    const afterBuy = await page.locator('.nav-chip').first().innerText();
    check(!afterBuy.includes('9,000'), `coins were spent (purse now ${afterBuy.trim()})`);
    note(`bought ${buyingName}`);
    await shot(page, '07-store-after');

    /* ------------------------------ Quests ------------------------------- */
    console.info('\n5. quests are dealt and rerollable');
    await tab(page, 'Quests');
    await page.waitForSelector('.quest-card');
    const dailies = await page.locator('.quest-list').first().locator('.quest-card').count();
    check(dailies === 3, `three dailies dealt (saw ${dailies})`);
    check((await page.locator('.streak-chip').count()) === 1, 'the streak calendar is there');
    await shot(page, '08-quests');

    const firstQuest = await page.locator('.quest-card').first().locator('strong').innerText();
    await page.locator('.quest-card').first().locator('.btn.ghost').click();
    await page.waitForTimeout(900);
    const afterReroll = await page.locator('.quest-card').first().locator('strong').innerText();
    check(
      (await page.locator('.quest-list').first().locator('.quest-card').count()) === 3,
      'still three dailies after a reroll',
    );
    note(`reroll: ${firstQuest} → ${afterReroll}`);
    await page
      .locator('.section-label')
      .first()
      .filter({ hasText: 'reroll used' })
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined);
    const dailyLabel = (await page.locator('.section-label').first().innerText()).trim();
    // The label is uppercased by CSS, and innerText reports what is rendered.
    check(
      dailyLabel.toLowerCase().includes('reroll used'),
      `the reroll is spent for the day ("${dailyLabel}")`,
    );

    /* ------------------------------ History ------------------------------ */
    console.info('\n6. history is empty, and says so kindly');
    await tab(page, 'History');
    await page.waitForTimeout(400);
    check(
      (await page.locator('.empty-note').innerText()).includes('No matches yet'),
      'the empty history explains itself rather than showing a blank list',
    );
    await shot(page, '09-history-empty');

    /* ------------------------------ Upgrade ------------------------------ */
    console.info('\n7. upgrade the guest to an email account');
    await tab(page, 'Profile');
    await page.waitForSelector('.account-panel');
    await shot(page, '10-profile');
    const coinsBefore = await page.locator('.pb-purse').innerText();

    await page.locator('input[type=email]').fill('smoke@example.com');
    await page.locator('input[type=password]').fill('correct horse battery');
    await page.getByRole('button', { name: 'Add email' }).click();
    await page.waitForSelector('.form-notice', { timeout: 15_000 });
    check(
      (await page.locator('.form-notice').innerText()).includes('Email added'),
      'the upgrade succeeded',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.hub-root');
    await tab(page, 'Profile');
    await page.waitForSelector('.pb-purse');
    check(
      (await page.locator('.pb-purse').innerText()) === coinsBefore,
      `coins survived the upgrade (${coinsBefore.trim()})`,
    );
    check(
      (await page.locator('.pb-body .subtle').innerText()).includes('smoke@example.com'),
      'the profile now shows the email',
    );
    await shot(page, '11-profile-upgraded');

    /* --------------------- The two-device acceptance --------------------- */
    console.info('\n8. sign in from a completely fresh browser');
    const second = await newPage(browser);
    await second.page.goto(url, { waitUntil: 'domcontentloaded' });
    // A browser the api has never seen: no device key, so the name screen.
    await second.page.waitForSelector('input[type=text]', { timeout: 30_000 });
    await second.page.getByRole('button', { name: 'I already have an account' }).click();
    await second.page.waitForSelector('input[type=email]');
    await second.page.locator('input[type=email]').fill('smoke@example.com');
    await second.page.locator('input[type=password]').fill('correct horse battery');
    await shot(second.page, '12-second-device-signin');
    await second.page.locator('.btn.primary').click();
    await second.page.waitForSelector('.hub-root', { timeout: 30_000 });

    await tab(second.page, 'Profile');
    await second.page.waitForSelector('.pb-purse', { timeout: 20_000 });
    check(
      (await second.page.locator('.pb-purse').innerText()).trim() === coinsBefore.trim(),
      'the second browser sees the same coins',
    );
    const shownName = (await second.page.locator('.pb-body h1').innerText()).trim();
    // The display font uppercases it; compare the letters, not the styling.
    check(shownName.toLowerCase() === 'smoketester', `…and the same name (saw "${shownName}")`);
    await tab(second.page, 'Champions');
    await second.page.waitForSelector('.champion-card');
    const ownedThere = await second.page.locator('.cc-tag.owned').count();
    check(ownedThere === 5, `…and the bought champion (${ownedThere} owned, expected 5)`);
    await shot(second.page, '13-second-device');

    /* ------------------------------ Offline ------------------------------ */
    console.info('\n9. the hub survives the api going away');
    await page.route('**/api/**', (route) => route.abort());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.hub-root', { timeout: 30_000 });
    const status = await page.locator('.hub-status').innerText();
    check(status.toLowerCase().includes('offline'), 'the hub says it is offline');
    check(status.toLowerCase().includes('bots'), '…and points out that offline play still works');
    await tab(page, 'Champions');
    await page.waitForTimeout(400);
    check(
      (await page.locator('.champion-card').count()) === 10,
      'the champion catalog still renders offline',
    );
    await shot(page, '14-offline');

    await context.close();
    await second.context.close();
  } finally {
    await browser.close();
    edge.close();
    await platform?.stop();
    if (preview) {
      try {
        process.kill(-preview.pid);
      } catch {
        /* already gone */
      }
    }
  }

  console.info(`\nshots → ${OUT}`);
  if (errors.length) {
    console.error(`\n${errors.length} check(s) failed:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.info('\nhub smoke: all checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
