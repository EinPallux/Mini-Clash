import { championStats } from './stats';
import { dist, norm } from './vec';
import type { Entity, World } from './world';

/** Path-following + soft separation. Facing snaps in-sim; the client smooths visually. */
export function updateMovement(w: World, e: Entity, dt: number): void {
  const c = e.champ;
  if (!c || e.dead) {
    return;
  }
  c.speed = 0;
  if (c.leap || e.airborne > 0) return;
  if (c.cast) return; // windups lock movement (both abilities and attack swings)

  const order = c.order;
  if (!order) return;

  let goalX: number;
  let goalZ: number;
  if (order.kind === 'attackTarget') {
    const t = w.get(order.target);
    if (!t || t.dead) {
      c.order = null;
      return;
    }
    const stats = championStats(e);
    if (dist(e.x, e.z, t.x, t.z) - t.radius <= stats.range) return; // in range: AA system owns the moment
    goalX = t.x;
    goalZ = t.z;
    // Chase: straight-ish path, re-request when target moved.
    if (
      c.path.length === 0 ||
      dist(c.path[c.path.length - 1][0], c.path[c.path.length - 1][1], goalX, goalZ) > 1.2 ||
      c.pathVersion !== w.nav.version
    ) {
      c.path = w.nav.findPath(e.x, e.z, goalX, goalZ);
      c.pathVersion = w.nav.version;
    }
  } else {
    // attackMove pauses while the AA system is engaging (target in acquisition handled there).
    if (order.kind === 'attackMove' && c.aaTarget !== null) return;
    goalX = order.x;
    goalZ = order.z;
    if (c.path.length === 0 || c.pathVersion !== w.nav.version) {
      c.path = w.nav.findPath(e.x, e.z, goalX, goalZ);
      c.pathVersion = w.nav.version;
      if (c.path.length === 0) {
        c.order = null;
        return;
      }
    }
  }

  const stats = championStats(e);
  let remaining = stats.moveSpeed * dt;
  let moved = 0;
  while (remaining > 0.0001 && c.path.length > 0) {
    const [wx, wz] = c.path[0];
    const d = dist(e.x, e.z, wx, wz);
    if (d <= remaining) {
      e.x = wx;
      e.z = wz;
      remaining -= d;
      moved += d;
      c.path.shift();
    } else {
      const [dx, dz] = norm(wx - e.x, wz - e.z);
      e.x += dx * remaining;
      e.z += dz * remaining;
      e.fx = dx;
      e.fz = dz;
      moved += remaining;
      remaining = 0;
    }
  }
  c.speed = moved / dt;

  if (c.path.length === 0 && order.kind === 'move') {
    c.order = null;
  }
}

/** Soft push-out so champions don't stack inside units (dummies/kegs are anchors). */
export function applySeparation(w: World, dt: number): void {
  const movers: Entity[] = [];
  for (const u of w.units()) {
    if (u.kind === 'champion' && !u.dead && !u.champ?.leap) movers.push(u);
  }
  for (const m of movers) {
    for (const other of w.units()) {
      if (other.id === m.id || other.dead) continue;
      const overlap = m.radius + other.radius - dist(m.x, m.z, other.x, other.z);
      if (overlap > 0.01) {
        const [dx, dz] = norm(m.x - other.x, m.z - other.z);
        const push = Math.min(overlap, 4 * dt);
        const nx = m.x + dx * push;
        const nz = m.z + dz * push;
        if (!w.nav.isBlockedAt(nx, nz)) {
          m.x = nx;
          m.z = nz;
        }
      }
    }
  }
}
