import { CHAMPIONS, TAG_SWAP } from '@mini-clash/data';
import type { ChampionSnap, Intent, IntentMsg, MatchConfig } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src';

/**
 * Tag Swap core (GAME_DESIGN §7.2 / ROADMAP v0.4 acceptance): shared HP pool,
 * per-champion Energy/cooldown banks, morph gating, CC/channel locks, and the
 * edge cases — swap during projectile flight, during channels, at death frame.
 */

function duoSim(extra: Partial<MatchConfig> = {}): {
  sim: Sim;
  msg: (intent: Intent, player?: number) => IntentMsg;
} {
  const config: MatchConfig = {
    mode: 'training',
    seed: 777,
    mapId: 'training',
    players: [
      { id: 1, championId: 'rook', benchId: 'fathom', team: 0 },
      { id: 2, championId: 'mortis', team: 1, name: 'Foe' },
    ],
    ...extra,
  };
  const sim = new Sim(config);
  let seq = 0;
  const msg = (intent: Intent, player = 1): IntentMsg => ({ seq: seq++, player, intent });
  return { sim, msg };
}

function me(sim: Sim) {
  const e = sim.world.entities.find((x) => x.champ?.player === 1);
  if (!e?.champ) throw new Error('no champion');
  return e;
}

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) sim.tick();
}

function mySnap(sim: Sim): ChampionSnap {
  const snap = sim.tick();
  return snap.entities.find((e) => e.kind === 'champion' && e.player === 1) as ChampionSnap;
}

