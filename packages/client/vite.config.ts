import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The game loads pipeline output from public/game-assets/ (gitignored).
 * Fail the BUILD when it's missing — otherwise every page deploys fine and the
 * arena 404s at runtime on the manifest fetch (exactly what happens when a host
 * runs `vite build` instead of the repo-root `pnpm build`).
 */
function requireGameAssets(): Plugin {
  return {
    name: 'require-game-assets',
    apply: 'build',
    buildStart() {
      const manifest = join(
        dirname(fileURLToPath(import.meta.url)),
        'public/game-assets/manifest.json',
      );
      if (!existsSync(manifest)) {
        throw new Error(
          'public/game-assets/manifest.json is missing — the asset pipeline has not run. ' +
            'Build with `pnpm build` from the repo root (or run `pnpm assets:build` first).',
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), requireGameAssets()],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  worker: { format: 'es' },
});
