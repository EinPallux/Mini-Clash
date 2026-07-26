import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { SnapshotDecoder } from '@mini-clash/protocol';
import { Client as JsClient, type Room as JsRoom } from 'colyseus.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tickP95 } from '../src/metrics';
import { BridgeRoom } from '../src/rooms/BridgeRoom';

/**
 * 200-socket soak (ROADMAP v0.3 acceptance, TECH §11): 25 rooms × 8 human
 * sockets against one server process — every client keeps receiving binary
 * snapshots, sim ticks hold the ≤ 4 ms p95 budget, downstream bandwidth stays
 * ≤ 12 KB/s per client, and memory doesn't climb through the run.
 *
 * Heavy by design → gated behind MC_SOAK=1 (CI runs it as its own step).
 */

const ROOMS = Number(process.env.MC_SOAK_ROOMS ?? 25);
const SEATS = 8;
const SOAK_SECONDS = Number(process.env.MC_SOAK_SECONDS ?? 45);

const CHAMPS = ['rook', 'fathom', 'mortis', 'rattle', 'grukk', 'sylva', 'rook', 'fathom'];

let server: Server;
let port: number;

beforeAll(async () => {
  const http = createServer();
  server = new Server({ transport: new WebSocketTransport({ server: http }) });
  server.define('bridge', BridgeRoom);
  await server.listen(0);
  const addr = http.address();
  if (typeof addr === 'object' && addr) port = addr.port;
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

interface SoakClient {
  room: JsRoom;
  bytes: number;
  snaps: number;
  lastTick: number;
  seq: number;
}

describe.skipIf(!process.env.MC_SOAK)('200-socket soak', () => {
  it(
    `${ROOMS * SEATS} sockets across ${ROOMS} rooms hold the §11 budgets`,
    async () => {
      const clients: SoakClient[] = [];
      const roster = CHAMPS.map((championId, i) => ({
        id: i + 1,
        championId,
        team: i < 4 ? 0 : 1,
        name: `S${i}`,
      }));

      // Boot rooms sequentially-ish to avoid a thundering-herd handshake.
      for (let r = 0; r < ROOMS; r++) {
        const first = new JsClient(`ws://127.0.0.1:${port}`);
        const room = await first.create('bridge', { name: 'S0', roster, seed: 1000 + r });
        const all: JsRoom[] = [room];
        for (let s = 1; s < SEATS; s++) {
          const c = new JsClient(`ws://127.0.0.1:${port}`);
          all.push(await c.joinById(room.roomId, { name: `S${s}` }));
        }
        for (const jr of all) {
          const sc: SoakClient = { room: jr, bytes: 0, snaps: 0, lastTick: 0, seq: 0 };
          const dec = new SnapshotDecoder();
          jr.onMessage('seat', () => {});
          jr.onMessage('afk', () => {});
          jr.onMessage('snapb', (raw: Uint8Array | ArrayBuffer) => {
            const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
            sc.bytes += buf.length;
            const snap = dec.decode(buf);
            if (snap) {
              sc.snaps++;
              sc.lastTick = snap.tick;
            }
          });
          jr.send('ready', {});
          clients.push(sc);
        }
      }
      expect(clients.length).toBe(ROOMS * SEATS);

      // Let every room start + take the memory baseline after warmup.
      await new Promise((res) => setTimeout(res, 5000));
      if (global.gc) global.gc();
      const rssStart = process.memoryUsage().rss;
      const bytesStart = clients.map((c) => c.bytes);
      const ticksStart = clients.map((c) => c.lastTick);

      // Soak: every client issues a couple of orders per second, like humans.
      const orderTimer = setInterval(() => {
        for (const c of clients) {
          const x = -50 + Math.random() * 100;
          const z = -8 + Math.random() * 16;
          c.room.send('intents', [{ seq: c.seq++, player: 1, intent: { t: 'move', x, z } }]);
        }
      }, 500);
      await new Promise((res) => setTimeout(res, SOAK_SECONDS * 1000));
      clearInterval(orderTimer);

      const rssEnd = process.memoryUsage().rss;
      const p95 = await tickP95();
      const perClientRates = clients.map((c, i) => (c.bytes - bytesStart[i]) / SOAK_SECONDS);
      const avgRate = perClientRates.reduce((a, b) => a + b, 0) / clients.length;
      const worstRate = Math.max(...perClientRates);
      const stalled = clients.filter((c, i) => c.lastTick <= ticksStart[i]).length;
      const rssGrowth = (rssEnd - rssStart) / rssStart;

      console.info(
        `soak: ${clients.length} sockets · tick p95 ≤ ${p95} ms · down avg ${Math.round(avgRate)} B/s (worst ${Math.round(worstRate)}) · rss ${(rssStart / 1e6).toFixed(0)}→${(rssEnd / 1e6).toFixed(0)} MB (${(rssGrowth * 100).toFixed(1)}%)`,
      );

      expect(stalled).toBe(0); // every client's sim kept advancing
      expect(p95).toBeLessThanOrEqual(4); // TECH §11 sim budget
      expect(avgRate).toBeLessThanOrEqual(12_000); // §11 bandwidth budget
      // Flat-ish memory: the process hosts 200 in-process decoders too, so
      // allow modest growth — a leak trends far beyond this over the run.
      expect(rssGrowth).toBeLessThan(0.35);

      for (const c of clients) {
        await c.room.leave(true).catch(() => {});
      }
    },
    (SOAK_SECONDS + 90) * 1000,
  );
});
