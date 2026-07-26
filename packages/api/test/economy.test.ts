import { CHAMPION_PRICES, REWARDS, STARTER_CHAMPIONS } from '@mini-clash/data';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { guest } from '../src/auth';
import { migrate, openDb, type Sql } from '../src/db';
import {
  addAccountXp,
  addMasteryXp,
  championsFor,
  claimMastery,
  masteryFor,
  matchReward,
  noteWin,
  priceOf,
  profileFor,
  purchase,
  setBanner,
  setShowcase,
  unlocksFor,
} from '../src/economy';
import { InsufficientCoins } from '../src/ledger';

/**
 * The meta game's rules (GAME_DESIGN §18).
 *
 * The purchase tests care about one thing above all: that coins and the thing
 * they bought move together. Every failure mode is checked from both ends —
 * that a refused purchase leaves no unlock, and that a crash after the charge
 * leaves no charge.
 */

let sql: Sql;
let uid: string;

beforeAll(async () => {
  sql = await openDb();
  await migrate(sql);
});

beforeEach(async () => {
  await sql`delete from users`;
  const s = await guest(sql, 'Rook', 'device-key-0123456789abcdef');
  uid = s.user.id;
});

const fund = (coins: number): Promise<unknown> =>
  sql`update profiles set coins = ${coins} where user_id = ${uid}`;

describe('prices', () => {
  it('quotes a champion from the data table and nothing for a ghost', () => {
    expect(priceOf('champion', 'boltz')).toBe(CHAMPION_PRICES.boltz);
    expect(priceOf('champion', 'not_a_champion')).toBeNull();
  });

  it('quotes cosmetics by kind', () => {
    expect(priceOf('palette', 'rook_gold')).toBeGreaterThan(0);
    expect(priceOf('sticker', 'gg')).toBeGreaterThan(0);
  });
});

describe('the champion catalog', () => {
  it('shows a logged-out visitor prices and the rotation, owning nothing', async () => {
    const view = await championsFor(sql, null, new Date('2026-07-26T00:00:00Z'));
    expect(view.champions.length).toBeGreaterThan(0);
    expect(view.champions.every((c) => !c.owned)).toBe(true);
    expect(view.rotation.length).toBeGreaterThan(0);
    // Starters cost nothing, so they are playable even signed out.
    for (const id of STARTER_CHAMPIONS) {
      expect(view.champions.find((c) => c.id === id)?.playable, id).toBe(true);
    }
  });

  it('marks the starters owned for a fresh account', async () => {
    const view = await championsFor(sql, uid, new Date());
    const owned = view.champions.filter((c) => c.owned).map((c) => c.id);
    expect(owned.sort()).toEqual([...STARTER_CHAMPIONS].sort());
  });

  it('makes this week’s rotation playable without owning it', async () => {
    const now = new Date('2026-07-26T00:00:00Z');
    const view = await championsFor(sql, uid, now);
    const free = view.champions.filter((c) => c.free && !c.owned);
    expect(free.length).toBeGreaterThan(0);
    for (const c of free) expect(c.playable, c.id).toBe(true);
  });

  it('leaves a locked champion locked', async () => {
    const view = await championsFor(sql, uid, new Date('2026-07-26T00:00:00Z'));
    const locked = view.champions.filter((c) => !c.owned && !c.free);
    expect(locked.length).toBeGreaterThan(0);
    for (const c of locked) {
      expect(c.playable, c.id).toBe(false);
      expect(c.price, c.id).toBeGreaterThan(0);
    }
  });
});

