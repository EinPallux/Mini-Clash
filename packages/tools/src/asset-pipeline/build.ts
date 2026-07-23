/**
 * Asset pipeline (ASSET_CATALOG §5): manifest-driven optimization of the raw CC0 packs
 * into hashed, pruned runtime files + a JSON manifest with per-asset metadata
 * (bbox, clips, skeleton bones) consumed by the client loader.
 *
 * Run: pnpm assets:build
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import { ASSET_MANIFEST } from './manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const assetsRoot = join(repoRoot, 'assets');
const outDir = join(repoRoot, 'packages/client/public/game-assets');

interface AssetMeta {
  url: string;
  bytes: number;
  group: string;
  kind: 'model' | 'texture';
  bbox?: [number, number, number];
  bboxMin?: [number, number, number];
  clips?: string[];
  bones?: string[];
  meshes?: string[];
}

const BUDGET_BYTES: Record<string, number> = {
  champion: 400_000,
  'match-core': 600_000,
  boot: 300_000,
};

async function main(): Promise<void> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const manifest: Record<string, AssetMeta> = {};
  let total = 0;
  const failures: string[] = [];

  for (const entry of ASSET_MANIFEST) {
    const srcPath = join(assetsRoot, entry.src);
    if (!existsSync(srcPath)) {
      failures.push(`${entry.key}: source missing (${entry.src})`);
      continue;
    }

    if (srcPath.endsWith('.png')) {
      // Skybox panoramas ship at 2048×1024 — plenty at our FOV, half the bytes.
      const sharp = (await import('sharp')).default;
      const img = sharp(srcPath);
      const meta = await img.metadata();
      const buf =
        (meta.width ?? 0) > 2048
          ? await img
              .resize(2048, Math.round((2048 * (meta.height ?? 1)) / (meta.width ?? 1)))
              .png({ compressionLevel: 9 })
              .toBuffer()
          : readFileSync(srcPath);
      const hash = createHash('sha1').update(buf).digest('hex').slice(0, 8);
      const name = `${entry.key.replace(/\//g, '_')}-${hash}.png`;
      writeFileSync(join(outDir, name), buf);
      manifest[entry.key] = { url: name, bytes: buf.length, group: entry.group, kind: 'texture' };
      total += buf.length;
      continue;
    }

    const doc = await io.read(srcPath);
    const root = doc.getRoot();

    // Strip unused animation clips before pruning so their data falls away.
    if (entry.keepClips) {
      const keep = new Set(entry.keepClips);
      const present = new Set(root.listAnimations().map((a) => a.getName()));
      for (const wanted of keep) {
        if (!present.has(wanted))
          failures.push(`${entry.key}: required clip '${wanted}' missing in source`);
      }
      for (const anim of root.listAnimations()) {
        if (!keep.has(anim.getName())) anim.dispose();
      }
    }

    // prune() can orphan secondary skins (stretched-vertex artifacts); skip it for rigged files.
    if (root.listSkins().length > 0) await doc.transform(dedup());
    else await doc.transform(dedup(), prune());

    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    const bounds = scene ? getBounds(scene) : { min: [0, 0, 0], max: [1, 1, 1] };
    const clips = root.listAnimations().map((a) => a.getName());
    const bones = [
      ...new Set(root.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName()))),
    ];
    const meshes = [...new Set(root.listMeshes().map((m) => m.getName()))];

    const glb = await io.writeBinary(doc);
    const hash = createHash('sha1').update(glb).digest('hex').slice(0, 8);
    const name = `${entry.key.replace(/\//g, '_')}-${hash}.glb`;
    writeFileSync(join(outDir, name), glb);
    total += glb.byteLength;

    const budget = BUDGET_BYTES[entry.group] ?? 600_000;
    if (glb.byteLength > budget)
      failures.push(`${entry.key}: ${glb.byteLength}B exceeds ${entry.group} budget ${budget}B`);

    const meta: AssetMeta = {
      url: name,
      bytes: glb.byteLength,
      group: entry.group,
      kind: 'model',
      bbox: [
        bounds.max[0] - bounds.min[0],
        bounds.max[1] - bounds.min[1],
        bounds.max[2] - bounds.min[2],
      ],
      bboxMin: [bounds.min[0], bounds.min[1], bounds.min[2]],
    };
    if (clips.length > 0) meta.clips = clips;
    if (bones.length > 0) meta.bones = bones;
    if (meshes.length > 0) meta.meshes = meshes;
    manifest[entry.key] = meta;
  }

  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify({ version: 1, totalBytes: total, assets: manifest }, null, 1),
  );

  if (failures.length > 0) {
    console.error(`asset pipeline FAILED:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.info(
    `assets: ${ASSET_MANIFEST.length} entries, ${(total / 1024).toFixed(0)} KiB → ${outDir}`,
  );
}

await main();
