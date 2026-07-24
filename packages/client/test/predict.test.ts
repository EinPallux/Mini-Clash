import { TRAINING_MAP } from '@mini-clash/data';
import type { ChampionSnap } from '@mini-clash/protocol';
import { NavGrid } from '@mini-clash/sim';
import { describe, expect, it } from 'vitest';
import { PredictedSelf } from '../src/game/predict';

/** Reconciliation rules (TECH §6): corrections invisible below 0.25u, glide above. */

function champ(x: number, z: number, over: Partial<ChampionSnap> = {}): ChampionSnap {
  return {
    kind: 'champion',
    id: 1,
    x,
    z,
    fx: 1,
    fz: 0,
    hp: 100,
    hpMax: 100,
    radius: 0.5,
    team: 0,
    player: 1,
    championId: 'rook',
    bot: false,
    name: 'T',
    dead: false,
    respawnIn: 0,
    energy: 100,
    level: 1,
    gold: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    items: [],
    relic: null,
    inBrush: false,
    shield: 0,
    cooldowns: { q: 0, w: 0, r: 0 },
    cooldownMax: { q: 1, w: 1, r: 1 },
    passive: {},
    dancing: false,
    speed: 0,
    buffs: [],
    stats: { ad: 10, attackSpeed: 1, moveSpeed: 4, armor: 0, ward: 0 },
    ...over,
  };
}

function make(): PredictedSelf {
  return new PredictedSelf(new NavGrid(TRAINING_MAP));
}

describe('PredictedSelf', () => {
  it('walks toward an ordered target at move speed', () => {
    const p = make();
    p.reconcile(champ(0, 0), -1);
    p.order(1, 4, 0);
    p.update(0.5); // 4 u/s * 0.5s = 2u
    const pos = p.renderPos()!;
    expect(pos.x).toBeCloseTo(2, 1);
    expect(pos.z).toBeCloseTo(0, 1);
  });

  it('never corrects while the server rides behind on the same path', () => {
    // The authoritative state is one trip old: mid-walk it reports positions we
    // occupied ~RTT ago. That must read as on-track, not as an error.
    const p = make();
    p.reconcile(champ(0, 0), -1);
    p.order(1, 8, 0);
    for (let i = 0; i < 20; i++) {
      p.update(1 / 60); // predicted walks ahead…
      const lagBehind = Math.max(0, p.renderPos()!.x - 1.3); // ~330ms of lag at 4u/s
      p.reconcile(champ(lagBehind, 0), 1); // …server echoes our old spot
    }
    expect(p.maxCorrection).toBe(0);
    expect(p.renderPos()!.x).toBeGreaterThan(1); // still ahead, never yanked back
  });

  it('absorbs sub-threshold drift with no visible correction', () => {
    const p = make();
    p.reconcile(champ(0, 0), -1);
    p.update(1 / 60);
    p.reconcile(champ(0.2, 0), 5); // no pending, tiny error
    expect(p.maxCorrection).toBe(0);
    const pos = p.renderPos()!;
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.x).toBeLessThan(0.21);
  });

  it('tracks creeping drift with bounded, glided corrections', () => {
    // Server walks us sideways (collision shove we didn't predict): the render
    // must follow smoothly — no frame may ever move far enough to read as a jump.
    const p = make();
    p.reconcile(champ(0, 0), -1);
    let prev = { x: 0, z: 0 };
    let worstFrameJump = 0;
    for (let i = 0; i < 25; i++) {
      p.update(1 / 60);
      p.reconcile(champ(0, Math.min(2, (i + 1) * 0.15)), 5);
      const r = p.renderPos()!;
      worstFrameJump = Math.max(worstFrameJump, Math.hypot(r.x - prev.x, r.z - prev.z));
      prev = r;
    }
    p.update(0.12); // drain the last glide
    expect(p.renderPos()!.z).toBeGreaterThan(1.2); // converged onto the drift
    expect(p.maxCorrection).toBeLessThanOrEqual(0.8);
    expect(worstFrameJump).toBeLessThan(0.45);
  });

  it('suppresses corrections while orders are still in flight', () => {
    const p = make();
    p.reconcile(champ(0, 0), -1);
    p.order(10, 6, 0);
    p.update(0.4); // predicted ahead ~1.6u
    const before = p.renderPos()!.x;
    p.reconcile(champ(0, 2), 3); // 2u off-trajectory, but seq 10 not applied yet
    expect(p.renderPos()!.x).toBeCloseTo(before, 5);
    expect(p.maxCorrection).toBe(0);
  });

  it('corrects real divergence once the order is acked', () => {
    // We predicted a walk the server never performed (e.g. shoved off it):
    // after the ack the divergence is genuine and must correct.
    const p = make();
    p.reconcile(champ(0, 0), -1);
    p.order(1, 6, 0);
    for (let i = 0; i < 30; i++) p.update(1 / 60); // ahead ~2u, trace filled
    p.reconcile(champ(0, 2), 1); // acked; server went sideways instead
    expect(p.maxCorrection).toBeGreaterThan(0.25);
    // Render held near the old spot the instant the correction lands (glide)…
    expect(p.renderPos()!.z).toBeLessThan(0.3);
    for (let i = 0; i < 6; i++) {
      p.update(1 / 60);
      p.reconcile(champ(0, 2), 1);
    }
    p.update(0.12);
    // …then the sideways shift sticks (forward lead is kept — it was on track).
    expect(p.renderPos()!.z).toBeGreaterThan(1.5);
  });

  it('hard-snaps when the server itself jumps (dash/hook)', () => {
    const p = make();
    p.reconcile(champ(0, 0), -1);
    p.update(1 / 60);
    p.reconcile(champ(2.5, 0), 5); // 2.5u in one snapshot ≫ walkable — a dash
    const pos = p.renderPos()!;
    expect(pos.x).toBe(2.5);
    expect(pos.z).toBe(0);
  });

  it('snaps hard on teleports (blink/respawn) and drops the stale path', () => {
    const p = make();
    p.reconcile(champ(0, 0), -1);
    p.order(1, 5, 0);
    p.update(0.25);
    p.reconcile(champ(20, 5), 1);
    const pos = p.renderPos()!;
    expect(pos.x).toBe(20);
    expect(pos.z).toBe(5);
    p.update(0.5); // stale path must not keep walking
    expect(p.renderPos()!.x).toBe(20);
  });
});
