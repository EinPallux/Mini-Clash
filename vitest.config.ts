import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    environment: 'node',
    // worker_threads pool: Colyseus signals process.send() when it exists, which
    // collides with the forks pool's IPC channel (threads have no process.send).
    pool: 'threads',
    // Sim tests do real work: a bridge case steps thousands of deterministic
    // ticks, and several sit within a second or two of vitest's 5 s default —
    // close enough that a loaded machine turns them red for no reason, which is
    // the worst kind of CI failure because it teaches you to re-run instead of
    // read. The timeout is here to catch a genuine infinite loop, and 30 s still
    // does that: nothing in `packages/sim` blocks on I/O, so a test that has not
    // finished by then is not slow, it is stuck.
    testTimeout: 30_000,
  },
});
