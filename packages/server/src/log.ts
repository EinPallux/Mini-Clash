import { pino } from 'pino';

/** Structured logs (TECH §14) — JSON lines, Loki-friendly, no transports. */
export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'mc-game' },
});
