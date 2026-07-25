import type { Intent, IntentMsg, MatchConfig } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src';

/** v0.5 champions: Piper (+Chomp, a real companion unit) and Vex (drain bruiser). */

function cfg(championId: string, benchId?: string): MatchConfig {
  return {
    mode: 'training',
    seed: 5150,
    mapId: 'training',
    players: [{ id: 1, championId, benchId, team: 0 }],
  };
}

let seq = 0;
const msg = (intent: Intent): IntentMsg => ({ seq: seq++, player: 1, intent });

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) sim.tick();
}

/**
 * Total damage dealt over a window, read from the event stream.
 * Dummies clamp at 1 HP and auto-reset after 4 s of quiet, so their HP is a
 * terrible probe — the events are the honest record.
 */
function damageOver(sim: Sim, seconds: number): number {
  let total = 0;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    for (const ev of sim.tick().events) if (ev.t === 'damage') total += ev.amount;
  }
  return total;
}

/** Walk to a point and wait until we actually arrive (or give up). */
function walkTo(sim: Sim, x: number, z: number, maxSeconds = 12): void {
  sim.applyIntents([msg({ t: 'move', x, z })]);
  for (let i = 0; i < Math.round(maxSeconds * 30); i++) {
    sim.tick();
    const e = me(sim);
    if (Math.hypot(e.x - x, e.z - z) < 0.6) return;
  }
}

function me(sim: Sim) {
  const e = sim.world.entities.find((x) => x.champ?.player === 1);
  if (!e?.champ) throw new Error('no champion');
  return e;
}

const petsIn = (sim: Sim) => sim.world.entities.filter((e) => e.pet);
const dummyOf = (sim: Sim) => {
  const d = sim.world.entities.find((e) => e.kind === 'dummy');
  if (!d) throw new Error('no dummy');
  return d;
};

describe('Piper & Chomp', () => {
  it('arrives with her companion already at heel', () => {
    const sim = new Sim(cfg('piper'));
    run(sim, 0.5);
    expect(petsIn(sim)).toHaveLength(1);
    expect(petsIn(sim)[0].pet?.def.id).toBe('chomp');
  });

  it('Chomp is untargetable: he never appears among damageable units', () => {
    const sim = new Sim(cfg('piper'));
    run(sim, 1);
    const ids = [...sim.world.units()].map((u) => u.id);
    expect(ids).not.toContain(petsIn(sim)[0].id);
  });

  it('the passive fetches on its own: Chomp bites a nearby enemy unprompted', () => {
    const sim = new Sim(cfg('piper'));
    const dummy = dummyOf(sim);
    walkTo(sim, dummy.x - 2, dummy.z);
    // No orders, no casts — just standing next to something bite-able.
    expect(damageOver(sim, 8)).toBeGreaterThan(0);
  });

  it('Q sends Chomp down a line and he comes home', () => {
    const sim = new Sim(cfg('piper'));
    const dummy = dummyOf(sim);
    const piper = me(sim);
    walkTo(sim, dummy.x - 4, dummy.z);
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: dummy.x, z: dummy.z })]);
    expect(damageOver(sim, 1.2)).toBeGreaterThan(0);
    // He returns to heel rather than parking on the target.
    run(sim, 3);
    const pet = petsIn(sim)[0];
    expect(Math.hypot(pet.x - piper.x, pet.z - piper.z)).toBeLessThan(3);
  });

  it('W drops a snack that heals an ally who walks over it', () => {
    const sim = new Sim(cfg('piper'));
    const piper = me(sim);
    piper.hp = piper.hpMax * 0.4;
    const before = piper.hp;
    // Land it right at her feet so she claims it herself the moment it lands.
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: piper.x, z: piper.z })]);
    run(sim, 0.3);
    expect(sim.world.entities.some((e) => e.pickup)).toBe(true); // still airborne
    run(sim, 0.8);
    expect(sim.world.entities.some((e) => e.pickup)).toBe(false); // claimed
    // A big step, not the trickle of regen.
    expect(piper.hp - before).toBeGreaterThan(40);
  });

  it('an unclaimed snack is eaten by the fox — and empowers his next fetch', () => {
    const sim = new Sim(cfg('piper'));
    const piper = me(sim);
    piper.hp = piper.hpMax * 0.5;
    // Toss it far away so no ally can reach it before the timer.
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: piper.x + 5, z: piper.z })]);
    run(sim, 3.5);
    expect(sim.world.entities.some((e) => e.pickup)).toBe(false);
    expect(petsIn(sim)[0].pet?.empowered).toBe(true);
  });

  it('R stampedes in three waves, and all three land on a champion as a knock-up', () => {
    // The finisher is champion-only by design ("champions hit by all 3 are
    // knocked up"), so this needs a real champion in the cone, not a dummy.
    const sim = new Sim({
      mode: 'training',
      seed: 31,
      mapId: 'training',
      players: [
        { id: 1, championId: 'piper', team: 0 },
        { id: 2, championId: 'rook', team: 1, bot: 'recruit' },
      ],
    });
    const piper = me(sim);
    const foe = sim.world.entities.find((e) => e.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    foe.x = piper.x + 3;
    foe.z = piper.z;
    sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'infiniteEnergy', on: true } })]);
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: foe.x, z: foe.z })]);
    let waves = 0;
    let airborne = 0;
    for (let i = 0; i < Math.round(3.2 * 30); i++) {
      // Pin the target in the cone so all three waves connect.
      foe.x = piper.x + 3;
      foe.z = piper.z;
      for (const ev of sim.tick().events) {
        if (ev.t === 'fx' && ev.key === 'piper.r.wave') waves++;
      }
      airborne = Math.max(airborne, foe.airborne);
    }
    expect(waves).toBe(3);
    expect(airborne).toBeGreaterThan(0);
  });

  it('Chomp leaves with her: swapping away retires the pet, swapping back whistles him in', () => {
    const sim = new Sim(cfg('piper', 'vex'));
    run(sim, 0.5);
    expect(petsIn(sim)).toHaveLength(1);
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 1);
    expect(me(sim).champ?.def.id).toBe('vex');
    expect(petsIn(sim)).toHaveLength(0);
    run(sim, 9.5); // swap cooldown
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 1);
    expect(me(sim).champ?.def.id).toBe('piper');
    expect(petsIn(sim)).toHaveLength(1);
  });
});

