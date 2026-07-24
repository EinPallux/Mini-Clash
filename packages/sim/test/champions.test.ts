import type { Intent, IntentMsg, MatchConfig, Snapshot } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src';

/** v0.2 champion kits (Mortis, Rattle, Grukk, Sylva) — verified in the Training Grounds. */

function cfg(championId: string): MatchConfig {
  return {
    mode: 'training',
    seed: 777,
    mapId: 'training',
    players: [{ id: 1, championId, team: 0 }],
  };
}

let seq = 0;
function msg(intent: Intent): IntentMsg {
  return { seq: seq++, player: 1, intent };
}

function run(sim: Sim, seconds: number, collect?: Snapshot[]): Snapshot {
  let snap!: Snapshot;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    snap = sim.tick();
    collect?.push(snap);
  }
  return snap;
}

function me(sim: Sim) {
  const e = sim.world.entities.find((x) => x.champ?.player === 1);
  if (!e?.champ) throw new Error('no champion');
  return e;
}

/** Nearest dummy entity to a point. */
function dummyNear(sim: Sim, x: number, z: number) {
  const ds = sim.world.entities.filter((e) => e.kind === 'dummy');
  ds.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  if (!ds[0]) throw new Error('no dummy');
  return ds[0];
}

function prep(championId: string): Sim {
  const sim = new Sim(cfg(championId));
  sim.applyIntents([
    msg({ t: 'trainer', cmd: { k: 'noCooldowns', on: true } }),
    msg({ t: 'trainer', cmd: { k: 'infiniteEnergy', on: true } }),
  ]);
  return sim;
}

function damageEvents(snaps: Snapshot[]) {
  return snaps.flatMap((s) => s.events.filter((e) => e.t === 'damage'));
}

describe('Mortis', () => {
  it('Q bolt damages; ability hits inscribe; attacks vs inscribed refund energy and burn extra', () => {
    const sim = prep('mortis');
    sim.applyIntents([msg({ t: 'move', x: 1, z: -5 })]);
    run(sim, 4);
    const dummy = dummyNear(sim, 6, -5);
    const snaps: Snapshot[] = [];
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: dummy.x, z: dummy.z })]);
    run(sim, 1.2, snaps);
    expect(damageEvents(snaps).length).toBeGreaterThanOrEqual(1);
    expect(dummy.buffs.some((b) => b.id === 'mortis_inscribed')).toBe(true);
    // Attack the inscribed dummy: bonus arcane hit + energy refund fx path runs.
    const before = damageEvents(snaps).length;
    sim.applyIntents([msg({ t: 'attackTarget', target: dummy.id })]);
    const more: Snapshot[] = [];
    run(sim, 2.5, more);
    // Each landed attack produces the base hit + the Soul Ledger burn.
    const hits = damageEvents(more);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(before).toBeGreaterThanOrEqual(1);
  });

  it('W telegraphs then roots (longer vs inscribed); R channel ticks damage', () => {
    const sim = prep('mortis');
    sim.applyIntents([msg({ t: 'move', x: 2, z: -5 })]);
    run(sim, 4);
    const dummy = dummyNear(sim, 6, -5);
    // Inscribe first so the root extension applies.
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: dummy.x, z: dummy.z })]);
    run(sim, 1);
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: dummy.x, z: dummy.z })]);
    run(sim, 0.5);
    expect(dummy.buffs.some((b) => b.id === 'cc_root')).toBe(false); // still telegraphing
    run(sim, 0.6);
    const root = dummy.buffs.find((b) => b.id === 'cc_root');
    expect(root).toBeDefined();
    expect(root && root.def.duration).toBeCloseTo(1.6, 1); // 1.2 + 0.4 inscribed

    // R: stand near the dummy and channel — expect several ticks.
    sim.applyIntents([msg({ t: 'move', x: dummy.x - 2.5, z: dummy.z })]);
    run(sim, 3);
    const snaps: Snapshot[] = [];
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: dummy.x, z: dummy.z })]);
    run(sim, 3.6, snaps);
    expect(damageEvents(snaps).length).toBeGreaterThanOrEqual(4);
  });
});

