import { BASELINE_EVERY, SnapshotEncoder } from '@mini-clash/protocol';
import { Sim } from '@mini-clash/sim';
import { describe, expect, it } from 'vitest';

/**
 * TECH §6 bandwidth budget: ≤ 12 KB/s per client at teamfight peak, measured
 * on a REAL match — 8 elite bots brawling mid-game, 20 Hz cadence, baselines
 * included. This is the wire the server actually sends (per-team view).
 *
 * Two windows, because "peak" moved in v0.6: the mid-game scrum, and the Clash
 * Golem window, where a converted siege engine drags a buffed wave up the lane
 * and the map event ticker is live.
 */

const CHAMPS = ['rook', 'fathom', 'mortis', 'rattle', 'grukk', 'sylva', 'rook', 'fathom'];
const SECONDS = 6;

interface Sample {
  perSec: number;
  avgDelta: number;
  peakFrame: number;
  frames: number;
  baselines: number;
  /** Entity kinds that actually appeared on the wire in this window. */
  kinds: Set<string>;
}

function measure(fromSecond: number): Sample {
  const sim = new Sim({
    mode: 'bridge',
    seed: 20260724,
    mapId: 'shatterbridge',
    players: CHAMPS.map((championId, i) => ({
      id: i + 1,
      championId,
      team: i < 4 ? 0 : 1,
      bot: 'elite' as const,
      name: `B${i}`,
    })),
  });

  for (let t = 0; t < 30 * fromSecond; t++) sim.step();
  sim.drainEvents();

  const enc = new SnapshotEncoder();
  let bytes = 0;
  let frames = 0;
  let baselines = 0;
  let deltaBytes = 0;
  let peakFrame = 0;
  const kinds = new Set<string>();
  for (let t = 0; t < 30 * SECONDS; t++) {
    sim.step();
    if (t % 3 === 0) continue; // 20 Hz downstream from 30 Hz (2-of-3 ticks)
    const snap = sim.snapshotFor(0);
    for (const e of snap.entities) kinds.add(e.kind);
    const buf = enc.encode(snap);
    sim.drainEvents();
    bytes += buf.length;
    frames++;
    peakFrame = Math.max(peakFrame, buf.length);
    if (buf[0] === 1) baselines++;
    else deltaBytes += buf.length;
  }
  return {
    perSec: bytes / SECONDS,
    avgDelta: deltaBytes / Math.max(1, frames - baselines),
    peakFrame,
    frames,
    baselines,
    kinds,
  };
}

function check(label: string, s: Sample): void {
  console.info(
    `codec ${label}: ${Math.round(s.perSec)} B/s avg · delta ø ${Math.round(s.avgDelta)} B · peak frame ${s.peakFrame} B · ${s.baselines} baselines/${s.frames} frames`,
  );
  expect(s.frames).toBe(SECONDS * 20);
  expect(s.baselines).toBeGreaterThanOrEqual(
    Math.floor((s.frames - BASELINE_EVERY) / BASELINE_EVERY),
  );
  expect(s.perSec).toBeGreaterThan(1000); // sanity: real traffic flowed
  expect(s.perSec).toBeLessThanOrEqual(12_000);
  // Deltas must be doing their job — well under the keyframe cost.
  expect(s.avgDelta).toBeLessThan(s.peakFrame / 2);
}

describe('snapshot codec bandwidth', () => {
  it('stays under 12 KB/s per client during mid-game combat', { timeout: 60_000 }, () => {
    check('midgame', measure(240));
  });

  it('stays under 12 KB/s through the Clash Golem window', { timeout: 60_000 }, () => {
    // 6:00 golem + the fight over it: the most entities, buffs and event state
    // that ever share a frame.
    const s = measure(375);
    // Guard the premise — a quiet window would pass the budget for free.
    expect(s.kinds.has('golem')).toBe(true);
    check('golem', s);
  });
});
