import { CHAMPIONS, type ChampionDef, UNITS } from '@mini-clash/data';
import type { ChampionSnap, EntitySnap } from '@mini-clash/protocol';
import * as THREE from 'three';
import { paletteColors, useSettings } from '../state/settings';
import { AnimGraph } from './anim';
import { assetMeta, findSocket, instantiate } from './assets';
import type { RenderEntity } from './interp';
import { HealthBar } from './ui3d';

/** Visual actors bound to sim entities. Pooled per kind; all juice lives here. */

const CHAMP_HEIGHT = 1.55;
const DUMMY_HEIGHT = 1.5;

export interface Actor {
  root: THREE.Group;
  kind: EntitySnap['kind'];
  update(re: RenderEntity, dt: number, camera: THREE.Camera): void;
  flash(): void;
  dispose(scene: THREE.Scene): void;
}

function normScale(key: string, targetHeight: number, defScale: number): number {
  const bbox = assetMeta(key).bbox;
  const h = bbox ? Math.max(bbox[1], 0.01) : 1;
  return (targetHeight / h) * defScale;
}

/** Emissive flash on every mesh material (hit feedback; obeys the accessibility toggle). */
class Flasher {
  private mats: THREE.MeshToonMaterial[] = [];
  private t = 0;
  constructor(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = m.material as THREE.MeshToonMaterial | THREE.MeshToonMaterial[];
        const list = Array.isArray(mat) ? mat : [mat];
        for (const x of list) {
          if (x.emissive) this.mats.push(x);
        }
      }
    });
  }
  flash(): void {
    if (!useSettings.getState().hitFlash) return;
    this.t = 0.08;
    for (const m of this.mats) {
      m.emissive.setHex(0xffffff);
      m.emissiveIntensity = 0.85;
    }
  }
  update(dt: number): void {
    if (this.t <= 0) return;
    this.t -= dt;
    if (this.t <= 0) {
      for (const m of this.mats) m.emissiveIntensity = 0;
    }
  }
}

/* -------------------------------- Champion -------------------------------- */

class ChampionActor implements Actor {
  kind = 'champion' as const;
  root = new THREE.Group();
  private model!: THREE.Group;
  private anim!: AnimGraph;
  private flasher!: Flasher;
  private bar: HealthBar;
  private def: ChampionDef;
  private lastCast: string | null = null;
  private lastDead = false;
  private yaw = 0;
  private championId: string;

  constructor(snap: ChampionSnap, scene: THREE.Scene, isSelf: boolean) {
    this.def = CHAMPIONS[snap.championId];
    this.championId = snap.championId;
    this.buildModel();
    const colors = paletteColors(useSettings.getState().palette);
    this.bar = new HealthBar(1.5, isSelf ? colors.self : colors.ally);
    this.bar.group.position.y = 2.15;
    this.root.add(this.bar.group);
    scene.add(this.root);
  }

