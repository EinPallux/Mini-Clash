import type { EntitySnap, SimEvent, Snapshot } from '@mini-clash/protocol';

/**
 * Snapshot interpolation (TECH §6): entities render `delayMs` behind the newest
 * snapshot from a short ring of arrivals — 0 offline (worker, ~no jitter),
 * 100 ms online so 20 Hz + network jitter still sample between two real states.
 * Beyond the newest snapshot we extrapolate dead-reckoned up to 100 ms, then
 * freeze (no rubber-banding).
 */

export interface RenderEntity {
  snap: EntitySnap;
  x: number;
  z: number;
  fx: number;
  fz: number;
}

interface Stamped {
  snap: Snapshot;
  at: number;
}

const EXTRAPOLATE_CAP_MS = 100;

export class SnapshotBuffer {
  /** Interpolation delay; MatchRuntime sets 100 for socket transports. */
  delayMs = 0;

  private ring: Stamped[] = [];
  private pendingEvents: SimEvent[] = [];

  push(snap: Snapshot): void {
    this.ring.push({ snap, at: performance.now() });
    if (this.ring.length > 12) this.ring.shift();
    this.pendingEvents.push(...snap.events);
  }

  get current(): Snapshot | null {
    return this.ring.length > 0 ? this.ring[this.ring.length - 1].snap : null;
  }

  drainEvents(): SimEvent[] {
    const out = this.pendingEvents;
    this.pendingEvents = [];
    return out;
  }

  /** Interpolated positions at render time. */
  sample(): RenderEntity[] {
    const n = this.ring.length;
    if (n === 0) return [];
    const newest = this.ring[n - 1];
    if (n === 1) return newest.snap.entities.map(still);

    const renderAt = performance.now() - this.delayMs;

    // Find the pair bracketing renderAt (by arrival time).
    let older = this.ring[n - 2];
    let newer = newest;
    for (let i = n - 1; i > 0; i--) {
      if (this.ring[i - 1].at <= renderAt || i === 1) {
        older = this.ring[i - 1];
        newer = this.ring[i];
        if (this.ring[i - 1].at <= renderAt && renderAt <= this.ring[i].at) break;
        if (this.ring[i].at < renderAt && i === n - 1) break; // beyond newest → extrapolate
      }
    }

    const gap = Math.max(1000 / 60, newer.at - older.at);
    let alpha = (renderAt - older.at) / gap;
    // Cap extrapolation: alpha may exceed 1 when the net stalls — dead-reckon a
    // little, then hold position (freeze beats teleporting back).
    const over = renderAt - newer.at;
    if (over > 0) alpha = 1 + Math.min(over, EXTRAPOLATE_CAP_MS) / gap;
    alpha = Math.max(0, alpha);

    const out: RenderEntity[] = [];
    for (const e of newer.snap.entities) {
      const p = older.snap.entities.find((x) => x.id === e.id);
      if (p && !isTeleport(p, e)) {
        out.push({
          snap: e,
          x: p.x + (e.x - p.x) * alpha,
          z: p.z + (e.z - p.z) * alpha,
          fx: p.fx + (e.fx - p.fx) * alpha,
          fz: p.fz + (e.fz - p.fz) * alpha,
        });
      } else {
        out.push({ snap: e, x: e.x, z: e.z, fx: e.fx, fz: e.fz });
      }
    }
    return out;
  }
}

function still(e: EntitySnap): RenderEntity {
  return { snap: e, x: e.x, z: e.z, fx: e.fx, fz: e.fz };
}

function isTeleport(a: EntitySnap, b: EntitySnap): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz > 9; // respawns / switches snap instead of sliding
}
