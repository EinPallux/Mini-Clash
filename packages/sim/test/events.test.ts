import {
  BRIDGE,
  EVENT_ANNOUNCE_LEAD,
  EVENT_SCHEDULE,
  EVENTS,
  SHATTERBRIDGE_MAP,
  TICK_DT,
  TICK_RATE,
} from '@mini-clash/data';
import type { MatchConfig } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { NavGrid, Sim } from '../src';
import { canAttack } from '../src/abilities';
import { dealDamage } from '../src/combat';
import { spawnMini } from '../src/minis';
import type { Entity } from '../src/world';

/** The Living Bridge: timetable, the four events, the golem, the collapse (v0.6). */

const BATTLE = SHATTERBRIDGE_MAP.battle;
if (!BATTLE) throw new Error('shatterbridge has no battle block');
const DECK_HALF = BRIDGE.collapse.deckHalves[0];

function cfg(seed = 4242): MatchConfig {
  const players = [];
  for (let i = 0; i < 8; i++) {
    const team = i < 4 ? (0 as const) : (1 as const);
    players.push({ id: i + 1, championId: i % 2 === 0 ? 'rook' : 'fathom', team });
  }
  return { mode: 'bridge', seed, mapId: 'shatterbridge', players };
}

/**
 * Jump the clock to `seconds` without dumping the backlog. Every catch-up timer
 * in the match fires once per tick until it is level with the clock, so a raw
 * jump buries an event test under a dozen waves and every earlier event in the
 * timetable. Nothing under test here depends on that history.
 */
function seek(sim: Sim, seconds: number): void {
  const m = sim.world.match;
  // `time` is derived from the tick counter every frame, so the counter is the
  // thing to move; setting `time` alone is undone by the next tick.
  sim.world.tick = Math.round(seconds * TICK_RATE);
  sim.world.time = sim.world.tick * TICK_DT;
  if (!m || !BATTLE) return;
  if (m.nextWaveAt !== null) m.nextWaveAt = sim.world.time + BATTLE.waveEvery;
  if (m.nextOrbAt !== null) m.nextOrbAt = sim.world.time + BATTLE.orbEvery;
  // Treat every window we skipped over as already run and retired.
  while (
    m.scheduleIdx < m.schedule.length &&
    m.schedule[m.scheduleIdx].at - EVENT_ANNOUNCE_LEAD <= sim.world.time
  ) {
    m.scheduleIdx++;
  }
  sim.tick();
}

function run(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) sim.tick();
}

function blockedCount(nav: NavGrid): number {
  let n = 0;
  for (let c = 0; c < nav.cols; c++) {
    for (let r = 0; r < nav.rows; r++) if (nav.isBlockedCell(c, r)) n++;
  }
  return n;
}

function slowed(e: Entity): boolean {
  return e.buffs.some((b) => b.id.startsWith('cc_slow'));
}

/** Take the golem for `team` through the real damage funnel. */
function convert(sim: Sim, golem: Entity, team: 0 | 1): Entity {
  const killer = sim.world.entities.find((e) => e.kind === 'champion' && e.team === team);
  if (!killer) throw new Error('no killer');
  dealDamage(sim.world, { source: killer, tag: 'unit', label: 'test' }, golem, 1e9, 'physical');
  sim.tick();
  return killer;
}

