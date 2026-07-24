import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/** Runtime asset store: manifest fetch, GLB loads, toon-ramp material conversion, clones. */

export interface AssetMeta {
  url: string;
  bytes: number;
  group: string;
  kind: 'model' | 'texture';
  bbox?: [number, number, number];
  bboxMin?: [number, number, number];
  clips?: string[];
  bones?: string[];
}

interface Manifest {
  version: number;
  totalBytes: number;
  assets: Record<string, AssetMeta>;
}

interface LoadedModel {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  meta: AssetMeta;
}

let manifest: Manifest | null = null;
const models = new Map<string, LoadedModel>();
const textures = new Map<string, THREE.Texture>();
const loader = new GLTFLoader();

/** 3-band toon ramp shared by all converted materials (ART_DIRECTION §3). */
let gradientMap: THREE.DataTexture | null = null;
function toonRamp(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export async function loadManifest(): Promise<Manifest> {
  if (manifest) return manifest;
  const res = await fetch('/game-assets/manifest.json');
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  manifest = (await res.json()) as Manifest;
  return manifest;
}

export function assetMeta(key: string): AssetMeta {
  const m = manifest?.assets[key];
  if (!m) throw new Error(`unknown asset '${key}'`);
  return m;
}

/** Convert imported materials to the toon-ramp look, preserving maps/colors. */
function convertMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Unlit exports (KHR_materials_unlit) may ship without normals; lit toon
    // materials need them or they shade black.
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    const convert = (mat: THREE.Material): THREE.Material => {
      const std = mat as THREE.MeshStandardMaterial;
      const toon = new THREE.MeshToonMaterial({
        color: std.color ? std.color.clone() : new THREE.Color(0xffffff),
        map: std.map ?? null,
        gradientMap: toonRamp(),
        transparent: std.transparent,
        opacity: std.opacity,
        side: std.side,
      });
      toon.name = mat.name;
      return toon;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(convert)
      : convert(mesh.material);
  });
}

export async function loadModel(key: string): Promise<LoadedModel> {
  const existing = models.get(key);
  if (existing) return existing;
  const meta = assetMeta(key);
  const gltf = await loader.loadAsync(`/game-assets/${meta.url}`);
  convertMaterials(gltf.scene);
  const loaded: LoadedModel = { scene: gltf.scene, clips: gltf.animations, meta };
  models.set(key, loaded);
  return loaded;
}

export async function loadTexture(key: string): Promise<THREE.Texture> {
  const existing = textures.get(key);
  if (existing) return existing;
  const meta = assetMeta(key);
  const tex = await new THREE.TextureLoader().loadAsync(`/game-assets/${meta.url}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, tex);
  return tex;
}

export interface InstanceOpts {
  /** Multiply material colors (palette tints, ghost-ship spectral). */
  tint?: number;
  /** Force transparent ghost look. */
  spectral?: boolean;
  /** Drop the texture map and use the tint as a solid toon color (mannequin look). */
  flat?: boolean;
}

/** Instantiate a loaded model (skeleton-aware clone, fresh materials when tinting). */
export function instantiate(
  key: string,
  opts: InstanceOpts = {},
): { root: THREE.Group; clips: THREE.AnimationClip[] } {
  const model = models.get(key);
  if (!model) throw new Error(`model '${key}' not preloaded`);
  const root = cloneSkinned(model.scene) as THREE.Group;
  if (opts.tint !== undefined || opts.spectral || opts.flat) {
    const tint = new THREE.Color(opts.tint ?? 0xffffff);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const retint = (m: THREE.Material): THREE.Material => {
        const c = (m as THREE.MeshToonMaterial).clone();
        if (opts.flat) {
          c.map = null;
          c.color.set(tint);
        } else {
          c.color.multiply(tint);
        }
        if (opts.spectral) {
          c.transparent = true;
          c.opacity = 0.55;
          c.emissive = new THREE.Color(0x2b6f8f);
          c.emissiveIntensity = 0.8;
          c.depthWrite = false;
        }
        return c;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(retint)
        : retint(mesh.material);
    });
  }
  return { root, clips: model.clips };
}

/** Find a skeleton bone / node for prop attachment by fuzzy name. */
export function findSocket(
  root: THREE.Object3D,
  socket: 'handRight' | 'handLeft' | 'back' | 'root',
): THREE.Object3D {
  // Covers both rig families: Kenney ('arm-right') and KayKit ('handslot.r' —
  // which GLTFLoader sanitizes to 'handslotr' at load time). Candidates are in
  // priority order: dedicated weapon slots before the bare hand/arm bones.
  const want =
    socket === 'handRight'
      ? ['handslotr', 'arm-right', 'handr', 'hand-right']
      : socket === 'handLeft'
        ? ['handslotl', 'arm-left', 'handl', 'hand-left']
        : socket === 'back'
          ? ['chest', 'torso', 'body']
          : ['root'];
  for (const w of want) {
    let found: THREE.Object3D | null = null;
    root.traverse((obj) => {
      if (!found && obj.name.toLowerCase().includes(w)) found = obj;
    });
    if (found) return found;
  }
  return root;
}

export async function preload(
  keys: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let done = 0;
  await Promise.all(
    keys.map(async (k) => {
      const meta = assetMeta(k);
      if (meta.kind === 'texture') await loadTexture(k);
      else await loadModel(k);
      done++;
      onProgress?.(done, keys.length);
    }),
  );
}
