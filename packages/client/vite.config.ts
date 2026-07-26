import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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

/**
 * Inject the real precache list into dist/sw.js after the bundle lands. The
 * service worker caches everything at install, so airplane mode never depends
 * on which first-visit requests raced past worker activation.
 */
function injectSwPrecache(): Plugin {
  return {
    name: 'inject-sw-precache',
    apply: 'build',
    closeBundle() {
      const dist = join(dirname(fileURLToPath(import.meta.url)), 'dist');
      const swPath = join(dist, 'sw.js');
      if (!existsSync(swPath)) return;
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(`/${relative(dist, full).split('\\').join('/')}`);
        }
      };
      walk(dist);
      const precache = ['/', ...files.filter((f) => f !== '/sw.js' && f !== '/index.html')];
      const version = createHash('sha1').update(JSON.stringify(precache)).digest('hex').slice(0, 8);
      let sw = readFileSync(swPath, 'utf8');
      sw = sw.replace("self.__PRECACHE_MANIFEST__ || ['/']", JSON.stringify(precache));
      sw = sw.replace("self.__PRECACHE_VERSION__ || 'dev'", JSON.stringify(version));
      writeFileSync(swPath, sw);
      this.info?.(`sw precache: ${precache.length} entries, version ${version}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), requireGameAssets(), injectSwPrecache()],
  server: {
    host: true,
    port: 5173,
    // Proxy the platform api so dev and production are the *same origin*. That
    // is not a convenience: session cookies are httpOnly + SameSite=Lax, and
    // testing them across origins in dev would prove nothing about production.
    proxy: {
      '/api': {
        target: process.env.MC_API_URL ?? 'http://127.0.0.1:3000',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
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
