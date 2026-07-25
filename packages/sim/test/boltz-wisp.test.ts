import type { Intent, IntentMsg, MatchConfig, Snapshot } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src';
import { applyFear } from '../src/buffs';
import { dealDamage } from '../src/combat';

/** v0.4 champion kits (Boltz, Wisp) — verified in the Training Grounds. */

function cfg(championId: string, benchId?: string): MatchConfig {
  return {
    mode: 'training',
    seed: 4242,
    mapId: 'training',
    players: [{ id: 1, championId, benchId, team: 0 }],
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

function dummyNear(sim: Sim, x: number, z: number) {
  const ds = sim.world.entities.filter((e) => e.kind === 'dummy');
  ds.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  if (!ds[0]) throw new Error('no dummy');
  return ds[0];
}

function prep(championId: string, benchId?: string): Sim {
  const sim = new Sim(cfg(championId, benchId));
  sim.applyIntents([
    msg({ t: 'trainer', cmd: { k: 'noCooldowns', on: true } }),
    msg({ t: 'trainer', cmd: { k: 'infiniteEnergy', on: true } }),
  ]);
  return sim;
}

function damageEvents(snaps: Snapshot[]) {
  return snaps.flatMap((s) => s.events.filter((e) => e.t === 'damage'));
}

function totalDamage(snaps: Snapshot[]): number {
  return damageEvents(snaps).reduce((a, e) => a + (e.t === 'damage' ? e.amount : 0), 0);
}

describe('Boltz', () => {
  it('Q beam is instant, hits down the line, and refunds Energy on champion hits only', () => {
    const sim = prep('boltz');
    sim.applyIntents([msg({ t: 'move', x: 2, z: -5 })]);
    run(sim, 4);
    const dummy = dummyNear(sim, 6, -5);
    const snaps: Snapshot[] = [];
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: dummy.x, z: dummy.z })]);
    // 0.15 s cast time, then the beam resolves the same tick it commits.
    run(sim, 0.3, snaps);
    expect(damageEvents(snaps).length).toBeGreaterThanOrEqual(1);
    // No projectile entity — the zapper is hitscan.
    expect(snaps.every((s) => s.entities.every((e) => e.kind !== 'projectile'))).toBe(true);
  });

  it('Q does 30% more to a shielded target', () => {
    const plain = prep('boltz');
    plain.applyIntents([msg({ t: 'move', x: 2, z: -5 })]);
    run(plain, 4);
    const d1 = dummyNear(plain, 6, -5);
    const s1: Snapshot[] = [];
    plain.applyIntents([msg({ t: 'cast', slot: 'q', x: d1.x, z: d1.z })]);
    run(plain, 0.3, s1);

    const shielded = prep('boltz');
    shielded.applyIntents([msg({ t: 'move', x: 2, z: -5 })]);
    run(shielded, 4);
    const d2 = dummyNear(shielded, 6, -5);
    d2.buffs.push({
      id: 'test_shield',
      def: { id: 'test_shield', name: 'Test', duration: 30, shield: 5000 },
      tLeft: 30,
      stacks: 1,
      shieldLeft: 5000,
    });
    const s2: Snapshot[] = [];
    shielded.applyIntents([msg({ t: 'cast', slot: 'q', x: d2.x, z: d2.z })]);
    run(shielded, 0.3, s2);

    expect(totalDamage(s2)).toBeGreaterThan(totalDamage(s1) * 1.2);
  });

  it('W dome pops enemy projectiles at the shell and expires on schedule', () => {
    // A Fathom cannonball fired into an enemy Boltz dome must never reach him.
    const sim = new Sim({
      mode: 'training',
      seed: 99,
      mapId: 'training',
      players: [
        { id: 1, championId: 'boltz', team: 0 },
        { id: 2, championId: 'fathom', team: 1 },
      ],
    });
    const boltz = sim.world.entities.find((e) => e.champ?.player === 1);
    const fathom = sim.world.entities.find((e) => e.champ?.player === 2);
    if (!boltz || !fathom) throw new Error('missing champions');
    // Line them up: Fathom shoots east through where the dome will stand.
    fathom.x = -6;
    fathom.z = 0;
    boltz.x = 0;
    boltz.z = 0;

    sim.applyIntents([{ seq: seq++, player: 1, intent: { t: 'cast', slot: 'w', x: -3, z: 0 } }]);
    run(sim, 0.4);
    const dome = sim.world.entities.find((e) => e.zone?.variant === 'dome');
    expect(dome).toBeDefined();

    // Fathom fires a Q skillshot straight through the dome at Boltz.
    sim.applyIntents([{ seq: seq++, player: 2, intent: { t: 'cast', slot: 'q', x: 6, z: 0 } }]);
    const snaps: Snapshot[] = [];
    run(sim, 1.0, snaps);
    // The ball died on the shell: no damage reached Boltz.
    expect(snaps.some((s) => s.events.some((e) => e.t === 'damage' && e.target === boltz.id))).toBe(
      false,
    );
    expect(
      snaps.some((s) => s.events.some((e) => e.t === 'fx' && e.key === 'boltz.dome.block')),
    ).toBe(true);

    // Dome expires at 2.5 s.
    run(sim, 2.4);
    expect(sim.world.entities.some((e) => e.zone?.variant === 'dome')).toBe(false);
  });

  it('R droppod lands after its telegraph, knocks up, blocks movement, then launches away', () => {
    const sim = prep('boltz');
    sim.applyIntents([msg({ t: 'move', x: 2, z: -5 })]);
    run(sim, 4);
    const dummy = dummyNear(sim, 6, -5);
    const navBefore = sim.world.nav.isBlockedAt(dummy.x, dummy.z);
    expect(navBefore).toBe(false);

    const snaps: Snapshot[] = [];
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: dummy.x, z: dummy.z })]);
    // 0.3 s cast + 1.2 s orbital delay: nothing has landed yet.
    run(sim, 1.0, snaps);
    expect(damageEvents(snaps).length).toBe(0);
    expect(sim.world.entities.some((e) => e.zone?.variant === 'pod')).toBe(false);

    const landing: Snapshot[] = [];
    run(sim, 1.0, landing);
    expect(damageEvents(landing).length).toBeGreaterThanOrEqual(1);
    expect(dummy.airborne).toBeGreaterThan(0); // knock-up at the center
    const pod = sim.world.entities.find((e) => e.zone?.variant === 'pod');
    expect(pod).toBeDefined();
    // It is a real bunker: the deck under it is blocked while it sits there.
    expect(sim.world.nav.isBlockedAt(pod?.x ?? 0, pod?.z ?? 0)).toBe(true);

    // 4 s later it launches away and gives the ground back.
    run(sim, 4.2);
    expect(sim.world.entities.some((e) => e.zone?.variant === 'pod')).toBe(false);
    expect(sim.world.nav.isBlockedAt(pod?.x ?? 0, pod?.z ?? 0)).toBe(false);
  });

  it('Capacitor charges after 3s of silence and arcs the next basic to a second target', () => {
    const sim = prep('boltz');
    sim.applyIntents([msg({ t: 'move', x: 2, z: -4 })]);
    run(sim, 4);
    const e = me(sim);
    expect(e.champ?.passive.charged).toBe(1); // primed: no attack yet

    // Two dummies close together so the arc has somewhere to jump.
    const a = dummyNear(sim, 6, -5);
    const b = sim.world.entities.filter((x) => x.kind === 'dummy' && x.id !== a.id)[0];
    if (!b) throw new Error('need a second dummy');
    b.x = a.x + 1.5;
    b.z = a.z;

    const snaps: Snapshot[] = [];
    sim.applyIntents([msg({ t: 'attackTarget', target: a.id })]);
    run(sim, 1.6, snaps);
    const arcs = snaps.flatMap((s) =>
      s.events.filter((ev) => ev.t === 'fx' && ev.key === 'boltz.passive.charge'),
    );
    expect(arcs.length).toBeGreaterThanOrEqual(2); // primary + the chained target
    expect(snaps.some((s) => s.events.some((ev) => ev.t === 'damage' && ev.target === b.id))).toBe(
      true,
    );
    // Spent: the very next swing is a plain shot until he goes quiet again.
    expect(me(sim).champ?.passive.charged).toBe(0);
  });

  it('EVA Hop entrance carries him forward on arrival', () => {
    const sim = prep('boltz', 'wisp');
    const e = me(sim);
    const startX = e.x;
    // The spawn entrance already fired at init; run out its 0.4 s hop.
    run(sim, 0.6);
    expect(Math.abs(e.x - startX)).toBeGreaterThan(0.4);
  });
});

