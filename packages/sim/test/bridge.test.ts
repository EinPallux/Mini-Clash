import { BRIDGE, ITEMS } from '@mini-clash/data';
import type { BotTier, Intent, IntentMsg, MatchConfig, Snapshot } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim, stateHash } from '../src';

/** Bridge Brawl systems: structures, waves, economy, items, orbs, win (ROADMAP v0.2). */

function bridgeCfg(opts?: {
  bots?: boolean;
  tierA?: BotTier;
  tierB?: BotTier;
  seed?: number;
}): MatchConfig {
  const players = [];
  for (let i = 0; i < 8; i++) {
    const team = i < 4 ? (0 as const) : (1 as const);
    players.push({
      id: i + 1,
      championId: i % 2 === 0 ? 'rook' : 'fathom',
      team,
      ...(opts?.bots === false && i === 0
        ? {}
        : { bot: team === 0 ? (opts?.tierA ?? 'veteran') : (opts?.tierB ?? 'veteran') }),
    });
  }
  return { mode: 'bridge', seed: opts?.seed ?? 4242, mapId: 'shatterbridge', players };
}

/** Human player 1 + 7 idle-ish bots (veteran). */
function humanCfg(seed = 99): MatchConfig {
  return bridgeCfg({ bots: false, seed });
}

let seq = 0;
function msg(intent: Intent, player = 1): IntentMsg {
  return { seq: seq++, player, intent };
}

function run(sim: Sim, seconds: number, collect?: Snapshot[]): Snapshot {
  let snap!: Snapshot;
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    snap = sim.tick();
    collect?.push(snap);
  }
  return snap;
}

function events(snaps: Snapshot[], t: string) {
  return snaps.flatMap((s) => s.events.filter((e) => e.t === t));
}

function champ1(sim: Sim) {
  const e = sim.world.entities.find((x) => x.champ?.player === 1);
  if (!e?.champ) throw new Error('no player 1');
  return e;
}

describe('bridge boot & barrier', () => {
  it('spawns 8 champions, 4 towers, 2 cores; barrier drops at 0:20 with event', () => {
    const sim = new Sim(bridgeCfg());
    const snaps: Snapshot[] = [];
    let snap = run(sim, 1, snaps);
    expect(snap.entities.filter((e) => e.kind === 'champion').length).toBe(8);
    expect(snap.entities.filter((e) => e.kind === 'tower').length).toBe(4);
    expect(snap.entities.filter((e) => e.kind === 'core').length).toBe(2);
    expect(snap.match.mode).toBe('bridge');
    expect(snap.match.barrierDown).toBe(false);
    snap = run(sim, 20, snaps);
    expect(snap.match.barrierDown).toBe(true);
    expect(events(snaps, 'barrierDown').length).toBe(1);
  });

  it('cores start invulnerable, inner towers immune while outer stands', () => {
    const sim = new Sim(humanCfg());
    const snap = run(sim, 1);
    for (const e of snap.entities) {
      if (e.kind === 'core') expect(e.invulnerable).toBe(true);
      if (e.kind === 'tower' && e.tier === 'inner') expect(e.invulnerable).toBe(true);
      if (e.kind === 'tower' && e.tier === 'outer') expect(e.invulnerable).toBe(false);
    }
  });
});

describe('mini waves', () => {
  it('first waves spawn at 0:35 from both gates; every 3rd wave adds Rams', () => {
    const sim = new Sim(humanCfg());
    let snap = run(sim, 34);
    expect(snap.entities.filter((e) => e.kind === 'mini').length).toBe(0);
    snap = run(sim, 3);
    const minis = snap.entities.filter((e) => e.kind === 'mini');
    expect(minis.length).toBe(10); // 5 per gate
    expect(minis.filter((m) => m.kind === 'mini' && m.miniKind === 'ram').length).toBe(0);
    // Waves 2 (60s) and 3 (85s): the 3rd carries a Ram per gate.
    snap = run(sim, 55);
    const rams = snap.entities.filter((e) => e.kind === 'mini' && e.miniKind === 'ram');
    expect(rams.length).toBe(2);
  });

  it('minis march toward mid and fight each other', () => {
    const sim = new Sim(humanCfg());
    const snaps: Snapshot[] = [];
    const snap = run(sim, 110, snaps);
    // Opposing waves have met and traded — mini deaths happened.
    const deadMinis = events(snaps, 'death');
    expect(deadMinis.length).toBeGreaterThan(2);
    // Any surviving mini has progressed away from its gate (|x| < 50).
    const minis = snap.entities.filter((e) => e.kind === 'mini');
    expect(minis.some((m) => Math.abs(m.x) < 40)).toBe(true);
  });
});

