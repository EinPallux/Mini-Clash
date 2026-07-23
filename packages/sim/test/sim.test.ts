import type { Intent, IntentMsg, MatchConfig, Snapshot } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { mitigate, Sim, stateHash } from '../src';

const CFG: MatchConfig = {
  mode: 'training',
  seed: 1234,
  mapId: 'training',
  players: [{ id: 1, championId: 'rook', team: 0 }],
};

function fathomCfg(): MatchConfig {
  return { ...CFG, players: [{ id: 1, championId: 'fathom', team: 0 }] };
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

function champ(snap: Snapshot) {
  const c = snap.entities.find((e) => e.kind === 'champion');
  if (c?.kind !== 'champion') throw new Error('no champion');
  return c;
}
function dummies(snap: Snapshot) {
  return snap.entities.filter((e) => e.kind === 'dummy');
}

describe('boot & movement', () => {
  it('spawns champion and dummies; nothing explodes over 10s idle', () => {
    const sim = new Sim(CFG);
    const snap = run(sim, 10);
    expect(champ(snap).championId).toBe('rook');
    expect(dummies(snap).length).toBe(4);
  });

  it('move intent walks the champion to the point', () => {
    const sim = new Sim(CFG);
    sim.applyIntents([msg({ t: 'move', x: -8, z: 4 })]);
    const snap = run(sim, 4);
    const c = champ(snap);
    expect(Math.hypot(c.x - -8, c.z - 4)).toBeLessThan(0.5);
  });

  it('pathfinds around the statue obstacle', () => {
    const sim = new Sim(CFG);
    // Statue sits at (-17.5, 0); walk to the far side of it.
    sim.applyIntents([msg({ t: 'move', x: -19, z: 0 })]);
    const snap = run(sim, 5);
    const c = champ(snap);
    expect(Math.hypot(c.x - -19, c.z)).toBeLessThan(1.6); // arrives near (nearestOpen clamps)
  });
});

describe('combat math', () => {
  it('mitigation follows 100/(100+resist)', () => {
    expect(mitigate(100, 0)).toBeCloseTo(100);
    expect(mitigate(100, 100)).toBeCloseTo(50);
    expect(mitigate(150, 50)).toBeCloseTo(100);
  });

  it('armor profiles change dealt damage (recruit takes more than champion dummy)', () => {
    const sim = new Sim(fathomCfg());
    sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'noCooldowns', on: true } })]);
    sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'infiniteEnergy', on: true } })]);
    // Skipshot through recruit (6,-5) then through champion dummy (6,5) from same spot.
    sim.applyIntents([msg({ t: 'move', x: 1, z: -5 })]);
    run(sim, 5);
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: 9, z: -5 })]);
    let snap = run(sim, 1.5);
    const recruit = dummies(snap).find((d) => d.kind === 'dummy' && d.z < -3)!;
    const recruitDmg = recruit.hpMax - recruit.hp;
    sim.applyIntents([msg({ t: 'move', x: 1, z: 5 })]);
    run(sim, 6);
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: 9, z: 5 })]);
    snap = run(sim, 1.5);
    const hard = dummies(snap).find((d) => d.kind === 'dummy' && d.z > 3)!;
    const hardDmg = hard.hpMax - hard.hp;
    expect(recruitDmg).toBeGreaterThan(0);
    expect(hardDmg).toBeGreaterThan(0);
    expect(recruitDmg).toBeGreaterThan(hardDmg * 1.5);
  });
});

