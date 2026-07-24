import { CHAMPION_LIST, CHAMPIONS, SHATTERBRIDGE_MAP, TRAINING_MAP } from '@mini-clash/data';
import type {
  ChampionSnap,
  MatchPlayerConfig,
  PingKind,
  SimEvent,
  TrainerCmd,
} from '@mini-clash/protocol';
import * as THREE from 'three';
import { paletteColors, useSettings } from '../state/settings';
import { ActorManager } from './actors';
import { loadManifest, preload } from './assets';
import { playCue } from './audio';
import { BridgeSet } from './bridge';
import { FollowCamera } from './camera';
import { ParticleSystem } from './fx/particles';
import { FxRunner } from './fx/runner';
import { useHud } from './hudStore';
import { InputManager } from './input';
import { SnapshotBuffer } from './interp';
import { WorkerLink } from './link';
import { GameRenderer } from './renderer';
import { AimIndicator, DamageNumbers, DecalPool, RingPool, SweepPool } from './ui3d';

/** MatchRuntime: owns the render loop, systems, worker sim and their lifecycles. */

const SELF_PLAYER = 1;
export type MatchMode = 'training' | 'bridge';

const BOT_NAMES = ['Krag', 'Nyx', 'Piston', 'Moxie', 'Thorn', 'Ember', 'Gruff', 'Fizz'];

/** 7 bot seats for Bridge Brawl: fill both teams from the roster, no duplicate champs
 * until the pool runs dry. Personalities/tiers live sim-side; Veteran is the default. */
function bridgeRoster(selfChampionId: string): MatchPlayerConfig[] {
  const pool = CHAMPION_LIST.map((c) => c.id).filter((id) => id !== selfChampionId);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const pick = (): string =>
    pool.shift() ?? CHAMPION_LIST[Math.floor(Math.random() * CHAMPION_LIST.length)].id;
  const players: MatchPlayerConfig[] = [{ id: SELF_PLAYER, championId: selfChampionId, team: 0 }];
  for (let i = 0; i < 7; i++) {
    players.push({
      id: SELF_PLAYER + 1 + i,
      championId: pick(),
      team: i < 3 ? 0 : 1,
      bot: 'veteran',
      name: BOT_NAMES[i],
    });
  }
  return players;
}

export class MatchRuntime {
  private renderer!: GameRenderer;
  private camera!: FollowCamera;
  private link!: WorkerLink;
  private input!: InputManager;
  private actors!: ActorManager;
  private particles!: ParticleSystem;
  private rings!: RingPool;
  private decals!: DecalPool;
  private sweeps!: SweepPool;
  private numbers!: DamageNumbers;
  private aim!: AimIndicator;
  private fx!: FxRunner;
  private buffer = new SnapshotBuffer();
  private bridge: BridgeSet | null = null;
  private raf = 0;
  private lastT = 0;
  private lastRender = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private disposed = false;
  private ray = new THREE.Raycaster();
  onEscape: (() => void) | null = null;

