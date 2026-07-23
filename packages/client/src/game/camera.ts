import * as THREE from 'three';
import { useSettings } from '../state/settings';

/**
 * Follow camera (ART_DIRECTION §2): FOV 30, pitch ~52°, leads toward the cursor,
 * critically-damped spring, additive shake respecting the accessibility toggle.
 */

const PITCH = (52 * Math.PI) / 180;
const DIST = 30;
const LEAD = 1.5;

export class FollowCamera {
  private targetX = 0;
  private targetZ = 0;
  private curX = 0;
  private curZ = 0;
  private leadX = 0;
  private leadZ = 0;
  private shakeAmp = 0;
  private shakeT = 0;
  private shakeDur = 0;
  private hitstopUntil = 0;

  constructor(private cam: THREE.PerspectiveCamera) {}

  /** World position of the followed champion. */
  setTarget(x: number, z: number): void {
    this.targetX = x;
    this.targetZ = z;
  }

  snap(): void {
    this.curX = this.targetX;
    this.curZ = this.targetZ;
  }

  /** Cursor ground point → lead offset. */
  setCursor(x: number, z: number): void {
    const dx = x - this.targetX;
    const dz = z - this.targetZ;
    const d = Math.hypot(dx, dz) || 1;
    const lead = Math.min(1, d / 10) * LEAD;
    this.leadX = (dx / d) * lead;
    this.leadZ = (dz / d) * lead;
  }

  shake(power: 's' | 'm' | 'l'): void {
    if (!useSettings.getState().screenShake) return;
    const amp = power === 's' ? 0.08 : power === 'm' ? 0.18 : 0.32;
    const dur = power === 's' ? 0.15 : power === 'm' ? 0.25 : 0.4;
    if (amp >= this.shakeAmp * (1 - this.shakeT / Math.max(this.shakeDur, 0.01))) {
      this.shakeAmp = amp;
      this.shakeDur = dur;
      this.shakeT = 0;
    }
  }

  hitstop(ms: number): void {
    this.hitstopUntil = Math.max(this.hitstopUntil, performance.now() + ms);
  }

  /** Returns the global animation time scale (dips during hit-stop). */
  timeScale(): number {
    return performance.now() < this.hitstopUntil ? 0.05 : 1;
  }

  update(dt: number): void {
    // Critically damped approach.
    const k = 1 - Math.exp(-dt * 7);
    this.curX += (this.targetX + this.leadX - this.curX) * k;
    this.curZ += (this.targetZ + this.leadZ - this.curZ) * k;

    let ox = 0;
    let oz = 0;
    if (this.shakeT < this.shakeDur) {
      this.shakeT += dt;
      const decay = 1 - this.shakeT / this.shakeDur;
      const a = this.shakeAmp * decay * decay;
      ox = (Math.random() * 2 - 1) * a;
      oz = (Math.random() * 2 - 1) * a;
    }

    const y = Math.sin(PITCH) * DIST;
    const back = Math.cos(PITCH) * DIST;
    this.cam.position.set(this.curX + ox, y, this.curZ + back + oz);
    this.cam.lookAt(this.curX + ox, 0, this.curZ + oz);
  }

  /** Raycast a screen point onto the ground plane (y=0). */
  screenToGround(nx: number, ny: number, out: THREE.Vector3): boolean {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return ray.ray.intersectPlane(plane, out) !== null;
  }
}