describe('Tag Swap', () => {
  it('shares one HP pool: the average of both curves, kept across swaps and level-ups', () => {
    const { sim } = duoSim();
    const e = me(sim);
    const rook = CHAMPIONS.rook.stats;
    const fathom = CHAMPIONS.fathom.stats;
    expect(e.hpMax).toBeCloseTo((rook.hp + fathom.hp) / 2, 5);

    // Damage sticks to the shared pool across a swap.
    e.hp -= 200;
    const before = e.hp;
    sim.applyIntents([{ seq: 0, player: 1, intent: { t: 'swap' } }]);
    sim.tick();
    expect(me(sim).champ?.def.id).toBe('fathom');
    expect(Math.abs(me(sim).hp - before)).toBeLessThan(2); // ± one tick of regen
    expect(me(sim).hpMax).toBeCloseTo((rook.hp + fathom.hp) / 2, 5);

    // Level-ups recompute the average from both curves.
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    sim.applyIntents([{ seq: 1, player: 1, intent: { t: 'trainer', cmd: { k: 'levelUp' } } }]);
    sim.tick();
    const lv = c.level - 1;
    expect(me(sim).hpMax).toBeCloseTo(
      (rook.hp + rook.hpPerLevel * lv + fathom.hp + fathom.hpPerLevel * lv) / 2,
      3,
    );
  });

  it('banks Energy and cooldowns per champion; the bench recovers while benched', () => {
    const { sim, msg } = duoSim();
    // Burn Rook's W (plain cooldown — Q opens a recast window) and Energy.
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: 5, z: -5 })]);
    run(sim, 1.2);
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    const rookQCd = c.cds.w;
    const rookEnergy = c.energy;
    expect(rookQCd).toBeGreaterThan(0);
    expect(rookEnergy).toBeLessThan(100);

    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    // Fathom arrives with a fresh kit and its own full Energy bar.
    expect(c.def.id).toBe('fathom');
    expect(c.cds.w).toBe(0);
    expect(c.energy).toBeGreaterThan(96);
    // The benched Rook keeps ticking: after the 9 s swap CD, its Q has cooled
    // and its Energy refilled.
    run(sim, TAG_SWAP.cooldown + 0.2);
    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    expect(c.def.id).toBe('rook');
    expect(c.cds.w).toBeLessThan(Math.max(0.01, rookQCd - 8));
    expect(c.energy).toBeGreaterThan(rookEnergy);
  });

  it('enforces the swap cooldown and the morph attack/cast lockout', () => {
    const { sim, msg } = duoSim();
    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    expect(c.def.id).toBe('fathom');
    expect(c.duo?.swapCd).toBeCloseTo(TAG_SWAP.cooldown, 1);

    // Mid-morph: casts are denied…
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: 5, z: -5 })]);
    sim.tick();
    expect(c.cds.q).toBe(0); // never cast
    // …and a second swap inside the cooldown is denied.
    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    expect(c.def.id).toBe('fathom');

    // After the morph, the new kit casts fine.
    run(sim, TAG_SWAP.morphS + 0.1);
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: 5, z: -5 })]);
    run(sim, 0.6);
    expect(c.cds.q).toBeGreaterThan(0);
  });

  it('is blocked while channeling and grants the decaying swap-in haste', () => {
    const { sim, msg } = duoSim();
    const c = me(sim).champ;
    if (!c) throw new Error('no champ');
    // Rook Q has a windup: start it, swap during the cast → denied.
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: 5, z: -5 }), msg({ t: 'swap' })]);
    sim.tick();
    expect(c.def.id).toBe('rook');

    run(sim, 1.5); // windup resolves
    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    expect(c.def.id).toBe('fathom');
    expect(me(sim).buffs.some((b) => b.id === 'tag_swap_momentum')).toBe(true);
    run(sim, TAG_SWAP.hasteDuration + 0.2);
    expect(me(sim).buffs.some((b) => b.id === 'tag_swap_momentum')).toBe(false);
  });

  it('keeps buffs on the entity across swaps and survives mid-flight projectiles', () => {
    const { sim, msg } = duoSim();
    const e = me(sim);
    // A lingering buff (swap momentum from a first swap) must survive later hits.
    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    expect(e.buffs.length).toBeGreaterThan(0);

    // Enemy fires Mortis Q (projectile) at us; we can't swap (CD) but the
    // projectile keeps homing on the same entity and hits the shared pool.
    const hpBefore = e.hp;
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: e.x, z: e.z }, 2)]);
    run(sim, 1.5);
    expect(me(sim).hp).toBeLessThan(hpBefore); // flight resolved onto the duo
  });

  it('death kills the duo; respawn restores both banks with swap ready', () => {
    const { sim, msg } = duoSim();
    const e = me(sim);
    // Swap so the CD is running, then die mid-cooldown.
    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    e.hp = 1;
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!foe?.champ) throw new Error('no foe');
    // Foe autos us down (one duo death — no second life from the bench).
    sim.applyIntents([msg({ t: 'attackTarget', target: e.id }, 2)]);
    run(sim, 3);
    expect(e.dead).toBe(true);
    // Swapping while dead is ignored.
    const active = e.champ?.def.id;
    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    expect(e.champ?.def.id).toBe(active);

    run(sim, 12); // respawn timer
    expect(e.dead).toBe(false);
    expect(e.champ?.duo?.swapCd).toBe(0);
    expect(e.champ?.duo?.energy).toBe(100);
    expect(e.hp).toBeCloseTo(e.hpMax, 3);
  });

  it('fires the arriving champion’s entrance on every swap-in', () => {
    const { sim, msg } = duoSim();
    const e = me(sim);
    // Rook → Fathom: Lucky Doubloon buff arrives with him.
    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    expect(e.buffs.some((b) => b.id === 'fathom_entrance_luck')).toBe(true);
    // …and back: Rook re-enters with Shieldwall's block charge.
    run(sim, TAG_SWAP.cooldown + 0.2);
    sim.applyIntents([msg({ t: 'swap' })]);
    sim.tick();
    const wall = e.buffs.find((b) => b.id === 'rook_entrance_shieldwall');
    expect(wall?.blockNextHit).toBe(true);
  });

  it('snapshots carry the duo block; solo configs stay duo-free with old hp rules', () => {
    const { sim } = duoSim();
    const snap = mySnap(sim);
    expect(snap.duo).toBeDefined();
    expect(snap.duo?.championId).toBe('fathom');
    expect(snap.duo?.swapCd).toBe(0);

    // Solo champion (v0.3 config shape): no duo block, classic hp.
    const solo = new Sim({
      mode: 'training',
      seed: 1,
      mapId: 'training',
      players: [{ id: 1, championId: 'rook', team: 0 }],
    });
    const s = solo
      .tick()
      .entities.find((x) => x.kind === 'champion' && x.player === 1) as ChampionSnap;
    expect(s.duo).toBeUndefined();
    expect(s.hpMax).toBe(CHAMPIONS.rook.stats.hp);
  });
});
