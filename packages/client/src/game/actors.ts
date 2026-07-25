import { AUGMENTS, CHAMPIONS, type ChampionDef, TAG_SWAP, UNITS } from '@mini-clash/data';
import type { ChampionSnap, EntitySnap, MiniSnap, TowerSnap } from '@mini-clash/protocol';
import * as THREE from 'three';
import { paletteColors, useSettings } from '../state/settings';
import { AnimGraph } from './anim';
import { assetMeta, findSocket, instantiate } from './assets';
import type { ParticleSystem } from './fx/particles';
import type { RenderEntity } from './interp';
import { HealthBar } from './ui3d';

/** Visual actors bound to sim entities. Pooled per kind; all juice lives here. */

const CHAMP_HEIGHT = 1.55;
const DUMMY_HEIGHT = 1.5;
const MINI_HEIGHT = 1.05;

export interface Actor {
  root: THREE.Group;
  kind: EntitySnap['kind'];
  update(re: RenderEntity, dt: number, camera: THREE.Camera): void;
  flash(): void;
  dispose(scene: THREE.Scene): void;
}

/** Shared context handed to actors that need team colors, particles or other actors. */
interface ActorCtx {
  selfPlayerId: number;
  selfTeam: number;
  /** Entity id of the local champion this frame (tower-tether warning color). */
  selfEntityId: number | null;
  particles: ParticleSystem | null;
  /** Interpolated position of another entity this frame (tower tethers). */
  posOf: (id: number) => { x: number; z: number } | null;
}

function teamColor(ctx: ActorCtx, team: number, isSelf = false): number {
  const colors = paletteColors(useSettings.getState().palette);
  if (isSelf) return colors.self;
  return team === ctx.selfTeam ? colors.ally : colors.enemy;
}

