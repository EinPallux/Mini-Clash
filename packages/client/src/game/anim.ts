import type { AnimMap } from '@mini-clash/data';
import * as THREE from 'three';

/**
 * AnimGraph (TECH §7): base locomotion blend + one-shot action layer + procedural
 * squash-and-stretch, unified over Kenney skinned and node rigs.
 */
export class AnimGraph {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: string | null = null;
  private oneShot: string | null = null;
  private squashV = 0;
  private squash = 1;
  private baseScale: number;

  constructor(
    private root: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private animMap: AnimMap,
    baseScale: number,
  ) {
    this.baseScale = baseScale;
    this.mixer = new THREE.AnimationMixer(root);
    for (const [state, def] of Object.entries(animMap)) {
      const clip = clips.find((c) => c.name === def.clip);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.setLoop(
        def.loop ? THREE.LoopRepeat : THREE.LoopOnce,
        def.loop ? Number.POSITIVE_INFINITY : 1,
      );
      action.clampWhenFinished = !def.loop;
      action.timeScale = def.speed ?? 1;
      this.actions.set(state, action);
    }
    this.mixer.addEventListener('finished', (e) => {
      // Fade the finished clip out. clampWhenFinished holds its last pose at full
      // weight forever otherwise — most visibly, the death clip's lying pose kept
      // blending into every animation after respawn.
      e.action.fadeOut(0.12);
      this.oneShot = null;
    });
  }

  /** Loop states (idle/run/dance). */
  setBase(state: string, timeScale = 1): void {
    if (this.oneShot) return; // action layer owns the body until it finishes
    const action = this.actions.get(state);
    if (!action) return;
    if (this.current !== state) {
      const prev = this.current ? this.actions.get(this.current) : null;
      action.reset().fadeIn(0.1).play();
      prev?.fadeOut(0.1);
      this.current = state;
    }
    action.timeScale = (this.animMap[state]?.speed ?? 1) * timeScale;
  }

  /** One-shot action (cast/attack/hit/spawn/death). Duration stretches to `fitSeconds` when given. */
  play(state: string, opts?: { fitSeconds?: number; pop?: number; lock?: boolean }): void {
    const action = this.actions.get(state);
    if (!action) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    prev?.fadeOut(0.08);
    // A still-running one-shot (interrupted cast, death overriding an attack) must
    // fade too, or its clamped pose keeps polluting the blend.
    if (this.oneShot && this.oneShot !== state) this.actions.get(this.oneShot)?.fadeOut(0.08);
    this.current = null;
    action.reset();
    const clipDur = action.getClip().duration;
    const speedFromDef = this.animMap[state]?.speed ?? 1;
    action.timeScale = opts?.fitSeconds ? clipDur / Math.max(opts.fitSeconds, 0.05) : speedFromDef;
    action.fadeIn(0.06).play();
    this.oneShot = opts?.lock === false ? null : state;
    if (opts?.pop) this.pop(opts.pop);
  }

  isPlaying(state: string): boolean {
    return this.oneShot === state;
  }

  clearOneShot(): void {
    if (this.oneShot) {
      this.actions.get(this.oneShot)?.fadeOut(0.1);
      this.oneShot = null;
      this.current = null;
    }
  }

  /** Squash-and-stretch impulse (positive = stretch up then settle). */
  pop(amount: number): void {
    this.squashV += amount;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    // Spring the squash scale (ART_DIRECTION §7 caps 0.8..1.3).
    const k = 60;
    const damp = 9;
    const accel = -k * (this.squash - 1) - damp * this.squashV;
    this.squashV += accel * dt;
    this.squash = THREE.MathUtils.clamp(this.squash + this.squashV * dt, 0.8, 1.3);
    this.root.scale.set(
      this.baseScale * (2 - this.squash > 1 ? Math.sqrt(2 - this.squash) : 1),
      this.baseScale * this.squash,
      this.baseScale * (2 - this.squash > 1 ? Math.sqrt(2 - this.squash) : 1),
    );
  }
}
