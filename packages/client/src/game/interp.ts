import type { EntitySnap, SimEvent, Snapshot } from '@mini-clash/protocol';

/**
 * Snapshot interpolation: render state samples between the two latest 30Hz snapshots
 * for 60fps+ smoothness. Offline (worker) latency is ~0, so the buffer is just one
 * tick deep; the same structure carries the 100ms network buffer in v0.3.
 */

export interface RenderEntity {
  snap: EntitySnap;
  x: number;
  z: number;
  fx: number;
  fz: number;
}

export class SnapshotBuffer {
  private prev: Snapshot | null = null;
  private latest: Snapshot | null = null;
  private latestAt = 0;
  private pendingEvents: SimEvent[] = [];

  push(snap: Snapshot): void {
    this.prev = this.latest;
    this.latest = snap;
    this.latestAt = performance.now();
    this.pendingEvents.push(...snap.events);
  }

  get current(): Snapshot | null {
    return this.latest;
  }

  drainEvents(): SimEvent[] {
    const out = this.pendingEvents;
    this.pendingEvents = [];
    return out;
  }

  /** Interpolated positions at render time. */
  sample(): RenderEntity[] {
    const latest = this.latest;
    if (!latest) return [];
    const prev = this.prev;
    const tickMs = 1000 / 30;
    const alpha = prev ? Math.min(1, (performance.now() - this.latestAt) / tickMs) : 1;
    const out: RenderEntity[] = [];
    for (const e of latest.entities) {
      const p = prev?.entities.find((x) => x.id === e.id);
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

function isTeleport(a: EntitySnap, b: EntitySnap): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz > 9; // respawns / switches snap instead of sliding
}
