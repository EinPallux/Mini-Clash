import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Server observability (TECH §14): prom-client metrics scraped at /metrics.
 * The soak test asserts against these same series — the dashboard numbers and
 * the CI gate can never disagree.
 */

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const roomsGauge = new Gauge({
  name: 'mc_rooms',
  help: 'Live match rooms',
  registers: [registry],
});

export const clientsGauge = new Gauge({
  name: 'mc_clients',
  help: 'Connected match clients',
  registers: [registry],
});

export const tickHistogram = new Histogram({
  name: 'mc_tick_ms',
  help: 'Sim tick duration (ms) across all rooms',
  buckets: [0.25, 0.5, 1, 2, 4, 8, 16, 33],
  registers: [registry],
});

export const snapshotBytes = new Counter({
  name: 'mc_snapshot_bytes_total',
  help: 'Binary snapshot bytes sent to clients',
  registers: [registry],
});

export const joinsCounter = new Counter({
  name: 'mc_joins_total',
  help: 'Match room joins',
  registers: [registry],
});

export const leavesCounter = new Counter({
  name: 'mc_leaves_total',
  help: 'Match room leaves (any reason)',
  registers: [registry],
});

/** p95 of the tick histogram, computed from bucket counts (for tests/logs). */
export async function tickP95(): Promise<number> {
  const metric = await tickHistogram.get();
  const buckets = metric.values.filter((v) => v.metricName === 'mc_tick_ms_bucket');
  const count = metric.values.find((v) => v.metricName === 'mc_tick_ms_count')?.value ?? 0;
  if (count === 0) return 0;
  const target = count * 0.95;
  for (const b of buckets.sort(
    (a, x) =>
      Number(a.labels.le === '+Inf' ? Infinity : a.labels.le) -
      Number(x.labels.le === '+Inf' ? Infinity : x.labels.le),
  )) {
    if (b.value >= target) return Number(b.labels.le === '+Inf' ? 33 : b.labels.le);
  }
  return 33;
}
