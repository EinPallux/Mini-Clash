import { BASELINE_EVERY, SnapshotEncoder } from '@mini-clash/protocol';
import { Sim } from '@mini-clash/sim';
import { describe, expect, it } from 'vitest';

/**
 * TECH §6 bandwidth budget: ≤ 12 KB/s per client at teamfight peak, measured
 * on a REAL match — 8 elite bots brawling mid-game, 20 Hz cadence, baselines
 * included. This is the wire the server actually sends (per-team view).
 */

const CHAMPS = ['rook', 'fathom', 'mortis', 'rattle', 'grukk', 'sylva', 'rook', 'fathom'];

describe('snapshot codec bandwidth', () => {
  it('stays under 12 KB/s per client during mid-game combat', () => {
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

    // Fast-forward past laning into the mid-game scrum (minute ~4).
    for (let t = 0; t < 30 * 240; t++) sim.step();
    sim.drainEvents();

    const enc = new SnapshotEncoder();
    let bytes = 0;
    let frames = 0;
    let baselines = 0;
    let deltaBytes = 0;
    let peakFrame = 0;
    const SECONDS = 6;
    for (let t = 0; t < 30 * SECONDS; t++) {
      sim.step();
      if (t % 3 === 0) continue; // 20 Hz downstream from 30 Hz (2-of-3 ticks)
      const buf = enc.encode(sim.snapshotFor(0));
      sim.drainEvents();
      bytes += buf.length;
      frames++;
      peakFrame = Math.max(peakFrame, buf.length);
      if (buf[0] === 1) baselines++;
      else deltaBytes += buf.length;
    }

    const perSec = bytes / SECONDS;
    const avgDelta = deltaBytes / Math.max(1, frames - baselines);
    // eslint-style info for the CI log — the numbers matter when tuning.
    console.info(
      `codec: ${Math.round(perSec)} B/s avg · delta ø ${Math.round(avgDelta)} B · peak frame ${peakFrame} B · ${baselines} baselines/${frames} frames`,
    );
    expect(frames).toBe(SECONDS * 20);
    expect(baselines).toBeGreaterThanOrEqual(
      Math.floor((frames - BASELINE_EVERY) / BASELINE_EVERY),
    );
    expect(perSec).toBeGreaterThan(1000); // sanity: real traffic flowed
    expect(perSec).toBeLessThanOrEqual(12_000);
    // Deltas must be doing their job — well under the keyframe cost.
    expect(avgDelta).toBeLessThan(peakFrame / 2);
  });
});
