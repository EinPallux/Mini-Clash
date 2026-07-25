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
  it('elite bots swap during a real match', () => {
    const [t0, t1] = swapsByTeam(bridge('elite'), 150);
    expect(t0 + t1).toBeGreaterThan(10);
  });

  it('recruits never swap — a beginner plays one half (tier-appropriate)', () => {
    const [t0, t1] = swapsByTeam(bridge('recruit'), 150);
    expect(t0 + t1).toBe(0);
  });

  it('veterans swap too — and elites swap LESS, because they hold ready ultimates', () => {
    const vet = swapsByTeam(bridge('veteran'), 150).reduce((a, b) => a + b, 0);
    const elite = swapsByTeam(bridge('elite'), 150).reduce((a, b) => a + b, 0);
    expect(vet).toBeGreaterThan(0);
    expect(elite).toBeGreaterThan(0);
    // Competence is not frequency. Veterans cycle the bench whenever Energy or
    // cooldowns say so; elites additionally refuse to trade away an ultimate that
    // is up in a live fight, which makes them swap *less often but better* — the
    // value of their swaps is what scripts/swap-ab.mjs measures.
    expect(elite).toBeLessThan(vet);
  });

  it('rig.noSwapTeam pins exactly one side — the A/B is honest', () => {
    const [t0, t1] = swapsByTeam(bridge('elite', { noSwapTeam: 1 }), 150);
    expect(t1).toBe(0);
    expect(t0).toBeGreaterThan(5);
  });

  it('a swapping bot keeps its shared HP pool intact across the match', () => {
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
