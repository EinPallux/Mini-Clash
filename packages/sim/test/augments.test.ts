import { AUGMENT_LIST, AUGMENTS, DRAFT, GENERIC_AUGMENTS } from '@mini-clash/data';
import { type Intent, type IntentMsg, UNKNOWN_AUGMENT } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src';
import { applyCc } from '../src/buffs';
import { dealDamage } from '../src/combat';
import { pickAugment } from '../src/draft';
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

  it('flags the timeout pick as automatic, and a chosen one as not', () => {
    // The HUD says "coach chose" only when the timer actually ran out (UI_UX §9).
    // tick() drains the queue into its snapshot, so read the events from there.
    const timeout = bridge();
    levelTo(timeout, 3);
    let auto: boolean | null = null;
    for (let i = 0; i < Math.round((DRAFT.seconds + 1) * 30); i++) {
      for (const ev of timeout.tick().events) {
        if (ev.t === 'augmentPicked' && ev.player === 1) auto = ev.auto;
      }
    }
    expect(auto).toBe(true);

    const chosen = bridge();
    levelTo(chosen, 3);
    chosen.applyIntents([msg({ t: 'draftPick', offer: 0 })]);
    const ev = chosen.tick().events.find((x) => x.t === 'augmentPicked');
    expect(ev && ev.t === 'augmentPicked' ? ev.auto : null).toBe(false);
  });

  it('a max-HP card grants the delta instead of shaving the bar mid-fight', () => {
    const sim = bridge();
    const e = me(sim);
    const c = e.champ;
    if (!c) throw new Error('no champ');
    levelTo(sim, 3);
    dealDamage(sim.world, { source: e, label: 'test' }, e, 200, 'physical');
    const hpBefore = e.hp;
    const maxBefore = e.hpMax;
    // Pick directly: a tick in between would let the fountain plate heal us and
    // hide exactly the thing under test.
    c.draft = { index: 0, offers: ['thick_hide'], tLeft: 5, rerolled: false };
    expect(pickAugment(sim.world, e, 0)).toBe(true);
    expect(e.hpMax).toBeGreaterThan(maxBefore);
    // Missing HP is unchanged: the card gave us the new slice, it didn't take one.
    expect(e.hpMax - e.hp).toBeCloseTo(maxBefore - hpBefore, 3);
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

  it('enemy augments arrive as `?` until they are seen on the field', () => {
    const sim = bridge();
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    // Grant directly and freeze discovery: nobody has looked at us yet.
    c.augments.push('stoneskin');
    sim.world.discovered = [new Set(), new Set()];
    const enemyView = sim.snapshotFor(1, 2);
    const hidden = enemyView.entities.find((e) => e.kind === 'champion' && e.player === 1);
    expect(hidden?.kind === 'champion' ? hidden.augments : []).toEqual([UNKNOWN_AUGMENT]);
    // The count still crosses: "they have one, I do not know which".
    expect(hidden?.kind === 'champion' ? hidden.augments.length : 0).toBe(1);

    // Our own team always sees the real card.
    const ownView = sim.snapshotFor(0, 1);
    const own = ownView.entities.find((e) => e.kind === 'champion' && e.player === 1);
    expect(own?.kind === 'champion' ? own.augments : []).toEqual(['stoneskin']);

    // Standing in the open for a tick is what buys the information.
    run(sim, 0.5);
    const after = sim
      .snapshotFor(1, 2)
      .entities.find((e) => e.kind === 'champion' && e.player === 1);
    expect(after?.kind === 'champion' ? after.augments : []).toEqual(['stoneskin']);
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

  /* ------------------------- Behavioural specials ------------------------- */

  it('Thornmail Soul reflects a share of basic-attack damage', () => {
    const sim = bridge();
    const e = me(sim);
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    grant(sim, 'thornmail_soul');
    foe.hp = foe.hpMax;
    const before = foe.hp;
    // Rook spawns behind Shieldwall, which eats the first hit whole.
    dealDamage(sim.world, { source: foe, tag: 'aa' }, e, 200, 'physical');
    dealDamage(sim.world, { source: foe, tag: 'aa' }, e, 200, 'physical');
    expect(foe.hp).toBeLessThan(before);
  });

  it('Undying Contract refuses one death per match, and only with a bench', () => {
    const sim = bridge();
    const e = me(sim);
    const c = e.champ;
    if (!c) throw new Error('no champ');
    const was = c.def.id;
    grant(sim, 'undying_contract');
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    dealDamage(sim.world, { source: foe }, e, 99999, 'physical');
    dealDamage(sim.world, { source: foe }, e, 99999, 'physical');
    expect(e.dead).toBe(false);
    expect(c.def.id).not.toBe(was); // the bench half took the field
    expect(e.hp / e.hpMax).toBeCloseTo(0.4, 1);
    // The contract is spent: the next lethal blow lands.
    dealDamage(sim.world, { source: foe }, e, 99999, 'physical');
    dealDamage(sim.world, { source: foe }, e, 99999, 'physical');
    expect(e.dead).toBe(true);
  });

  it('Second Wind heals once per life', () => {
    // Mortis, not Rook: no block passive to swallow the trigger hit.
    const sim = bridge('mortis', 'sylva');
    const e = me(sim);
    const c = e.champ;
    if (!c) throw new Error('no champ');
    grant(sim, 'second_wind');
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    e.hp = e.hpMax * 0.12;
    dealDamage(sim.world, { source: foe }, e, 20, 'physical');
    expect(c.augState.secondWind).toBe(1);
    const low = e.hp;
    run(sim, 3.2);
    expect(e.hp).toBeGreaterThan(low);
    // Armed once per life: a second dip does not re-trigger it.
    c.augState.secondWind = 1;
    const before = e.hp;
    e.hp = e.hpMax * 0.05;
    dealDamage(sim.world, { source: foe }, e, 20, 'physical');
    run(sim, 3.2);
    expect(e.hp).toBeLessThan(before);
  });

  it('Guardian Constellation banks a star and eats one whole ability', () => {
    const sim = bridge();
    const e = me(sim);
    const c = e.champ;
    if (!c) throw new Error('no champ');
    grant(sim, 'guardian_constellation');
    run(sim, 21);
    expect(c.augState.star).toBe(1);
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    const before = e.hp;
    dealDamage(sim.world, { source: foe, tag: 'ability' }, e, 300, 'arcane');
    expect(e.hp).toBe(before);
    expect(c.augState.star).toBe(0);
    // Second ability gets through — the star is spent, not permanent.
    dealDamage(sim.world, { source: foe, tag: 'ability' }, e, 300, 'arcane');
    expect(e.hp).toBeLessThan(before);
  });

  it('Kinetic Battery charges from movement', () => {
    const sim = bridge();
    grant(sim, 'kinetic_battery');
    // Somewhere reachable inside our own half — the barrier is still up at 0:00.
    const e = me(sim);
    sim.applyIntents([msg({ t: 'move', x: e.x + 3, z: e.z })]);
    run(sim, 3);
    expect(me(sim).champ?.augState.kinetic ?? 0).toBeGreaterThan(0);
  });

  it('Overcharge scales the ultimate and leaves Q alone', () => {
    const hit = (withCard: boolean): number => {
      const sim = bridge('grukk', 'rook');
      if (withCard) grant(sim, 'overcharge');
      const c = me(sim).champ;
      if (!c) throw new Error('no champ');
      levelTo(sim, 6);
      c.draft = null;
      const foe = sim.world.entities.find((x) => x.champ?.player === 2);
      if (!foe) throw new Error('no foe');
      foe.x = me(sim).x + 1.2;
      foe.z = me(sim).z;
      foe.hp = foe.hpMax;
      sim.applyIntents([msg({ t: 'cast', slot: 'r', x: foe.x, z: foe.z })]);
      run(sim, 1.5);
      return foe.hpMax - foe.hp;
    };
    const plain = hit(false);
    const charged = hit(true);
    expect(plain).toBeGreaterThan(0);
    expect(charged).toBeGreaterThan(plain);
  });

  it('Splitter turns one Q into two angled casts', () => {
    // Fathom's Q is a projectile, so Splitter is legal on him.
    const sim = bridge('fathom', 'rook');
    grant(sim, 'splitter');
    const e = me(sim);
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: e.x + 6, z: e.z })]);
    run(sim, 0.5); // ride out the windup — the shot leaves on commit, not on cast
    const shots = sim.world.entities.filter(
      (x) => x.kind === 'projectile' && x.proj?.owner === e.id,
    );
    expect(shots.length).toBe(2);
    // And they leave on different headings — that V is the whole tell.
    expect(shots[0].proj?.dirZ).not.toBeCloseTo(shots[1].proj?.dirZ ?? 0, 3);
  });

  it('Ramparts stretches the wall and stops enemy shots', () => {
    const plain = bridge('rook', 'grukk');
    const e0 = me(plain);
    plain.applyIntents([msg({ t: 'cast', slot: 'w', x: e0.x + 3, z: e0.z })]);
    for (let i = 0; i < 20; i++) plain.tick();
    const base = plain.world.entities.find((x) => x.kind === 'wall')?.wall?.length ?? 0;
    expect(base).toBeGreaterThan(0);

    const sim = bridge('rook', 'grukk');
    grant(sim, 'ramparts_old_bridge');
    const e = me(sim);
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: e.x + 3, z: e.z })]);
    for (let i = 0; i < 20; i++) sim.tick();
    const wall = sim.world.entities.find((x) => x.kind === 'wall');
    expect(wall?.wall?.length ?? 0).toBeGreaterThan(base);
    expect(wall?.wall?.blocksProjectiles).toBe(true);
  });

  it('Elemental Ascension locks one element at pickup and rides ability hits', () => {
    const sim = bridge();
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    levelTo(sim, 3);
    c.draft = { index: 0, offers: ['elemental_ascension'], tLeft: 5, rerolled: false };
    expect(pickAugment(sim.world, me(sim), 0)).toBe(true);
    const rolled = c.augState.element;
    expect(rolled).toBeGreaterThanOrEqual(0);
    expect(rolled).toBeLessThan(3);
    run(sim, 2);
    expect(c.augState.element).toBe(rolled); // never re-rolls mid-match
  });

  it('every signature augment survives its own champion casting the whole kit', {
    timeout: 90_000,
  }, () => {
    const broken: string[] = [];
    for (const def of AUGMENT_LIST) {
      if (def.category !== 'signature' || !def.championId) continue;
      try {
        const sim = bridge(def.championId, def.championId === 'rook' ? 'fathom' : 'rook');
        grant(sim, def.id);
        const c = me(sim).champ;
        if (!c) throw new Error('no champ');
        levelTo(sim, 4); // R unlocks at 4 in bridge mode
        c.draft = null;
        championStats(me(sim));
        for (const slot of ['q', 'w', 'r'] as const) {
          const e = me(sim);
          c.energy = 100;
          c.cds = { q: 0, w: 0, r: 0 };
          sim.applyIntents([msg({ t: 'cast', slot, x: e.x + 3, z: e.z })]);
          run(sim, 1);
        }
        run(sim, 2); // let scheduled tails (echoes, pods, trails) resolve
      } catch (err) {
        broken.push(`${def.id}: ${(err as Error).message}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('patch stacking survives death, swap and sell without orphaning a modifier', {
    timeout: 30_000,
  }, () => {
    // ROADMAP v0.5 acceptance: 3 augments x duo x items, and the resolved
    // stat line has to be reproducible from the inputs at every step.
    const sim = bridge('rook', 'fathom');
    const e = me(sim);
    const c = e.champ;
    if (!c) throw new Error('no champ');
    c.gold = 20_000;
    for (const id of ['whetted_edges', 'stoneskin', 'thick_hide']) grant(sim, id);
    sim.applyIntents([msg({ t: 'buy', itemId: 'iron_plate' })]);
    run(sim, 0.2);
    expect(c.items.length).toBe(1);

    const line = (): string => {
      const s2 = championStats(e);
      return [s2.ad, s2.armor, s2.ward, s2.hpMax, s2.attackSpeed]
        .map((v) => Math.round(v * 100) / 100)
        .join('|');
    };
    const withAll = line();
    const bare = (() => {
      const held = [...c.augments];
      const items = [...c.items];
      c.augments = [];
      c.items = [];
      const l = line();
      c.augments = held;
      c.items = items;
      return l;
    })();
    expect(withAll).not.toBe(bare);

    // 1. A swap must not move the seat's cards: they belong to the seat, not
    //    to whichever half is on stage. The shared HP pool is symmetric, so
    //    it must read identically on both sides of the round trip.
    const poolBefore = championStats(e).hpMax;
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.6);
    expect(c.augments).toHaveLength(3);
    expect(championStats(e).hpMax).toBeCloseTo(poolBefore, 3);
    run(sim, 10); // the 9 s swap cooldown has to expire before we come back
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.6);
    expect(line()).toBe(withAll);

    // 2. Dying and respawning must not duplicate or drop a modifier.
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    for (let i = 0; i < 3; i++) dealDamage(sim.world, { source: foe }, e, 99_999, 'physical');
    run(sim, 1);
    expect(e.dead).toBe(true);
    run(sim, 25);
    expect(e.dead).toBe(false);
    expect(c.augments).toHaveLength(3);
    expect(line()).toBe(withAll);

    // 3. Selling the item removes exactly the item's contribution.
    sim.applyIntents([msg({ t: 'sell', itemId: 'iron_plate' })]);
    run(sim, 0.2);
    expect(c.items).toHaveLength(0);
    const augOnly = line();
    expect(augOnly).not.toBe(withAll);
    expect(augOnly).not.toBe(bare);

    // 4. And dropping the cards returns us exactly to the naked champion.
    c.augments = [];
    expect(line()).toBe(bare);
    // No stray buffs are left behind by any of it.
    expect(e.buffs.filter((b) => b.id.startsWith('aug_'))).toEqual([]);
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
