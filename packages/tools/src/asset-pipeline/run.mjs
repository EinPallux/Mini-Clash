#!/usr/bin/env node
/**
 * Portable launcher for the asset pipeline. Bundles build.ts with esbuild and runs
 * the result, so the pipeline works on any Node ≥18 — no reliance on Node's
 * built-in TypeScript stripping (which varies by version and broke Vercel builds).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const esbuild = await import('esbuild');

const outDir = join(here, '../../.pipeline-cache');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'build.bundle.mjs');
writeFileSync(join(outDir, '.gitignore'), '*\n');

await esbuild.build({
  entryPoints: [join(here, 'build.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outfile,
  logLevel: 'silent',
});

await import(pathToFileURL(outfile).href);
