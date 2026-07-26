import { buildApp } from './app';
import { log } from './log';

/**
 * Mini Clash platform api (TECH §9): accounts, coins, unlocks, quests, history.
 * Fronted by Caddy under `/api/*`; the game server talks to it over `/internal`.
 */

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = await buildApp();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

try {
  await app.listen({ port, host });
  log.info({ port }, 'mini-clash api listening');
} catch (err) {
  log.error({ err }, 'failed to listen');
  process.exit(1);
}
