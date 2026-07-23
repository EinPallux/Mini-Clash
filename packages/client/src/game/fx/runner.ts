import { FX, type FxOp } from '@mini-clash/data';
import type { SimEvent } from '@mini-clash/protocol';
import * as THREE from 'three';
import { useSettings } from '../../state/settings';
import type { ActorManager } from '../actors';
import { instantiate } from '../assets';
import { playCue } from '../audio';
import type { FollowCamera } from '../camera';
import type { DecalPool, RingPool, SweepPool } from '../ui3d';
import type { ParticleSystem } from './particles';

/** FxRunner: sim fx events → data timelines → visual/audio ops (ART_DIRECTION §6). */

interface Scheduled {
  at: number;
  op: FxOp;
  x: number;
  z: number;
  fx: number;
  fz: number;
  ax: number;
  az: number;
  source?: number;
  target?: number;
}

interface TempProp {
  root: THREE.Group;
  t: number;
  life: number;
  riseFrom?: number;
  sink?: boolean;
  toss?: boolean;
  spinSpeed?: number;
  baseY: number;
}

const warned = new Set<string>();

export class FxRunner {
  private queue: Scheduled[] = [];
  private props: TempProp[] = [];
  private lights: { light: THREE.PointLight; t: number; life: number; peak: number }[] = [];
  private now = 0;

  constructor(
    private scene: THREE.Scene,
    private particles: ParticleSystem,
    private rings: RingPool,
    private decals: DecalPool,
    private sweeps: SweepPool,
    private camera: FollowCamera,
    private actors: ActorManager,
    private getCameraX: () => number,
  ) {}

  handle(ev: Extract<SimEvent, { t: 'fx' }>): void {
    const timeline = FX[ev.key];
    if (!timeline) {
      if (!warned.has(ev.key) && import.meta.env.DEV) {
        warned.add(ev.key);
        console.warn(`no FX timeline for '${ev.key}'`);
      }
      return;
    }
    for (const e of timeline.events) {
      this.queue.push({
        at: this.now + e.time,
        op: e.op,
        x: ev.x,
        z: ev.z,
        fx: ev.fx ?? 1,
        fz: ev.fz ?? 0,
        ax: ev.ax ?? ev.x,
        az: ev.az ?? ev.z,
        source: ev.source,
        target: ev.target,
      });
    }
  }

  private anchor(s: Scheduled): { x: number; z: number } {
    switch (s.op.t === 'sound' || s.op.t === 'shake' || s.op.t === 'hitstop' ? 'origin' : s.op.at) {
      case 'aim':
        return { x: s.ax, z: s.az };
      case 'target': {
        const a = s.target !== undefined ? this.actors.get(s.target) : undefined;
        return a ? { x: a.root.position.x, z: a.root.position.z } : { x: s.x, z: s.z };
      }
      case 'self': {
        const a = s.source !== undefined ? this.actors.get(s.source) : undefined;
        return a ? { x: a.root.position.x, z: a.root.position.z } : { x: s.x, z: s.z };
      }
      default:
        return { x: s.x, z: s.z };
    }
  }

  private withOffset(
    s: Scheduled,
    p: { x: number; z: number },
    offset?: [number, number, number],
  ): { x: number; y: number; z: number } {
    if (!offset) return { x: p.x, y: 0, z: p.z };
    const [right, up, forward] = offset;
    // facing basis: forward = (fx,fz), right = (fz,-fx)
    return {
      x: p.x + s.fz * right + s.fx * forward,
      y: up,
      z: p.z + -s.fx * right + s.fz * forward,
    };
  }