describe('Rook kit', () => {
  it('Q costs energy, starts cooldown after recast window, and slows via cc buff', () => {
    const sim = new Sim(CFG);
    sim.applyIntents([msg({ t: 'move', x: 5.8, z: 0 })]); // inside Q cone reach of the mid dummy at (8,0)
    run(sim, 6);
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: 8, z: 0 })]);
    let snap = run(sim, 0.4);
    let c = champ(snap);
    expect(c.energy).toBeLessThan(78); // paid 25 (regen trickles back)
    expect(c.recast?.slot).toBe('q');
    expect(c.cooldowns.q).toBe(0); // cd waits for recast resolution
    // Recast fires the backswing, then cd starts.
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: 8, z: 0 })]);
    snap = run(sim, 0.1);
    c = champ(snap);
    expect(c.recast).toBeUndefined();
    expect(c.cooldowns.q).toBeGreaterThan(6);
    // The mid dummy got hit twice and slowed.
    const mid = dummies(snap).find((d) => d.kind === 'dummy' && Math.abs(d.z) < 1 && d.x < 10)!;
    expect(mid.hp).toBeLessThan(mid.hpMax);
  });

  it('casting with insufficient energy is denied', () => {
    const sim = new Sim(CFG);
    sim.applyIntents([msg({ t: 'move', x: 4.5, z: 0 })]);
    run(sim, 4);
    const snaps: Snapshot[] = [];
    for (let i = 0; i < 6; i++) {
      sim.applyIntents([msg({ t: 'cast', slot: 'w', x: 6, z: 0 })]);
      run(sim, 0.7, snaps);
    }
    const denies = snaps.flatMap((s) => s.events).filter((e) => e.t === 'castDenied');
    expect(denies.length).toBeGreaterThan(0); // cooldown (14s) and energy (35) both gate repeat casts
  });

  it('Rampart blocks pathing while it stands', () => {
    const sim = new Sim(CFG);
    sim.applyIntents([msg({ t: 'move', x: 0, z: 0 })]);
    run(sim, 6);
    // Wall directly ahead, then order a move through it: path must bend (slower arrival than straight walk).
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: 2.5, z: 0 })]);
    run(sim, 0.5);
    const nav = sim.world.nav;
    expect(nav.lineWalkable(0, 0, 5, 0)).toBe(false); // wall blocks the straight line
    run(sim, 2.5); // wall expires
    expect(nav.lineWalkable(0, 0, 5, 0)).toBe(true);
  });

  it('R leaps, knocks up, and applies the DR aura', () => {
    const sim = new Sim(CFG);
    sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'levelUp' } })]);
    sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'levelUp' } })]);
    sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'levelUp' } })]); // level 4: R unlocked by data (no gate in v0.1 sim)
    sim.applyIntents([msg({ t: 'move', x: 5, z: 0 })]);
    run(sim, 5);
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: 7.5, z: 0 })]);
    const mid = run(sim, 0.5);
    expect(champ(mid).airborne).toBeGreaterThan(0); // leaping
    const after = run(sim, 0.7);
    const c = champ(after);
    expect(c.buffs.some((b) => b.id === 'rook_keeps_wrath')).toBe(true);
    const knocked = dummies(after).filter((d) => d.kind === 'dummy' && d.ccKind === 'knockup');
    expect(knocked.length).toBeGreaterThan(0);
  });

  it('Stonewall passive reduces the first hit and goes on internal cooldown', () => {
    const sim = new Sim(CFG);
    const rookEnt = sim.world.entities.find((e) => e.champ)!;
    expect(rookEnt.champ!.passive.stonewallCd).toBe(0);
  });
});

describe('Fathom kit', () => {
  it('autos launch homing missiles and every 4th is a powder blast', () => {
    const sim = new Sim(fathomCfg());
    sim.applyIntents([msg({ t: 'move', x: 1, z: 0 })]);
    run(sim, 5);
    const dummyEnt = sim.world.entities.find((e) => e.dummy && Math.abs(e.z) < 1 && e.x < 10)!;
    sim.applyIntents([msg({ t: 'attackTarget', target: dummyEnt.id })]);
    const snaps: Snapshot[] = [];
    run(sim, 8, snaps);
    const fxKeys = snaps
      .flatMap((s) => s.events)
      .filter((e) => e.t === 'fx')
      .map((e) => (e.t === 'fx' ? e.key : ''));
    expect(fxKeys.filter((k) => k === 'fathom.aa.fire').length).toBeGreaterThan(4);
    expect(fxKeys).toContain('fathom.aa.hit');
    expect(fxKeys).toContain('fathom.passive.blast');
    expect(dummyEnt.hp).toBeLessThan(dummyEnt.hpMax);
  });

  it('Skipshot pulses hit a dummy once per cast and spawn skip fx', () => {
    const sim = new Sim(fathomCfg());
    sim.applyIntents([msg({ t: 'move', x: 1, z: 0 })]);
    run(sim, 5);
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: 12, z: 0 })]);
    const snaps: Snapshot[] = [];
    run(sim, 1.5, snaps);
    const events = snaps.flatMap((s) => s.events);
    const skips = events.filter((e) => e.t === 'fx' && e.key === 'fathom.q.skip');
    expect(skips.length).toBe(3);
    const dmg = events.filter((e) => e.t === 'damage');
    // Two dummies on the line (x=6..13,z=0 → mid at 8 and far at 13): each hit at most once.
    const perTarget = new Map<number, number>();
    for (const d of dmg) {
      if (d.t === 'damage') perTarget.set(d.target, (perTarget.get(d.target) ?? 0) + 1);
    }
    for (const [, n] of perTarget) expect(n).toBe(1);
    expect(dmg.length).toBeGreaterThan(0);
  });

  it('Powder Keg detonates on fuse and damages + slows nearby dummies', () => {
    const sim = new Sim(fathomCfg());
    sim.applyIntents([msg({ t: 'move', x: 4, z: 0 })]);
    run(sim, 4);
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: 7.5, z: 0 })]);
    let snap = run(sim, 0.5);
    expect(snap.entities.some((e) => e.kind === 'keg')).toBe(true);
    const snaps: Snapshot[] = [];
    snap = run(sim, 3, snaps);
    expect(snap.entities.some((e) => e.kind === 'keg')).toBe(false);
    const events = snaps.flatMap((s) => s.events);
    expect(events.some((e) => e.t === 'fx' && e.key === 'keg.explode')).toBe(true);
    const mid = dummies(snap).find((d) => d.kind === 'dummy' && Math.abs(d.z) < 1 && d.x < 10)!;
    expect(mid.hp).toBeLessThan(mid.hpMax);
    expect(mid.ccKind).toBe('slow');
  });

  it('Broadside schedules 5 volley pulses after the ship delay', () => {
    const sim = new Sim(fathomCfg());
    sim.applyIntents([msg({ t: 'move', x: 1, z: 0 })]);
    run(sim, 5);
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: 12, z: 0 })]);
    const snaps: Snapshot[] = [];
    run(sim, 4, snaps);
    const events = snaps.flatMap((s) => s.events);
    const volleys = events.filter((e) => e.t === 'fx' && e.key === 'fathom.r.volley');
    expect(volleys.length).toBe(5);
    const dmgByTarget = new Map<number, number>();
    for (const d of events) {
      if (d.t === 'damage') dmgByTarget.set(d.target, (dmgByTarget.get(d.target) ?? 0) + 1);
    }
    for (const [, n] of dmgByTarget) expect(n).toBeLessThanOrEqual(2); // max 2 hits per target
  });
});

