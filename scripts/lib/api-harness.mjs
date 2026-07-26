/**
 * A real platform api, in-process, for the browser smokes.
 *
 * Since v0.7 the client boots through an account: it asks `/auth/me`, and a
 * browser it has never seen creates a guest before it can reach the hub. A
 * smoke with no api behind `/api` therefore does not test the game with the
 * platform switched off — it tests a *different* boot path, on a timer, with a
 * console full of failed requests that drown out the ones that matter.
 *
 * So the smokes run the shipped topology instead. This starts the same service
 * `packages/api/run.mjs` runs, on the port vite's `/api` proxy already points
 * at, backed by PGlite — Postgres compiled to WASM, in memory, fresh per
 * process — so there is nothing to install and no state carried between runs.
 *
 * (The offline path has its own coverage: `shot-hub.mjs` cuts the network with
 * the hub open, and `scripts/api-load.mjs` exercises the api directly.)
 */
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';

/** Where vite's dev/preview proxy sends `/api`, minus the prefix. */
export const API_PORT = 3000;

/**
 * Bundle the api the way its dev launcher does.
 *
 * Node's TypeScript support does not resolve extensionless imports and the
 * service uses them throughout, so this is not a test workaround — it is the
 * same esbuild step `packages/api/run.mjs` performs to run for real.
 */
async function bundle(outdir, root) {
  mkdirSync(outdir, { recursive: true });
  await build({
    entryPoints: [`${root}packages/api/src/app.ts`, `${root}packages/api/src/ledger.ts`],
    outdir,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    alias: {
      '@mini-clash/data': `${root}packages/data/src/index.ts`,
      '@mini-clash/protocol': `${root}packages/protocol/src/index.ts`,
    },
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
}

/**
 * Start it. Returns the Fastify instance, the ledger module (for smokes that
 * need to grant coins directly) and a `stop` that is safe to call twice.
 *
 * `name` keeps concurrent smokes out of each other's build output.
 */
export async function startApi({ name = 'smoke', port = API_PORT } = {}) {
  // The game server signs match results with this; the api refuses anything
  // under 16 characters rather than accepting unsigned results.
  process.env.MC_INTERNAL_SECRET ??= 'smoke-harness-secret-32-chars!!!!';
  const root = new URL('../../', import.meta.url).pathname;
  const outdir = new URL(`../../packages/api/.dev/${name}/`, import.meta.url).pathname;
  await bundle(outdir, root);

  const { buildApp } = await import(`${outdir}app.js`);
  const ledger = await import(`${outdir}ledger.js`);
  const app = await buildApp({ quiet: true });
  await app.listen({ port, host: '127.0.0.1' });

  let stopped = false;
  return {
    app,
    ledger,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await app.close().catch(() => {});
    },
  };
}