  async start(
    canvas: HTMLCanvasElement,
    championId: string,
    onProgress: (p: number) => void,
    mode: MatchMode = 'training',
    roster?: MatchPlayerConfig[],
  ): Promise<void> {
    const map = mode === 'bridge' ? SHATTERBRIDGE_MAP : TRAINING_MAP;
    const manifest = await loadManifest();
    onProgress(0.08);
    const keys = Object.keys(manifest.assets);
    await preload(keys, (done, total) => onProgress(0.08 + (done / total) * 0.62));

    this.renderer = new GameRenderer(canvas);
    await this.renderer.buildEnvironment(map);
    onProgress(0.8);

    this.camera = new FollowCamera(this.renderer.camera);
    this.particles = new ParticleSystem(this.renderer.scene);
    this.rings = new RingPool(this.renderer.scene);
    this.decals = new DecalPool(this.renderer.scene);
    this.sweeps = new SweepPool(this.renderer.scene);
    this.numbers = new DamageNumbers(this.renderer.scene);
    this.actors = new ActorManager(this.renderer.scene, SELF_PLAYER, 0, this.particles);
    if (mode === 'bridge') this.bridge = new BridgeSet(this.renderer.scene, map);
    this.aim = new AimIndicator(
      this.renderer.scene,
      paletteColors(useSettings.getState().palette).ally,
    );
    this.fx = new FxRunner(
      this.renderer.scene,
      this.particles,
      this.rings,
      this.decals,
      this.sweeps,
      this.camera,
      this.actors,
      () => this.selfPos().x,
    );

    this.link = new WorkerLink();
    this.link.onSnapshot = (snap) => this.buffer.push(snap);
    // ?rig=win pre-damages enemy structures AND idles the enemy seats — offline
    // smoke hook so acceptance tests reach the win sequence in ~2 minutes
    // (harmless vs bots, and the v0.3 server ignores rig).
    const rigged =
      mode === 'bridge' && new URLSearchParams(window.location.search).get('rig') === 'win';
    const rig = rigged ? { enemyCoreHp: 1, enemyTowerHp: 1 } : undefined;
    await this.link.start({
      mode,
      seed: (Math.random() * 0xffffffff) >>> 0,
      mapId: map.id,
      rig,
      players:
        mode === 'bridge'
          ? (roster ?? bridgeRoster(championId)).map((p) =>
              rigged && p.team === 1 ? { ...p, bot: undefined } : p,
            )
          : [{ id: SELF_PLAYER, championId, team: 0 }],
    });
    onProgress(0.95);

    this.input = new InputManager(canvas, this.camera, {
      send: (intent) => this.link.send(SELF_PLAYER, intent),
      quickPing: mode === 'bridge' ? () => this.ping('attack') : undefined,
      pickEntity: (nx, ny) => this.pick(nx, ny),
      onEscape: () => this.onEscape?.(),
      moveMarker: (x, z, kind) => {
        const colors = paletteColors(useSettings.getState().palette);
        this.rings.spawn(x, z, kind === 'move' ? colors.ally : colors.enemy, 0.7, 0.4, 0.25);
      },
    });

    const spawn = map.spawns.find((s) => s.team === 0) ?? map.spawns[0];
    this.camera.setTarget(spawn.x, spawn.z);
    this.camera.snap();
    onProgress(1);
    this.lastT = performance.now();
    this.loop(this.lastT);
  }

  private selfSnap(): ChampionSnap | null {
    const snap = this.buffer.current;
    if (!snap) return null;
    for (const e of snap.entities) {
      if (e.kind === 'champion' && e.player === SELF_PLAYER) return e;
    }
    return null;
  }

  private selfPos(): { x: number; z: number } {
    const s = this.selfSnap();
    return s ? { x: s.x, z: s.z } : { x: 0, z: 0 };
  }

