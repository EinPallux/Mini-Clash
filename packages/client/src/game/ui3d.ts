import * as THREE from 'three';

/** In-world WebGL overlays: health bars, damage numbers, telegraphs, rings, decals. */

/* ------------------------------ Health bars ------------------------------ */

const barVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const barFrag = /* glsl */ `
  uniform float fill; uniform float ghost; uniform vec3 color; varying vec2 vUv;
  void main() {
    vec3 bg = vec3(0.05, 0.07, 0.12);
    float border = step(vUv.x, 0.012) + step(0.988, vUv.x) + step(vUv.y, 0.09) + step(0.91, vUv.y);
    vec3 c = bg;
    if (vUv.x < ghost) c = vec3(0.9);
    if (vUv.x < fill) c = color;
    // chunk ticks every 20%
    float tick = step(0.96, fract(vUv.x * 5.0)) * step(vUv.x, fill);
    c = mix(c, c * 0.55, tick);
    c = mix(c, vec3(0.0), clamp(border, 0.0, 1.0) * 0.85);
    gl_FragColor = vec4(c, 0.92);
  }`;

export class HealthBar {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private ghost = 1;

  constructor(width: number, color: number) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: barVert,
      fragmentShader: barFrag,
      uniforms: {
        fill: { value: 1 },
        ghost: { value: 1 },
        color: { value: new THREE.Color(color) },
      },
      transparent: true,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.16), this.mat);
    mesh.renderOrder = 90;
    this.group.add(mesh);
  }

  setColor(color: number): void {
    (this.mat.uniforms.color.value as THREE.Color).set(color);
  }

  update(frac: number, dt: number, camera: THREE.Camera): void {
    this.mat.uniforms.fill.value = frac;
    // Damage-lag ghost segment chases the real value.
    this.ghost = this.ghost > frac ? Math.max(frac, this.ghost - dt * 0.9) : frac;
    this.mat.uniforms.ghost.value = this.ghost;
    this.group.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
  }
}

/* ----------------------------- Damage numbers ---------------------------- */

interface FloatText {
  sprite: THREE.Sprite;
  t: number;
  life: number;
  vy: number;
  baseScale: number;
}

export class DamageNumbers {
  private pool: FloatText[] = [];
  constructor(private scene: THREE.Scene) {}

