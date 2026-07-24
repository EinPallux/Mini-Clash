import type { MapDef } from '@mini-clash/data';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { type Quality, useSettings } from '../state/settings';
import { instantiate, loadTexture } from './assets';

/** Scene + camera + lights + post stack per ART_DIRECTION §2–§3. */

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.32 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - strength * smoothstep(0.42, 0.86, d);
      gl_FragColor = c;
    }`,
};

export interface QualityProfile {
  pixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  post: boolean;
}

export function resolveQuality(q: Quality): QualityProfile {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  switch (q === 'auto' ? autoQuality() : q) {
    case 'low':
      return { pixelRatio: 1, shadows: false, shadowSize: 1024, post: false };
    case 'medium':
      return { pixelRatio: Math.min(dpr, 1.5), shadows: true, shadowSize: 1024, post: true };
    default:
      return { pixelRatio: dpr, shadows: true, shadowSize: 2048, post: true };
  }
}

function autoQuality(): Exclude<Quality, 'auto'> {
  const cores = navigator.hardwareConcurrency ?? 4;
  return cores >= 8 ? 'high' : cores >= 4 ? 'medium' : 'low';
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private profile: QualityProfile;
  private sun!: THREE.DirectionalLight;

  /** True when running on a software rasterizer (SwiftShader/llvmpipe — CI, VMs). */
  readonly softwareGl: boolean;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 220);

    // Software rasterizers lose the GL context under load spikes; clamp them to the
    // low profile regardless of the auto heuristic (real GPUs are unaffected).
    const glInfo = this.rendererString();
    this.softwareGl = /swiftshader|llvmpipe|software/i.test(glInfo);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost — awaiting restore');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      console.warn('WebGL context restored');
      this.applyProfile();
    });

    this.profile = this.clamp(resolveQuality(useSettings.getState().quality));
    this.applyProfile();
    useSettings.subscribe((s) => {
      const next = this.clamp(resolveQuality(s.quality));
      if (JSON.stringify(next) !== JSON.stringify(this.profile)) {
        this.profile = next;
        this.applyProfile();
      }
    });
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  private rendererString(): string {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(
        ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      );
    } catch {
      return '';
    }
  }

  private clamp(p: QualityProfile): QualityProfile {
    if (!this.softwareGl) return p;
    return { pixelRatio: 1, shadows: false, shadowSize: 1024, post: false };
  }

  get quality(): QualityProfile {
    return this.profile;
  }

  private applyProfile(): void {
    const p = this.profile;
    this.renderer.setPixelRatio(p.pixelRatio);
    this.renderer.shadowMap.enabled = p.shadows;
    if (this.sun) {
      this.sun.castShadow = p.shadows;
      this.sun.shadow.mapSize.setScalar(p.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.buildComposer();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        const mat = m.material as THREE.Material;
        mat.needsUpdate = true;
      }
    });
  }

  private buildComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    if (!this.profile.post) return;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // No bloom pass: UnrealBloomPass NaN-poisons its mip chain on some drivers
    // (permanent black screen once bright additive FX appear). Glow is carried by
    // additive sprites/halos instead; revisit with a clamped bloom in a later phase.
    composer.addPass(new ShaderPass(VignetteShader));
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private onResize = (): void => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  async buildEnvironment(map: MapDef): Promise<void> {
    // Sky.
    const sky = await loadTexture(map.skybox);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = sky;
    this.scene.backgroundIntensity = 1.0;
    this.scene.fog = new THREE.Fog(map.lighting.skyColor, 60, 160);

    // Lights (single warm key from screen bottom-left + hemisphere fill).
    const l = map.lighting;
    this.sun = new THREE.DirectionalLight(l.sunColor, l.sunIntensity);
    this.sun.position.set(-l.sunDir[0] * 40, -l.sunDir[1] * 40, -l.sunDir[2] * 40);
    this.sun.castShadow = this.profile.shadows;
    this.sun.shadow.mapSize.setScalar(this.profile.shadowSize);
    const ext = Math.max(map.width, map.height) * 0.62;
    this.sun.shadow.camera.left = -ext;
    this.sun.shadow.camera.right = ext;
    this.sun.shadow.camera.top = ext;
    this.sun.shadow.camera.bottom = -ext;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(l.skyColor, l.groundColor, l.ambientIntensity));

    // Floor: instanced tile grid with sparse accent tiles (deterministic checker pattern).
    this.buildFloor(map);

    // Props.
    for (const prop of map.props) {
      const { root } = instantiate(prop.model, { tint: prop.tint });
      root.position.set(prop.position[0], prop.position[1], prop.position[2]);
      root.rotation.y = ((prop.rotationDeg ?? 0) * Math.PI) / 180;
      const s = prop.scale ?? 1;
      if (Array.isArray(s)) root.scale.set(s[0], s[1], s[2]);
      else root.scale.setScalar(s);
      this.scene.add(root);
    }
  }

  private buildFloor(map: MapDef): void {
    const size = map.floor.size;
    const cols = Math.ceil(map.width / size) + 2;
    const rows = Math.ceil(map.height / size) + 2;
    // Sky-bridge maps clip the floor to the deck and fray the outermost rows so the
    // silhouette reads fractured over the void (deterministic hash pattern).
    const deckHalf = map.floor.deckHalf ?? Number.POSITIVE_INFINITY;
    const masked = (c: number, r: number): boolean => {
      const z = (r - rows / 2) * size + size / 2;
      if (Math.abs(z) > deckHalf) return true;
      if (map.floor.frayEnds && Math.abs(z) > deckHalf - size) {
        return (c * 31 + r * 17) % 7 < 2;
      }
      return false;
    };
    const placeTiles = (key: string, filter: (c: number, r: number) => boolean): void => {
      const { root } = instantiate(key);
      let tileMesh: THREE.Mesh | null = null;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !tileMesh) tileMesh = m;
      });
      if (!tileMesh) return;
      const mesh = tileMesh as THREE.Mesh;
      const positions: [number, number][] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (filter(c, r))
            positions.push([(c - cols / 2) * size + size / 2, (r - rows / 2) * size + size / 2]);
        }
      }
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, positions.length);
      inst.receiveShadow = true;
      // Instance bounds are geometry-local; without this the whole floor culls away
      // as soon as the camera leaves the map origin.
      inst.frustumCulled = false;
      const m4 = new THREE.Matrix4();
      const scl = new THREE.Vector3(size, 1, size);
      positions.forEach(([x, z], i) => {
        m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), scl);
        inst.setMatrixAt(i, m4);
      });
      this.scene.add(inst);
    };
    placeTiles(map.floor.tile, (c, r) => !masked(c, r) && (c * 7 + r * 13) % 9 !== 0);
    placeTiles(map.floor.accentTile, (c, r) => !masked(c, r) && (c * 7 + r * 13) % 9 === 0);
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