describe('economy', () => {
  it('starts with 500g and accrues ambient gold + XP', () => {
    const sim = new Sim(humanCfg());
    let snap = run(sim, 1);
    const me = () => {
      const c = snap.entities.find((e) => e.kind === 'champion' && e.player === 1);
      if (c?.kind !== 'champion') throw new Error('gone');
      return c;
    };
    expect(me().gold).toBeGreaterThanOrEqual(500);
    snap = run(sim, 60);
    expect(me().gold).toBeGreaterThanOrEqual(500 + 60 * BRIDGE.ambientGoldPerSec - 5);
    expect(me().level).toBeGreaterThan(1); // 2 XP/s → level 2 before 0:40
  });

  it('shop: buy at fountain, component upgrade consumes + discounts, sell at 70%', () => {
    const sim = new Sim(humanCfg());
    run(sim, 1);
    const e = champ1(sim);
    const c = e.champ;
    if (!c) throw new Error('no champ');
    sim.applyIntents([msg({ t: 'buy', itemId: 'sharpened_fang' })]);
    run(sim, 0.1);
    expect(c.items).toEqual(['sharpened_fang']);
    expect(Math.round(c.gold)).toBeLessThan(510);
    // Component upgrade: vampire_seal (1150) builds from sharpened_fang (500) → 650.
    c.gold = 700;
    sim.applyIntents([msg({ t: 'buy', itemId: 'vampire_seal' })]);
    run(sim, 0.1);
    expect(c.items).toEqual(['vampire_seal']);
    expect(c.gold).toBeGreaterThan(40); // paid 650, not 1150
    sim.applyIntents([msg({ t: 'sell', itemId: 'vampire_seal' })]);
    run(sim, 0.1);
    expect(c.items).toEqual([]);
    expect(Math.round(c.gold)).toBeGreaterThanOrEqual(50 + Math.round(1150 * 0.7));
  });

  it('shop closes away from fountain after 1:00 but reopens while dead', () => {
    const sim = new Sim(humanCfg());
    const snaps: Snapshot[] = [];
    run(sim, 21);
    sim.applyIntents([msg({ t: 'move', x: 0, z: 0 })]);
    run(sim, 45, snaps); // now past 1:00, standing mid
    const e = champ1(sim);
    const c = e.champ;
    if (!c) throw new Error('no champ');
    c.gold = 3000;
    sim.applyIntents([msg({ t: 'buy', itemId: 'iron_plate' })]);
    const snap = run(sim, 0.2, snaps);
    expect(c.items).toEqual([]);
    const denied = snaps.flatMap((s) =>
      s.events.filter((ev) => ev.t === 'purchase' && !ev.ok && ev.reason === 'zone'),
    );
    expect(denied.length).toBe(1);
    void snap;
    // Death reopens the shop wherever you fall (the death screen IS the shop).
    e.dead = true;
    c.respawnIn = 10;
    sim.applyIntents([msg({ t: 'buy', itemId: 'iron_plate' })]);
    expect(c.items).toEqual(['iron_plate']);
  });

  it('R is level-gated at 4 in bridge mode', () => {
    const sim = new Sim(humanCfg());
    const snaps: Snapshot[] = [];
    run(sim, 25);
    sim.applyIntents([msg({ t: 'cast', slot: 'r', x: 0, z: 0 })]);
    run(sim, 0.5, snaps);
    const denies = snaps.flatMap((s) =>
      s.events.filter((ev) => ev.t === 'castDenied' && ev.reason === 'level'),
    );
    expect(denies.length).toBe(1);
  });
});

describe('items in combat', () => {
  it('shield buffs absorb before HP (Horn of Rally)', () => {
    const sim = new Sim(humanCfg());
    run(sim, 1);
    const e = champ1(sim);
    const c = e.champ;
    if (!c) throw new Error('no champ');
    c.gold = 900;
    sim.applyIntents([msg({ t: 'buyRelic', relicId: 'horn_of_rally' })]);
    run(sim, 0.1);
    expect(c.relic?.def.id).toBe('horn_of_rally');
    sim.applyIntents([msg({ t: 'useRelic', x: e.x, z: e.z })]);
    const snap = run(sim, 0.2);
    const me = snap.entities.find((x) => x.kind === 'champion' && x.player === 1);
    if (me?.kind !== 'champion') throw new Error('gone');
    expect(me.shield).toBe(140);
  });

  it('nullwave recharges a shield after 8s out of combat', () => {
    const sim = new Sim(humanCfg());
    run(sim, 1);
    const e = champ1(sim);
    const c = e.champ;
    if (!c) throw new Error('no champ');
    c.gold = 2000;
    sim.applyIntents([msg({ t: 'buy', itemId: 'nullwave_cloak' })]);
    const snap = run(sim, 9);
    const me = snap.entities.find((x) => x.kind === 'champion' && x.player === 1);
    if (me?.kind !== 'champion') throw new Error('gone');
    expect(me.shield).toBe(ITEMS.nullwave_cloak.passive?.params.shield);
  });
});

describe('full match', () => {
  it('a full bot match reaches a winner inside the sudden-death bound with real sieging', () => {
    const sim = new Sim(bridgeCfg({ tierA: 'elite', tierB: 'recruit', seed: 1717 }));
    let over: Snapshot['match']['over'] = null;
    let towerEvents = 0;
    let kills = 0;
    // Sudden death (20:00, 1%/s decay) hard-bounds every match under ~22 min.
    const cap = 23 * 60 * 30;
    for (let i = 0; i < cap; i++) {
      const snap = sim.tick();
      towerEvents += snap.events.filter((e) => e.t === 'towerDown').length;
      kills += snap.events.filter((e) => e.t === 'kill').length;
      if (snap.match.over) {
        over = snap.match.over;
        break;
      }
    }
    expect(over).not.toBeNull();
    expect(towerEvents).toBeGreaterThanOrEqual(1); // sieges actually happened
    expect(kills).toBeGreaterThan(5); // teams actually fought
  }, 180000);

  it('bridge matches are deterministic (same seed ⇒ same hash)', () => {
    const a = new Sim(bridgeCfg({ seed: 555 }));
    const b = new Sim(bridgeCfg({ seed: 555 }));
    for (let i = 0; i < 90 * 30; i++) {
      a.tick();
      b.tick();
    }
    expect(stateHash(a)).toBe(stateHash(b));
  }, 60000);
});