  private fire(s: Scheduled): void {
    const settings = useSettings.getState();
    const reduced = settings.reducedVfx;
    const op = s.op;
    const base = this.anchor(s);
    switch (op.t) {
      case 'burst': {
        const p = this.withOffset(s, base, op.offset);
        this.particles.burst({
          x: p.x,
          y: 0.4 + p.y,
          z: p.z,
          dirX: s.fx,
          dirZ: s.fz,
          count: reduced ? Math.ceil(op.count * 0.4) : op.count,
          color: op.color,
          color2: op.color2,
          size: op.size,
          speed: op.speed,
          spread: op.spread ?? 360,
          up: op.up ?? 0.8,
          life: op.life,
          gravity: op.gravity,
          shape: op.shape ?? 'spark',
        });
        break;
      }
      case 'ring': {
        const p = this.withOffset(s, base, op.offset);
        this.rings.spawn(p.x, p.z, op.color, op.radius, op.life, op.width ?? 0.3);
        break;
      }
      case 'decal': {
        if (reduced) break;
        const p = this.withOffset(s, base, op.offset);
        this.decals.spawn(p.x, p.z, op.kind, op.color, op.radius, op.life);
        break;
      }
      case 'flash': {
        const actor =
          (s.target !== undefined ? this.actors.get(s.target) : undefined) ??
          (s.source !== undefined ? this.actors.get(s.source) : undefined);
        actor?.flash();
        break;
      }
      case 'light': {
        if (reduced || this.lights.length >= 4) break;
        const light = new THREE.PointLight(op.color, 0, op.radius);
        light.position.set(base.x, 1.2, base.z);
        this.scene.add(light);
        this.lights.push({ light, t: 0, life: op.life, peak: op.intensity });
        break;
      }
      case 'shake':
        this.camera.shake(op.power);
        break;
      case 'hitstop':
        this.camera.hitstop(op.ms);
        break;
      case 'sound': {
        const pan = Math.max(-1, Math.min(1, (base.x - this.getCameraX()) / 22));
        playCue(op.cue, { volume: op.volume ?? 1, pan, detune: 0.05 });
        break;
      }
      case 'ribbonSweep':
        this.sweeps.spawn(base.x, base.z, s.fx, s.fz, op.color, op.radius, op.angleDeg, op.life);
        break;
      case 'prop': {
        const p = this.withOffset(s, base, op.offset);
        const spectral = op.model === 'pirate/ship-ghost';
        const { root } = instantiate(op.model, spectral ? { spectral: true } : {});
        root.scale.setScalar(op.scale ?? 1);
        root.position.set(p.x, op.riseFrom ?? p.y, p.z);
        root.rotation.y = Math.atan2(s.fx, s.fz);
        this.scene.add(root);
        this.props.push({
          root,
          t: 0,
          life: op.life,
          riseFrom: op.riseFrom,
          sink: op.sink,
          toss: op.toss,
          spinSpeed: op.spinSpeed,
          baseY: p.y,
        });
        break;
      }
    }
  }

  update(dt: number): void {
    this.now += dt;
    if (this.queue.length > 0) {
      const due = this.queue.filter((q) => q.at <= this.now);
      if (due.length > 0) {
        this.queue = this.queue.filter((q) => q.at > this.now);
        for (const s of due) this.fire(s);
      }
    }

    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      p.t += dt;
      const frac = p.t / p.life;
      if (frac >= 1) {
        this.scene.remove(p.root);
        this.props.splice(i, 1);
        continue;
      }
      if (p.riseFrom !== undefined) {
        const riseT = Math.min(1, p.t / 0.9);
        const ease = 1 - (1 - riseT) ** 3;
        let y = p.riseFrom + (p.baseY - p.riseFrom) * ease;
        if (p.sink && p.life - p.t < 0.9) {
          const sinkT = 1 - (p.life - p.t) / 0.9;
          y = p.baseY + (p.riseFrom - p.baseY) * sinkT * sinkT;
        }
        p.root.position.y = y;
        // Gentle bob while surfaced.
        if (riseT >= 1 && !(p.sink && p.life - p.t < 0.9))
          p.root.position.y += Math.sin(p.t * 2.2) * 0.12;
      }
      if (p.toss) {
        p.root.position.y = p.baseY + Math.sin(Math.min(1, frac * 1.6) * Math.PI) * 1.4;
        p.root.rotation.x += dt * 8;
      }
      if (p.spinSpeed) p.root.rotation.y += dt * p.spinSpeed;
    }

    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.t += dt;
      const frac = l.t / l.life;
      if (frac >= 1) {
        this.scene.remove(l.light);
        this.lights.splice(i, 1);
        continue;
      }
      l.light.intensity = l.peak * (1 - frac) * 14;
    }
  }

  dispose(): void {
    for (const p of this.props) this.scene.remove(p.root);
    for (const l of this.lights) this.scene.remove(l.light);
    this.props = [];
    this.lights = [];
    this.queue = [];
  }
}
