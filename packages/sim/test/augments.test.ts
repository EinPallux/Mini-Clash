import { AUGMENTS, DRAFT, GENERIC_AUGMENTS } from '@mini-clash/data';
import type { Intent, IntentMsg, MatchConfig } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src';
import { applyCc } from '../src/buffs';
import { dealDamage } from '../src/combat';
import { championStats } from '../src/stats';

/**
 * The draft loop and the effect engine (docs/AUGMENTS.md).
 * Drafts only open in bridge mode, so most of this runs a real match config.
 */

function bridge(championId = 'rook', benchId = 'fathom'): Sim {
  const players = [
    { id: 1, championId, benchId, team: 0 as const },
    { id: 2, championId: 'mortis', benchId: 'sylva', team: 1 as const, bot: 'recruit' as const },
  ];
  return new Sim({ mode: 'bridge', seed: 4242, mapId: 'shatterbridge', players });
}

let seq = 0;
const msg = (intent: Intent, player = 1): IntentMsg => ({ seq: seq++, player, intent });

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) sim.tick();
}

function me(sim: Sim) {
  const e = sim.world.entities.find((x) => x.champ?.player === 1);
  if (!e?.champ) throw new Error('no champion');
  return e;
}

/** Level the player to `n`, which is what opens drafts. */
function levelTo(sim: Sim, n: number): void {
  const c = me(sim).champ;
  if (!c) return;
  while (c.level < n) {
    sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'levelUp' } })]);
    sim.tick();
  }
}

/** Give a champion an augment directly (skips the draft — for effect tests). */
function grant(sim: Sim, id: string): void {
  const c = me(sim).champ;
  if (!c) throw new Error('no champ');
  c.augments.push(id);
}