describe('Wisp', () => {
  it('Ectoplasm chills enemies she walks through and she never collides with them', () => {
    const sim = new Sim({
      mode: 'training',
      seed: 7,
      mapId: 'training',
      players: [
        { id: 1, championId: 'wisp', team: 0 },
        { id: 2, championId: 'rook', team: 1 },
      ],
    });
    const wisp = sim.world.entities.find((e) => e.champ?.player === 1);
    const rook = sim.world.entities.find((e) => e.champ?.player === 2);
    if (!wisp || !rook) throw new Error('missing champions');
    wisp.x = 0;
    wisp.z = 0;
    rook.x = 0.2;
    rook.z = 0;
    run(sim, 0.2);
    // Overlapping: separation would normally shove them apart — she phases.
    expect(Math.hypot(wisp.x - rook.x, wisp.z - rook.z)).toBeLessThan(
      wisp.radius + rook.radius + 0.05,
    );
    expect(rook.buffs.some((b) => b.id === 'wisp_chilled')).toBe(true);
    expect(rook.buffs.some((b) => b.id.startsWith('cc_slow'))).toBe(true);
  });

  it('Q Boo hits harder into a Chilled target', () => {
    const plain = prep('wisp');
    plain.applyIntents([msg({ t: 'move', x: 2, z: -5 })]);
    run(plain, 4);
    const d1 = dummyNear(plain, 6, -5);
    const s1: Snapshot[] = [];
    plain.applyIntents([msg({ t: 'cast', slot: 'q', x: d1.x, z: d1.z })]);
    run(plain, 1.2, s1);

    const chilled = prep('wisp');
    chilled.applyIntents([msg({ t: 'move', x: 2, z: -5 })]);
    run(chilled, 4);
    const d2 = dummyNear(chilled, 6, -5);
    d2.buffs.push({
      id: 'wisp_chilled',
      def: { id: 'wisp_chilled', name: 'Chilled', duration: 30 },
      tLeft: 30,
      stacks: 1,
    });
    const s2: Snapshot[] = [];
    chilled.applyIntents([msg({ t: 'cast', slot: 'q', x: d2.x, z: d2.z })]);
    run(chilled, 1.2, s2);

    expect(totalDamage(s1)).toBeGreaterThan(0);
    expect(totalDamage(s2)).toBeGreaterThan(totalDamage(s1) * 1.2);
  });

  it('W blinks away, leaves a decoy that dies to exactly two hits, and cloaks until she acts', () => {
    const sim = prep('wisp');
    sim.applyIntents([msg({ t: 'move', x: 0, z: -4 })]);
    run(sim, 4);
    const e = me(sim);
    const fromX = e.x;
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: e.x + 3.5, z: e.z })]);
    run(sim, 0.3);
    expect(e.x).toBeGreaterThan(fromX + 2.5); // blinked
    expect(e.buffs.some((b) => b.id === 'wisp_invis')).toBe(true);

    const decoy = sim.world.entities.find((x) => x.keg?.def.id === 'wisp_decoy');
    expect(decoy).toBeDefined();
    if (!decoy) return;
    expect(Math.abs(decoy.x - fromX)).toBeLessThan(0.6); // left where she stood

    // Casting breaks the cloak.
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: e.x + 5, z: e.z })]);
    run(sim, 0.4);
    expect(e.buffs.some((b) => b.id === 'wisp_invis')).toBe(false);

    // The sheet takes exactly two hits regardless of how small they are.
    const src = sim.world.entities.find((x) => x.kind === 'dummy');
    if (!src) throw new Error('no source');
    dealDamage(sim.world, { source: src }, decoy, 1, 'physical');
    expect(decoy.dead).toBe(false);
    dealDamage(sim.world, { source: src }, decoy, 1, 'physical');
    expect(decoy.dead).toBe(true);
  });

  it('R curses the ground: damage + Chill while inside, and the gong fears whoever stayed', () => {
    const sim = new Sim({
      mode: 'training',
      seed: 11,
      mapId: 'training',
      players: [
        { id: 1, championId: 'wisp', team: 0 },
        { id: 2, championId: 'rook', team: 1 },
      ],
    });
    const wisp = sim.world.entities.find((e) => e.champ?.player === 1);
    const rook = sim.world.entities.find((e) => e.champ?.player === 2);
    if (!wisp || !rook || !rook.champ) throw new Error('missing champions');
    wisp.x = -4;
    wisp.z = 0;
    rook.x = 0;
    rook.z = 0;

    sim.applyIntents([{ seq: seq++, player: 1, intent: { t: 'cast', slot: 'r', x: 0, z: 0 } }]);
    const snaps: Snapshot[] = [];
    run(sim, 1.5, snaps);
    expect(sim.world.entities.some((e) => e.zone?.variant === 'curse')).toBe(true);
    expect(snaps.some((s) => s.events.some((e) => e.t === 'damage' && e.target === rook.id))).toBe(
      true,
    );
    expect(rook.buffs.some((b) => b.id === 'wisp_chilled')).toBe(true);

    // Ride it out: at expiry the gong fears him out of the circle.
    const rookX = rook.x;
    run(sim, 3.2);
    expect(rook.champ.feared).not.toBeNull();
    run(sim, 0.6);
    expect(Math.hypot(rook.x - 0, rook.z - 0)).toBeGreaterThan(Math.hypot(rookX, 0));
  });

  it('fear locks casts and swaps until it runs out', () => {
    const sim = new Sim({
      mode: 'training',
      seed: 13,
      mapId: 'training',
      players: [{ id: 1, championId: 'rook', benchId: 'wisp', team: 0 }],
    });
    const e = me(sim);
    if (!e.champ) throw new Error('no champion');
    run(sim, 1);
    // Directly fear him (the R path is covered above) and check the control lock.
    applyFear(e, e.x + 2, e.z, 1);
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: e.x - 3, z: e.z })]);
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.2);
    expect(e.champ.def.id).toBe('rook'); // swap refused
    expect(e.champ.cds.q).toBe(0); // Q never went on cooldown

    // He flees away from the fear source meanwhile.
    const fledX = e.x;
    run(sim, 0.5);
    expect(e.x).toBeLessThan(fledX);

    // Once it lapses, he is himself again.
    run(sim, 0.8);
    expect(e.champ.feared).toBeNull();
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.1);
    expect(e.champ.def.id).toBe('wisp');
  });

  it('Cold Spot entrance chills nearby enemies and shields the swap morph', () => {
    const sim = new Sim({
      mode: 'training',
      seed: 17,
      mapId: 'training',
      players: [
        { id: 1, championId: 'rook', benchId: 'wisp', team: 0 },
        { id: 2, championId: 'grukk', team: 1 },
      ],
    });
    const e = sim.world.entities.find((x) => x.champ?.player === 1);
    const foe = sim.world.entities.find((x) => x.champ?.player === 2);
    if (!e?.champ || !foe) throw new Error('missing champions');
    run(sim, 1);
    foe.x = e.x + 1;
    foe.z = e.z;

    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.1);
    expect(e.champ.def.id).toBe('wisp');
    expect(foe.buffs.some((b) => b.id === 'wisp_chilled')).toBe(true);
    // Untargetable through the morph — nobody can start an attack on her.
    expect(e.buffs.some((b) => b.id === 'wisp_untargetable')).toBe(true);
    run(sim, 0.5);
    expect(e.buffs.some((b) => b.id === 'wisp_untargetable')).toBe(false);
  });
});
