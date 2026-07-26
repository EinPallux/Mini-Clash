import type { MatchConfig, Snapshot } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src';

/** ROADMAP v0.4: bots swap, tier-appropriately, and the A/B rig can pin them. */

function bridge(tier: 'recruit' | 'veteran' | 'elite', rig?: MatchConfig['rig']): Sim {
  const duos: [string, string][] = [
    ['rook', 'fathom'],
    ['mortis', 'rattle'],
    ['grukk', 'sylva'],
    ['boltz', 'wisp'],
  ];
  const players = [];
  for (let i = 0; i < 8; i++) {
    const [championId, benchId] = duos[i % 4];
    players.push({
      id: i + 1,
      championId,
      benchId,
      team: (i < 4 ? 0 : 1) as 0 | 1,
      bot: tier,
      name: `${tier}-${i}`,
    });
  }
  return new Sim({ mode: 'bridge', seed: 5150, mapId: 'shatterbridge', players, rig });
}

/** Count `duo.swap` fx per team over `seconds` of simulated match. */
function swapsByTeam(sim: Sim, seconds: number): [number, number] {
  const teamOf = new Map<number, number>();
  const counts: [number, number] = [0, 0];
  let snap: Snapshot | null = null;
  for (let i = 0; i < seconds * 30; i++) {
    snap = sim.tick();
    if (teamOf.size === 0) {
      for (const e of snap.entities) {
        if (e.kind === 'champion') teamOf.set(e.id, e.team);
      }
    }
    for (const ev of snap.events) {
      if (ev.t === 'fx' && ev.key === 'duo.swap' && ev.source !== undefined) {
        const t = teamOf.get(ev.source);
        if (t !== undefined) counts[t]++;
      }
    }
    if (snap.match.over) break;
  }
  return counts;
}

describe('bot Tag Swap', () => {
  // 150 s of match now runs the Living Bridge timetable too (v0.6), so these
  // are minute-scale simulations rather than the 3 s they used to be.
  it('elite bots swap during a real match', { timeout: 30_000 }, () => {
    const [t0, t1] = swapsByTeam(bridge('elite'), 150);
    expect(t0 + t1).toBeGreaterThan(10);
  });

  it('recruits never swap — a beginner plays one half (tier-appropriate)', {
    timeout: 30_000,
  }, () => {
    const [t0, t1] = swapsByTeam(bridge('recruit'), 150);
    expect(t0 + t1).toBe(0);
  });

  it('veterans and elites both swap actively', { timeout: 30_000 }, () => {
    const vet = swapsByTeam(bridge('veteran'), 150).reduce((a, b) => a + b, 0);
    const elite = swapsByTeam(bridge('elite'), 150).reduce((a, b) => a + b, 0);
    expect(vet).toBeGreaterThan(0);
    expect(elite).toBeGreaterThan(0);
    // Deliberately NOT asserting which tier swaps more often. An earlier version
    // of this test locked in "elites swap less" off a single measurement; adding
    // augments flipped the ordering (47<58 became 59>53) without changing either
    // brain. Swap COUNT is context noise — the ult-discipline rule really does
    // suppress some elite swaps, but it competes with cooldown- and Energy-driven
    // ones that augments accelerate. What matters is the value of a swap, and
    // that is what scripts/swap-ab.mjs measures head-to-head.
  });

  it('rig.noSwapTeam pins exactly one side — the A/B is honest', { timeout: 30_000 }, () => {
    const [t0, t1] = swapsByTeam(bridge('elite', { noSwapTeam: 1 }), 150);
    expect(t1).toBe(0);
    expect(t0).toBeGreaterThan(5);
  });

  it('a swapping bot keeps its shared HP pool intact across the match', { timeout: 30_000 }, () => {
    const sim = bridge('elite');
    const seat = sim.world.entities.find((e) => e.champ?.player === 1);
    if (!seat) throw new Error('no seat');
    const pool = seat.hpMax;
    for (let i = 0; i < 60 * 30; i++) {
      sim.tick();
      if (sim.world.match?.over) break;
      // hpMax only ever grows with levels — a swap must never nudge it.
      expect(seat.hpMax).toBeGreaterThanOrEqual(pool - 0.01);
    }
  });
});