  private buildModel(): void {
    if (this.model) this.root.remove(this.model);
    const { root: model, clips } = instantiate(this.def.visual.model);
    const scale = normScale(this.def.visual.model, CHAMP_HEIGHT, this.def.visual.scale);
    this.model = model;
    this.root.add(model);
    this.anim = new AnimGraph(model, clips, this.def.visual.anim, scale);
    this.flasher = new Flasher(model);

    for (const prop of this.def.visual.props) {
      const { root: propRoot } = instantiate(prop.model);
      // Hand-cannon: barrel only, the carriage stays on the ship.
      if (prop.model === 'pirate/hand-cannon') {
        propRoot.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && !m.name.toLowerCase().includes('cannon')) m.visible = false;
        });
      }
      const socket = findSocket(model, prop.socket);
      propRoot.scale.setScalar(prop.scale ?? 1);
      if (prop.position) propRoot.position.set(...prop.position);
      if (prop.rotationDeg) {
        propRoot.rotation.set(
          (prop.rotationDeg[0] * Math.PI) / 180,
          (prop.rotationDeg[1] * Math.PI) / 180,
          (prop.rotationDeg[2] * Math.PI) / 180,
        );
      }
      socket.add(propRoot);
    }
    this.anim.play('spawn', { pop: 0.5 });
  }

  update(re: RenderEntity, dt: number): void {
    const snap = re.snap as ChampionSnap;

    // Trainer champion switch rebuilds the rig.
    if (snap.championId !== this.championId) {
      this.championId = snap.championId;
      this.def = CHAMPIONS[snap.championId];
      this.buildModel();
    }

    this.root.position.set(re.x, 0, re.z);

    // Leap / knock-up arc (render-only height).
    if (snap.airborne !== undefined) {
      const h = Math.sin(Math.min(1, snap.airborne) * Math.PI) * 1.4;
      this.model.position.y = h;
    } else {
      this.model.position.y = 0;
    }

    // Smooth yaw toward sim facing.
    const targetYaw = Math.atan2(re.fx, re.fz);
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 14);
    this.model.rotation.y = this.yaw;

    // Death / respawn transitions.
    if (snap.dead && !this.lastDead) this.anim.play('death', { pop: -0.3 });
    if (!snap.dead && this.lastDead) {
      this.anim.clearOneShot();
      this.anim.play('spawn', { pop: 0.5 });
    }
    this.lastDead = snap.dead;
    this.model.visible = !snap.dead || this.anim.isPlaying('death');

    // Cast-driven one-shots (fires once per new cast).
    const castKey = snap.casting
      ? `${snap.casting.kind}:${Math.floor(snap.casting.progress * 1000) <= 200 ? 'go' : 'run'}`
      : null;
    if (snap.casting && castKey !== this.lastCast && castKey?.endsWith('go')) {
      const kind = snap.casting.kind;
      if (kind === 'aa') {
        const windup = 1 / Math.max(snap.stats.attackSpeed, 0.1);
        this.anim.play('attack', {
          fitSeconds: Math.max(windup * this.def.attack.windupFrac * 2.4, 0.3),
          pop: 0.12,
        });
      } else if (kind === 'recast') {
        this.anim.play('cast_q_recast', { pop: 0.18 });
      } else {
        this.anim.play(`cast_${kind}`, { pop: 0.18 });
      }
    }
    this.lastCast = castKey;

    if (!snap.dead && !snap.casting) {
      if (snap.dancing) this.anim.setBase('dance');
      else if (snap.speed > 0.25) this.anim.setBase('run', snap.speed / this.def.stats.moveSpeed);
      else this.anim.setBase('idle');
    }

    this.anim.update(dt);
    this.flasher.update(dt);
  }

  updateBar(frac: number, dt: number, camera: THREE.Camera): void {
    this.bar.update(frac, dt, camera);
  }

  flash(): void {
    this.flasher.flash();
  }
  pop(v: number): void {
    this.anim.pop(v);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* --------------------------------- Dummy ---------------------------------- */

class DummyActor implements Actor {
  kind = 'dummy' as const;
  root = new THREE.Group();
  private model: THREE.Group;
  private flasher: Flasher;
  private bar: HealthBar;
  private wobble = 0;
  private lift = 0;

  constructor(snap: EntitySnap & { kind: 'dummy' }, scene: THREE.Scene) {
    const def = UNITS[snap.unitId];
    const { root: model } = instantiate(def.visual.model ?? 'chars-blocky/character-r', {
      tint: def.visual.tint,
      flat: true,
    });
    model.scale.setScalar(
      normScale(def.visual.model ?? 'chars-blocky/character-r', DUMMY_HEIGHT, def.visual.scale),
    );
    this.model = model;
    this.root.add(model);
    this.flasher = new Flasher(model);
    const colors = paletteColors(useSettings.getState().palette);
    this.bar = new HealthBar(1.4, colors.enemy);
    this.bar.group.position.y = 2.0;
    this.root.add(this.bar.group);
    this.root.position.set(snap.x, 0, snap.z);
    this.model.rotation.y = Math.atan2(snap.fx, snap.fz);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number, camera: THREE.Camera): void {
    const snap = re.snap;
    if (snap.kind !== 'dummy') return;
    // Hit shudder + knock-up lift: dummies never move, but they must FEEL hits.
    if (snap.hitPulse > 0.15) this.wobble = Math.min(0.3, this.wobble + dt * 3);
    this.wobble = Math.max(0, this.wobble - dt * 1.4);
    const targetLift = snap.ccKind === 'knockup' ? 0.9 : 0;
    this.lift += (targetLift - this.lift) * Math.min(1, dt * 8);
    this.model.position.y = this.lift;
    this.model.rotation.z = Math.sin(performance.now() / 28) * this.wobble * 0.35;
    this.bar.update(snap.hp / snap.hpMax, dt, camera);
    this.flasher.update(dt);
  }

  flash(): void {
    this.flasher.flash();
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* ---------------------------------- Keg ----------------------------------- */

class KegActor implements Actor {
  kind = 'keg' as const;
  root = new THREE.Group();
  private model: THREE.Group;
  private flasher: Flasher;
  private spark: THREE.PointLight;

  constructor(_snap: EntitySnap & { kind: 'keg' }, scene: THREE.Scene) {
    const { root: model } = instantiate('pirate/barrel');
    model.scale.setScalar(normScale('pirate/barrel', 0.85, 1));
    this.model = model;
    this.root.add(model);
    this.flasher = new Flasher(model);
    this.spark = new THREE.PointLight(0xffa13b, 0, 3);
    this.spark.position.y = 1.0;
    this.root.add(this.spark);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number): void {
    const snap = re.snap;
    if (snap.kind !== 'keg') return;
    this.root.position.set(re.x, 0, re.z);
    if (snap.tossPhase !== undefined && snap.tossPhase < 1) {
      // Lob arc + tumble.
      this.model.position.y = Math.sin(snap.tossPhase * Math.PI) * 1.6;
      this.model.rotation.x += dt * 9;
    } else {
      this.model.position.y = 0;
      this.model.rotation.x = 0;
      // Fuse blink accelerates toward zero.
      const urgency = 1 - Math.min(1, snap.fuseLeft / 2);
      const blink = Math.sin(performance.now() / (140 - urgency * 100)) > 0 ? 1 : 0;
      this.spark.intensity = blink * (0.8 + urgency * 2.2);
      const s = 1 + Math.sin(performance.now() / (150 - urgency * 110)) * 0.05 * (1 + urgency);
      this.model.scale.setScalar(normScale('pirate/barrel', 0.85, 1) * s);
    }
    this.flasher.update(dt);
  }

  flash(): void {
    this.flasher.flash();
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* ---------------------------------- Wall ----------------------------------- */

class WallActor implements Actor {
  kind = 'wall' as const;
  root = new THREE.Group();
  private chunks: THREE.Group[] = [];

  constructor(snap: EntitySnap & { kind: 'wall' }, scene: THREE.Scene) {
    // Rampart = 3 stone chunks across the cast direction, rising with overshoot.
    const across = { x: -snap.fz, z: snap.fx };
    for (let i = -1; i <= 1; i++) {
      const { root: chunk } = instantiate('dungeon/wall-half', { tint: 0xb9c2d4 });
      const s = normScale('dungeon/wall-half', 1.5, 1);
      chunk.scale.setScalar(s);
      chunk.position.set(across.x * i * (snap.length / 3), -1.6, across.z * i * (snap.length / 3));
      chunk.rotation.y = Math.atan2(snap.fx, snap.fz) + Math.PI / 2;
      this.chunks.push(chunk);
      this.root.add(chunk);
    }
    this.root.position.set(snap.x, 0, snap.z);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number): void {
    const snap = re.snap;
    if (snap.kind !== 'wall') return;
    const age = snap.duration - snap.tLeft;
    for (const [i, chunk] of this.chunks.entries()) {
      const delay = Math.abs(i - 1) * 0.06;
      const riseT = Math.min(1, Math.max(0, (age - delay) / 0.28));
      const overshoot = riseT >= 1 ? 0 : Math.sin(riseT * Math.PI) * 0.18;
      let y = -1.6 + riseT * 1.6 + overshoot;
      if (snap.tLeft < 0.3) y = -1.6 + (snap.tLeft / 0.3) * 1.6; // sink out
      chunk.position.y = y;
      void dt;
    }
  }

  flash(): void {}
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* ------------------------------- Projectile -------------------------------- */

class ProjectileActor implements Actor {
  kind = 'projectile' as const;
  root = new THREE.Group();
  private mesh: THREE.Object3D;
  private spin: number;
  private arcHeight: number;

  constructor(snap: EntitySnap & { kind: 'projectile' }, scene: THREE.Scene) {
    if (snap.style === 'def' && snap.projId === 'fathom_q_ball') {
      const { root } = instantiate('pirate/cannon-ball');
      root.scale.setScalar(normScale('pirate/cannon-ball', 0.5, 1));
      this.mesh = root;
      this.spin = 7;
      this.arcHeight = 0.55;
    } else {
      const geo = new THREE.SphereGeometry(snap.size, 12, 10);
      const mat = new THREE.MeshBasicMaterial({ color: snap.color });
      const core = new THREE.Mesh(geo, mat);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(snap.size * 1.9, 12, 10),
        new THREE.MeshBasicMaterial({
          color: snap.color,
          transparent: true,
          opacity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const g = new THREE.Group();
      g.add(core, halo);
      this.mesh = g;
      this.spin = 0;
      this.arcHeight = 0;
    }
    this.root.add(this.mesh);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number): void {
    const snap = re.snap;
    if (snap.kind !== 'projectile') return;
    this.root.position.set(
      re.x,
      0.9 + Math.sin(Math.min(1, snap.travelFrac) * Math.PI) * this.arcHeight,
      re.z,
    );
    if (this.spin) this.mesh.rotation.x += dt * this.spin;
  }

  flash(): void {}
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* --------------------------------- Manager --------------------------------- */

export class ActorManager {
  private actors = new Map<number, Actor>();
  constructor(
    private scene: THREE.Scene,
    private selfPlayerId: number,
  ) {}

  get(id: number): Actor | undefined {
    return this.actors.get(id);
  }

  /** Object roots for pointer picking (target attacks). */
  pickables(): { object: THREE.Object3D; id: number }[] {
    const out: { object: THREE.Object3D; id: number }[] = [];
    for (const [id, a] of this.actors) {
      if (a.kind === 'dummy' || a.kind === 'keg') out.push({ object: a.root, id });
    }
    return out;
  }

  sync(entities: RenderEntity[], dt: number, camera: THREE.Camera): void {
    const seen = new Set<number>();
    for (const re of entities) {
      const snap = re.snap;
      seen.add(snap.id);
      let actor = this.actors.get(snap.id);
      if (!actor) {
        actor =
          snap.kind === 'champion'
            ? new ChampionActor(snap, this.scene, snap.player === this.selfPlayerId)
            : snap.kind === 'dummy'
              ? new DummyActor(snap, this.scene)
              : snap.kind === 'keg'
                ? new KegActor(snap, this.scene)
                : snap.kind === 'wall'
                  ? new WallActor(snap, this.scene)
                  : new ProjectileActor(snap as EntitySnap & { kind: 'projectile' }, this.scene);
        this.actors.set(snap.id, actor);
      }
      actor.update(re, dt, camera);
      if (snap.kind === 'champion') {
        (actor as ChampionActor).updateBar(Math.max(0, snap.hp / snap.hpMax), dt, camera);
      }
    }
    for (const [id, actor] of [...this.actors]) {
      if (!seen.has(id)) {
        actor.dispose(this.scene);
        this.actors.delete(id);
      }
    }
  }

  dispose(): void {
    for (const a of this.actors.values()) a.dispose(this.scene);
    this.actors.clear();
  }
}