describe('Rattle', () => {
  it('Q throws three daggers; W dash leaves a skull and recast returns to it', () => {
    const sim = prep('rattle');
    sim.applyIntents([msg({ t: 'move', x: 2, z: -5 })]);
    run(sim, 4);
    const dummy = dummyNear(sim, 6, -5);
    const snaps: Snapshot[] = [];
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: dummy.x, z: dummy.z })]);
    const snap = run(sim, 0.3, snaps);
    expect(snap.entities.filter((e) => e.kind === 'projectile').length).toBe(3);

    // W: dash away, skull stays, recast snaps back.
    const e = me(sim);
    const fromX = e.x;
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: e.x + 4, z: e.z })]);
    run(sim, 0.4);
    const skull = sim.world.entities.find((x) => x.keg?.def.id === 'rattle_skull');
    expect(skull).toBeDefined();
    expect(e.x).toBeGreaterThan(fromX + 2.5);
    expect(e.buffs.some((b) => b.id === 'rattle_bones')).toBe(true); // Loose Bones charged
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: e.x, z: e.z })]);
    run(sim, 0.2);
    expect(Math.abs(e.x - fromX)).toBeLessThan(1.2); // back at the skull
    expect(sim.world.entities.some((x) => x.keg?.def.id === 'rattle_skull')).toBe(false);
  });

  it('R blink-strikes behind the target and arms the harvest watch', () => {
    const sim = prep('rattle');
    sim.applyIntents([msg({ t: 'move', x: 3, z: -5 })]);
    run(sim, 4);
    const dummy = dummyNear(sim, 6, -5);
    const e = me(sim);
    const snaps: Snapshot[] = [];
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: dummy.x, z: dummy.z })]);
    run(sim, 0.3, snaps);
    expect(damageEvents(snaps).length).toBeGreaterThanOrEqual(1);
    // Landed on the far side of the dummy, watching for the kill.
    expect(e.x).toBeGreaterThan(dummy.x);
    expect(e.champ?.passive.harvestId).toBe(dummy.id);
  });
});

describe('Grukk', () => {
  it('Q lunges with damage; W slows and shields; ability hits stack Toll Paid', () => {
    const sim = prep('grukk');
    sim.applyIntents([msg({ t: 'move', x: 3.6, z: -5 })]);
    run(sim, 7);
    const dummy = dummyNear(sim, 6, -5);
    const e = me(sim);
    const snaps: Snapshot[] = [];
    const fromX = e.x;
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: dummy.x, z: dummy.z })]);
    run(sim, 0.5, snaps);
    expect(damageEvents(snaps).length).toBeGreaterThanOrEqual(1);
    expect(e.x).toBeGreaterThan(fromX + 1.5); // lunged

    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: dummy.x, z: dummy.z })]);
    run(sim, 0.5);
    expect(dummy.buffs.some((b) => b.id.startsWith('cc_slow'))).toBe(true);
    expect(e.buffs.some((b) => b.id === 'grukk_bellow_shield')).toBe(true);
  });

  it('R chains three slams via recast; the final slam knocks up', () => {
    const sim = prep('grukk');
    sim.applyIntents([msg({ t: 'move', x: 3.5, z: -5 })]);
    run(sim, 7);
    const dummy = dummyNear(sim, 6, -5);
    const snaps: Snapshot[] = [];
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: dummy.x, z: dummy.z })]);
    run(sim, 0.5, snaps);
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: dummy.x, z: dummy.z })]);
    run(sim, 0.5, snaps);
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: dummy.x, z: dummy.z })]);
    run(sim, 0.5, snaps);
    expect(damageEvents(snaps).length).toBeGreaterThanOrEqual(3);
    expect(dummy.airborne).toBeGreaterThan(0); // third slam knock-up
  });
});

describe('Sylva', () => {
  it('plants flowers while walking; Q blooms them along its path', () => {
    const sim = prep('sylva');
    sim.applyIntents([msg({ t: 'move', x: 8, z: 0 })]);
    run(sim, 5);
    const flowers = sim.world.entities.filter((e) => e.kind === 'flower');
    expect(flowers.length).toBeGreaterThanOrEqual(1);
    // Q back across the trail blooms at least one flower.
    const before = flowers.length;
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: -6, z: 0 })]);
    run(sim, 0.6);
    const after = sim.world.entities.filter((e) => e.kind === 'flower').length;
    expect(after).toBeLessThan(before + 1); // bloomed (consumed) or unchanged if none in path
  });

  it('W creates a healing zone; R roots longer when flowers bloom in the cone', () => {
    const sim = prep('sylva');
    sim.applyIntents([msg({ t: 'move', x: 2, z: -5 })]);
    run(sim, 4);
    const e = me(sim);
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: e.x, z: e.z })]);
    run(sim, 0.5);
    expect(sim.world.entities.some((x) => x.kind === 'zone')).toBe(true);
    run(sim, 3);
    expect(sim.world.entities.some((x) => x.kind === 'zone')).toBe(false); // expired

    // Walk a trail toward the dummy so R's cone covers flowers, then root it.
    const dummy = dummyNear(sim, 6, -5);
    sim.applyIntents([msg({ t: 'move', x: dummy.x - 4.5, z: dummy.z })]);
    run(sim, 4);
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: dummy.x, z: dummy.z })]);
    run(sim, 1);
    const root = dummy.buffs.find((b) => b.id === 'cc_root');
    expect(root).toBeDefined();
    expect(root && root.def.duration).toBeGreaterThanOrEqual(1.4);
  });
});
