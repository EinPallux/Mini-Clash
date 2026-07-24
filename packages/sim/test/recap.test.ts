import type { ChampionSnap, Intent, IntentMsg, MatchConfig } from '@mini-clash/protocol';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src';

/**
 * Death recap (UI_UX §10): per-ability damage attribution over a 12 s window,
 * frozen at death as the top 3 (source, ability) pairs, cleared on respawn.
 */

function duel(): { sim: Sim; msg: (intent: Intent, player?: number) => IntentMsg } {
  const config: MatchConfig = {
    mode: 'training',
    seed: 4242,
    mapId: 'training',
    players: [
      { id: 1, championId: 'mortis', team: 0 },
      // Fathom: squishy, no flat-block passive — dies to autos inside the cap.
      { id: 2, championId: 'fathom', team: 1, name: 'Victim' },
    ],
  };
  const sim = new Sim(config);
  let seq = 0;
  const msg = (intent: Intent, player = 1): IntentMsg => ({ seq: seq++, player, intent });
  sim.applyIntents([
    msg({ t: 'trainer', cmd: { k: 'noCooldowns', on: true } }),
    msg({ t: 'trainer', cmd: { k: 'infiniteEnergy', on: true } }),
  ]);
  return { sim, msg };
}

function victim(sim: Sim) {
  const e = sim.world.entities.find((x) => x.champ?.player === 2);
  if (!e?.champ) throw new Error('no victim');
  return e;
}

/** Walk both champions onto open ground: apart (skillshot flight path) and off
 * the spawn fountain plate (its regen out-heals slow chip damage). */
function separate(sim: Sim, msg: (i: Intent, p?: number) => IntentMsg): void {
  sim.applyIntents([msg({ t: 'move', x: 8, z: -5 }, 2), msg({ t: 'move', x: 2, z: -5 }, 1)]);
  for (let i = 0; i < 30 * 4; i++) sim.tick();
  sim.applyIntents([msg({ t: 'stop' }, 2), msg({ t: 'stop' }, 1)]);
}

/** Attack the victim until it dies, weaving a Q every third order (cap: `seconds`). */
function batter(
  sim: Sim,
  msg: (i: Intent, p?: number) => IntentMsg,
  seconds: number,
  useAbility: boolean,
): boolean {
  for (let t = 0; t < seconds * 2; t++) {
    const v = victim(sim);
    if (v.dead) return true;
    const intents: IntentMsg[] = [msg({ t: 'attackTarget', target: v.id })];
    if (useAbility && t % 3 === 0) {
      intents.unshift(msg({ t: 'cast', slot: 'q', x: v.x, z: v.z }));
    }
    sim.applyIntents(intents);
    for (let i = 0; i < 15; i++) sim.tick();
  }
  return victim(sim).dead;
}

describe('death recap', () => {
  it('freezes top sources at death, attributed per ability, and shows in snapshots', () => {
    const { sim, msg } = duel();
    separate(sim, msg);
    expect(batter(sim, msg, 60, true)).toBe(true);

    const v = victim(sim);
    const recap = v.champ?.recap ?? [];
    expect(recap.length).toBeGreaterThan(0);
    expect(recap.length).toBeLessThanOrEqual(3);
    // Sorted by damage, every entry attributed to the killer.
    for (let i = 1; i < recap.length; i++) {
      expect(recap[i - 1].amount).toBeGreaterThanOrEqual(recap[i].amount);
    }
    for (const r of recap) {
      expect(r.championId).toBe('mortis');
      expect(r.amount).toBeGreaterThan(0);
    }
    // Both the Q casts (aggregated into one entry) and the autos show up.
    const labels = recap.map((r) => r.label);
    expect(labels).toContain('q');
    expect(labels).toContain('aa');

    // The snapshot carries the recap while dead…
    const snap = sim.tick();
    const dead = snap.entities.find((e) => e.kind === 'champion' && e.player === 2) as ChampionSnap;
    expect(dead.dead).toBe(true);
    expect(dead.recap?.length).toBe(recap.length);

    // …and respawn clears it.
    for (let i = 0; i < 30 * 12; i++) sim.tick();
    const back = victim(sim);
    expect(back.dead).toBe(false);
    expect(back.champ?.recap).toBeNull();
  });

  it('only aggregates the last 12 seconds — old chip damage falls out', () => {
    const { sim, msg } = duel();
    separate(sim, msg);
    // One early Q, then disengage well past the window.
    const v0 = victim(sim);
    sim.applyIntents([msg({ t: 'cast', slot: 'q', x: v0.x, z: v0.z })]);
    for (let i = 0; i < 60; i++) sim.tick();
    expect(victim(sim).champ?.dmgLog.length).toBeGreaterThan(0);
    sim.applyIntents([msg({ t: 'stop' })]);
    for (let i = 0; i < 30 * 14; i++) sim.tick();

    // Now kill with autos only: the stale Q must not appear in the recap.
    expect(batter(sim, msg, 60, false)).toBe(true);
    const recap = victim(sim).champ?.recap ?? [];
    expect(recap.length).toBeGreaterThan(0);
    expect(recap.map((r) => r.label)).not.toContain('q');
  });
});
