#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Container build: bundle EVERYTHING (node_modules included) into one server
 * file so the runtime image needs nothing but node. `run.mjs` stays the dev
 * launcher (externals resolved from the workspace).
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
  outfile: join(outDir, 'server.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  alias: {
    '@mini-clash/sim': join(root, 'packages/sim/src/index.ts'),
    '@mini-clash/data': join(root, 'packages/data/src/index.ts'),
    '@mini-clash/protocol': join(root, 'packages/protocol/src/index.ts'),
  },
  banner: {
    // A bundled dep declares its own createRequire import — alias ours.
    js: "import { createRequire as __mcRequire } from 'node:module'; const require = __mcRequire(import.meta.url);",
  },
});

console.info('server bundle → packages/server/dist/server.mjs');
