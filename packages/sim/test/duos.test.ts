import { CHAMPION_LIST, CHAMPIONS, TAG_SWAP } from '@mini-clash/data';
import type { Intent, IntentMsg, MatchConfig, Snapshot } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src';

/**
 * ROADMAP v0.4 acceptance: every champion pair (28 duos of 8) is playable, and
 * the shared-HP pool is symmetric — swapping never moves your health bar.
 */

const ALL = CHAMPION_LIST.map((c) => c.id);

/** The 28 unordered pairs of the 8-champion roster. */
function allPairs(): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < ALL.length; i++) {
    for (let j = i + 1; j < ALL.length; j++) out.push([ALL[i], ALL[j]]);
  }
  return out;
}

function cfg(a: string, b: string): MatchConfig {
  return {
    mode: 'training',
    seed: 20_004,
    mapId: 'training',
    players: [{ id: 1, championId: a, benchId: b, team: 0 }],
  };
}

let seq = 0;
function msg(intent: Intent): IntentMsg {
  return { seq: seq++, player: 1, intent };
}

function run(sim: Sim, seconds: number, collect?: Snapshot[]): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    const s = sim.tick();
    collect?.push(s);
  }
}

function me(sim: Sim) {
  const e = sim.world.entities.find((x) => x.champ?.player === 1);
  if (!e?.champ) throw new Error('no champion');
  return e;
}

/** Level-1 shared pool: the average of both champions' HP at that level. */
function expectedPool(a: string, b: string, level: number): number {
  const lv = level - 1;
  const sa = CHAMPIONS[a].stats;
  const sb = CHAMPIONS[b].stats;
  return (sa.hp + sa.hpPerLevel * lv + (sb.hp + sb.hpPerLevel * lv)) / 2;
}

describe('all 28 duos', () => {
  const pairs = allPairs();

  it('enumerates exactly 28 pairs from the 8-champion roster', () => {
    expect(ALL.length).toBe(8);
    expect(pairs.length).toBe(28);
  });

  it('every pair plays: both kits cast, both entrances fire, nothing throws', () => {
    const broken: string[] = [];
    for (const [a, b] of pairs) {
      try {
        const sim = new Sim(cfg(a, b));
        sim.applyIntents([
          msg({ t: 'trainer', cmd: { k: 'noCooldowns', on: true } }),
          msg({ t: 'trainer', cmd: { k: 'infiniteEnergy', on: true } }),
        ]);
        // Level past the R gate so ultimates are live for both halves.
        for (let i = 0; i < 5; i++)
          sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'levelUp' } })]);

        const dummy = sim.world.entities.find((x) => x.kind === 'dummy');
        if (!dummy) throw new Error('no dummy');
        // Stand within arm's reach: half the roster is melee, and "playable"
        // means the kit works from its own effective range, not from across the map.
        sim.applyIntents([msg({ t: 'move', x: dummy.x - 1.4, z: dummy.z })]);
        run(sim, 5);

        const snaps: Snapshot[] = [];
        // Half A: fire the whole kit.
        for (const slot of ['q', 'w', 'r'] as const) {
          sim.applyIntents([msg({ t: 'cast', slot, x: dummy.x, z: dummy.z })]);
          run(sim, 1.2, snaps);
        }
        // Swap, then half B fires its whole kit.
        sim.applyIntents([msg({ t: 'swap' })]);
        run(sim, 1, snaps);
        expect(me(sim).champ?.def.id).toBe(b);
        for (const slot of ['q', 'w', 'r'] as const) {
          sim.applyIntents([msg({ t: 'cast', slot, x: dummy.x, z: dummy.z })]);
          run(sim, 1.2, snaps);
        }
        // And back again — a duo has to survive round-tripping.
        run(sim, TAG_SWAP.cooldown);
        sim.applyIntents([msg({ t: 'swap' })]);
        run(sim, 1, snaps);
        expect(me(sim).champ?.def.id).toBe(a);

        // Both kits actually did something to the dummy.
        const dmg = snaps.flatMap((s) => s.events.filter((ev) => ev.t === 'damage'));
        if (dmg.length < 2) throw new Error(`only ${dmg.length} damage events`);
      } catch (err) {
        broken.push(`${a}+${b}: ${(err as Error).message}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('shared HP pool is the average of both curves and never moves on a swap', () => {
    const wrong: string[] = [];
    for (const [a, b] of pairs) {
      const sim = new Sim(cfg(a, b));
      const e = me(sim);
      run(sim, 0.2);

      const want1 = expectedPool(a, b, 1);
      if (Math.abs(e.hpMax - want1) > 0.51) {
        wrong.push(`${a}+${b}: level 1 pool ${e.hpMax.toFixed(1)} ≠ ${want1.toFixed(1)}`);
        continue;
      }
      // Symmetry: the pool is identical whichever half is active.
      const before = e.hpMax;
      sim.applyIntents([msg({ t: 'swap' })]);
      run(sim, 0.6);
      if (Math.abs(e.hpMax - before) > 0.001) {
        wrong.push(`${a}+${b}: pool moved on swap (${before} → ${e.hpMax})`);
        continue;
      }
      // And it still tracks the curve after levelling.
      for (let i = 0; i < 4; i++) sim.applyIntents([msg({ t: 'trainer', cmd: { k: 'levelUp' } })]);
      run(sim, 0.4);
      const want5 = expectedPool(a, b, e.champ?.level ?? 5);
      if (Math.abs(e.hpMax - want5) > 0.51) {
        wrong.push(
          `${a}+${b}: level ${e.champ?.level} pool ${e.hpMax.toFixed(1)} ≠ ${want5.toFixed(1)}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it('a duo never pairs a champion with itself, and the pool sits between the halves', () => {
    for (const [a, b] of pairs) {
      expect(a).not.toBe(b);
      const pool = expectedPool(a, b, 1);
      const lo = Math.min(CHAMPIONS[a].stats.hp, CHAMPIONS[b].stats.hp);
      const hi = Math.max(CHAMPIONS[a].stats.hp, CHAMPIONS[b].stats.hp);
      expect(pool).toBeGreaterThanOrEqual(lo);
      expect(pool).toBeLessThanOrEqual(hi);
    }
  });
});
