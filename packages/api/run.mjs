#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Dev/prod launcher: bundles the TS sources (workspace packages inlined from
 * src, node_modules kept external) and runs the result — no build step to
 * forget, same pattern as the asset pipeline.
 */
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
let root = here;
for (let i = 0; i < 8; i++) {
  if (existsSync(join(root, 'pnpm-workspace.yaml'))) break;
  root = resolve(root, '..');
}

const outDir = join(here, '.dev');
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, 'api.mjs');

await build({
  entryPoints: [join(here, 'src/index.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  alias: {
    '@mini-clash/data': join(root, 'packages/data/src/index.ts'),
    '@mini-clash/protocol': join(root, 'packages/protocol/src/index.ts'),
  },
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

await import(outfile);