describe('nav regions', () => {
  it('opening a region touches only static cells and restores exactly', () => {
    const nav = new NavGrid(SHATTERBRIDGE_MAP);
    const before = blockedCount(nav);
    const patch = nav.openRegion(0, EVENTS.flankIsles.params.offsetZ, 10, 6);
    expect(patch.cells.length).toBeGreaterThan(100);
    expect(blockedCount(nav)).toBe(before - patch.cells.length);
    nav.restoreRegion(patch);
    expect(blockedCount(nav)).toBe(before);
  });

  it('a wall stamped inside an open region does not leak a permanent blocker', () => {
    // The bug this guards: `openRegion` used to record a stamped cell's value
    // (>= 2) and hand it back on restore. By then the stamp's owner had already
    // unstamped — it saw an opened 0 and did nothing — so the restore resurrected
    // an obstacle with no owner. One match leaked 259 cells and froze the waves.
    const nav = new NavGrid(SHATTERBRIDGE_MAP);
    const before = blockedCount(nav);
    // A bunker on the deck edge, overlapping where the light-bridge opens.
    const wall = nav.stampDisc(0, DECK_HALF - 0.5, 2.5);
    expect(wall.length).toBeGreaterThan(0);
    const patch = nav.openRegion(0, DECK_HALF + 1.25, 3, 3.9);
    nav.unstampWall(wall);
    nav.restoreRegion(patch);
    expect(blockedCount(nav)).toBe(before);
  });

  it('overlapping opens restore to the same baseline', () => {
    const nav = new NavGrid(SHATTERBRIDGE_MAP);
    const before = blockedCount(nav);
    const p = EVENTS.flankIsles.params;
    const isle = nav.openRegion(0, p.offsetZ, p.width, p.depth);
    const link = nav.openRegion(0, (DECK_HALF + p.offsetZ - p.depth / 2) / 2, p.bridgeWidth, 4);
    nav.restoreRegion(isle);
    nav.restoreRegion(link);
    expect(blockedCount(nav)).toBe(before);
  });

  it('closing a region is permanent — the bridge does not grow back', () => {
    const nav = new NavGrid(SHATTERBRIDGE_MAP);
    expect(nav.isBlockedAt(0, 7)).toBe(false);
    nav.closeRegion(0, 7.5, 20, 3);
    expect(nav.isBlockedAt(0, 7)).toBe(true);
  });
});

describe('schedule', () => {
  it('rolls one entry per slot, in order, from the seed', () => {
    const s = new Sim(cfg()).world.match?.schedule ?? [];
    expect(s).toHaveLength(EVENT_SCHEDULE.length);
    for (let i = 0; i < s.length; i++) {
      expect(s[i].at).toBe(EVENT_SCHEDULE[i].at);
      expect(EVENT_SCHEDULE[i].pool).toContain(s[i].kind);
      expect(s[i].elder).toBe(EVENT_SCHEDULE[i].elder ?? false);
    }
    // The Elder is the second golem, always.
    expect(s.filter((e) => e.elder).every((e) => e.kind === 'clashGolem')).toBe(true);
  });

  it('is reproducible for a seed and varies across seeds', () => {
    const line = (seed: number): string =>
      (new Sim(cfg(seed)).world.match?.schedule ?? []).map((s) => s.kind).join(',');
    expect(line(11)).toBe(line(11));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(line)).size).toBeGreaterThan(1);
  });

  it('announces 8 s ahead, then starts', () => {
    const sim = new Sim(cfg());
    const first = sim.world.match?.schedule[0];
    if (!first) throw new Error('no schedule');
    seek(sim, first.at - EVENT_ANNOUNCE_LEAD - 1);
    expect(sim.world.match?.events).toHaveLength(0);
    run(sim, 1.2);
    const ev = sim.world.match?.events[0];
    expect(ev?.phase).toBe('announced');
    expect(ev?.kind).toBe(first.kind);
    run(sim, EVENT_ANNOUNCE_LEAD);
    expect(sim.world.match?.events[0]?.phase).toBe('active');
  });

  it('surfaces the next event and the live one in the snapshot', () => {
    const sim = new Sim(cfg());
    const snap = sim.tick();
    expect(snap.match.nextEvent?.kind).toBe(sim.world.match?.schedule[0].kind);
    expect(snap.match.nextEvent?.inSeconds).toBeGreaterThan(0);
    expect(snap.match.deckHalf).toBe(DECK_HALF);
    const first = sim.world.match?.schedule[0];
    if (!first) throw new Error('no schedule');
    seek(sim, first.at - EVENT_ANNOUNCE_LEAD - 0.5);
    run(sim, EVENT_ANNOUNCE_LEAD + 1);
    const live = sim.tick();
    expect(live.match.events[0]?.kind).toBe(first.kind);
    expect(live.match.events[0]?.phase).toBe('active');
    expect(live.match.events[0]?.tLeft).toBeGreaterThan(0);
    expect(live.match.events[0]?.tTotal).toBe(EVENTS[first.kind].duration);
  });
});

