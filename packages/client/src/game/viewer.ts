import { CHAMPIONS, type ChampionDef, FX } from '@mini-clash/data';
import * as THREE from 'three';
import { useSettings } from '../state/settings';
import type { ActorManager } from './actors';
import { AnimGraph } from './anim';
import { findSocket, instantiate, loadManifest, preload } from './assets';
import type { FollowCamera } from './camera';
import { ParticleSystem } from './fx/particles';
import { FxRunner } from './fx/runner';
import { DecalPool, RingPool, SweepPool } from './ui3d';

/**
 * The champion viewer (UI_UX §13: *the kit is the pitch*).
 *
 * A self-contained little scene: one champion on a plinth, draggable, with a
 * button per ability that plays **the same FxTimeline the match plays**. That
 * reuse is the whole point — a preview built from its own bespoke effects would
 * drift from the game within one patch and quietly start lying about what an
 * ability looks like.
 *
 * The runner needs a camera and an actor manager. Here they are stubs: nothing
 * in a viewer should shake, and the only "actor" is the champion standing at
 * the origin. The stubs are narrow on purpose — if `FxRunner` ever needs more
 * from them, this fails to compile rather than silently rendering less.
 */

/** Ability phases, in the order a cast plays them. */
const PHASES = ['windup', 'telegraph', 'cast', 'recast', 'volley', 'land', 'hit', 'explode'];

export type ViewerAction = 'idle' | 'run' | 'attack' | 'q' | 'w' | 'r' | 'entrance';

/**
 * Every model an FX timeline drops on the field.
 *
 * The runner instantiates props straight from the timeline, so a preview that
 * preloaded only the champion would throw the moment an ability tossed a
 * banner. Collected from the data rather than listed by hand, so a new prop in
 * a new timeline is preloaded without anybody remembering to add it here.
 */
export function fxPropModels(keys: string[]): string[] {
  const models = new Set<string>();
  for (const key of keys) {
    for (const e of FX[key]?.events ?? []) {
      if (e.op.t === 'prop') models.add(e.op.model);
    }
  }
  return [...models];
}

/** Which FX keys belong to one slot of one champion, in play order. */
export function fxKeysFor(championId: string, slot: string): string[] {
  const prefix = `${championId}.${slot}.`;
  return Object.keys(FX)
    .filter((k) => k.startsWith(prefix))
    .sort((a, b) => {
      const rank = (k: string): number => {
        const phase = k.slice(prefix.length);
        const i = PHASES.indexOf(phase);
        return i === -1 ? PHASES.length : i;
      };
      return rank(a) - rank(b) || (a < b ? -1 : 1);
    });
}

/**
 * What the runner asks of an actor: where it is, and a hit flash.
 *
 * Kept as a real (tiny) implementation rather than an empty object, because a
 * missing method here surfaces as a runtime crash mid-preview rather than a
 * type error — which is exactly how it was found.
 */
interface StubActor {
  root: THREE.Object3D;
  flash(): void;
}

