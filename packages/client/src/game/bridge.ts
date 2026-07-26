import { BRIDGE, EVENTS, type MapDef } from '@mini-clash/data';
import type { MatchStateSnap } from '@mini-clash/protocol';
import * as THREE from 'three';
import { paletteColors, useSettings } from '../state/settings';
import { instantiate } from './assets';
import type { FloorLayer } from './renderer';

/**
 * Bridge-mode environment layer: spawn-barrier energy walls, fountain glow plates,
 * the Overtime/Sudden-Death mood shift, and everything the Living Bridge (§9)
 * does to the map — the Flank Isles rising and falling, the Storm Front wall
 * sweeping through, and the deck itself dropping into the void.
 *
 * Static dressing (pads, flags, pillars) lives in the map def; this class owns
 * everything that reacts to match state.
 */

interface BarrierWall {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  edge: THREE.Mesh;
  team: number;
  drop: number; // -1 = standing, else seconds since drop started
}

/** A floor tile (or prop) that the collapse has thrown off the bridge. */
interface FallingTile {
  layer: FloorLayer | null;
  index: number;
  object: THREE.Object3D | null;
  x: number;
  z: number;
  y: number;
  vy: number;
  delay: number;
  spinX: number;
  spinZ: number;
  rx: number;
  rz: number;
}

const BARRIER_H = 3.2;
const ISLE = 0x7fd4ff;
const STORM = 0xbfe4ff;
/** Deck surface sits at y=0; the isles float a touch below it (§9 "platforms"). */
const ISLE_Y = -0.12;