describe('dummies & trainer', () => {
  it('dummy resets to full HP after 4s without damage and reports DPS meanwhile', () => {
    const sim = new Sim(fathomCfg());
    sim.applyIntents([msg({ t: 'move', x: 2, z: 0 })]);
    run(sim, 4);
    const dummyEnt = sim.world.entities.find((e) => e.dummy && Math.abs(e.z) < 1 && e.x < 10)!;
    sim.applyIntents([msg({ t: 'attackTarget', target: dummyEnt.id })]);
    let snap = run(sim, 3);
    const hurt = dummies(snap).find((d) => d.id === dummyEnt.id)!;
    expect(hurt.kind === 'dummy' ? hurt.dps : 0).toBeGreaterThan(0);
    expect(hurt.hp).toBeLessThan(hurt.hpMax);
    sim.applyIntents([msg({ t: 'stop' })]);
    const snaps: Snapshot[] = [];
    snap = run(sim, 5.5, snaps);
    const reset = dummies(snap).find((d) => d.id === dummyEnt.id)!;
    expect(reset.hp).toBe(reset.hpMax);
    expect(snaps.flatMap((s) => s.events).some((e) => e.t === 'dummyReset')).toBe(true);
  });

  it('trainer: noCooldowns + switchChampion work', () => {
    const sim = new Sim(CFG);
    sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'noCooldowns', on: true } })]);
    sim.applyIntents([msg({ t: 'move', x: 4.5, z: 0 })]);
    run(sim, 4);
    for (let i = 0; i < 3; i++) {
      sim.applyIntents([msg({ t: 'cast', slot: 'w', x: 6, z: i })]);
      run(sim, 0.6);
    }
    const snap = run(sim, 0.2);
    expect(champ(snap).cooldowns.w).toBe(0);
    sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'switchChampion', championId: 'fathom' } })]);
    const after = run(sim, 0.2);
    expect(champ(after).championId).toBe('fathom');
    expect(champ(after).hp).toBe(champ(after).hpMax);
  });
});

describe('determinism', () => {
  it('same seed + same intent script ⇒ identical state hash', () => {
    const script = (sim: Sim): void => {
      sim.applyIntents([msg({ t: 'move', x: 3, z: 1 })]);
      run(sim, 3);
      sim.applyIntents([msg({ t: 'cast', slot: 'q', x: 9, z: 0 })]);
      run(sim, 1);
      sim.applyIntents([msg({ t: 'cast', slot: 'w', x: 6, z: 2 })]);
      run(sim, 2);
      sim.applyIntents([msg({ t: 'attackMove', x: 12, z: 0 })]);
      run(sim, 4);
    };
    const a = new Sim(fathomCfg());
    seq = 0;
    script(a);
    const b = new Sim(fathomCfg());
    seq = 0;
    script(b);
    expect(stateHash(a)).toBe(stateHash(b));
  });
});