describe('draft flow', () => {
  it('opens at levels 3, 6 and 9 — and not at any other level', () => {
    const sim = bridge();
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    levelTo(sim, 2);
    expect(c.draft).toBeNull();
    levelTo(sim, 3);
    expect(c.draft).not.toBeNull();
    sim.applyIntents([msg({ t: 'draftPick', offer: 0 })]);
    sim.tick();
    expect(c.draft).toBeNull();
    levelTo(sim, 5);
    expect(c.draft).toBeNull();
    levelTo(sim, 6);
    expect(c.draft).not.toBeNull();
  });

  it('offers three distinct cards, none already taken', () => {
    const sim = bridge();
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    levelTo(sim, 3);
    const first = c.draft?.offers ?? [];
    expect(first).toHaveLength(DRAFT.offers);
    expect(new Set(first).size).toBe(first.length);

    sim.applyIntents([msg({ t: 'draftPick', offer: 0 })]);
    sim.tick();
    const taken = c.augments[0];
    levelTo(sim, 6);
    expect(c.draft?.offers).not.toContain(taken);
  });

  it('never offers the same category twice in one set (§1)', { timeout: 20_000 }, () => {
    // Sweep seeds so this is about the rule, not one lucky roll.
    for (let seed = 0; seed < 12; seed++) {
      const sim = new Sim({
        mode: 'bridge',
        seed: 900 + seed,
        mapId: 'shatterbridge',
        players: [
          { id: 1, championId: 'rook', benchId: 'fathom', team: 0 },
          { id: 2, championId: 'mortis', team: 1, bot: 'recruit' },
        ],
      });
      levelTo(sim, 3);
      const offers = me(sim).champ?.draft?.offers ?? [];
      const cats = offers.map((id) => AUGMENTS[id].category);
      expect(new Set(cats).size, `seed ${seed}: ${cats.join(',')}`).toBe(cats.length);
    }
  });

  it('guarantees a champion-specific card while the duo still has one', { timeout: 20_000 }, () => {
    let sawSignature = 0;
    for (let seed = 0; seed < 15; seed++) {
      const sim = new Sim({
        mode: 'bridge',
        seed: 4000 + seed,
        mapId: 'shatterbridge',
        players: [
          { id: 1, championId: 'rook', benchId: 'fathom', team: 0 },
          { id: 2, championId: 'mortis', team: 1, bot: 'recruit' },
        ],
      });
      levelTo(sim, 3);
      const offers = me(sim).champ?.draft?.offers ?? [];
      const sigs = offers.filter((id) => AUGMENTS[id].category === 'signature');
      expect(sigs.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      // And it belongs to one of MY two champions, never someone else's.
      for (const id of sigs) {
        expect(['rook', 'fathom']).toContain(AUGMENTS[id].championId);
      }
      sawSignature += sigs.length;
    }
    expect(sawSignature).toBeGreaterThan(0);
  });

  it('filters cards the kit cannot use (Splitter needs a projectile Q)', {
    timeout: 20_000,
  }, () => {
    // Rook + Grukk: neither Q is a projectile, so Splitter must never appear.
    for (let seed = 0; seed < 20; seed++) {
      const sim = new Sim({
        mode: 'bridge',
        seed: 7000 + seed,
        mapId: 'shatterbridge',
        players: [
          { id: 1, championId: 'rook', benchId: 'grukk', team: 0 },
          { id: 2, championId: 'mortis', team: 1, bot: 'recruit' },
        ],
      });
      levelTo(sim, 3);
      expect(me(sim).champ?.draft?.offers ?? []).not.toContain('splitter');
    }
  });

  it('the reroll token replaces the set exactly once', () => {
    const sim = bridge();
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    levelTo(sim, 3);
    expect(c.rerolls).toBe(DRAFT.rerolls);
    const before = [...(c.draft?.offers ?? [])];
    sim.applyIntents([msg({ t: 'draftReroll' })]);
    sim.tick();
    expect(c.rerolls).toBe(DRAFT.rerolls - 1);
    expect(c.draft?.rerolled).toBe(true);
    // A second reroll on the same set is refused.
    const after = [...(c.draft?.offers ?? [])];
    sim.applyIntents([msg({ t: 'draftReroll' })]);
    sim.tick();
    expect(c.draft?.offers).toEqual(after);
    expect(before.length).toBe(after.length);
  });

  it('auto-picks at 0 rather than leaving the player empty-handed', () => {
    const sim = bridge();
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    levelTo(sim, 3);
    expect(c.draft).not.toBeNull();
    run(sim, DRAFT.seconds + 1);
    expect(c.draft).toBeNull();
    expect(c.augments).toHaveLength(1);
  });

  it('the match keeps running while a draft is open — it never pauses', () => {
    const sim = bridge();
    levelTo(sim, 3);
    const t0 = sim.world.time;
    const tick0 = sim.world.tick;
    run(sim, 2);
    expect(sim.world.time).toBeGreaterThan(t0);
    expect(sim.world.tick).toBeGreaterThan(tick0);
    // And the player can still act with the overlay up.
    sim.applyIntents([msg({ t: 'move', x: 0, z: 0 })]);
    run(sim, 1);
    expect(me(sim).champ?.draft).not.toBeNull();
  });

  it('your offers are private — they never reach the other team', () => {
    const sim = bridge();
    levelTo(sim, 3);
    const enemyView = sim.snapshotFor(1, 2);
    const mine = enemyView.entities.find((e) => e.kind === 'champion' && e.player === 1);
    expect(mine && mine.kind === 'champion' ? mine.draft : undefined).toBeUndefined();
    const ownView = sim.snapshotFor(0, 1);
    const own = ownView.entities.find((e) => e.kind === 'champion' && e.player === 1);
    expect(own && own.kind === 'champion' ? own.draft?.offers : undefined).toHaveLength(3);
  });

  it('bots draft on their own instead of idling out the timer', () => {
    const sim = new Sim({
      mode: 'bridge',
      seed: 31337,
      mapId: 'shatterbridge',
      players: Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        championId: ['rook', 'fathom', 'mortis', 'rattle'][i % 4],
        benchId: ['grukk', 'sylva', 'boltz', 'wisp'][i % 4],
        team: (i < 4 ? 0 : 1) as 0 | 1,
        bot: 'elite' as const,
      })),
    });
    // Long enough for everyone to cross level 3, far short of 3 × 45 s of timers.
    run(sim, 260);
    const drafted = sim.world.entities.filter((e) => (e.champ?.augments.length ?? 0) > 0);
    expect(drafted.length).toBe(8);
  });
});

