import type { MapDef } from '@mini-clash/data';
import type { MatchStateSnap } from '@mini-clash/protocol';
import * as THREE from 'three';
import { paletteColors, useSettings } from '../state/settings';

/**
 * Bridge-mode environment layer: spawn-barrier energy walls, fountain glow plates
 * and the Overtime/Sudden-Death mood shift. Static dressing (pads, flags, pillars)
 * lives in the map def; this class owns everything that reacts to match state.
 */

interface BarrierWall {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  edge: THREE.Mesh;
  team: number;
  drop: number; // -1 = standing, else seconds since drop started
}

const BARRIER_H = 3.2;

export class BridgeSet {
  private walls: BarrierWall[] = [];
  private fountains: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; team: number }[] = [];
  private t = 0;
  private mood = 0; // 0 normal → 1 overtime → 2 sudden death
  private moodNow = 0;
  private baseFog: THREE.Color;
  private stripes: THREE.Texture;

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

  /** Feed the latest match snapshot (drives barrier + mood transitions). */
  apply(match: MatchStateSnap): void {
    if (match.barrierDown) {
      for (const w of this.walls) {
        if (w.drop < 0) w.drop = 0;
      }
    }
    this.mood = match.suddenDeath ? 2 : match.overtime ? 1 : 0;
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

    // Mood: fog shifts toward hot ember as the match escalates.
    this.moodNow += (this.mood - this.moodNow) * Math.min(1, dt * 0.8);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      const target = new THREE.Color(this.moodNow >= 1.5 ? 0xd96a4a : 0xe0a06a);
      fog.color.copy(this.baseFog.clone().lerp(target, Math.min(1, this.moodNow) * 0.45));
    }
  }

  dispose(): void {
    for (const w of this.walls) {
      if (w.group.parent) this.scene.remove(w.group);
    }
    for (const f of this.fountains) this.scene.remove(f.mesh);
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