export class ChampionViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private particles: ParticleSystem;
  private rings: RingPool;
  private decals: DecalPool;
  private sweeps: SweepPool;
  private fx: FxRunner;
  private stage = new THREE.Group();
  private plinth!: THREE.Mesh;
  private rim!: THREE.Mesh;
  private model: THREE.Group | null = null;
  private anim: AnimGraph | null = null;
  private def: ChampionDef | null = null;
  private raf = 0;
  private clock = new THREE.Clock();
  private yaw = 0.5;
  private spin = true;
  private action: ViewerAction = 'idle';
  private actionT = 0;
  private queue: { at: number; key: string }[] = [];
  private elapsed = 0;
  private disposed = false;
  private tint: number | undefined;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;

    // Framed on the champion, not on the room: a MOBA model is about 1.8 u
    // tall, and the arena camera's distance would render it a thumbnail.
    // Starting pose only — `frame()` fits it to each champion once built.
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.camera.position.set(0, 1.85, 4.7);
    this.camera.lookAt(0, 0.92, 0);

    // Three-point-ish lighting, warm key and cool fill: the same read as the
    // arena, without the arena's fog eating the silhouette.
    const key = new THREE.DirectionalLight(0xfff1d0, 2.1);
    key.position.set(3.5, 6, 4);
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.8);
    fill.position.set(-4, 2.5, -2);
    this.scene.add(key, fill, new THREE.HemisphereLight(0xd8e8ff, 0x33251c, 1.05));

    // A plinth so the champion is standing on something rather than floating.
    // Unit-sized here; `frame()` scales it to the model that lands on it.
    this.plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1.15, 0.26, 40),
      new THREE.MeshToonMaterial({ color: 0x2a2f3d }),
    );
    this.plinth.position.y = -0.14;
    this.rim = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.035, 10, 48),
      new THREE.MeshBasicMaterial({ color: 0xffc72e }),
    );
    this.rim.rotation.x = Math.PI / 2;
    this.rim.position.y = -0.01;
    this.stage.add(this.plinth, this.rim);
    this.scene.add(this.stage);

    this.particles = new ParticleSystem(this.scene);
    this.rings = new RingPool(this.scene);
    this.decals = new DecalPool(this.scene);
    this.sweeps = new SweepPool(this.scene);

    const actors = {
      get: (): StubActor | undefined =>
        this.model ? { root: this.model, flash: () => this.flashModel() } : undefined,
    } as unknown as ActorManager;
    const camera = {
      shake: (): void => {},
      hitstop: (): void => {},
    } as unknown as FollowCamera;
    this.fx = new FxRunner(
      this.scene,
      this.particles,
      this.rings,
      this.decals,
      this.sweeps,
      camera,
      actors,
      () => 0,
    );

    canvas.addEventListener('pointerdown', this.onDown);
    this.resize();
  }

  /* ------------------------------- Input --------------------------------- */

  private dragging = false;
  private lastX = 0;

  private onDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.spin = false;
    this.lastX = e.clientX;
    this.canvas.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.yaw -= (e.clientX - this.lastX) * 0.011;
    this.lastX = e.clientX;
  };

  private onUp = (): void => {
    this.dragging = false;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
  };

  /** Hit flash: the same white pop the arena uses, on a timer. */
  private flashT = 0;
  private flashModel(): void {
    this.flashT = 0.14;
  }

  /** Nudge the turntable by keyboard, so the viewer is not mouse-only. */
  nudge(direction: -1 | 1): void {
    this.spin = false;
    this.yaw += direction * 0.35;
  }

  /* ------------------------------ Content -------------------------------- */

  async setChampion(championId: string, tint?: number): Promise<void> {
    const def = CHAMPIONS[championId];
    if (!def || this.disposed) return;
    this.def = def;
    this.tint = tint;
    // The hub can be the first screen to touch the asset pipeline, so the
    // manifest may not be warm yet — the match runtime is not the only caller.
    await loadManifest();
    const timelines = ['aa', 'q', 'w', 'r', 'entrance', 'passive'].flatMap((slot) =>
      fxKeysFor(def.id, slot),
    );
    await preload([
      def.visual.model,
      ...def.visual.props.map((p) => p.model),
      ...fxPropModels(timelines),
    ]);
    if (this.disposed) return;
    this.build();
    this.setAction('idle');
  }

  /** Re-tint without reloading — the palette switcher's live preview. */
  setPalette(tint?: number): void {
    if (this.tint === tint) return;
    this.tint = tint;
    if (this.def) this.build();
  }

  private build(): void {
    const def = this.def;
    if (!def) return;
    if (this.model) {
      this.stage.remove(this.model);
      this.model = null;
    }
    const spectral = def.visual.model === 'graveyard/ghost';
    const { root, clips } = instantiate(def.visual.model, {
      tint: this.tint ?? 0xffffff,
      spectral,
    });
    root.scale.setScalar(def.visual.scale);
    for (const p of def.visual.props) {
      const socket = findSocket(root, p.socket);
      if (!socket) continue;
      const { root: prop } = instantiate(p.model, { tint: this.tint ?? 0xffffff });
      prop.scale.setScalar(p.scale ?? 1);
      if (p.position) prop.position.set(...p.position);
      if (p.rotationDeg) {
        prop.rotation.set(
          THREE.MathUtils.degToRad(p.rotationDeg[0]),
          THREE.MathUtils.degToRad(p.rotationDeg[1]),
          THREE.MathUtils.degToRad(p.rotationDeg[2]),
        );
      }
      socket.add(prop);
    }
    if (def.visual.helmet) {
      const h = def.visual.helmet;
      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(h.radius, 20, 16),
        new THREE.MeshPhysicalMaterial({
          color: h.color,
          transparent: true,
          opacity: 0.32,
          roughness: 0.1,
          transmission: 0.6,
        }),
      );
      bubble.position.y = h.y;
      root.add(bubble);
    }
    this.model = root;
    this.anim = new AnimGraph(root, clips, def.visual.anim, def.visual.scale);
    this.stage.add(root);
    this.frame(root);
  }

  /**
   * Fit the camera and the plinth to whatever was just built.
   *
   * Measured rather than tuned: champion models differ by more than 2× in
   * height once their `visual.scale` is applied, and a fixed camera that
   * flatters Rook leaves Chomp a speck and crops Grukk's head. One `Box3` makes
   * every champion arrive framed the same way.
   */
  private frame(model: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centerY = (box.min.y + box.max.y) / 2;
    const height = Math.max(0.4, size.y);
    const fov = (this.camera.fov * Math.PI) / 180;
    // 1.55× the tight fit: enough air above the head for an ultimate's VFX.
    const distance = (height * 1.55) / (2 * Math.tan(fov / 2));
    this.camera.position.set(0, centerY + height * 0.28, distance);
    this.camera.lookAt(0, centerY, 0);

    const footprint = Math.max(0.5, Math.max(size.x, size.z) * 0.85);
    this.plinth.scale.set(footprint, 1, footprint);
    this.rim.scale.setScalar(footprint);
  }

  /* ------------------------------ Playback ------------------------------- */

  /**
   * Play an ability preview: the animation and the real FX timeline together.
   *
   * Phases are staggered rather than fired at once — a windup that lands on the
   * same frame as its cast reads as one flash instead of a wind-up and a hit.
   */
  setAction(action: ViewerAction): void {
    this.action = action;
    this.actionT = 0;
    this.queue = [];
    if (!this.def) return;
    const anim = this.anim;
    if (anim) {
      const clip =
        action === 'idle'
          ? 'idle'
          : action === 'run'
            ? 'run'
            : action === 'attack'
              ? 'attack'
              : action === 'entrance'
                ? this.def.visual.anim.entrance
                  ? 'entrance'
                  : 'cast_r'
                : `cast_${action}`;
      anim.play(this.def.visual.anim[clip] ? clip : 'idle');
    }
    if (action === 'idle' || action === 'run') return;

    const slot = action === 'attack' ? 'aa' : action === 'entrance' ? 'entrance' : action;
    const keys = fxKeysFor(this.def.id, slot);
    // No timeline for this slot (a purely mechanical ability): the animation
    // still plays, so the button never reads as broken.
    let at = 0;
    for (const key of keys) {
      this.queue.push({ at: this.elapsed + at, key });
      at += 0.28;
    }
  }

  private pump(): void {
    while (this.queue.length > 0 && this.queue[0].at <= this.elapsed) {
      const next = this.queue.shift();
      if (!next) break;
      this.fx.handle({ t: 'fx', key: next.key, x: 0, z: 0, fx: 0, fz: -1, source: 1, target: 1 });
    }
  }

  /* ------------------------------- Frame --------------------------------- */

  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.raf) return;
    this.clock.start();
    const loop = (): void => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.elapsed += dt;
      this.actionT += dt;
      // Idle-out: a one-shot action returns to idle so the viewer is never
      // frozen mid-swing when the player looks away.
      if (this.action !== 'idle' && this.action !== 'run' && this.actionT > 2.2) {
        this.setAction('idle');
      }
      if (this.spin && !this.dragging) this.yaw += dt * 0.35;
      this.stage.rotation.y = this.yaw;
      if (this.flashT > 0) {
        this.flashT = Math.max(0, this.flashT - dt);
        const k = this.flashT / 0.14;
        this.model?.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const mat = m as THREE.MeshToonMaterial;
            if (mat?.emissive) mat.emissive.setScalar(k * 0.5);
          }
        });
      }
      this.anim?.update(dt);
      this.particles.update(dt, this.camera);
      this.rings.update(dt);
      this.decals.update(dt);
      this.sweeps.update(dt);
      this.pump();
      this.fx.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          m?.dispose();
        }
      }
    });
    this.renderer.dispose();
  }

  /** Reduced-VFX honours the same setting the match does. */
  applySettings(): void {
    this.particles.density = useSettings.getState().reducedVfx ? 0.35 : 1;
  }
}
