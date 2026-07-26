#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Container build: bundle EVERYTHING into one api file so the runtime image
 * needs nothing but node. `run.mjs` stays the dev launcher.
 *
 * PGlite is left external on purpose: it is the offline/test driver, it drags a
 * multi-megabyte WASM build in with it, and production always has DATABASE_URL
 * set — so the dynamic import that would load it is never reached.
 */
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
let root = here;
for (let i = 0; i < 8; i++) {
  if (existsSync(join(root, 'pnpm-workspace.yaml'))) break;
  root = resolve(root, '..');
}

const outDir = join(here, 'dist');
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(here, 'src/index.ts')],
  outfile: join(outDir, 'api.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['@electric-sql/pglite'],
  alias: {
    '@mini-clash/data': join(root, 'packages/data/src/index.ts'),
    '@mini-clash/protocol': join(root, 'packages/protocol/src/index.ts'),
  },
  banner: {
    // A bundled dep declares its own createRequire import — alias ours.
    js: "import { createRequire as __mcRequire } from 'node:module'; const require = __mcRequire(import.meta.url);",
  },
});

// Ship the .sql files beside the bundle; `findMigrations()` looks here first.
cpSync(join(here, 'migrations'), join(outDir, 'migrations'), { recursive: true });

console.info('api bundle → packages/api/dist/api.mjs');