/** Soft radial glow for halo/glow sprites (an untextured Sprite renders a hard square). */
let glowTex: THREE.Texture | null = null;
function softGlow(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Fade a rig's materials in/out (brush concealment). Materials are per-instance clones. */
class Fader {
  /** Each material keeps its authored opacity (Wisp's spectral 0.55) as the ceiling. */
  private mats: { mat: THREE.MeshToonMaterial; base: number }[] = [];
  private level = 1;
  constructor(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const x of list) {
        const mat = x as THREE.MeshToonMaterial;
        this.mats.push({ mat, base: mat.transparent ? mat.opacity : 1 });
      }
    });
  }
  update(target: number, dt: number): void {
    const next = this.level + (target - this.level) * Math.min(1, dt * 10);
    if (Math.abs(next - this.level) < 0.002) return;
    this.level = next;
    for (const { mat, base } of this.mats) {
      mat.transparent = next < 0.995 || base < 0.995;
      mat.opacity = next * base;
    }
  }
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
  private fader!: Fader;
  private bar: HealthBar;
  private def: ChampionDef;
  private lastCast: string | null = null;
  private lastDead = false;
  private yaw = 0;
  private championId: string;
  private idleFor = 0;
  private nextFidget = 5 + Math.random() * 5;
  /** Tag Swap morph (GAME_DESIGN §7.2): the rig changes at the midpoint so the
   * puff hides the switch; the whole 0.35 s reads as one squash-and-pop. */
  private morphT = 0;
  private morphScale = 1;
  /** Boltz's bubble helmet — glows while the Capacitor is primed. */
  private helmet: THREE.Mesh | null = null;

  private ctx: ActorCtx;

  constructor(snap: ChampionSnap, scene: THREE.Scene, ctx: ActorCtx) {
    this.ctx = ctx;
    this.def = CHAMPIONS[snap.championId];
    this.championId = snap.championId;
    this.buildModel();
    this.bar = new HealthBar(1.5, teamColor(ctx, snap.team, snap.player === ctx.selfPlayerId));
    this.bar.group.position.y = 2.15;
    this.root.add(this.bar.group);
    scene.add(this.root);
  }

  private buildModel(): void {
    if (this.model) this.root.remove(this.model);
    this.helmet = null; // rebuilt below only if the (possibly new) champion wears one
    // White tint forces per-instance material clones — flash/fade must never leak
    // across duplicate champions in an 8-player match.
    // Wisp is a ghost: her body renders spectral (translucent + rim-lit) by design.
    const spectral = this.def.visual.model === 'graveyard/ghost';
    const { root: model, clips } = instantiate(this.def.visual.model, {
      tint: 0xffffff,
      spectral,
    });
    const scale = normScale(this.def.visual.model, CHAMP_HEIGHT, this.def.visual.scale);
    this.model = model;
    this.root.add(model);
    this.anim = new AnimGraph(model, clips, this.def.visual.anim, scale);
    this.flasher = new Flasher(model);
    this.fader = new Fader(model);

    for (const prop of this.def.visual.props) {
      const { root: propRoot } = instantiate(prop.model);
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

    // Bubble helmet (Boltz): a translucent visor dome riding the head bone.
    // `radius`/`y` are authored in WORLD units, so undo the rig's normalization
    // scale — otherwise a 1.96× champion wears a 1.6 u snow globe.
    const helm = this.def.visual.helmet;
    if (helm) {
      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(helm.radius, 18, 14),
        new THREE.MeshPhongMaterial({
          color: helm.color,
          transparent: true,
          opacity: 0.34,
          // Viewed from a top-down camera the specular hotspot lands dead centre,
          // so a hot highlight would blow the whole dome to white — keep it dim.
          shininess: 24,
          specular: 0x5a7a92,
          emissive: new THREE.Color(helm.color).multiplyScalar(0.3),
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      // Rides the model root, not the head bone: bone transforms are driven by
      // the clips (and differ per rig family), so a root-anchored dome is the one
      // placement that is identical in every animation state.
      bubble.scale.setScalar(1 / scale);
      bubble.position.y = helm.y / scale;
      model.add(bubble);
      this.helmet = bubble;
    }

    this.anim.play('spawn', { pop: 0.5 });
  }

  update(re: RenderEntity, dt: number): void {
    const snap = re.snap as ChampionSnap;

    // Tag Swap: the sim flips championId the instant the swap fires, but the
    // rig waits for the morph's midpoint so the puff covers the change.
    const morph = snap.duo?.morphT ?? 0;
    const swapping = morph > 0;
    if (swapping && this.morphT <= 0 && this.ctx.particles) {
      // Swap started: puff at the feet, both palettes mingling.
      this.ctx.particles.burst({
        x: re.x,
        z: re.z,
        y: 0.5,
        count: 16,
        color: 0xffffff,
        color2: teamColor(this.ctx, snap.team, snap.player === this.ctx.selfPlayerId),
        size: 0.4,
        speed: 2.6,
        spread: 360,
        up: 0.7,
        life: 0.45,
        shape: 'puff',
      });
    }
    this.morphT = morph;
    // Squash to nothing at the midpoint, pop back out — the rig swaps inside it.
    const half = TAG_SWAP.morphS / 2;
    this.morphScale = swapping ? Math.abs(morph - half) / half : 1;

    // Champion identity changed (Tag Swap, or the trainer switch): rebuild the
    // rig — mid-morph that lands exactly when the model is squashed flat.
    if (snap.championId !== this.championId) {
      if (swapping && morph > half) return; // wait for the squash to hide it
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

    // Thick Hide (and any future `visual.scale` card) makes the body visibly
    // chonkier — the augment's on-screen tell, read straight off the snapshot.
    let bulk = 1;
    for (const id of snap.augments) {
      for (const eff of AUGMENTS[id]?.effects ?? []) {
        if (eff.k === 'param' && eff.key === 'visual.scale') {
          bulk *= eff.mode === 'add' ? 1 + eff.value : eff.value;
        }
      }
    }

    // Tag Swap squash-and-pop, layered over whatever the anim graph is doing.
    if (this.morphScale < 1) {
      const k = Math.max(0.02, this.morphScale);
      this.model.scale.set(bulk * (1 + (1 - k) * 0.5), bulk * k, bulk * (1 + (1 - k) * 0.5));
    } else if (this.model.scale.y !== bulk) {
      this.model.scale.set(bulk, bulk, bulk);
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
      if (snap.dancing) {
        this.anim.setBase('dance');
        this.idleFor = 0;
      } else if (snap.speed > 0.25) {
        this.anim.setBase('run', snap.speed / this.def.stats.moveSpeed);
        this.idleFor = 0;
      } else {
        this.anim.setBase('idle');
        // Idle fidgets: nothing on stage is a statue (ART_DIRECTION §10).
        this.idleFor += dt;
        if (this.idleFor >= this.nextFidget) {
          this.idleFor = 0;
          this.nextFidget = 6 + Math.random() * 6;
          this.anim.play('fidget', { pop: 0.06 });
        }
      }
    } else {
      this.idleFor = 0;
    }

    // Capacitor primed (Boltz): the visor charges up as the telegraph.
    if (this.helmet) {
      const mat = this.helmet.material as THREE.MeshPhongMaterial;
      const charged = (snap.passive.charged ?? 0) > 0.5 && !snap.dead;
      const target = charged ? 0.62 + Math.sin(performance.now() / 130) * 0.16 : 0.32;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 8);
      mat.emissive = mat.emissive ?? new THREE.Color();
      mat.emissive.setHex(charged ? 0x8fd8ff : 0x000000);
    }

    this.anim.update(dt);
    this.flasher.update(dt);
    // Brush concealment: your own (and allied) champions go translucent while hidden.
    // Enemies never reach this path — the sim omits them from snapshots entirely.
    // Wisp's Sheet Slip cloaks her the same way (visible to her own team only).
    const cloaked = snap.buffs.some((b) => b.id === 'wisp_invis');
    this.fader.update((snap.inBrush || cloaked) && !snap.dead ? 0.4 : 1, dt);
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
  private spark: THREE.PointLight | null = null;
  private modelKey: string;
  private baseScale: number;
  private bob = 0;
  private isDecoy = false;

  constructor(snap: EntitySnap & { kind: 'keg' }, scene: THREE.Scene) {
    // Data-driven body: powder keg, Rattle's skull marker, Wisp's sheet decoy…
    const vis = UNITS[snap.unitId]?.visual;
    this.modelKey = vis?.model ?? 'pirate/barrel';
    this.isDecoy = snap.unitId === 'wisp_decoy';
    const { root: model } = instantiate(this.modelKey, {
      tint: vis?.tint ?? 0xffffff,
      spectral: this.isDecoy,
    });
    this.baseScale = normScale(this.modelKey, this.isDecoy ? 1.45 : 0.85, vis?.scale ?? 1);
    model.scale.setScalar(this.baseScale);
    this.model = model;
    this.root.add(model);
    this.flasher = new Flasher(model);
    if (UNITS[snap.unitId]?.explode) {
      // Only exploding destructibles carry the fuse spark.
      this.spark = new THREE.PointLight(0xffa13b, 0, 3);
      this.spark.position.y = 1.0;
      this.root.add(this.spark);
    }
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
    } else if (this.spark) {
      this.model.position.y = 0;
      this.model.rotation.x = 0;
      // Fuse blink accelerates toward zero.
      const urgency = 1 - Math.min(1, snap.fuseLeft / 2);
      const blink = Math.sin(performance.now() / (140 - urgency * 100)) > 0 ? 1 : 0;
      this.spark.intensity = blink * (0.8 + urgency * 2.2);
      const s = 1 + Math.sin(performance.now() / (150 - urgency * 110)) * 0.05 * (1 + urgency);
      this.model.scale.setScalar(this.baseScale * s);
    } else if (this.isDecoy) {
      // The abandoned sheet: hovers in place, facing where Wisp was — dead still
      // except for a slow haunt-drift. Convincing exactly because it does nothing.
      this.bob += dt;
      this.model.position.y = 0.18 + Math.sin(this.bob * 1.6) * 0.06;
      this.model.rotation.y = Math.atan2(snap.fx, snap.fz) + Math.sin(this.bob * 0.8) * 0.08;
    } else {
      // Marker bodies (Rattle's skull) hover and slow-spin instead of ticking.
      this.bob += dt;
      this.model.position.y = 0.25 + Math.sin(this.bob * 3.2) * 0.08;
      this.model.rotation.y += dt * 1.6;
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

/* ---------------------------------- Mini ----------------------------------- */

class MiniActor implements Actor {
  kind = 'mini' as const;
  root = new THREE.Group();
  private model: THREE.Group;
  private anim: AnimGraph | null = null;
  private flasher: Flasher;
  private bar: HealthBar;
  private yaw: number;
  private lastX: number;
  private lastZ: number;
  private atkTimer = 0;
  private interval: number;
  private roll = 0;
  private isRam: boolean;

  constructor(snap: MiniSnap, scene: THREE.Scene, ctx: ActorCtx) {
    const def = UNITS[snap.unitId];
    const vis = def.visual;
    const key = vis.model ?? 'chars-blocky/character-r';
    this.isRam = snap.miniKind === 'ram';
    // Team-palette uniform: multiply the body toward the team color (soft for allies,
    // hot for enemies — matches health bar language, honors colorblind palettes).
    const tc = new THREE.Color(teamColor(ctx, snap.team));
    const tint = tc.lerp(new THREE.Color(0xffffff), this.isRam ? 0.35 : 0.45).getHex();
    const { root: model, clips } = instantiate(key, { tint });
    const height = this.isRam ? 1.35 : MINI_HEIGHT;
    const scale = normScale(key, height, vis.scale);
    model.scale.setScalar(scale);
    this.model = model;
    this.root.add(model);
    this.flasher = new Flasher(model);
    if (vis.anim && clips.length > 0) {
      this.anim = new AnimGraph(model, clips, vis.anim, scale);
    }
    for (const prop of vis.props ?? []) {
      const { root: propRoot } = instantiate(prop.model);
      propRoot.scale.setScalar(prop.scale ?? 1);
      findSocket(model, prop.socket).add(propRoot);
    }
    this.interval = def.mini?.attackInterval ?? 1.2;
    this.bar = new HealthBar(0.9, teamColor(ctx, snap.team));
    this.bar.group.position.y = this.isRam ? 1.9 : 1.5;
    this.bar.group.visible = false;
    this.root.add(this.bar.group);
    this.yaw = Math.atan2(snap.fx, snap.fz);
    this.lastX = snap.x;
    this.lastZ = snap.z;
    this.root.position.set(snap.x, 0, snap.z);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number, camera: THREE.Camera): void {
    const snap = re.snap;
    if (snap.kind !== 'mini') return;
    this.root.position.set(re.x, 0, re.z);

    const moved = Math.hypot(re.x - this.lastX, re.z - this.lastZ);
    const speed = dt > 0 ? moved / dt : 0;
    this.lastX = re.x;
    this.lastZ = re.z;

    const targetYaw = Math.atan2(re.fx, re.fz);
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 10);
    this.model.rotation.y = this.yaw;

    this.atkTimer = Math.max(0, this.atkTimer - dt);
    if (this.anim) {
      if (snap.attacking && this.atkTimer <= 0) {
        this.anim.play('attack', { fitSeconds: Math.min(this.interval * 0.7, 0.6), pop: 0.1 });
        this.atkTimer = this.interval;
      }
      this.anim.setBase(speed > 0.4 ? 'run' : 'idle', 1);
      this.anim.update(dt);
    } else if (this.isRam) {
      // Siege engine: wheels do the walking — roll the whole body subtly and thump on hits.
      this.roll += speed * dt * 2.2;
      this.model.position.y = Math.abs(Math.sin(this.roll * 4)) * 0.05;
      if (snap.attacking && this.atkTimer <= 0) {
        this.model.rotation.x = -0.16; // rear back…
        this.atkTimer = this.interval;
      }
      this.model.rotation.x += (0 - this.model.rotation.x) * Math.min(1, dt * 6);
    }

    this.bar.group.visible = snap.hp < snap.hpMax - 0.5;
    if (this.bar.group.visible) this.bar.update(Math.max(0, snap.hp / snap.hpMax), dt, camera);
    this.flasher.update(dt);
  }

  flash(): void {
    this.flasher.flash();
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* ---------------------------------- Tower ---------------------------------- */

const TOWER_SCALE = 1.55;

class TowerActor implements Actor {
  kind = 'tower' as const;
  root = new THREE.Group();
  private parts: { base: THREE.Group; mid: THREE.Group; top: THREE.Group; roof: THREE.Group };
  private ballista: THREE.Group;
  private glow: THREE.Sprite;
  private tether: THREE.Mesh;
  private tetherMat: THREE.MeshBasicMaterial;
  private dome: THREE.Mesh;
  private bar: HealthBar;
  private flasher: Flasher;
  private rubble: THREE.Group;
  private ctx: ActorCtx;
  private roofState: 'on' | 'falling' | 'off' = 'on';
  private roofT = 0;
  private smokeAcc = 0;
  private fellAt = -1;
  private topY: number;

  constructor(snap: TowerSnap, scene: THREE.Scene, ctx: ActorCtx) {
    this.ctx = ctx;
    const tint = new THREE.Color(teamColor(ctx, snap.team))
      .lerp(new THREE.Color(0xffffff), 0.18)
      .getHex();
    const part = (key: string, flatTint?: number): THREE.Group => {
      // flat replaces the material color outright — multiply tints can only darken,
      // which turns the blue Kenney roofs muddy for the red team.
      const { root } = instantiate(
        key,
        flatTint ? { tint: flatTint, flat: true } : { tint: 0xffffff },
      );
      root.scale.setScalar(TOWER_SCALE);
      this.root.add(root);
      return root;
    };
    const h = (key: string): number => (assetMeta(key).bbox?.[1] ?? 1) * TOWER_SCALE;
    const base = part('castle/tower-base');
    const mid = part('castle/tower-mid');
    mid.position.y = h('castle/tower-base');
    const top = part('castle/tower-top');
    top.position.y = mid.position.y + h('castle/tower-mid');
    const roof = part('castle/tower-roof', tint);
    roof.position.y = top.position.y + h('castle/tower-top');
    this.parts = { base, mid, top, roof };
    this.topY = roof.position.y;

    const { root: ballista } = instantiate('td/weapon-ballista', { tint: 0xffffff });
    ballista.scale.setScalar(1.5);
    ballista.position.y = this.topY + 0.1;
    ballista.visible = false; // rides under the roof until it pops at 66%
    this.root.add(ballista);
    this.ballista = ballista;

    // Ramp glow at the weapon mount.
    const glowMat = new THREE.SpriteMaterial({
      map: softGlow(),
      color: 0xffc72e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glow = new THREE.Sprite(glowMat);
    this.glow.scale.setScalar(1.4);
    this.glow.position.y = this.topY + 0.6;
    this.root.add(this.glow);

    // Aggro tether: unit-length box scaled/aimed per frame (cheap, no rebuilds).
    this.tetherMat = new THREE.MeshBasicMaterial({
      color: 0xffc72e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const tetherGeo = new THREE.BoxGeometry(0.09, 0.09, 1);
    tetherGeo.translate(0, 0, 0.5);
    this.tether = new THREE.Mesh(tetherGeo, this.tetherMat);
    this.tether.position.y = this.topY + 0.4;
    this.tether.renderOrder = 60;
    this.root.add(this.tether);

    // Destroy-in-order shield.
    this.dome = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.4, 1),
      new THREE.MeshBasicMaterial({
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.dome.position.y = 1.6;
    this.root.add(this.dome);

    this.rubble = new THREE.Group();
    const { root: r1 } = instantiate('castle/rocks-large');
    r1.scale.setScalar(1.9);
    const { root: r2 } = instantiate('castle/rocks-small');
    r2.scale.setScalar(2.2);
    r2.position.set(0.7, 0, -0.5);
    r2.rotation.y = 1.1;
    this.rubble.add(r1, r2);
    this.rubble.visible = false;
    this.root.add(this.rubble);

    this.flasher = new Flasher(this.root);
    this.bar = new HealthBar(1.7, teamColor(ctx, snap.team));
    this.bar.group.position.y = 3.4;
    this.root.add(this.bar.group);
    this.root.position.set(snap.x, 0, snap.z);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number, camera: THREE.Camera): void {
    const snap = re.snap;
    if (snap.kind !== 'tower') return;
    const frac = Math.max(0, snap.hp / snap.hpMax);

    if (snap.dead) {
      // Collapse: parts sink and shrink into the deck, rubble stays.
      if (this.fellAt < 0) {
        this.fellAt = 0;
        this.rubble.visible = true;
        this.ballista.visible = false;
        this.glow.material.opacity = 0;
        this.tetherMat.opacity = 0;
        this.bar.group.visible = false;
        this.dome.visible = false;
      }
      this.fellAt += dt;
      const t = Math.min(1, this.fellAt / 0.7);
      const sink = 1 - t;
      for (const p of Object.values(this.parts)) {
        p.scale.setScalar(TOWER_SCALE * Math.max(0.001, sink));
        p.visible = t < 1;
      }
      this.parts.roof.visible = false;
      return;
    }

    // Roof pops off at 66% — the ballista underneath takes over.
    if (this.roofState === 'on' && frac < 0.66) {
      this.roofState = 'falling';
      this.roofT = 0;
      this.ballista.visible = true;
    }
    if (this.roofState === 'falling') {
      this.roofT += dt;
      const t = this.roofT;
      this.parts.roof.position.y = this.topY + t * 2.2 - t * t * 7;
      this.parts.roof.rotation.x = t * 2.4;
      this.parts.roof.rotation.z = t * 1.7;
      this.parts.roof.position.x = t * 1.6;
      if (this.parts.roof.position.y < -3) {
        this.parts.roof.visible = false;
        this.roofState = 'off';
      }
    }

    // Heavy damage: lean + chimney smoke.
    if (frac < 0.33) {
      this.parts.top.rotation.z = -0.06;
      this.parts.mid.rotation.z = 0.035;
      this.smokeAcc += dt;
      if (this.smokeAcc > 0.22 && this.ctx.particles) {
        this.smokeAcc = 0;
        this.ctx.particles.burst({
          x: re.x,
          y: this.topY - 0.4,
          z: re.z,
          count: 2,
          color: 0x5a5f6b,
          color2: 0x8a94a6,
          size: 0.3,
          speed: 0.4,
          up: 1.6,
          life: 1.4,
          gravity: -0.4,
          shape: 'puff',
        });
      }
    }

    // Aggro tether + ballista aim.
    const targetPos = snap.aggro !== null ? this.ctx.posOf(snap.aggro) : null;
    if (targetPos) {
      const dx = targetPos.x - re.x;
      const dz = targetPos.z - re.z;
      const len = Math.hypot(dx, dz);
      this.tether.scale.z = len;
      this.tether.rotation.y = Math.atan2(dx, dz);
      this.tether.rotation.x = Math.atan2(this.tether.position.y - 0.9, len);
      const onSelf = this.aggroIsSelf(snap);
      this.tetherMat.opacity = onSelf ? 0.75 : 0.22;
      this.tetherMat.color.setHex(onSelf ? 0xff5a3c : 0xffc72e);
      this.ballista.rotation.y = Math.atan2(dx, dz);
    } else {
      this.tetherMat.opacity = Math.max(0, this.tetherMat.opacity - dt * 4);
    }
    this.glow.material.opacity = Math.min(0.7, snap.ramp * 0.12);
    this.glow.scale.setScalar(1.1 + Math.min(1.2, snap.ramp * 0.2));

    this.dome.visible = snap.invulnerable;
    if (snap.invulnerable) {
      const pulse = 0.12 + Math.sin(performance.now() / 400) * 0.04;
      (this.dome.material as THREE.MeshBasicMaterial).opacity = pulse;
      this.dome.rotation.y += dt * 0.3;
    }

    this.bar.group.visible = !snap.invulnerable;
    if (this.bar.group.visible) this.bar.update(frac, dt, camera);
    this.flasher.update(dt);
  }

  private aggroIsSelf(snap: TowerSnap): boolean {
    return snap.aggro !== null && snap.aggro === this.ctx.selfEntityId;
  }

  flash(): void {
    this.flasher.flash();
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* ---------------------------------- Core ------------------------------------ */

class CoreActor implements Actor {
  kind = 'core' as const;
  root = new THREE.Group();
  private crystal: THREE.Group;
  private dome: THREE.Mesh;
  private halo: THREE.Sprite;
  private bar: HealthBar;
  private flasher: Flasher;
  private bob = 0;
  private wasInvulnerable: boolean;
  private deadT = -1;

  constructor(snap: EntitySnap & { kind: 'core' }, scene: THREE.Scene, ctx: ActorCtx) {
    const team = teamColor(ctx, snap.team);
    const { root: plinth } = instantiate('castle/core-base', {
      tint: new THREE.Color(team).lerp(new THREE.Color(0xffffff), 0.6).getHex(),
    });
    plinth.scale.setScalar(2.6);
    this.root.add(plinth);

    const { root: crystal } = instantiate('td/crystal', {
      tint: new THREE.Color(team).lerp(new THREE.Color(0xffffff), 0.35).getHex(),
      flat: true,
    });
    crystal.scale.setScalar(3.1);
    crystal.position.y = 3.1;
    this.crystal = crystal;
    this.root.add(crystal);

    const haloMat = new THREE.SpriteMaterial({
      map: softGlow(),
      color: team,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new THREE.Sprite(haloMat);
    this.halo.scale.setScalar(3.4);
    this.halo.position.y = 3.5;
    this.root.add(this.halo);

    this.dome = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.2, 1),
      new THREE.MeshBasicMaterial({
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.dome.position.y = 2.4;
    this.root.add(this.dome);

    this.flasher = new Flasher(this.root);
    this.bar = new HealthBar(2.2, team);
    this.bar.group.position.y = 5.6;
    this.root.add(this.bar.group);
    this.wasInvulnerable = snap.invulnerable;
    this.root.position.set(snap.x, 0, snap.z);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number, camera: THREE.Camera): void {
    const snap = re.snap;
    if (snap.kind !== 'core') return;

    if (snap.hp <= 0) {
      // Destruction: crystal implodes then vanishes; the FX timeline carries the burst.
      if (this.deadT < 0) this.deadT = 0;
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.5);
      this.crystal.scale.setScalar(3.1 * (1 - t));
      this.crystal.rotation.y += dt * 14;
      this.halo.material.opacity = 0.35 * (1 - t);
      this.dome.visible = false;
      this.bar.group.visible = false;
      return;
    }

    this.bob += dt;
    this.crystal.position.y = 3.1 + Math.sin(this.bob * 1.4) * 0.18;
    this.crystal.rotation.y += dt * 0.7;
    const pulse = 0.3 + Math.sin(this.bob * 2.1) * 0.1;
    this.halo.material.opacity = snap.invulnerable ? 0.16 : pulse;

    // Exposure moment: shield shatters, crystal flares hot.
    if (this.wasInvulnerable && !snap.invulnerable) {
      this.flasher.flash();
    }
    this.wasInvulnerable = snap.invulnerable;
    this.dome.visible = snap.invulnerable;
    if (snap.invulnerable) {
      (this.dome.material as THREE.MeshBasicMaterial).opacity =
        0.14 + Math.sin(performance.now() / 500) * 0.04;
      this.dome.rotation.y += dt * 0.25;
    }

    this.bar.group.visible = !snap.invulnerable;
    if (this.bar.group.visible) this.bar.update(Math.max(0, snap.hp / snap.hpMax), dt, camera);
    this.flasher.update(dt);
  }

  flash(): void {
    this.flasher.flash();
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* ----------------------------------- Orb ------------------------------------ */

class OrbActor implements Actor {
  kind = 'orb' as const;
  root = new THREE.Group();
  private shell: THREE.Mesh;
  private halo: THREE.Sprite;
  private t = Math.random() * 6;

  constructor(snap: EntitySnap & { kind: 'orb' }, scene: THREE.Scene) {
    this.shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshBasicMaterial({
        color: 0x6fe0a8,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2, 1),
      new THREE.MeshBasicMaterial({ color: 0xf2fff6 }),
    );
    this.shell.add(core);
    const haloMat = new THREE.SpriteMaterial({
      map: softGlow(),
      color: 0x6fe0a8,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new THREE.Sprite(haloMat);
    this.halo.scale.setScalar(1.7);
    this.root.add(this.shell, this.halo);
    this.root.position.set(snap.x, 0, snap.z);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number): void {
    this.t += dt;
    this.root.position.set(re.x, 0, re.z);
    const y = 0.9 + Math.sin(this.t * 2.2) * 0.16;
    this.shell.position.y = y;
    this.halo.position.y = y;
    this.shell.rotation.y += dt * 1.3;
    this.shell.rotation.x += dt * 0.6;
    this.halo.material.opacity = 0.32 + Math.sin(this.t * 3.1) * 0.12;
  }

  flash(): void {}
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* ---------------------------------- Flower ---------------------------------- */

class FlowerActor implements Actor {
  kind = 'flower' as const;
  root = new THREE.Group();
  private model: THREE.Group;
  private age = 0;
  private sway = Math.random() * 6;

  constructor(snap: EntitySnap & { kind: 'flower' }, scene: THREE.Scene) {
    const { root: model } = instantiate('nature/flower-purple');
    this.model = model;
    this.model.scale.setScalar(0.01);
    this.root.add(model);
    this.root.position.set(snap.x, 0, snap.z);
    this.root.rotation.y = Math.random() * Math.PI * 2;
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number): void {
    const snap = re.snap;
    if (snap.kind !== 'flower') return;
    this.age += dt;
    this.sway += dt;
    // Sprout pop with a little overshoot, wilt in the final second.
    const grow = Math.min(1, this.age / 0.35);
    const overshoot = grow >= 1 ? 1 : 1 + Math.sin(grow * Math.PI) * 0.25;
    const wilt = Math.min(1, Math.max(0, snap.tLeft) / 0.8);
    this.model.scale.setScalar(Math.max(0.01, 2.4 * grow * overshoot * (0.35 + 0.65 * wilt)));
    this.model.rotation.z = Math.sin(this.sway * 2.4) * 0.07;
  }

  flash(): void {}
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* ----------------------------------- Zone ----------------------------------- */

/** Per-variant look: Sylva's garden, Boltz's dome + pod bunker, Wisp's cursed ground. */
const ZONE_STYLE = {
  garden: { ring: 0x8ade6a, disc: 0x5da84b, discOpacity: 0.16 },
  dome: { ring: 0x8fd8ff, disc: 0x8fd8ff, discOpacity: 0.1 },
  pod: { ring: 0xffb14b, disc: 0xff9a3c, discOpacity: 0.12 },
  curse: { ring: 0x8a5fb0, disc: 0x3a2450, discOpacity: 0.3 },
} as const;

class ZoneActor implements Actor {
  kind = 'zone' as const;
  root = new THREE.Group();
  private ring: THREE.Mesh;
  private disc: THREE.Mesh;
  /** Boltz W: the hex shell that pops projectiles, plus its facet wireframe. */
  private shell: THREE.Mesh | null = null;
  private facets: THREE.Mesh | null = null;
  /** Boltz R: the physical bunker that lands, holds, then launches away. */
  private pod: THREE.Group | null = null;
  private variant: NonNullable<EntitySnap & { kind: 'zone' }>['variant'];
  private t = 0;

  constructor(snap: EntitySnap & { kind: 'zone' }, scene: THREE.Scene) {
    const r = snap.radius;
    this.variant = snap.variant ?? 'garden';
    const style = ZONE_STYLE[this.variant] ?? ZONE_STYLE.garden;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.14, r, 48),
      new THREE.MeshBasicMaterial({
        color: style.ring,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.renderOrder = 40;
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(r - 0.14, 48),
      new THREE.MeshBasicMaterial({
        color: style.disc,
        transparent: true,
        opacity: style.discOpacity,
        // The curse darkens its ground instead of glowing — normal blending reads
        // as a shadow, which is the whole point of "the lights just went out".
        blending: this.variant === 'curse' ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.05;
    this.disc.renderOrder = 39;
    this.root.add(this.ring, this.disc);

    if (this.variant === 'dome') {
      // Faceted energy shield. Additive + DoubleSide stacks front and back faces,
      // so the fill has to stay very low or it reads as a solid white ball; the
      // facet wireframe on top is what actually sells "hex shield".
      this.shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 1),
        new THREE.MeshBasicMaterial({
          color: 0x8fd8ff,
          transparent: true,
          opacity: 0.07,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      this.shell.position.y = r * 0.55;
      this.shell.scale.y = 0.7;
      this.facets = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r * 1.005, 1),
        new THREE.MeshBasicMaterial({
          color: 0xd8f4ff,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          wireframe: true,
        }),
      );
      this.shell.add(this.facets);
      this.root.add(this.shell);
    } else if (this.variant === 'pod') {
      const { root: pod } = instantiate('space/rocket-pod');
      pod.scale.setScalar(normScale('space/rocket-pod', 2.2, 1));
      this.pod = pod;
      this.root.add(pod);
    }

    this.root.position.set(snap.x, 0, snap.z);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number): void {
    const snap = re.snap;
    if (snap.kind !== 'zone') return;
    this.t += dt;
    this.root.position.set(re.x, 0, re.z);
    const closing = Math.min(1, Math.max(0, snap.tLeft) / 0.5);
    const age = snap.duration - snap.tLeft;

    if (this.variant === 'dome' && this.shell) {
      // Inflate with a wobble on arrival, deflate as it expires.
      const inflate = Math.min(1, age / 0.25);
      const wobble = 1 + Math.sin(this.t * 9) * 0.03 * inflate;
      this.shell.scale.set(inflate * wobble, 0.7 * inflate * wobble, inflate * wobble);
      this.shell.rotation.y += dt * 0.6;
      // Additive over the bright sand clips fast (and DoubleSide doubles it), so
      // the volume fill stays whisper-thin — the facet lines carry the read.
      (this.shell.material as THREE.MeshBasicMaterial).opacity =
        (0.045 + Math.sin(this.t * 5) * 0.015) * closing;
      if (this.facets) {
        (this.facets.material as THREE.MeshBasicMaterial).opacity =
          (0.42 + Math.sin(this.t * 5) * 0.12) * closing;
      }
    } else if (this.variant === 'pod' && this.pod) {
      // Slams the last few metres on arrival (the zone spawns exactly at impact),
      // rocks itself settled, then re-ignites and launches on the final beat.
      const slam = Math.min(1, age / 0.12);
      const settle = Math.min(1, age / 0.4);
      this.pod.rotation.z = Math.sin(this.t * 9) * 0.06 * (1 - settle);
      this.pod.position.y =
        snap.tLeft < 0.5 ? (0.5 - snap.tLeft) * 14 : (1 - slam) * (1 - slam) * 6;
      this.pod.rotation.y += dt * 0.25;
    } else {
      this.root.rotation.y += dt * 0.5;
    }

    (this.ring.material as THREE.MeshBasicMaterial).opacity =
      (0.7 + Math.sin(this.t * 4) * 0.15) * closing;
    (this.disc.material as THREE.MeshBasicMaterial).opacity =
      ((ZONE_STYLE[this.variant] ?? ZONE_STYLE.garden).discOpacity +
        Math.sin(this.t * 2.3) * 0.04) *
      closing;
  }

  flash(): void {}
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* ---------------------------------- Pet ------------------------------------ */

/** Chomp: trots, sprints on errands, and pops when he's been fed. */
class PetActor implements Actor {
  kind = 'pet' as const;
  root = new THREE.Group();
  private model: THREE.Group;
  private anim: AnimGraph | null = null;
  private glow: THREE.Sprite;
  private yaw: number;
  private lastX: number;
  private lastZ: number;
  private baseScale: number;

  constructor(snap: EntitySnap & { kind: 'pet' }, scene: THREE.Scene) {
    const def = UNITS[snap.unitId];
    const key = def?.visual.model ?? 'pets/fox';
    const { root: model, clips } = instantiate(key, { tint: 0xffffff });
    this.baseScale = normScale(key, 0.75, def?.visual.scale ?? 1);
    model.scale.setScalar(this.baseScale);
    this.model = model;
    this.root.add(model);
    if (def?.visual.anim && clips.length > 0) {
      this.anim = new AnimGraph(model, clips, def.visual.anim, this.baseScale);
    }
    // "He's been fed" tell: a warm halo the enemy can read before the next bite.
    const mat = new THREE.SpriteMaterial({
      map: softGlow(),
      color: 0xf2c46a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glow = new THREE.Sprite(mat);
    this.glow.scale.setScalar(1.3);
    this.glow.position.y = 0.4;
    this.root.add(this.glow);
    this.yaw = Math.atan2(snap.fx, snap.fz);
    this.lastX = snap.x;
    this.lastZ = snap.z;
    this.root.position.set(snap.x, 0, snap.z);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number): void {
    const snap = re.snap;
    if (snap.kind !== 'pet') return;
    this.root.position.set(re.x, 0, re.z);
    const speed = dt > 0 ? Math.hypot(re.x - this.lastX, re.z - this.lastZ) / dt : 0;
    this.lastX = re.x;
    this.lastZ = re.z;

    const targetYaw = Math.atan2(re.fx, re.fz);
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 12);
    this.model.rotation.y = this.yaw;

    if (this.anim) {
      this.anim.setBase(speed > 4 ? 'run' : speed > 0.3 ? 'walk' : 'idle', 1);
      this.anim.update(dt);
    }
    // Little bounce while sprinting an errand — he is having a great time.
    this.model.position.y = snap.busy ? Math.abs(Math.sin(performance.now() / 90)) * 0.12 : 0;
    this.glow.material.opacity = snap.empowered
      ? 0.4 + Math.sin(performance.now() / 220) * 0.15
      : 0;
    if (snap.empowered) this.model.scale.setScalar(this.baseScale * 1.12);
    else if (this.model.scale.x !== this.baseScale) this.model.scale.setScalar(this.baseScale);
  }

  flash(): void {}
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* --------------------------------- Pickup ---------------------------------- */

/** Piper's tossed snack: arcs in, then bobs invitingly until someone takes it. */
class PickupActor implements Actor {
  kind = 'pickup' as const;
  root = new THREE.Group();
  private model: THREE.Group;
  private glow: THREE.Sprite;
  private bob = 0;

  constructor(snap: EntitySnap & { kind: 'pickup' }, scene: THREE.Scene) {
    const def = UNITS[snap.unitId];
    const key = def?.visual.model ?? 'dungeon/plate-full';
    const { root: model } = instantiate(key);
    model.scale.setScalar(normScale(key, 0.4, def?.visual.scale ?? 1));
    this.model = model;
    this.root.add(model);
    const mat = new THREE.SpriteMaterial({
      map: softGlow(),
      color: 0xf2c46a,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glow = new THREE.Sprite(mat);
    this.glow.scale.setScalar(1.5);
    this.glow.position.y = 0.35;
    this.root.add(this.glow);
    this.root.position.set(snap.x, 0, snap.z);
    scene.add(this.root);
  }

  update(re: RenderEntity, dt: number): void {
    const snap = re.snap;
    if (snap.kind !== 'pickup') return;
    this.bob += dt;
    this.root.position.set(re.x, 0, re.z);
    if (snap.tossPhase !== undefined && snap.tossPhase < 1) {
      this.model.position.y = Math.sin(snap.tossPhase * Math.PI) * 1.5;
      this.model.rotation.x += dt * 7;
    } else {
      this.model.position.y = 0.18 + Math.sin(this.bob * 3.4) * 0.06;
      this.model.rotation.y += dt * 1.4;
      this.model.rotation.x = 0;
    }
    // Urgency as the fox tax approaches.
    const urgency = 1 - Math.min(1, Math.max(0, snap.tLeft) / 2);
    this.glow.material.opacity = 0.4 + Math.sin(this.bob * (6 + urgency * 10)) * 0.2;
  }

  flash(): void {}
  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }
}

/* --------------------------------- Manager --------------------------------- */

export class ActorManager {
  private actors = new Map<number, Actor>();
  private positions = new Map<number, { x: number; z: number }>();
  private teams = new Map<number, number>();
  private ctx: ActorCtx;

  constructor(
    private scene: THREE.Scene,
    selfPlayerId: number,
    selfTeam = 0,
    particles: ParticleSystem | null = null,
  ) {
    this.ctx = {
      selfPlayerId,
      selfTeam,
      selfEntityId: null,
      particles,
      posOf: (id) => this.positions.get(id) ?? null,
    };
  }

  get(id: number): Actor | undefined {
    return this.actors.get(id);
  }

  /** Online, the server assigns our seat after connect — update before first sync. */
  setSelf(playerId: number, team: 0 | 1): void {
    this.ctx.selfPlayerId = playerId;
    this.ctx.selfTeam = team;
  }

  /** Object roots for pointer picking (target attacks): attackable ENEMY units only —
   * friendly bodies must never swallow a move click. */
  pickables(): { object: THREE.Object3D; id: number }[] {
    const out: { object: THREE.Object3D; id: number }[] = [];
    for (const [id, a] of this.actors) {
      const attackable =
        a.kind === 'dummy' ||
        a.kind === 'keg' ||
        a.kind === 'mini' ||
        a.kind === 'tower' ||
        a.kind === 'core' ||
        a.kind === 'champion';
      if (!attackable) continue;
      const team = this.teams.get(id);
      if (a.kind === 'dummy' || a.kind === 'keg' || team !== this.ctx.selfTeam) {
        out.push({ object: a.root, id });
      }
    }
    return out;
  }

  sync(entities: RenderEntity[], dt: number, camera: THREE.Camera): void {
    // Position pass first so cross-actor lookups (tower tethers) see this frame.
    this.positions.clear();
    this.teams.clear();
    this.ctx.selfEntityId = null;
    for (const re of entities) {
      this.positions.set(re.snap.id, { x: re.x, z: re.z });
      this.teams.set(re.snap.id, re.snap.team);
      if (re.snap.kind === 'champion' && re.snap.player === this.ctx.selfPlayerId) {
        this.ctx.selfEntityId = re.snap.id;
      }
    }

    const seen = new Set<number>();
    for (const re of entities) {
      const snap = re.snap;
      seen.add(snap.id);
      let actor = this.actors.get(snap.id);
      if (!actor) {
        actor = this.create(snap);
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

  private create(snap: EntitySnap): Actor {
    switch (snap.kind) {
      case 'champion':
        return new ChampionActor(snap, this.scene, this.ctx);
      case 'dummy':
        return new DummyActor(snap, this.scene);
      case 'keg':
        return new KegActor(snap, this.scene);
      case 'wall':
        return new WallActor(snap, this.scene);
      case 'mini':
        return new MiniActor(snap, this.scene, this.ctx);
      case 'tower':
        return new TowerActor(snap, this.scene, this.ctx);
      case 'core':
        return new CoreActor(snap, this.scene, this.ctx);
      case 'orb':
        return new OrbActor(snap, this.scene);
      case 'flower':
        return new FlowerActor(snap, this.scene);
      case 'zone':
        return new ZoneActor(snap, this.scene);
      case 'pet':
        return new PetActor(snap, this.scene);
      case 'pickup':
        return new PickupActor(snap, this.scene);
      default:
        return new ProjectileActor(snap as EntitySnap & { kind: 'projectile' }, this.scene);
    }
  }

  dispose(): void {
    for (const a of this.actors.values()) a.dispose(this.scene);
    this.actors.clear();
  }
}