/**
 * Blocked-cell count of each match's grid the moment before its event opened.
 * The live grid is not the fresh one — structures stamp cells and keep them —
 * so "did the event give the ground back" has to be measured against the match.
 */
const navBaseline = new WeakMap<Sim, number>();

/** Drive a match to the first window of `kind`, whatever the seed rolled. */
function toEvent(kind: string, opts?: { elder?: boolean; seed?: number }): Sim {
  const seeds = opts?.seed !== undefined ? [opts.seed] : [4242, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const seed of seeds) {
    const sim = new Sim(cfg(seed));
    const slot = (sim.world.match?.schedule ?? []).find(
      (s) => s.kind === kind && (opts?.elder === undefined || s.elder === opts.elder),
    );
    if (!slot) continue;
    seek(sim, slot.at - EVENT_ANNOUNCE_LEAD - 0.5);
    navBaseline.set(sim, blockedCount(sim.world.nav));
    run(sim, EVENT_ANNOUNCE_LEAD + 1);
    // Fail loudly rather than hand back a match where nothing started — an
    // empty `events` list makes half the assertions below vacuously true.
    const live = sim.world.match?.events[0];
    if (live?.kind !== kind || live.phase !== 'active') {
      throw new Error(
        `${kind} did not start (got ${live?.kind ?? 'nothing'}/${live?.phase ?? '-'})`,
      );
    }
    return sim;
  }
  throw new Error(`no seed rolls ${kind}`);
}

describe('flank isles', () => {
  it('opens walkable platforms off the deck, each carrying an orb', () => {
    const sim = toEvent('flankIsles');
    const p = EVENTS.flankIsles.params;
    expect(p.offsetZ - p.depth / 2).toBeGreaterThan(DECK_HALF); // genuinely off-deck
    expect(sim.world.nav.isBlockedAt(0, p.offsetZ)).toBe(false);
    expect(sim.world.nav.isBlockedAt(0, -p.offsetZ)).toBe(false);
    // Reachable from mid, not a marooned pocket — that is what the light-bridge is for.
    expect(sim.world.nav.findPath(0, 0, 0, p.offsetZ).length).toBeGreaterThan(0);
    expect(sim.world.nav.findPath(0, 0, 0, -p.offsetZ).length).toBeGreaterThan(0);
    const orbs = sim.world.entities.filter((e) => e.kind === 'orb' && Math.abs(e.z) > DECK_HALF);
    expect(orbs).toHaveLength(2);
  });

  it('takes the platforms back, lands everyone on the deck, and restores the grid', () => {
    const sim = toEvent('flankIsles');
    const fresh = navBaseline.get(sim) ?? -1;
    const p = EVENTS.flankIsles.params;
    const champ = sim.world.entities.find((e) => e.kind === 'champion');
    if (!champ) throw new Error('no champion');
    champ.x = 0;
    champ.z = p.offsetZ;
    run(sim, EVENTS.flankIsles.duration + 1);
    expect(sim.world.match?.events).toHaveLength(0);
    expect(sim.world.nav.isBlockedAt(0, p.offsetZ)).toBe(true);
    expect(blockedCount(sim.world.nav)).toBe(fresh);
    expect(Math.abs(champ.z)).toBeLessThanOrEqual(DECK_HALF);
    expect(sim.world.nav.isBlockedAt(champ.x, champ.z)).toBe(false);
    expect(
      sim.world.entities.filter((e) => e.kind === 'orb' && Math.abs(e.z) > DECK_HALF),
    ).toHaveLength(0);
  });
});

