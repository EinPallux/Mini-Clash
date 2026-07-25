import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    environment: 'node',
    // worker_threads pool: Colyseus signals process.send() when it exists, which
    // collides with the forks pool's IPC channel (threads have no process.send).
    pool: 'threads',
  },
});