describe('buying a champion', () => {
  it('takes exactly the listed price and hands over the champion', async () => {
    await fund(6000);
    const res = await purchase(sql, uid, 'champion', 'boltz');
    expect(res.paid).toBe(CHAMPION_PRICES.boltz);
    expect(res.coins).toBe(6000 - CHAMPION_PRICES.boltz);

    const owned = await unlocksFor(sql, uid);
    expect(owned.champion).toContain('boltz');
    const [t] = await sql<{ delta: number; ref_id: string }>`
      select delta, ref_id from transactions where user_id = ${uid}`;
    expect(t).toEqual({ delta: -CHAMPION_PRICES.boltz, ref_id: 'champion:boltz' });
  });

  it('refuses when the coins are not there, and hands over nothing', async () => {
    await fund(100);
    await expect(purchase(sql, uid, 'champion', 'boltz')).rejects.toBeInstanceOf(InsufficientCoins);
    const owned = await unlocksFor(sql, uid);
    expect(owned.champion).not.toContain('boltz');
    expect((await profileFor(sql, uid)).coins).toBe(100);
  });

  it('refuses to sell something already owned', async () => {
    await fund(6000);
    await purchase(sql, uid, 'champion', 'boltz');
    await expect(purchase(sql, uid, 'champion', 'boltz')).rejects.toThrow(/already_owned/);
    expect((await profileFor(sql, uid)).coins).toBe(6000 - CHAMPION_PRICES.boltz);
  });

  it('refuses to sell a starter, which is not merchandise', async () => {
    await fund(6000);
    await expect(purchase(sql, uid, 'champion', 'rook')).rejects.toThrow(/not_for_sale/);
    expect((await profileFor(sql, uid)).coins).toBe(6000);
  });

  it('refuses an unknown item or an unknown kind', async () => {
    await fund(6000);
    await expect(purchase(sql, uid, 'champion', 'nobody')).rejects.toThrow(/unknown_item/);
    await expect(purchase(sql, uid, 'spaceship', 'x')).rejects.toThrow(/bad_kind/);
  });

  it('charges once when the same purchase arrives twice', async () => {
    await fund(20000);
    await purchase(sql, uid, 'champion', 'boltz', 'click-1');
    await expect(purchase(sql, uid, 'champion', 'boltz', 'click-1')).rejects.toThrow();
    expect((await profileFor(sql, uid)).coins).toBe(20000 - CHAMPION_PRICES.boltz);
  });

  it('survives two tabs buying different champions at once', async () => {
    await fund(20000);
    const [a, b] = await Promise.all([
      purchase(sql, uid, 'champion', 'boltz'),
      purchase(sql, uid, 'champion', 'wisp'),
    ]);
    expect(a.paid + b.paid).toBe(CHAMPION_PRICES.boltz + CHAMPION_PRICES.wisp);
    const owned = await unlocksFor(sql, uid);
    expect(owned.champion).toContain('boltz');
    expect(owned.champion).toContain('wisp');
    expect((await profileFor(sql, uid)).coins).toBe(20000 - a.paid - b.paid);
  });

  it('lets only one of two racing purchases through when there is money for one', async () => {
    await fund(CHAMPION_PRICES.piper);
    const results = await Promise.allSettled([
      purchase(sql, uid, 'champion', 'piper'),
      purchase(sql, uid, 'champion', 'vex'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await profileFor(sql, uid)).coins).toBe(0);
    expect(
      (await unlocksFor(sql, uid)).champion.filter((c) => c === 'piper' || c === 'vex'),
    ).toHaveLength(1);
  });
});

describe('match rewards', () => {
  it('pays a win more than a loss and never pays nothing', () => {
    const win = matchReward({ won: true, performance: 0.5, firstWinOfDay: false });
    const loss = matchReward({ won: false, performance: 0.5, firstWinOfDay: false });
    expect(win.coins).toBe(REWARDS.win);
    expect(loss.coins).toBe(REWARDS.loss);
    expect(loss.coins).toBeGreaterThan(0);
  });

  it('swings with performance, in both directions, by the advertised amount', () => {
    const best = matchReward({ won: true, performance: 1, firstWinOfDay: false });
    const worst = matchReward({ won: true, performance: 0, firstWinOfDay: false });
    expect(best.coins).toBe(Math.round(REWARDS.win * (1 + REWARDS.performanceSwing)));
    expect(worst.coins).toBe(Math.round(REWARDS.win * (1 - REWARDS.performanceSwing)));
  });

  it('clamps a performance figure that makes no sense', () => {
    expect(matchReward({ won: true, performance: 99, firstWinOfDay: false }).coins).toBe(
      matchReward({ won: true, performance: 1, firstWinOfDay: false }).coins,
    );
    expect(matchReward({ won: true, performance: -5, firstWinOfDay: false }).coins).toBe(
      matchReward({ won: true, performance: 0, firstWinOfDay: false }).coins,
    );
  });

  it('adds the first-win bonus on top rather than instead', () => {
    const plain = matchReward({ won: true, performance: 0.5, firstWinOfDay: false });
    const first = matchReward({ won: true, performance: 0.5, firstWinOfDay: true });
    expect(first.coins).toBe(plain.coins + REWARDS.firstWinOfDay);
    expect(first.bonus).toBe(REWARDS.firstWinOfDay);
  });
});

describe('the first-win-of-day streak', () => {
  const at = (iso: string): Date => new Date(iso);

  it('fires once a day, however many times you win', async () => {
    expect(await noteWin(sql, uid, at('2026-07-26T10:00:00Z'))).toEqual({
      firstOfDay: true,
      streak: 1,
    });
    expect(await noteWin(sql, uid, at('2026-07-26T22:00:00Z'))).toEqual({
      firstOfDay: false,
      streak: 1,
    });
  });

  it('counts consecutive days and resets when one is missed', async () => {
    await noteWin(sql, uid, at('2026-07-26T10:00:00Z'));
    expect((await noteWin(sql, uid, at('2026-07-27T10:00:00Z'))).streak).toBe(2);
    expect((await noteWin(sql, uid, at('2026-07-28T01:00:00Z'))).streak).toBe(3);
    // Skipped the 29th.
    expect((await noteWin(sql, uid, at('2026-07-30T10:00:00Z'))).streak).toBe(1);
  });

  it('rolls at UTC midnight, not at some local one', async () => {
    await noteWin(sql, uid, at('2026-07-26T23:59:00Z'));
    expect((await noteWin(sql, uid, at('2026-07-27T00:01:00Z'))).firstOfDay).toBe(true);
    expect((await profileFor(sql, uid)).lastWinDay).toBe('2026-07-27');
  });
});

describe('levels and mastery', () => {
  it('raises the account level as xp lands, and says when it moved', async () => {
    const first = await addAccountXp(sql, uid, 100);
    expect(first.levelledUp).toBe(false);
    const later = await addAccountXp(sql, uid, 5000);
    expect(later.levelledUp).toBe(true);
    expect((await profileFor(sql, uid)).level).toBe(later.level);
  });

  it('creates a mastery row on first play and accumulates after', async () => {
    expect((await addMasteryXp(sql, uid, 'rook', 200)).xp).toBe(200);
    expect((await addMasteryXp(sql, uid, 'rook', 300)).xp).toBe(500);
    const [m] = await masteryFor(sql, uid);
    expect(m.championId).toBe('rook');
    expect(m.level).toBe(2);
    expect(m.progress).toEqual({ into: 100, needed: 500 });
  });

  it('reports no progress bar at the cap', async () => {
    await addMasteryXp(sql, uid, 'rook', 99999);
    const [m] = await masteryFor(sql, uid);
    expect(m.level).toBe(10);
    expect(m.progress).toBeNull();
  });

  it('offers a milestone once it is reached and pays it exactly once', async () => {
    await addMasteryXp(sql, uid, 'rook', 3300); // level 6, past the level-5 milestone
    const [before] = await masteryFor(sql, uid);
    expect(before.claimable).toEqual({ level: 5, coins: REWARDS.masteryCoins[5] });

    const claim = await claimMastery(sql, uid, 'rook');
    expect(claim.coins).toBe(REWARDS.masteryCoins[5]);
    expect((await profileFor(sql, uid)).coins).toBe(REWARDS.masteryCoins[5]);
    await expect(claimMastery(sql, uid, 'rook')).rejects.toThrow(/nothing_to_claim/);

    const [after] = await masteryFor(sql, uid);
    expect(after.claimable).toBeNull();
  });

  it('offers the level-10 milestone after the level-5 one is taken', async () => {
    await addMasteryXp(sql, uid, 'rook', 20000);
    expect((await claimMastery(sql, uid, 'rook')).level).toBe(5);
    expect((await claimMastery(sql, uid, 'rook')).level).toBe(10);
    expect((await profileFor(sql, uid)).coins).toBe(
      REWARDS.masteryCoins[5] + REWARDS.masteryCoins[10],
    );
  });

  it('refuses to claim on a champion never played', async () => {
    await expect(claimMastery(sql, uid, 'wisp')).rejects.toThrow(/no_mastery/);
  });
});

describe('profile decoration', () => {
  it('accepts a showcase of champions the player owns', async () => {
    expect(await setShowcase(sql, uid, ['rook', 'fathom'])).toEqual(['rook', 'fathom']);
    expect((await profileFor(sql, uid)).showcase).toEqual(['rook', 'fathom']);
  });

  it('refuses to show off something not owned', async () => {
    await expect(setShowcase(sql, uid, ['rook', 'vex'])).rejects.toThrow(/not_owned/);
    expect((await profileFor(sql, uid)).showcase).toEqual([]);
  });

  it('keeps the showcase to three, without duplicates', async () => {
    await sql`insert into unlocks (user_id, kind, ref_id) values (${uid}, 'champion', 'boltz')`;
    const set = await setShowcase(sql, uid, ['rook', 'rook', 'fathom', 'mortis', 'boltz']);
    expect(set).toEqual(['rook', 'fathom', 'mortis']);
  });

  it('takes a valid banner id and rejects a made-up one', async () => {
    await setBanner(sql, uid, 'banner_shatter');
    expect((await profileFor(sql, uid)).bannerId).toBe('banner_shatter');
    await expect(setBanner(sql, uid, '../../etc/passwd')).rejects.toThrow(/bad_banner/);
  });
});