describe('coin rain', () => {
  it('drops coins over the window and pays gold on touch', () => {
    const sim = toEvent('coinRain');
    run(sim, 6);
    const coins = sim.world.entities.filter((e) => e.coin);
    expect(coins.length).toBeGreaterThan(2);
    expect(coins.length).toBeLessThan(EVENTS.coinRain.params.coins);
    const champ = sim.world.entities.find((e) => e.kind === 'champion');
    const c = champ?.champ;
    if (!champ || !c) throw new Error('no champion');
    const gold = c.gold;
    const coin = coins[0];
    const worth = coin.coin?.gold ?? 0;
    expect(worth).toBeGreaterThanOrEqual(EVENTS.coinRain.params.goldMin);
    expect(worth).toBeLessThanOrEqual(EVENTS.coinRain.params.goldMax);
    champ.x = coin.x;
    champ.z = coin.z;
    run(sim, 0.1);
    expect(c.gold).toBeGreaterThanOrEqual(gold + worth);
    expect(sim.world.get(coin.id)).toBeUndefined();
  });

  it('coins land on walkable ground, not in the void', () => {
    const sim = toEvent('coinRain');
    run(sim, EVENTS.coinRain.duration);
    const coins = sim.world.entities.filter((e) => e.coin);
    expect(coins.length).toBeGreaterThan(0);
    for (const coin of coins) expect(sim.world.nav.isBlockedAt(coin.x, coin.z)).toBe(false);
  });

  it('coins outlive the shower but dissolve on their own timer', () => {
    const sim = toEvent('coinRain');
    run(sim, EVENTS.coinRain.duration + 1);
    expect(sim.world.match?.events).toHaveLength(0);
    expect(sim.world.entities.some((e) => e.coin)).toBe(true);
    run(sim, EVENTS.coinRain.params.coinLife + 1);
    expect(sim.world.entities.filter((e) => e.coin)).toHaveLength(0);
  });
});

describe('storm front', () => {
  it('sweeps the full length and burns + slows whoever stands in it', () => {
    const sim = toEvent('stormFront');
    const ev = sim.world.match?.events[0];
    if (!ev) throw new Error('no storm');
    const champ = sim.world.entities.find((e) => e.kind === 'champion');
    if (!champ) throw new Error('no champion');
    champ.hp = champ.hpMax;
    const start = ev.data.centre ?? 0;
    // Ride the wall for a second.
    for (let i = 0; i < 30; i++) {
      champ.x = sim.world.match?.events[0]?.data.centre ?? 0;
      champ.z = 0;
      sim.tick();
    }
    const lost = champ.hpMax - champ.hp;
    expect(lost).toBeGreaterThan(champ.hpMax * EVENTS.stormFront.params.dpsPctMaxHp * 0.5);
    expect(slowed(champ)).toBe(true);
    // It keeps moving: the band is a function of elapsed time, not a wanderer.
    run(sim, 10);
    const now = sim.world.match?.events[0]?.data.centre ?? 0;
    expect(Math.abs(now - start)).toBeGreaterThan(20);
  });

  it('ends cleanly and stops hurting people', () => {
    const sim = toEvent('stormFront');
    run(sim, EVENTS.stormFront.duration + 1);
    expect(sim.world.match?.events).toHaveLength(0);
    const champ = sim.world.entities.find((e) => e.kind === 'champion');
    if (!champ) throw new Error('no champion');
    champ.hp = champ.hpMax;
    run(sim, 2);
    expect(champ.hp).toBe(champ.hpMax);
  });
});