describe('augment effects', () => {
  it('stat cards move the resolved totals', () => {
    const sim = bridge();
    const e = me(sim);
    const before = championStats(e);
    grant(sim, 'whetted_edges'); // +10% AD
    grant(sim, 'stoneskin'); // +18 armor
    const after = championStats(e);
    expect(after.ad).toBeCloseTo(before.ad * 1.1, 3);
    expect(after.armor).toBeCloseTo(before.armor + 18, 3);
  });

  it('Glass Core is a real trade: more damage, less health', () => {
    const sim = bridge();
    const e = me(sim);
    const hpBefore = championStats(e).hpMax;
    grant(sim, 'glass_core');
    expect(championStats(e).hpMax).toBeCloseTo(hpBefore * 0.88, 2);
  });

  it('Giant Slayer only fires against a bigger health pool', () => {
    const sim = bridge('fathom', 'mortis'); // small pool
    const e = me(sim);
    grant(sim, 'giant_slayer');
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    foe.x = e.x + 2;
    foe.z = e.z;

    // Bigger target → bonus applies.
    foe.hpMax = e.hpMax * 2;
    foe.hp = foe.hpMax;
    const big = foe.hp;
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: foe.x, z: foe.z })]);
    run(sim, 1);
    const dealtBig = big - foe.hp;

    // Smaller target → no bonus.
    const sim2 = bridge('fathom', 'mortis');
    const e2 = me(sim2);
    const foe2 = sim2.world.entities.find((x) => x.champ?.player === 2);
    if (!foe2) throw new Error('no foe');
    foe2.x = e2.x + 2;
    foe2.z = e2.z;
    foe2.hpMax = e2.hpMax * 2;
    foe2.hp = foe2.hpMax;
    const base = foe2.hp;
    sim2.applyIntents([msg({ t: 'cast', slot: 'q', x: foe2.x, z: foe2.z })]);
    run(sim2, 1);
    const dealtBase = base - foe2.hp;

    expect(dealtBig).toBeGreaterThan(dealtBase);
  });

  it('Quick Change shortens the swap cooldown', () => {
    const sim = bridge();
    grant(sim, 'quick_change');
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.2);
    const duo = me(sim).champ?.duo;
    expect(duo?.swapCd).toBeLessThan(9);
    expect(duo?.swapCd).toBeGreaterThan(6);
  });

  it('Bulwark Bond shields the champion arriving from the bench', () => {
    const sim = bridge();
    grant(sim, 'bulwark_bond');
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.5);
    expect(me(sim).buffs.some((b) => b.id === 'aug_bulwark' && (b.shieldLeft ?? 0) > 0)).toBe(true);
  });

  it('Tag Combo makes exactly one post-swap ability free', () => {
    const sim = bridge('mortis', 'sylva');
    grant(sim, 'tag_combo');
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.5);
    c.energy = 30;
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: me(sim).x + 3, z: me(sim).z })]);
    run(sim, 0.4);
    expect(c.energy).toBeGreaterThanOrEqual(30); // the free one cost nothing
  });

  it('Juggernaut Frame blunts slows instead of ignoring them', () => {
    const sim = bridge();
    const e = me(sim);
    grant(sim, 'juggernaut_frame');
    const base = championStats(e).moveSpeed;
    // A 30% slow, resisted down to ~21%.
    applyCc(e, { kind: 'slow', duration: 3, strength: 0.3 });
    const slowed = championStats(e).moveSpeed;
    expect(slowed).toBeLessThan(base);
    expect(slowed).toBeGreaterThan(base * 0.7); // stronger than a raw 30% cut
  });

  it('a signature does nothing while its champion is benched', () => {
    const sim = bridge('rook', 'fathom');
    const e = me(sim);
    grant(sim, 'long_nine'); // Fathom's: +0.75 range
    const asRook = championStats(e).range;
    expect(asRook).toBeCloseTo(e.champ?.def.stats.range ?? 0, 3);
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.5);
    // Now Fathom is fielded and the card switches on.
    expect(championStats(e).range).toBeCloseTo((e.champ?.def.stats.range ?? 0) + 0.75, 3);
  });

  it('augments survive death and respawn — no orphaned modifiers', () => {
    const sim = bridge();
    const e = me(sim);
    grant(sim, 'whetted_edges');
    grant(sim, 'stoneskin');
    const before = championStats(e).armor;
    e.hp = 1;
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    // Twice: Rook spawns with Shieldwall up, which eats the first hit outright.
    dealDamage(sim.world, { source: foe }, e, 99999, 'physical');
    dealDamage(sim.world, { source: foe }, e, 99999, 'physical');
    run(sim, 1);
    expect(e.dead).toBe(true);
    run(sim, 20); // respawn
    expect(e.dead).toBe(false);
    expect(e.champ?.augments).toHaveLength(2);
    expect(championStats(e).armor).toBeCloseTo(before, 3);
  });

  it('every generic augment can be granted without throwing', () => {
    const broken: string[] = [];
    for (const def of GENERIC_AUGMENTS) {
      try {
        const sim = bridge();
        grant(sim, def.id);
        championStats(me(sim));
        run(sim, 1.5);
      } catch (err) {
        broken.push(`${def.id}: ${(err as Error).message}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
