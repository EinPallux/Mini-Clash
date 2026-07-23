import * as THREE from 'three';

/** Pooled, CPU-integrated, instanced billboard particles (ART_DIRECTION §6 budgets). */

type Shape = 'spark' | 'puff' | 'shard' | 'ring';
const CAP: Record<Shape, number> = { spark: 768, puff: 512, shard: 256, ring: 128 };

export interface BurstOpts {
  x: number;
  y?: number;
  z: number;
  dirX?: number;
  dirZ?: number;
  count: number;
  color: number;
  color2?: number;
  size: number;
  speed: number;
  /** Cone half-angle around dir in degrees; 360 = omni. */
  spread?: number;
  up?: number;
  life: number;
  gravity?: number;
  shape?: Shape;
}

function softCircleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function streakTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 16);
  return new THREE.CanvasTexture(c);
}

function ringTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(32, 32, 24, 0, Math.PI * 2);
  g.stroke();
  return new THREE.CanvasTexture(c);
}

interface Slot {
  alive: boolean;
  t: number;
  life: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  gravity: number;
  color: THREE.Color;
}

class Pool {
  mesh: THREE.InstancedMesh;
  slots: Slot[] = [];
  cursor = 0;
  constructor(shape: Shape, scene: THREE.Scene) {
    const cap = CAP[shape];
    const geo =
      shape === 'shard'
        ? new THREE.TetrahedronGeometry(0.5)
        : new THREE.PlaneGeometry(1, shape === 'spark' ? 0.3 : 1);
    const additive = shape === 'spark' || shape === 'ring';
    const mat = new THREE.MeshBasicMaterial({
      map:
        shape === 'spark'
          ? streakTexture()
          : shape === 'ring'
            ? ringTexture()
            : shape === 'puff'
              ? softCircleTexture()
              : null,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = cap;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, new THREE.Color(0));
      this.slots.push({
        alive: false,
        t: 0,
        life: 1,
        px: 0,
        py: 0,
        pz: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 1,
        gravity: 0,
        color: new THREE.Color(),
      });
    }
    scene.add(this.mesh);
  }
}

export class ParticleSystem {
  private pools = new Map<Shape, Pool>();
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();
  /** Global density scale (reduced-VFX accessibility). */
  density = 1;

  constructor(scene: THREE.Scene) {
    for (const s of ['spark', 'puff', 'shard', 'ring'] as Shape[])
      this.pools.set(s, new Pool(s, scene));
  }

  burst(o: BurstOpts): void {
    const shape = o.shape ?? 'spark';
    const pool = this.pools.get(shape)!;
    const n = Math.max(1, Math.round(o.count * this.density));
    const c1 = new THREE.Color(o.color);
    const c2 = o.color2 !== undefined ? new THREE.Color(o.color2) : c1;
    const spreadRad = ((o.spread ?? 360) * Math.PI) / 180;
    const baseAngle = Math.atan2(o.dirZ ?? 0, o.dirX ?? 1);
    for (let i = 0; i < n; i++) {
      const slot = pool.slots[pool.cursor];
      pool.cursor = (pool.cursor + 1) % pool.slots.length;
      const ang = baseAngle + (Math.random() * 2 - 1) * spreadRad;
      const sp = o.speed * (0.5 + Math.random() * 0.7);
      slot.alive = true;
      slot.t = 0;
      slot.life = o.life * (0.7 + Math.random() * 0.6);
      slot.px = o.x;
      slot.py = (o.y ?? 0.5) + Math.random() * 0.3;
      slot.pz = o.z;
      slot.vx = Math.cos(ang) * sp;
      slot.vz = Math.sin(ang) * sp;
      slot.vy = (o.up ?? 0.5) * (0.5 + Math.random());
      slot.size = o.size * (0.7 + Math.random() * 0.6);
      slot.gravity = o.gravity ?? 2;
      slot.color.copy(c1).lerp(c2, Math.random());
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    camera.getWorldQuaternion(this.tmpQ);
    for (const pool of this.pools.values()) {
      let dirty = false;
      for (let i = 0; i < pool.slots.length; i++) {
        const s = pool.slots[i];
        if (!s.alive) continue;
        dirty = true;
        s.t += dt;
        if (s.t >= s.life) {
          s.alive = false;
          this.tmpM.makeScale(0, 0, 0);
          pool.mesh.setMatrixAt(i, this.tmpM);
          continue;
        }
        s.vy -= s.gravity * dt;
        s.px += s.vx * dt;
        s.py = Math.max(0.02, s.py + s.vy * dt);
        s.pz += s.vz * dt;
        const frac = s.t / s.life;
        const scale = s.size * (frac < 0.15 ? frac / 0.15 : 1 - (frac - 0.15) / 0.85);
        this.tmpP.set(s.px, s.py, s.pz);
        this.tmpS.setScalar(Math.max(0.001, scale));
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        pool.mesh.setMatrixAt(i, this.tmpM);
        pool.mesh.setColorAt(i, s.color);
      }
      if (dirty) {
        pool.mesh.instanceMatrix.needsUpdate = true;
        if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
      }
    }
  }
}