describe('Vex', () => {
  it('Red Ledger heals him off ability damage to champions — but not off dummies', () => {
    // Dummies are not champions, so the ledger stays shut.
    const solo = new Sim(cfg('vex'));
    const dummy = dummyOf(solo);
    const vex = me(solo);
    solo.applyIntents([msg({ t: 'move', x: dummy.x - 1.5, z: dummy.z })]);
    run(solo, 3);
    vex.hp = vex.hpMax * 0.5;
    const before = vex.hp;
    solo.applyIntents([msg({ t: 'cast', slot: 'q', x: dummy.x, z: dummy.z })]);
    run(solo, 0.6);
    // Only regen moved it, if anything — no big drain spike.
    expect(vex.hp - before).toBeLessThan(10);
  });

  it('Red Ledger drains a real champion', () => {
    const sim = new Sim({
      mode: 'training',
      seed: 99,
      mapId: 'training',
      players: [
        { id: 1, championId: 'vex', team: 0 },
        { id: 2, championId: 'rook', team: 1, bot: 'recruit' },
      ],
    });
    const vex = me(sim);
    const foe = sim.world.entities.find((e) => e.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    foe.x = vex.x + 2;
    foe.z = vex.z;
    vex.hp = vex.hpMax * 0.5;
    const before = vex.hp;
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: foe.x, z: foe.z })]);
    run(sim, 0.5);
    expect(vex.hp).toBeGreaterThan(before);
  });

  it('W is untargetable mid-waltz and heals on re-forming', () => {
    const sim = new Sim(cfg('vex'));
    const vex = me(sim);
    vex.hp = vex.hpMax * 0.4;
    const startX = vex.x;
    sim.applyIntents([msg({ t: 'cast', slot: 'w', x: vex.x + 5, z: vex.z })]);
    run(sim, 0.2);
    expect(vex.buffs.some((b) => b.id === 'wisp_untargetable')).toBe(true);
    const midHp = vex.hp;
    run(sim, 0.9);
    expect(vex.x).not.toBeCloseTo(startX, 1); // he actually moved
    expect(vex.hp).toBeGreaterThan(midHp); // and re-formed with blood back
  });

  it('R invites nearby champions, and guests take more from him', () => {
    const sim = new Sim({
      mode: 'training',
      seed: 7,
      mapId: 'training',
      players: [
        { id: 1, championId: 'vex', team: 0 },
        { id: 2, championId: 'rook', team: 1, bot: 'recruit' },
      ],
    });
    const vex = me(sim);
    const foe = sim.world.entities.find((e) => e.champ?.player === 2);
    if (!foe) throw new Error('no foe');
    foe.x = vex.x + 2;
    foe.z = vex.z;
    sim.applyIntents([
      msg({ t: 'trainer', cmd: { k: 'infiniteEnergy', on: true } }),
      msg({ t: 'trainer', cmd: { k: 'levelUp' } }),
      msg({ t: 'trainer', cmd: { k: 'levelUp' } }),
      msg({ t: 'trainer', cmd: { k: 'levelUp' } }),
    ]);
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: vex.x, z: vex.z })]);
    run(sim, 0.8);
    expect(foe.buffs.some((b) => b.id === 'vex_invited')).toBe(true);
    expect(vex.champ?.passive.inviteAmp).toBeGreaterThan(0);
  });

  it('his entrance makes the next lash free', () => {
    const sim = new Sim(cfg('rook', 'vex'));
    run(sim, 0.5);
    sim.applyIntents([msg({ t: 'swap' })]);
    run(sim, 0.6);
    const c = me(sim).champ;
    expect(c?.def.id).toBe('vex');
    expect(me(sim).buffs.some((b) => b.id === 'entrance_free_q')).toBe(true);
  });
});
