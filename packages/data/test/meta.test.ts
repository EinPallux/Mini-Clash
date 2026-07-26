import { describe, expect, it } from 'vitest';
import {
  accountLevelFor,
  CHAMPION_PRICES,
  CHAMPIONS,
  COSMETIC_PRICES,
  freeRotation,
  MASTERY_CURVE,
  masteryLevelFor,
  QUEST_POOL,
  QUESTS,
  RENAME_PRICE,
  REWARDS,
  STARTER_CHAMPIONS,
  weekIndexOf,
} from '../src/index';

/**
 * The meta game's content rules (GAME_DESIGN §18).
 *
 * The first test is the one `meta.ts` leans on: `freeRotation` derives its pool
 * from the price table rather than the roster, which is only safe as long as
 * those two agree. Nothing in the type system says they do — so this does.
 */

describe('prices', () => {
  it('covers the roster exactly — no unpriced champion, no price for a ghost', () => {
    expect(Object.keys(CHAMPION_PRICES).sort()).toEqual(Object.keys(CHAMPIONS).sort());
  });

  it('gives every starter away and charges for everyone else', () => {
    for (const id of STARTER_CHAMPIONS) {
      expect(CHAMPION_PRICES[id], id).toBe(0);
    }
    for (const [id, price] of Object.entries(CHAMPION_PRICES)) {
      if ((STARTER_CHAMPIONS as readonly string[]).includes(id)) continue;
      expect(price, id).toBeGreaterThan(0);
    }
  });

  it('keeps a cosmetic cheaper than a champion, and a rename cheaper still', () => {
    const cheapestChampion = Math.min(
      ...Object.entries(CHAMPION_PRICES)
        .filter(([, p]) => p > 0)
        .map(([, p]) => p),
    );
    for (const [kind, price] of Object.entries(COSMETIC_PRICES)) {
      expect(price, kind).toBeLessThan(cheapestChampion);
    }
    expect(RENAME_PRICE).toBeLessThan(Math.min(...Object.values(COSMETIC_PRICES)));
  });

  it('covers one starter of each role, so a new account can play any position', () => {
    const roles = new Set(STARTER_CHAMPIONS.map((id) => CHAMPIONS[id].role));
    expect(roles.size).toBe(STARTER_CHAMPIONS.length);
  });
});