  private pick(nx: number, ny: number): number | null {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.renderer.camera);
    const pickables = this.actors.pickables();
    const objects = pickables.map((p) => p.object);
    const hits = this.ray.intersectObjects(objects, true);
    if (hits.length === 0) return null;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      const found = pickables.find((p) => p.object === obj);
      if (found) return found.id;
      obj = obj.parent;
    }
    return null;
  }

  switchChampion(championId: string): void {
    this.link.send(SELF_PLAYER, { t: 'trainer', cmd: { k: 'switchChampion', championId } });
  }

  /** Ping at the current cursor ground position (wheel/quick-ping UI). */
  ping(kind: PingKind): void {
    const g = this.input.cursorGround;
    this.link.send(SELF_PLAYER, { t: 'ping', kind, x: g.x, z: g.z });
  }

  surrender(): void {
    this.link.send(SELF_PLAYER, { t: 'surrender' });
  }

  buy(itemId: string): void {
    this.link.send(SELF_PLAYER, { t: 'buy', itemId });
  }

  buyRelic(relicId: string): void {
    this.link.send(SELF_PLAYER, { t: 'buyRelic', relicId });
  }

  sell(itemId: string): void {
    this.link.send(SELF_PLAYER, { t: 'sell', itemId });
  }

  /** Lane-strip minimap payload (drawn by the HUD at ~10 Hz). */
  minimap(): {
    width: number;
    deckHalf: number;
    marks: { x: number; z: number; kind: string; team: number; self: boolean; dead?: boolean }[];
  } {
    const snap = this.buffer.current;
    const marks: {
      x: number;
      z: number;
      kind: string;
      team: number;
      self: boolean;
      dead?: boolean;
    }[] = [];
    if (snap) {
      for (const e of snap.entities) {
        if (
          e.kind === 'champion' ||
          e.kind === 'tower' ||
          e.kind === 'core' ||
          e.kind === 'orb' ||
          e.kind === 'mini'
        ) {
          marks.push({
            x: e.x,
            z: e.z,
            kind: e.kind,
            team: e.team,
            self: e.kind === 'champion' && e.player === SELF_PLAYER,
            dead: (e.kind === 'champion' || e.kind === 'tower') && e.dead ? true : undefined,
          });
        }
      }
    }
    return { width: SHATTERBRIDGE_MAP.width, deckHalf: 11, marks };
  }

  trainer(cmd: TrainerCmd): void {
    this.link.send(SELF_PLAYER, { t: 'trainer', cmd });
  }

  private seatName(player: number): { name: string; championId: string; team: number } {
    const snap = this.buffer.current;
    for (const e of snap?.entities ?? []) {
      if (e.kind === 'champion' && e.player === player) {
        return {
          name: e.player === SELF_PLAYER ? 'You' : e.name,
          championId: e.championId,
          team: e.team,
        };
      }
    }
    const seat = useHud.getState().seats.find((s2) => s2.player === player);
    return seat
      ? {
          name: seat.player === SELF_PLAYER ? 'You' : seat.name,
          championId: seat.championId,
          team: seat.team,
        }
      : { name: '—', championId: 'rook', team: 0 };
  }

  private handleEvents(events: SimEvent[]): void {
    const hud = useHud.getState();
    for (const ev of events) {
      switch (ev.t) {
        case 'fx':
          this.fx.handle(ev);
          break;
        case 'damage': {
          const big = ev.amount >= 150;
          this.numbers.show(
            ev.x,
            ev.z,
            String(ev.amount),
            ev.dtype === 'physical' ? '#ffa13b' : '#b36bff',
            big,
          );
          break;
        }
        case 'castDenied':
          hud.denied(ev.reason);
          playCue('cast_denied', { bus: 'ui', volume: 0.7 });
          break;
        case 'kill': {
          const victim = this.seatName(ev.victim);
          const killer = ev.killer !== null ? this.seatName(ev.killer) : null;
          hud.addFeed({
            kind: 'kill',
            killerChamp: killer?.championId,
            victimChamp: victim.championId,
            killerName: killer?.name ?? 'The bridge',
            victimName: victim.name,
            team: killer?.team ?? (victim.team === 0 ? 1 : 0),
          });
          break;
        }
        case 'towerDown': {
          // Big moment regardless of position — the fx timeline covers local presentation.
          this.camera.shake('m');
          hud.addFeed({
            kind: 'tower',
            team: ev.byTeam,
            text: `${ev.tier === 'outer' ? 'Outer' : 'Inner'} watchtower down`,
          });
          break;
        }
        case 'purchase':
          if (ev.player === SELF_PLAYER) {
            hud.shopResult(ev.ok, ev.reason);
            playCue(ev.ok ? 'shop_buy' : 'cast_denied', { bus: 'ui', volume: 0.7 });
          }
          break;
        case 'ping': {
          const colors: Record<string, number> = {
            danger: 0xff5a3c,
            attack: 0xffc72e,
            omw: 0x3ba7ff,
            help: 0x6fe0a8,
          };
          const color = colors[ev.kind] ?? 0xffffff;
          this.rings.spawn(ev.x, ev.z, color, 1.6, 0.55, 0.5);
          this.rings.spawn(ev.x, ev.z, color, 0.7, 0.9, 0.35);
          playCue(ev.kind === 'danger' ? 'ping_danger' : 'ping_mark', {
            bus: 'ui',
            volume: 0.8,
          });
          break;
        }
        case 'surrendered':
          hud.addFeed({ kind: 'surrender', team: ev.team, text: 'Surrendered' });
          break;
        case 'matchOver':
          this.camera.shake('l');
          break;
        default:
          break;
      }
    }
  }

  private loop = (t: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    try {
      this.frame(t);
    } catch (err) {
      // A single bad frame must never wedge the match into a black screen loop.
      (globalThis as Record<string, unknown>).__mcError = String(err);
      console.error('frame error', err);
    }
  };

  private frame(t: number): void {
    const cap = useSettings.getState().fpsCap;
    if (cap > 0 && t - this.lastRender < 1000 / cap - 1) return;
    this.lastRender = t;

    const rawDt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    const dt = rawDt * this.camera.timeScale(); // presentation hit-stop

    // FPS meter (0.5s window).
    this.fpsAcc += rawDt;
    this.fpsN++;
    if (this.fpsAcc >= 0.5) {
      useHud.getState().setFps(Math.round(this.fpsN / this.fpsAcc));
      this.fpsAcc = 0;
      this.fpsN = 0;
    }

    this.handleEvents(this.buffer.drainEvents());

    const entities = this.buffer.sample();
    this.actors.sync(entities, dt, this.renderer.camera);

    // Follow + cursor lead.
    const self = entities.find((e) => e.snap.kind === 'champion' && e.snap.player === SELF_PLAYER);
    if (self) this.camera.setTarget(self.x, self.z);
    this.input.update();
    this.camera.setCursor(this.input.cursorGround.x, this.input.cursorGround.z);
    this.camera.update(rawDt);

    // Aim indicators.
    const selfSnap = this.selfSnap();
    if (this.input.aimingSlot && selfSnap && !selfSnap.dead) {
      const def = CHAMPIONS[selfSnap.championId];
      const ability = def.abilities[this.input.aimingSlot];
      const ind = ability.indicator;
      const ox = self?.x ?? selfSnap.x;
      const oz = self?.z ?? selfSnap.z;
      let ax = this.input.cursorGround.x;
      let az = this.input.cursorGround.z;
      if (ability.aim === 'point' || ability.aim === 'skillshot') {
        const d = Math.hypot(ax - ox, az - oz);
        if (d > ability.range) {
          ax = ox + ((ax - ox) / d) * ability.range;
          az = oz + ((az - oz) / d) * ability.range;
        }
      }
      if (ind.kind === 'circle')
        this.aim.show('circle', ox, oz, ax, az, { radius: ind.radius, range: ability.range });
      else if (ind.kind === 'cone')
        this.aim.show('cone', ox, oz, ax, az, { radius: ind.radius, angleDeg: ind.angleDeg });
      else if (ind.kind === 'rect')
        this.aim.show('line', ox, oz, ax, az, {
          length: ind.length,
          width: ind.width,
          range: ability.range,
        });
      else if (ind.kind === 'line')
        this.aim.show('line', ox, oz, ax, az, { length: ind.length, width: ind.width });
      else this.aim.show('point', ox, oz, ax, az, { radius: ind.radius, range: ability.range });
    } else {
      this.aim.hide();
    }

    this.particles.density = useSettings.getState().reducedVfx ? 0.4 : 1;
    this.fx.update(dt);
    this.particles.update(dt, this.renderer.camera);
    this.rings.update(dt);
    this.decals.update(dt);
    this.sweeps.update(dt);
    this.numbers.update(dt);

    const snap = this.buffer.current;
    if (snap) {
      useHud.getState().applySnapshot(snap, SELF_PLAYER);
      this.bridge?.apply(snap.match);
    }
    this.bridge?.update(dt);

    this.renderer.render();

    if (import.meta.env.DEV || (globalThis as { __mcDebugWanted?: boolean }).__mcDebugWanted) {
      (globalThis as Record<string, unknown>).__mcDebug = {
        cam: this.renderer.camera.position.toArray().map((v) => Math.round(v * 10) / 10),
        self: this.selfPos(),
        entities: this.buffer.current?.entities.length ?? 0,
        calls: this.renderer.renderer.info.render.calls,
        tris: this.renderer.renderer.info.render.triangles,
      };
      (globalThis as Record<string, unknown>).__mc = this.renderer;
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.input?.dispose();
    this.link?.dispose();
    this.fx?.dispose();
    this.actors?.dispose();
    this.bridge?.dispose();
    this.renderer?.dispose();
    useHud.getState().reset();
  }
}