describe('clash golem', () => {
  function wake(elder = false): { sim: Sim; golem: Entity } {
    const sim = toEvent('clashGolem', { elder });
    const golem = sim.world.entities.find((e) => e.golem);
    if (!golem) throw new Error('golem did not wake');
    return { sim, golem };
  }

  it('wakes neutral on the altar, scaled to the clock', () => {
    const { sim, golem } = wake();
    const p = EVENTS.clashGolem.params;
    expect(golem.golem?.owner).toBeNull();
    expect(Math.hypot(golem.x, golem.z)).toBeLessThan(1);
    // Scaled off the clock at wake, a second or so before this reads it.
    expect(golem.hpMax).toBeGreaterThan(p.hp);
    expect(golem.hpMax).toBeCloseTo(p.hp + (p.hpPerMin * sim.world.time) / 60, -1);
  });

  it('is hostile to both teams while neutral, and attackable by both', () => {
    const { sim, golem } = wake();
    for (const team of [0, 1] as const) {
      expect([...sim.world.enemiesOf(team)].some((e) => e.id === golem.id)).toBe(true);
      const champ = sim.world.entities.find((e) => e.kind === 'champion' && e.team === team);
      if (!champ) throw new Error('no champion');
      // It spawns tagged team 0 because the field is not nullable — if that tag
      // gated attacks, half the map could not race for the objective.
      expect(canAttack(sim.world, champ, golem)).toBe(true);
    }
  });

  it('once converted, only the other side can hit it', () => {
    const { sim, golem } = wake();
    convert(sim, golem, 0);
    const west = sim.world.entities.find((e) => e.kind === 'champion' && e.team === 0);
    const east = sim.world.entities.find((e) => e.kind === 'champion' && e.team === 1);
    if (!west || !east) throw new Error('no champions');
    expect(canAttack(sim.world, west, golem)).toBe(false);
    expect(canAttack(sim.world, east, golem)).toBe(true);
  });

  it('slams a champion that walks onto the altar', () => {
    const { sim, golem } = wake();
    const champ = sim.world.entities.find((e) => e.kind === 'champion');
    if (!champ) throw new Error('no champion');
    champ.hp = champ.hpMax;
    for (let i = 0; i < 30 * 4; i++) {
      champ.x = golem.x + 1.2;
      champ.z = golem.z;
      sim.tick();
    }
    expect(champ.hp).toBeLessThan(champ.hpMax);
  });

  it('converts on the killing blow and marches the killer team lane', () => {
    const { sim, golem } = wake();
    convert(sim, golem, 1);
    expect(golem.dead).toBe(false);
    expect(golem.golem?.owner).toBe(1);
    expect(golem.team).toBe(1);
    // Its event handed it over rather than deleting it.
    expect(sim.world.match?.events.some((e) => e.kind === 'clashGolem')).toBe(false);
    expect(sim.world.get(golem.id)).toBeDefined();
    // Team 1 sieges west: it must walk −x, not turn round and go home.
    const x0 = golem.x;
    run(sim, 6);
    expect(golem.x).toBeLessThan(x0 - 4);
  });

  it('converted for team 0 it marches the other way', () => {
    const { sim, golem } = wake();
    convert(sim, golem, 0);
    const x0 = golem.x;
    run(sim, 6);
    expect(golem.x).toBeGreaterThan(x0 + 4);
  });

  it('takes 40% less from towers once converted, and buffs nearby minis', () => {
    const { sim, golem } = wake();
    const p = EVENTS.clashGolem.params;
    const killer = convert(sim, golem, 0);
    const tower = sim.world.entities.find((e) => e.kind === 'tower' && e.team === 1);
    if (!tower) throw new Error('no tower');

    golem.hp = golem.hpMax;
    dealDamage(sim.world, { source: tower, tag: 'unit', label: 'tower' }, golem, 200, 'physical');
    const fromTower = golem.hpMax - golem.hp;
    golem.hp = golem.hpMax;
    dealDamage(sim.world, { source: killer, tag: 'unit', label: 'test' }, golem, 200, 'physical');
    const fromChamp = golem.hpMax - golem.hp;
    expect(fromTower).toBeGreaterThan(0);
    expect(fromTower).toBeCloseTo(fromChamp * (1 - p.towerResist), 3);

    spawnMini(sim.world, 'mini_bruiser', 0, golem.x, golem.z);
    const mini = sim.world.entities.find((e) => e.kind === 'mini');
    if (!mini) throw new Error('no mini');
    sim.tick();
    expect(mini.buffs.some((b) => b.id === 'golem_march')).toBe(true);
  });

  it('the Elder is bigger and shields its team', () => {
    const p = EVENTS.clashGolem.params;
    const plain = wake(false);
    const { sim, golem } = wake(true);
    expect(golem.golem?.elder).toBe(true);
    expect(golem.hpMax).toBeGreaterThan(plain.golem.hpMax * p.elderMul * 0.9);

    const killer = convert(sim, golem, 0);
    for (let i = 0; i < 30 * 6; i++) {
      killer.x = golem.x;
      killer.z = golem.z;
      sim.tick();
      if (killer.buffs.some((b) => b.id === 'golem_aegis')) break;
    }
    expect(killer.buffs.some((b) => b.id === 'golem_aegis')).toBe(true);
    // A plain golem's aura is Minis only.
    const other = convert(plain.sim, plain.golem, 0);
    for (let i = 0; i < 30 * 6; i++) {
      other.x = plain.golem.x;
      other.z = plain.golem.z;
      plain.sim.tick();
    }
    expect(other.buffs.some((b) => b.id === 'golem_aegis')).toBe(false);
  });
});