describe('the free rotation', () => {
  const pool = Object.keys(CHAMPION_PRICES).filter(
    (id) => !(STARTER_CHAMPIONS as readonly string[]).includes(id),
  );

  it('only ever offers champions somebody could otherwise have to buy', () => {
    for (let week = 0; week < 60; week++) {
      for (const id of freeRotation(week)) {
        expect(pool, `week ${week}`).toContain(id);
      }
    }
  });

  it('never repeats a champion inside one week', () => {
    for (let week = 0; week < 60; week++) {
      const got = freeRotation(week);
      expect(new Set(got).size, `week ${week}`).toBe(got.length);
    }
  });

  it('is the same list for everyone asking about the same week', () => {
    expect(freeRotation(7)).toEqual(freeRotation(7));
  });

  it('actually rotates — a champion does not sit free forever', () => {
    const seen = new Map<string, number>();
    for (let week = 0; week < 24; week++) {
      for (const id of freeRotation(week)) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    // Over 24 weeks every buyable champion gets a turn…
    expect([...seen.keys()].sort()).toEqual([...pool].sort());
    // …and none of them is free every single week.
    for (const [id, count] of seen) expect(count, id).toBeLessThan(24);
  });

  it('survives a pool smaller than the rotation size', () => {
    expect(freeRotation(3, 999).length).toBeLessThanOrEqual(pool.length);
  });

  it('counts weeks forward from the epoch and never goes backwards', () => {
    const a = weekIndexOf(new Date('2026-01-05T00:00:00Z'));
    const b = weekIndexOf(new Date('2026-01-12T00:00:00Z'));
    expect(b).toBe(a + 1);
    expect(weekIndexOf(new Date('2026-01-05T23:59:59Z'))).toBe(a);
  });
});

describe('mastery and account level', () => {
  it('starts at 1 and tops out at 10', () => {
    expect(masteryLevelFor(0)).toBe(1);
    expect(masteryLevelFor(-5)).toBe(1);
    expect(masteryLevelFor(MASTERY_CURVE[MASTERY_CURVE.length - 1])).toBe(10);
    expect(masteryLevelFor(999_999)).toBe(10);
  });

  it('never goes down as xp goes up', () => {
    let last = 1;
    for (let xp = 0; xp <= 12_000; xp += 37) {
      const level = masteryLevelFor(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it('turns each threshold exactly, not one xp early or late', () => {
    for (let i = 1; i < MASTERY_CURVE.length; i++) {
      expect(masteryLevelFor(MASTERY_CURVE[i] - 1), `below ${i + 1}`).toBe(i);
      expect(masteryLevelFor(MASTERY_CURVE[i]), `at ${i + 1}`).toBe(i + 1);
    }
  });

  it('costs more for each mastery level than the one before', () => {
    for (let i = 2; i < MASTERY_CURVE.length; i++) {
      expect(MASTERY_CURVE[i] - MASTERY_CURVE[i - 1]).toBeGreaterThan(
        MASTERY_CURVE[i - 1] - MASTERY_CURVE[i - 2],
      );
    }
  });

  it('gives an account level from the first match and keeps climbing', () => {
    expect(accountLevelFor(0)).toBe(1);
    let last = 1;
    for (let xp = 0; xp < 200_000; xp += 911) {
      const level = accountLevelFor(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
    expect(accountLevelFor(100_000)).toBeGreaterThan(accountLevelFor(10_000));
  });
});

describe('rewards', () => {
  it('pays a loss enough to keep playing, but less than a win', () => {
    expect(REWARDS.loss).toBeGreaterThan(0);
    expect(REWARDS.loss).toBeLessThan(REWARDS.win);
  });

  it('makes the first win of the day the best win of the day', () => {
    expect(REWARDS.firstWinOfDay).toBeGreaterThan(REWARDS.win);
  });

  it('keeps the performance swing a nudge rather than the whole reward', () => {
    expect(REWARDS.performanceSwing).toBeGreaterThan(0);
    expect(REWARDS.performanceSwing).toBeLessThanOrEqual(0.25);
    // Even a worst-case game still pays more than nothing.
    expect(REWARDS.loss * (1 - REWARDS.performanceSwing)).toBeGreaterThan(0);
  });

  it('prices a champion within a sane number of matches', () => {
    const perMatch = (REWARDS.win + REWARDS.loss) / 2;
    const dearest = Math.max(...Object.values(CHAMPION_PRICES));
    const matches = dearest / perMatch;
    // Roughly a fortnight of casual play, not a second job.
    expect(matches).toBeGreaterThan(40);
    expect(matches).toBeLessThan(120);
  });
});

describe('quests', () => {
  it('has unique ids and an index that matches the pool', () => {
    const ids = QUEST_POOL.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(QUESTS).sort()).toEqual([...ids].sort());
  });

  it('can deal three dailies and one weekly without running dry', () => {
    expect(QUEST_POOL.filter((q) => q.cadence === 'daily').length).toBeGreaterThanOrEqual(4);
    expect(QUEST_POOL.filter((q) => q.cadence === 'weekly').length).toBeGreaterThanOrEqual(2);
  });

  it('asks for something achievable and pays the advertised rates', () => {
    for (const q of QUEST_POOL) {
      expect(q.target, q.id).toBeGreaterThan(0);
      expect(q.coins, q.id).toBeGreaterThan(0);
      if (q.cadence === 'daily') {
        expect(REWARDS.questDaily as readonly number[], q.id).toContain(q.coins);
      } else {
        expect(q.coins, q.id).toBe(REWARDS.questWeekly);
      }
    }
  });

  it('makes a weekly worth more than a daily that counts the same thing', () => {
    for (const weekly of QUEST_POOL.filter((q) => q.cadence === 'weekly')) {
      for (const daily of QUEST_POOL.filter(
        (q) => q.cadence === 'daily' && q.metric === weekly.metric,
      )) {
        expect(weekly.target, weekly.id).toBeGreaterThan(daily.target);
        expect(weekly.coins).toBeGreaterThan(daily.coins);
      }
    }
  });
});
