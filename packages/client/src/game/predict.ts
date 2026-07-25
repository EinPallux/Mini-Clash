import type { ChampionSnap } from '@mini-clash/protocol';
import type { NavGrid } from '@mini-clash/sim';

/**
 * Client-side movement prediction for the local champion (TECH §6): move orders
 * start walking instantly on the client's own navgrid; the server remains
 * authoritative and echoes the last applied intent seq.
 *
 * Reconciliation compares the authoritative position against the *recent
 * predicted trajectory*, not the current predicted position — a snapshot is one
 * network trip old, so mid-walk the prediction legitimately leads it by
 * speed × RTT. Genuine divergence (collision shove, blocked path, order
 * re-timing) is corrected softly: at most ~10 u/s of error drains per second,
 * so the champion catch-up-slides instead of jumping, and each step glides out
 * over ~100 ms. A hard snap happens only when the server ITSELF jumped between
 * two snapshots (dash, hook, respawn) — walk drift can never look like that.
 *
 * Pure math (no three.js / DOM / wall clock) so the rules are unit-testable.
 */

const VISIBLE_ERROR = 0.25; // u — below this, absorb silently
const PENDING_ERROR = 2.5; // u — while orders are in flight, only correct gross drift
const TELEPORT_ERROR = 8; // u — safety net: prediction lost the plot, snap
const CORRECTION_MS = 100;
const HISTORY_MS = 1500; // trajectory window ≥ any sane RTT
const HISTORY_CAP = 240;
const FIX_RATE = 10; // u/s of error drained by soft corrections
const FIX_FLOOR = 0.1; // u — minimum drain per snapshot (burst arrivals)
const FIX_STEP_CAP = 0.8; // u — hard cap per snapshot (hitchy frames)

interface Trace {
  t: number;
  x: number;
  z: number;
}

export class PredictedSelf {
  private x = 0;
  private z = 0;
  private has = false;
  private path: [number, number][] = [];
  private speed = 0;
  private lastSeq = -1;
  /** Internal clock (ms) fed by update(dt) — keeps the module wall-clock free. */
  private tMs = 0;
  private trace: Trace[] = [];
  /** Last authoritative position — detects server-side jumps (dash/blink). */
  private srvX = 0;
  private srvZ = 0;
  private srvAtMs = 0;
  /** Render-only offset that decays after a correction (the "glide"). */
  private offX = 0;
  private offZ = 0;
  private offT = 0;
  /** Diagnostics: worst single visible correction step / worst raw divergence. */
  maxCorrection = 0;
  maxError = 0;

  constructor(private nav: NavGrid) {}

  /** Local move/attack-move order — starts the predicted walk immediately. */
  order(seq: number, x: number, z: number): void {
    if (!this.has) return;
    this.lastSeq = Math.max(this.lastSeq, seq);
    this.path = this.nav.findPath(this.x, this.z, x, z);
  }

  /** Stop / cast-halt: hold position (server confirms). */
  halt(seq: number): void {
    this.lastSeq = Math.max(this.lastSeq, seq);
    this.path = [];
  }

  /** Advance the predicted walk. */
  update(dt: number): void {
    this.tMs += dt * 1000;
    if (!this.has) return;
    if (this.speed > 0) {
      let budget = this.speed * dt;
      while (budget > 0 && this.path.length > 0) {
        const [tx, tz] = this.path[0];
        const dx = tx - this.x;
        const dz = tz - this.z;
        const d = Math.hypot(dx, dz);
        if (d <= budget) {
          this.x = tx;
          this.z = tz;
          budget -= d;
          this.path.shift();
        } else {
          this.x += (dx / d) * budget;
          this.z += (dz / d) * budget;
          budget = 0;
        }
      }
    }
    this.trace.push({ t: this.tMs, x: this.x, z: this.z });
    while (
      this.trace.length > HISTORY_CAP ||
      (this.trace.length > 0 && this.tMs - this.trace[0].t > HISTORY_MS)
    ) {
      this.trace.shift();
    }
    if (this.offT > 0) this.offT = Math.max(0, this.offT - dt * 1000);
  }

  /** Fold in the authoritative state for our champion. */
  reconcile(snap: ChampionSnap, ackedSeq: number): void {
    this.speed = snap.stats.moveSpeed;
    const snapDtMs = Math.min(1000, Math.max(0, this.tMs - this.srvAtMs));
    const srvJump = this.has ? Math.hypot(snap.x - this.srvX, snap.z - this.srvZ) : 0;
    this.srvX = snap.x;
    this.srvZ = snap.z;
    this.srvAtMs = this.tMs;
    if (!this.has || snap.dead) {
      this.adopt(snap.x, snap.z);
      return;
    }
    // The server itself moved faster than walking allows between snapshots:
    // dash, hook, knockback or respawn. Predicting through it is meaningless.
    if (srvJump > this.speed * (snapDtMs / 1000) * 3 + 0.5) {
      this.adopt(snap.x, snap.z);
      return;
    }
    // The server state is one trip old — find the closest point on our recent
    // trajectory. On-track prediction ⇒ the server rides somewhere behind us on
    // the very path we walked, and this error is ~0.
    let err = Math.hypot(snap.x - this.x, snap.z - this.z);
    let refX = this.x;
    let refZ = this.z;
    for (const p of this.trace) {
      const d = Math.hypot(snap.x - p.x, snap.z - p.z);
      if (d < err) {
        err = d;
        refX = p.x;
        refZ = p.z;
      }
    }
    if (err > TELEPORT_ERROR) {
      this.adopt(snap.x, snap.z);
      return;
    }
    if (this.lastSeq > ackedSeq && err <= PENDING_ERROR) {
      // The server hasn't seen our newest order yet — expected divergence.
      return;
    }
    if (err <= VISIBLE_ERROR) {
      // Invisible drift: absorb a fraction each snapshot.
      this.x += (snap.x - refX) * 0.15;
      this.z += (snap.z - refZ) * 0.15;
      return;
    }
    // Soft correction: shift toward (authority + our forward lead) at a bounded
    // rate, keep walking the same goal, and glide the render over the step.
    this.maxError = Math.max(this.maxError, err);
    const step = Math.min(err, Math.min(FIX_STEP_CAP, FIX_FLOOR + (FIX_RATE * snapDtMs) / 1000));
    const k = step / err;
    const dx = (snap.x - refX) * k;
    const dz = (snap.z - refZ) * k;
    this.maxCorrection = Math.max(this.maxCorrection, Math.hypot(dx, dz));
    const glide = this.offT / CORRECTION_MS;
    this.offX = this.offX * glide - dx;
    this.offZ = this.offZ * glide - dz;
    this.offT = CORRECTION_MS;
    this.x += dx;
    this.z += dz;
    if (this.path.length > 0) {
      const [gx, gz] = this.path[this.path.length - 1];
      this.path = this.nav.findPath(this.x, this.z, gx, gz);
    }
  }

  private adopt(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.has = true;
    this.path = [];
    this.trace = [{ t: this.tMs, x, z }];
    this.offX = 0;
    this.offZ = 0;
    this.offT = 0;
  }

  /** Where to draw the local champion this frame (null before first snapshot). */
  renderPos(): { x: number; z: number } | null {
    if (!this.has) return null;
    const k = this.offT / CORRECTION_MS;
    return { x: this.x + this.offX * k, z: this.z + this.offZ * k };
  }
}