describe('bridge collapse', () => {
  function toOvertime(): Sim {
    const sim = new Sim(cfg());
    seek(sim, BRIDGE.overtime.at - 0.5);
    run(sim, 1.5);
    return sim;
  }

  it('narrows the deck one stage a minute and stops at the last stage', () => {
    const sim = toOvertime();
    const m = sim.world.match;
    if (!m) throw new Error('no match');
    expect(m.overtime).toBe(true);
    expect(m.deckHalf).toBe(DECK_HALF);
    for (let stage = 1; stage < BRIDGE.collapse.deckHalves.length; stage++) {
      run(sim, BRIDGE.collapse.every + 0.5);
      expect(m.collapseStage).toBe(stage);
      expect(m.deckHalf).toBe(BRIDGE.collapse.deckHalves[stage]);
    }
    run(sim, BRIDGE.collapse.every * 2);
    expect(m.collapseStage).toBe(BRIDGE.collapse.deckHalves.length - 1);
  });

  it('closes the lost strip for good and sweeps units inward first', () => {
    const sim = toOvertime();
    const champ = sim.world.entities.find((e) => e.kind === 'champion');
    if (!champ) throw new Error('no champion');
    champ.x = 0;
    champ.z = DECK_HALF - 0.6;
    run(sim, BRIDGE.collapse.every + 0.5);
    const half = sim.world.match?.deckHalf ?? 0;
    expect(Math.abs(champ.z)).toBeLessThanOrEqual(half);
    expect(sim.world.nav.isBlockedAt(0, DECK_HALF - 0.6)).toBe(true);
    expect(sim.world.nav.isBlockedAt(0, 0)).toBe(false);
    // Mid is still one connected deck after the edges go.
    expect(sim.world.nav.findPath(-40, 0, 40, 0).length).toBeGreaterThan(0);
  });

  it('drops brush cover on the strip that fell', () => {
    const sim = toOvertime();
    expect(sim.world.brushRects.length).toBeGreaterThan(0);
    run(sim, BRIDGE.collapse.every * 2 + 1);
    const half = sim.world.match?.deckHalf ?? 0;
    expect(sim.world.brushRects.every((b) => Math.abs(b.z) + b.d / 2 <= half)).toBe(true);
  });

  it('logs each stage for the summary', () => {
    const sim = toOvertime();
    run(sim, BRIDGE.collapse.every + 0.5);
    const log = sim.world.match?.eventLog ?? [];
    expect(log.some((l) => l.kind === 'collapse')).toBe(true);
  });
});