export class BridgeSet {
  private walls: BarrierWall[] = [];
  private fountains: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; team: number }[] = [];
  private t = 0;
  private mood = 0; // 0 normal → 1 overtime → 2 sudden death
  private moodNow = 0;
  private baseFog: THREE.Color;
  private stripes: THREE.Texture;
  /** Flank Isles: built once, hidden until the event raises them (§9). */
  private isles: { group: THREE.Group; sign: number }[] = [];
  private isleT = 0; // 0 = fully down, 1 = fully up
  private isleUp = false;
  private storm: { group: THREE.Group; mats: THREE.MeshBasicMaterial[] } | null = null;
  private stormX: number | null = null;
  private falling: FallingTile[] = [];
  private deck: { layers: FloorLayer[]; props: THREE.Object3D[] } | null = null;
  private deckHalf: number = BRIDGE.collapse.deckHalves[0];
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private vec = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    map: MapDef,
  ) {
    this.baseFog = new THREE.Color(map.lighting.skyColor);
    this.stripes = makeStripeTexture();
    const colors = paletteColors(useSettings.getState().palette);
    const battle = map.battle;
    if (!battle) return;

    for (const gate of battle.gates) {
      const color = gate.team === 0 ? colors.ally : colors.enemy;
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        map: this.stripes,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      // Span the *deck*, not the navgrid: the grid runs out into the void where
      // the Flank Isles rise, and a barrier hanging over open sky reads as a
      // rendering bug rather than a gate.
      const span = (map.floor.deckHalf ?? map.height / 2) * 2 + 2;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(span, BARRIER_H), mat);
      wall.position.y = BARRIER_H / 2;
      wall.rotation.y = Math.PI / 2;
      group.add(wall);
      // Hard light edge along the top so the field reads at a glance.
      const edgeMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, span), edgeMat);
      edge.position.y = BARRIER_H;
      group.add(edge);
      group.position.set(gate.x, 0, gate.z);
      this.scene.add(group);
      this.walls.push({ group, mat, edge, team: gate.team, drop: -1 });
    }

    // Soft glow discs over the fountain plates (heal zone readability).
    for (const spawn of map.spawns) {
      const color = spawn.team === 0 ? colors.ally : colors.enemy;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(4.5, 40), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(spawn.x, 0.04, spawn.z);
      mesh.renderOrder = 30;
      this.scene.add(mesh);
      this.fountains.push({ mesh, mat, team: spawn.team });
    }

    this.buildIsles(map);
    this.buildStorm(map);
  }

  /**
   * Two stone platforms with light-bridge ramps, parked under the void until the
   * event raises them. Built up front rather than on demand: a 60 s window is
   * not long enough to hide a model load, and the rise has to start on the frame
   * the sim says it does.
   */
  private buildIsles(map: MapDef): void {
    const p = EVENTS.flankIsles.params;
    const deckHalf = map.floor.deckHalf ?? BRIDGE.collapse.deckHalves[0];
    const size = map.floor.size;
    for (const sign of [-1, 1] as const) {
      const group = new THREE.Group();
      // Deck tiles laid out to the isle footprint, so the platform reads as the
      // same bridge material that fell away around it.
      for (let x = -p.width / 2 + size / 2; x < p.width / 2; x += size) {
        for (let z = -p.depth / 2 + size / 2; z < p.depth / 2; z += size) {
          const { root } = instantiate(map.floor.tile);
          root.scale.set(size, 1, size);
          root.position.set(x, 0, sign * p.offsetZ + z);
          group.add(root);
        }
      }
      // Chunky rock underside so the isle reads as floating rather than clipped.
      const { root: keel } = instantiate('castle/rocks-large', { tint: 0x8d95a4, flat: true });
      keel.scale.set(p.width * 0.55, 2.2, p.depth * 0.9);
      keel.position.set(0, -1.1, sign * p.offsetZ);
      group.add(keel);

      // Light bridge: an additive ramp from the deck edge to the isle.
      const inner = p.offsetZ - p.depth / 2;
      const span = inner - deckHalf + 1.2;
      const mat = new THREE.MeshBasicMaterial({
        color: ISLE,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ramp = new THREE.Mesh(new THREE.PlaneGeometry(p.bridgeWidth, span), mat);
      ramp.rotation.x = -Math.PI / 2;
      ramp.position.set(0, 0.03, sign * (deckHalf + span / 2 - 0.6));
      ramp.renderOrder = 28;
      group.add(ramp);
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(p.bridgeWidth, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
      );
      rail.position.copy(ramp.position);
      rail.position.y = 0.35;
      group.add(rail);

      group.visible = false;
      group.position.y = -14;
      this.scene.add(group);
      this.isles.push({ group, sign });
    }
  }

  /** The Storm Front band: a full-width wall of light that sweeps end to end. */
  private buildStorm(map: MapDef): void {
    const p = EVENTS.stormFront.params;
    const depth = (map.floor.deckHalf ?? 11) * 2 + 6;
    const group = new THREE.Group();
    const mats: THREE.MeshBasicMaterial[] = [];
    const sheet = (offset: number, opacity: number, height: number): void => {
      const mat = new THREE.MeshBasicMaterial({
        color: STORM,
        transparent: true,
        opacity,
        map: this.stripes,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(depth, height), mat);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(offset, height / 2, 0);
      mesh.renderOrder = 26;
      group.add(mesh);
      mats.push(mat);
    };
    // Three sheets across the band's thickness: the leading edge is brightest,
    // so you can see which way it is coming before it reaches you.
    sheet(-p.depth / 2, 0.34, 4.2);
    sheet(0, 0.2, 3.6);
    sheet(p.depth / 2, 0.26, 4);
    // Ground scorch so the damage footprint is legible from the top-down camera.
    const floorMat = new THREE.MeshBasicMaterial({
      color: STORM,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(p.depth, depth), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.05;
    floor.renderOrder = 27;
    group.add(floor);
    mats.push(floorMat);

    group.visible = false;
    this.scene.add(group);
    this.storm = { group, mats };
  }

  /** Hand over the deck geometry the collapse is allowed to drop. */
  setDeck(deck: { layers: FloorLayer[]; props: THREE.Object3D[] }): void {
    this.deck = deck;
  }

  /** How far the isle platforms have risen, 0..1 (smoke hook — §9 acceptance). */
  isleRise(): number {
    return this.isleT;
  }

  /** Are the isle platforms up in the scene? (smoke hook — §9 acceptance) */
  islesRaised(): boolean {
    return this.isleT > 0.9;
  }

  /** Re-tint gates + fountain plates relative to our seat's team (online the
   * server may put us on team 1 — "ally color" always means OUR side). */
  setSelfTeam(self: 0 | 1): void {
    const colors = paletteColors(useSettings.getState().palette);
    for (const w of this.walls) w.mat.color.set(w.team === self ? colors.ally : colors.enemy);
    for (const f of this.fountains) {
      f.mat.color.set(f.team === self ? colors.ally : colors.enemy);
    }
  }

  /** Feed the latest match snapshot (drives barrier, events, collapse + mood). */
  apply(match: MatchStateSnap): void {
    if (match.barrierDown) {
      for (const w of this.walls) {
        if (w.drop < 0) w.drop = 0;
      }
    }
    this.mood = match.suddenDeath ? 2 : match.overtime ? 1 : 0;

    // Living Bridge (§9). `announced` events are deliberately *not* raised —
    // the 8 s lead-in belongs to the banner and the horn, not to the terrain.
    const live = (kind: string): MatchStateSnap['events'][number] | undefined =>
      match.events.find((e) => e.kind === kind && e.phase === 'active');
    this.isleUp = live('flankIsles') !== undefined;
    const storm = live('stormFront');
    this.stormX = storm ? storm.x : null;

    if (match.deckHalf < this.deckHalf) {
      this.collapseTo(match.deckHalf);
      this.deckHalf = match.deckHalf;
    }
  }

  /**
   * Throw everything outside `half` off the bridge. Tiles are released with a
   * stagger keyed off their position — the strip tears rather than dropping as
   * one slab, which is the difference between a spectacle and a bug.
   */
  private collapseTo(half: number): void {
    const deck = this.deck;
    if (!deck) return;
    for (const layer of deck.layers) {
      layer.positions.forEach(([x, z], index) => {
        if (Math.abs(z) <= half || Math.abs(z) > this.deckHalf + 2.5) return;
        this.falling.push({
          layer,
          index,
          object: null,
          x,
          z,
          y: 0,
          vy: 0,
          // Tear from the outside in, with a per-tile jitter along the span.
          delay: (Math.abs(z) - half) * 0.05 + (Math.abs(x * 7.3) % 1) * 0.5,
          spinX: (((x * 13.1) % 1) - 0.5) * 2.4,
          spinZ: (((z * 17.7) % 1) - 0.5) * 2.4,
          rx: 0,
          rz: 0,
        });
      });
    }
    for (const obj of deck.props) {
      if (Math.abs(obj.position.z) <= half) continue;
      if (this.falling.some((f) => f.object === obj)) continue;
      this.falling.push({
        layer: null,
        index: -1,
        object: obj,
        x: obj.position.x,
        z: obj.position.z,
        y: obj.position.y,
        vy: 0,
        delay: (Math.abs(obj.position.z) - half) * 0.05,
        spinX: (((obj.position.x * 11.3) % 1) - 0.5) * 3,
        spinZ: (((obj.position.z * 19.1) % 1) - 0.5) * 3,
        rx: obj.rotation.x,
        rz: obj.rotation.z,
      });
    }
  }

  /** Advance every falling piece; retire it once it is well below the deck. */
  private updateFalling(dt: number): void {
    if (this.falling.length === 0) return;
    const touched = new Set<FloorLayer>();
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.vy -= 26 * dt;
      f.y += f.vy * dt;
      f.rx += f.spinX * dt;
      f.rz += f.spinZ * dt;
      if (f.object) {
        f.object.position.y = f.y;
        f.object.rotation.x = f.rx;
        f.object.rotation.z = f.rz;
        if (f.y < -40) {
          f.object.visible = false;
          this.falling.splice(i, 1);
        }
        continue;
      }
      const layer = f.layer;
      if (!layer) continue;
      this.euler.set(f.rx, 0, f.rz);
      this.quat.setFromEuler(this.euler);
      this.vec.set(f.x, f.y, f.z);
      this.matrix.compose(this.vec, this.quat, layer.tileScale);
      layer.inst.setMatrixAt(f.index, this.matrix);
      touched.add(layer);
      if (f.y < -40) {
        // Park it at the bottom of the world rather than shrinking the buffer.
        this.vec.set(f.x, -1000, f.z);
        this.matrix.compose(this.vec, this.quat, layer.tileScale);
        layer.inst.setMatrixAt(f.index, this.matrix);
        this.falling.splice(i, 1);
      }
    }
    for (const layer of touched) layer.inst.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.t += dt;
    this.stripes.offset.y = (this.t * 0.35) % 1;

    for (const w of this.walls) {
      if (w.drop >= 0) {
        w.drop += dt;
        const k = Math.min(1, w.drop / 0.6);
        w.group.scale.y = Math.max(0.001, 1 - k);
        w.mat.opacity = 0.3 * (1 - k);
        (w.edge.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
        if (k >= 1 && w.group.parent) this.scene.remove(w.group);
      } else {
        w.mat.opacity = 0.24 + Math.sin(this.t * 2.4) * 0.07;
      }
    }

    for (const f of this.fountains) {
      f.mat.opacity = 0.1 + Math.sin(this.t * 1.6) * 0.04;
    }

    this.updateIsles(dt);
    this.updateStorm();
    this.updateFalling(dt);

    // Mood: fog shifts toward hot ember as the match escalates.
    this.moodNow += (this.mood - this.moodNow) * Math.min(1, dt * 0.8);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      const target = new THREE.Color(this.moodNow >= 1.5 ? 0xd96a4a : 0xe0a06a);
      fog.color.copy(this.baseFog.clone().lerp(target, Math.min(1, this.moodNow) * 0.45));
    }
  }

  /**
   * Raise and lower the isles over the event's own rise window, with an
   * overshoot at the top so a 12-tonne platform lands rather than parks.
   */
  private updateIsles(dt: number): void {
    if (this.isles.length === 0) return;
    const rise = Math.max(0.2, EVENTS.flankIsles.params.riseSeconds);
    const before = this.isleT;
    this.isleT = Math.max(0, Math.min(1, this.isleT + (this.isleUp ? dt : -dt) / rise));
    if (this.isleT === before && (this.isleT === 0 || this.isleT === 1)) return;
    const k = this.isleT;
    // Ease out on the way up, ease in on the way down — heavy things fall fast.
    const eased = this.isleUp ? 1 - (1 - k) ** 3 : k * k;
    const overshoot = this.isleUp && k > 0.75 ? Math.sin((k - 0.75) * 12) * 0.12 * (1 - k) : 0;
    for (const isle of this.isles) {
      isle.group.visible = k > 0.001;
      isle.group.position.y = ISLE_Y - 14 * (1 - eased) + overshoot;
    }
  }

  /** Park the storm band on the sweep position the sim reports. */
  private updateStorm(): void {
    const storm = this.storm;
    if (!storm) return;
    const on = this.stormX !== null;
    storm.group.visible = on;
    if (!on || this.stormX === null) return;
    storm.group.position.x = this.stormX;
    // The whole band flickers together — a lightning wall, not three sheets.
    const flick = 0.82 + Math.sin(this.t * 31) * 0.1 + Math.sin(this.t * 71) * 0.08;
    storm.mats[0].opacity = 0.34 * flick;
    storm.mats[1].opacity = 0.2 * flick;
    storm.mats[2].opacity = 0.26 * flick;
    storm.mats[3].opacity = 0.16 * flick;
  }

  dispose(): void {
    for (const w of this.walls) {
      if (w.group.parent) this.scene.remove(w.group);
    }
    for (const f of this.fountains) this.scene.remove(f.mesh);
    for (const isle of this.isles) this.scene.remove(isle.group);
    if (this.storm) {
      this.scene.remove(this.storm.group);
      for (const m of this.storm.mats) m.dispose();
    }
    this.stripes.dispose();
  }
}

/** Vertical energy stripes, tileable, drawn once to a small canvas. */
function makeStripeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  return tex;
}