  show(x: number, z: number, text: string, color: string, big = false): void {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 84;
    const g = canvas.getContext('2d')!;
    g.font = `600 ${big ? 58 : 44}px 'Oswald', 'Arial Narrow', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(10,12,24,0.9)';
    g.strokeText(text, 96, 44);
    g.fillStyle = color;
    g.fillText(text, 96, 44);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    const baseScale = big ? 1.5 : 1.1;
    sprite.scale.set(baseScale * 2.3, baseScale, 1);
    sprite.position.set(x + (Math.random() - 0.5) * 0.6, 1.8, z);
    sprite.renderOrder = 95;
    this.scene.add(sprite);
    this.pool.push({ sprite, t: 0, life: 0.85, vy: 2.2, baseScale });
  }

  update(dt: number): void {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const f = this.pool[i];
      f.t += dt;
      const frac = f.t / f.life;
      if (frac >= 1) {
        this.scene.remove(f.sprite);
        (f.sprite.material.map as THREE.Texture).dispose();
        f.sprite.material.dispose();
        this.pool.splice(i, 1);
        continue;
      }
      // Pop in, drift up, fade out.
      const pop = frac < 0.18 ? 0.6 + (frac / 0.18) * 0.55 : 1.15 - (frac - 0.18) * 0.2;
      f.sprite.scale.set(f.baseScale * 2.3 * pop, f.baseScale * pop, 1);
      f.sprite.position.y += f.vy * dt * (1 - frac * 0.7);
      f.sprite.material.opacity = frac > 0.6 ? 1 - (frac - 0.6) / 0.4 : 1;
    }
  }
}

/* ------------------------------- Telegraphs ------------------------------ */

function areaMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Local-player aim indicators: circle / cone / line + range ring. */
export class AimIndicator {
  readonly group = new THREE.Group();
  private circle: THREE.Mesh;
  private cone: THREE.Mesh;
  private line: THREE.Mesh;
  private rangeRing: THREE.Mesh;

  constructor(scene: THREE.Scene, color: number) {
    this.circle = new THREE.Mesh(new THREE.CircleGeometry(1, 48), areaMat(color, 0.28));
    this.cone = new THREE.Mesh(new THREE.CircleGeometry(1, 32, 0, 1), areaMat(color, 0.28));
    this.line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), areaMat(color, 0.26));
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), areaMat(color, 0.5));
    for (const m of [this.circle, this.cone, this.line, this.rangeRing]) {
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 5;
      this.group.add(m);
    }
    scene.add(this.group);
  }

  hide(): void {
    for (const m of [this.circle, this.cone, this.line, this.rangeRing]) m.visible = false;
  }

  /** All coordinates in world space; facing = unit vector toward aim. */
  show(
    kind: 'circle' | 'cone' | 'line' | 'point',
    originX: number,
    originZ: number,
    aimX: number,
    aimZ: number,
    dims: { radius?: number; angleDeg?: number; length?: number; width?: number; range?: number },
  ): void {
    this.hide();
    const ang = Math.atan2(aimZ - originZ, aimX - originX);
    if (dims.range && dims.range > 0.1) {
      this.rangeRing.visible = true;
      this.rangeRing.position.set(originX, 0.02, originZ);
      this.rangeRing.scale.setScalar(dims.range);
    }
    if (kind === 'circle' || kind === 'point') {
      this.circle.visible = true;
      this.circle.position.set(aimX, 0.03, aimZ);
      this.circle.scale.setScalar(dims.radius ?? 1);
    } else if (kind === 'cone') {
      const arc = ((dims.angleDeg ?? 60) * Math.PI) / 180;
      this.cone.geometry.dispose();
      this.cone.geometry = new THREE.CircleGeometry(dims.radius ?? 2, 32, -arc / 2, arc);
      this.cone.visible = true;
      this.cone.position.set(originX, 0.03, originZ);
      this.cone.rotation.z = -ang;
    } else {
      const len = dims.length ?? 5;
      this.line.visible = true;
      this.line.scale.set(len, dims.width ?? 1, 1);
      this.line.position.set(
        originX + (Math.cos(ang) * len) / 2,
        0.03,
        originZ + (Math.sin(ang) * len) / 2,
      );
      this.line.rotation.z = -ang;
    }
  }
}

/* --------------------------- Rings, decals, marks -------------------------- */

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  life: number;
  radius: number;
  width: number;
}

export class RingPool {
  private items: Ring[] = [];
  constructor(private scene: THREE.Scene) {}

  spawn(x: number, z: number, color: number, radius: number, life: number, width = 0.3): void {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), areaMat(color, 0.85));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    mesh.renderOrder = 6;
    this.scene.add(mesh);
    this.items.push({ mesh, t: 0, life, radius, width });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const r = this.items[i];
      r.t += dt;
      const frac = r.t / r.life;
      if (frac >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.items.splice(i, 1);
        continue;
      }
      const ease = 1 - (1 - frac) * (1 - frac);
      r.mesh.scale.setScalar(0.2 + r.radius * ease);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - frac);
    }
  }
}

function decalTexture(kind: 'crack' | 'scorch' | 'splat'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  if (kind === 'crack') {
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
      g.lineWidth = 4 + Math.random() * 3;
      g.beginPath();
      g.moveTo(0, 0);
      const midR = 22 + Math.random() * 12;
      g.lineTo(Math.cos(a + 0.2) * midR, Math.sin(a + 0.2) * midR);
      g.lineTo(Math.cos(a) * (44 + Math.random() * 16), Math.sin(a) * (44 + Math.random() * 16));
      g.stroke();
    }
  } else {
    const grad = g.createRadialGradient(0, 0, 4, 0, 0, 60);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 60, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

interface Decal {
  mesh: THREE.Mesh;
  t: number;
  life: number;
}

export class DecalPool {
  private items: Decal[] = [];
  private textures = {
    crack: decalTexture('crack'),
    scorch: decalTexture('scorch'),
    splat: decalTexture('splat'),
  };
  constructor(private scene: THREE.Scene) {}

  spawn(
    x: number,
    z: number,
    kind: 'crack' | 'scorch' | 'splat',
    color: number,
    radius: number,
    life: number,
  ): void {
    const mat = new THREE.MeshBasicMaterial({
      map: this.textures[kind],
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(x, 0.025, z);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    this.items.push({ mesh, t: 0, life });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      d.t += dt;
      const frac = d.t / d.life;
      if (frac >= 1) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.items.splice(i, 1);
        continue;
      }
      (d.mesh.material as THREE.MeshBasicMaterial).opacity =
        0.85 * (frac > 0.7 ? 1 - (frac - 0.7) / 0.3 : 1);
    }
  }
}

/** Sweeping melee arc (ribbonSweep op): sector that expands + fades. */
export class SweepPool {
  private items: { mesh: THREE.Mesh; t: number; life: number; from: number; arc: number }[] = [];
  constructor(private scene: THREE.Scene) {}

  spawn(
    x: number,
    z: number,
    fx: number,
    fz: number,
    color: number,
    radius: number,
    angleDeg: number,
    life: number,
  ): void {
    const arc = (Math.abs(angleDeg) * Math.PI) / 180;
    const dir = Math.sign(angleDeg) || 1;
    const base = Math.atan2(fz, fx);
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24, 0, arc * 0.35),
      areaMat(color, 0.5),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    mesh.renderOrder = 7;
    this.scene.add(mesh);
    this.items.push({ mesh, t: 0, life, from: base - (dir * arc) / 2, arc: arc * dir });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      s.t += dt;
      const frac = s.t / s.life;
      if (frac >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.items.splice(i, 1);
        continue;
      }
      const sweep = 1 - (1 - frac) * (1 - frac) * (1 - frac);
      s.mesh.rotation.z = -(s.from + s.arc * sweep);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - frac);
    }
  }
}
