import { QUESTS } from '@mini-clash/data';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { guest } from '../src/auth';
import { migrate, openDb, type Sql } from '../src/db';
import { profileFor } from '../src/economy';
import {
  bumpQuests,
  claimQuest,
  dailyPeriod,
  dealFor,
  questsFor,
  rerollQuest,
  weeklyPeriod,
} from '../src/quests';

/**
 * Quests (GAME_DESIGN §18).
 *
 * The deal is a pure function of (player, period), so these tests can ask for
 * "tomorrow" simply by passing a different `now` — no clock mocking, and no
 * cron job that has to have run. That property is the point of the design and
 * the first thing worth testing.
 */

let sql: Sql;
let uid: string;

const MON = new Date('2026-07-27T09:00:00Z'); // a Monday
const MON_LATE = new Date('2026-07-27T23:00:00Z');
const TUE = new Date('2026-07-28T09:00:00Z');
const NEXT_MON = new Date('2026-08-03T09:00:00Z');

beforeAll(async () => {
  sql = await openDb();
  await migrate(sql);
});

beforeEach(async () => {
  await sql`delete from users`;
  uid = (await guest(sql, 'Rook', 'device-key-0123456789abcdef')).user.id;
});

describe('periods', () => {
  it('rolls dailies at the next UTC midnight', () => {
    expect(dailyPeriod(MON).key).toBe('2026-07-27');
    expect(dailyPeriod(MON).resetAt.toISOString()).toBe('2026-07-28T00:00:00.000Z');
    expect(dailyPeriod(MON_LATE).key).toBe(dailyPeriod(MON).key);
    expect(dailyPeriod(TUE).key).toBe('2026-07-28');
  });

  it('runs weeks Monday to Monday', () => {
    expect(weeklyPeriod(MON).resetAt.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    // Sunday belongs to the week that started the Monday before it.
    const sunday = new Date('2026-08-02T23:00:00Z');
    expect(weeklyPeriod(sunday).key).toBe(weeklyPeriod(MON).key);
    expect(weeklyPeriod(NEXT_MON).key).not.toBe(weeklyPeriod(MON).key);
  });
});

describe('dealing', () => {
  it('gives the same player the same three dailies all day', () => {
    const a = dealFor(uid, 'daily', dailyPeriod(MON).key).map((q) => q.id);
    const b = dealFor(uid, 'daily', dailyPeriod(MON_LATE).key).map((q) => q.id);
    expect(a).toHaveLength(3);
    expect(b).toEqual(a);
  });

  it('gives different players different quests', () => {
    const mine = dealFor('u_aaa', 'daily', '2026-07-27').map((q) => q.id);
    const theirs = dealFor('u_bbb', 'daily', '2026-07-27').map((q) => q.id);
    expect(mine).not.toEqual(theirs);
  });

  it('deals only from the right cadence, and never a duplicate', () => {
    const daily = dealFor(uid, 'daily', '2026-07-27');
    expect(daily.every((q) => q.cadence === 'daily')).toBe(true);
    expect(new Set(daily.map((q) => q.id)).size).toBe(daily.length);
    const weekly = dealFor(uid, 'weekly', 'w:2026-07-27');
    expect(weekly).toHaveLength(1);
    expect(weekly[0].cadence).toBe('weekly');
  });
});

describe('the quests screen', () => {
  it('deals on first sight, with everything at zero', async () => {
    const view = await questsFor(sql, uid, MON);
    expect(view.daily).toHaveLength(3);
    expect(view.weekly).toHaveLength(1);
    expect(view.daily.every((q) => q.progress === 0 && q.state === 'active')).toBe(true);
    expect(view.rerollAvailable).toBe(true);
    expect(view.streak).toBe(0);
  });

  it('is stable within the day rather than re-dealing on every look', async () => {
    const first = await questsFor(sql, uid, MON);
    await bumpQuests(sql, uid, { [first.daily[0].metric]: 1 }, MON);
    const second = await questsFor(sql, uid, MON_LATE);
    expect(second.daily.map((q) => q.id)).toEqual(first.daily.map((q) => q.id));
    expect(second.daily.find((q) => q.id === first.daily[0].id)?.progress).toBe(1);
  });

  it('deals a fresh set the next day and forgets the old progress', async () => {
    const mon = await questsFor(sql, uid, MON);
    await bumpQuests(sql, uid, { [mon.daily[0].metric]: 5 }, MON);
    const tue = await questsFor(sql, uid, TUE);
    expect(tue.daily).toHaveLength(3);
    expect(tue.daily.every((q) => q.progress === 0)).toBe(true);
    expect(tue.daily.map((q) => q.id)).not.toEqual(mon.daily.map((q) => q.id));
    expect(tue.rerollAvailable).toBe(true);
  });

  it('keeps the weekly running while the dailies roll under it', async () => {
    const mon = await questsFor(sql, uid, MON);
    await bumpQuests(sql, uid, { [mon.weekly[0].metric]: 3 }, MON);
    const tue = await questsFor(sql, uid, TUE);
    expect(tue.weekly[0].id).toBe(mon.weekly[0].id);
    expect(tue.weekly[0].progress).toBeGreaterThan(0);
  });

  it('rolls the weekly on Monday', async () => {
    const mon = await questsFor(sql, uid, MON);
    await bumpQuests(sql, uid, { [mon.weekly[0].metric]: 3 }, MON);
    const next = await questsFor(sql, uid, NEXT_MON);
    expect(next.weekly[0].progress).toBe(0);
    expect(next.weekly[0].resetAt).toBe('2026-08-10T00:00:00.000Z');
  });
});

describe('progress', () => {
  it('counts only the metric a quest asks for', async () => {
    const view = await questsFor(sql, uid, MON);
    const target = view.daily[0];
    await bumpQuests(sql, uid, { [target.metric]: 1 }, MON);
    const after = await questsFor(sql, uid, MON);
    expect(after.daily.find((q) => q.id === target.id)?.progress).toBe(1);
    for (const q of after.daily) {
      if (q.metric !== target.metric) expect(q.progress, q.id).toBe(0);
    }
  });

  it('flips to ready at the target and names what completed', async () => {
    const view = await questsFor(sql, uid, MON);
    const target = view.daily[0];
    const done = await bumpQuests(sql, uid, { [target.metric]: target.target }, MON);
    expect(done).toContain(target.id);
    const after = await questsFor(sql, uid, MON);
    expect(after.daily.find((q) => q.id === target.id)?.state).toBe('ready');
  });

  it('does not report a bar past 100%', async () => {
    const view = await questsFor(sql, uid, MON);
    const target = view.daily[0];
    await bumpQuests(sql, uid, { [target.metric]: target.target * 10 }, MON);
    const after = await questsFor(sql, uid, MON);
    expect(after.daily.find((q) => q.id === target.id)?.progress).toBe(target.target);
  });

  it('stops counting once a quest is ready, so a claim cannot be re-earned', async () => {
    const view = await questsFor(sql, uid, MON);
    const target = view.daily[0];
    await bumpQuests(sql, uid, { [target.metric]: target.target }, MON);
    const again = await bumpQuests(sql, uid, { [target.metric]: target.target }, MON);
    expect(again).not.toContain(target.id);
  });

  it('ignores an expired quest row', async () => {
    await questsFor(sql, uid, MON);
    const done = await bumpQuests(sql, uid, { matches: 99, wins: 99 }, NEXT_MON);
    expect(done).toEqual([]);
  });
});

describe('claiming', () => {
  it('pays the advertised coins, once', async () => {
    const view = await questsFor(sql, uid, MON);
    const target = view.daily[0];
    await bumpQuests(sql, uid, { [target.metric]: target.target }, MON);

    const claim = await claimQuest(sql, uid, target.id, MON);
    expect(claim.coins).toBe(QUESTS[target.id].coins);
    expect((await profileFor(sql, uid)).coins).toBe(claim.coins);
    await expect(claimQuest(sql, uid, target.id, MON)).rejects.toThrow(/already_claimed/);
    expect((await profileFor(sql, uid)).coins).toBe(claim.coins);
  });

  it('refuses a quest that is not finished', async () => {
    const view = await questsFor(sql, uid, MON);
    await expect(claimQuest(sql, uid, view.daily[0].id, MON)).rejects.toThrow(/not_complete/);
    expect((await profileFor(sql, uid)).coins).toBe(0);
  });

  it('refuses a quest the player was never dealt, or one that never existed', async () => {
    const view = await questsFor(sql, uid, MON);
    const held = new Set([...view.daily, ...view.weekly].map((q) => q.id));
    const notHeld = Object.keys(QUESTS).find((id) => !held.has(id));
    await expect(claimQuest(sql, uid, notHeld as string, MON)).rejects.toThrow(/no_quest/);
    await expect(claimQuest(sql, uid, 'q_invented', MON)).rejects.toThrow(/unknown_quest/);
  });

  it('refuses a quest that expired before it was claimed', async () => {
    const view = await questsFor(sql, uid, MON);
    const target = view.daily[0];
    await bumpQuests(sql, uid, { [target.metric]: target.target }, MON);
    await expect(claimQuest(sql, uid, target.id, TUE)).rejects.toThrow(/no_quest/);
  });

  it('pays only once when two clicks race', async () => {
    const view = await questsFor(sql, uid, MON);
    const target = view.daily[0];
    await bumpQuests(sql, uid, { [target.metric]: target.target }, MON);
    const results = await Promise.allSettled([
      claimQuest(sql, uid, target.id, MON),
      claimQuest(sql, uid, target.id, MON),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await profileFor(sql, uid)).coins).toBe(QUESTS[target.id].coins);
  });
});

describe('rerolling', () => {
  it('swaps one daily for another and marks the day used', async () => {
    const before = await questsFor(sql, uid, MON);
    const dropped = before.daily[0];
    const fresh = await rerollQuest(sql, uid, dropped.id, MON);
    expect(fresh.id).not.toBe(dropped.id);
    expect(fresh.cadence).toBe('daily');

    const after = await questsFor(sql, uid, MON);
    expect(after.daily).toHaveLength(3);
    expect(after.daily.map((q) => q.id)).not.toContain(dropped.id);
    expect(after.daily.map((q) => q.id)).toContain(fresh.id);
    expect(after.rerollAvailable).toBe(false);
  });

  it('never rerolls into a quest already held', async () => {
    const before = await questsFor(sql, uid, MON);
    const fresh = await rerollQuest(sql, uid, before.daily[0].id, MON);
    const others = before.daily.slice(1).map((q) => q.id);
    expect(others).not.toContain(fresh.id);
  });

  it('allows one per day and no more', async () => {
    const view = await questsFor(sql, uid, MON);
    await rerollQuest(sql, uid, view.daily[0].id, MON);
    await expect(rerollQuest(sql, uid, view.daily[1].id, MON)).rejects.toThrow(/reroll_used/);
  });

  it('gives the reroll back the next day', async () => {
    const view = await questsFor(sql, uid, MON);
    await rerollQuest(sql, uid, view.daily[0].id, MON);
    expect((await questsFor(sql, uid, TUE)).rerollAvailable).toBe(true);
  });

  it('refuses to reroll a finished quest — that would farm the pool', async () => {
    const view = await questsFor(sql, uid, MON);
    const target = view.daily[0];
    await bumpQuests(sql, uid, { [target.metric]: target.target }, MON);
    await expect(rerollQuest(sql, uid, target.id, MON)).rejects.toThrow(/already_complete/);
  });

  it('refuses to reroll the weekly', async () => {
    const view = await questsFor(sql, uid, MON);
    await expect(rerollQuest(sql, uid, view.weekly[0].id, MON)).rejects.toThrow(/not_rerollable/);
  });

  it('does not re-deal the rerolled-away quest when the screen reloads', async () => {
    const before = await questsFor(sql, uid, MON);
    const dropped = before.daily[0];
    await rerollQuest(sql, uid, dropped.id, MON);
    const reloaded = await questsFor(sql, uid, MON_LATE);
    expect(reloaded.daily).toHaveLength(3);
    expect(reloaded.daily.map((q) => q.id)).not.toContain(dropped.id);
  });
});
