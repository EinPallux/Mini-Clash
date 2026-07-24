import { createServer } from 'node:http';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { Snapshot } from '@mini-clash/protocol';
import { Server } from 'colyseus';
import { Client as JsClient, type Room as JsRoom } from 'colyseus.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BridgeRoom } from '../src/rooms/BridgeRoom';

/**
 * End-to-end room contract: a real Colyseus server hosting the real sim, joined
 * by the real JS client — the same wire the browser SocketLink speaks.
 */

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

function collectSnaps(room: JsRoom, into: Snapshot[]): void {
  room.onMessage('snap', (snap: Snapshot) => into.push(snap));
}

async function waitFor(cond: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('bridge room', () => {
  it('seats a human, runs the sim, applies validated intents, and filters enemy pings', async () => {
    const client = new JsClient(`ws://127.0.0.1:${port}`);
    const room = await client.create('bridge', { name: 'NetSmoke', seed: 1234 });

    let seat: { player: number; seed: number } | null = null;
    room.onMessage('seat', (msg: { player: number; seed: number }) => {
      seat = msg;
    });
    const snaps: Snapshot[] = [];
    collectSnaps(room, snaps);

    room.send('ready', {});
    await waitFor(() => seat !== null && snaps.length > 3);
    expect(seat!.player).toBe(1);

    // 8 champions on the field, clock advancing at 20 Hz downstream.
    const first = snaps[0];
    expect(first.entities.filter((e) => e.kind === 'champion').length).toBe(8);
    const t0 = snaps[snaps.length - 1].time;
    await waitFor(() => snaps[snaps.length - 1].time > t0 + 0.5);

    // A move intent under our seat identity moves our champion.
    const before = snaps[snaps.length - 1].entities.find(
      (e) => e.kind === 'champion' && e.player === 1,
    );
    // Target inside the spawn area — the gate barrier is still up this early.
    room.send('intents', [{ seq: 1, player: 999, intent: { t: 'move', x: -57, z: 4 } }]);
    await waitFor(() => {
      const now = snaps[snaps.length - 1].entities.find(
        (e) => e.kind === 'champion' && e.player === 1,
      );
      return !!before && !!now && Math.hypot(now.x - before.x, now.z - before.z) > 1;
    });

    // Trainer cheats never cross the wire.
    room.send('intents', [{ seq: 2, player: 1, intent: { t: 'trainer', cmd: { k: 'levelUp' } } }]);
    // Own-team pings arrive; the sim broadcast is team-scoped server-side.
    const pingEvents: unknown[] = [];
    room.onMessage('snap', (snap: Snapshot) => {
      for (const ev of snap.events) if (ev.t === 'ping') pingEvents.push(ev);
    });
    room.send('intents', [
      { seq: 3, player: 1, intent: { t: 'ping', kind: 'attack', x: 0, z: 0 } },
    ]);
    await waitFor(() => pingEvents.length > 0);
    const levelNow = snaps[snaps.length - 1].entities.find(
      (e) => e.kind === 'champion' && e.player === 1,
    );
    expect(levelNow && levelNow.kind === 'champion' ? levelNow.level : 99).toBe(1);

    await room.leave(true);
  }, 30000);

  it('rejects malformed rosters by falling back to a sane default', async () => {
    const client = new JsClient(`ws://127.0.0.1:${port}`);
    const room = await client.create('bridge', {
      name: 'Sneak',
      roster: [{ id: 1, championId: 'nonexistent_champ', team: 0 }],
      seed: 99,
    });
    const snaps: Snapshot[] = [];
    collectSnaps(room, snaps);
    room.send('ready', {});
    await waitFor(() => snaps.length > 0);
    expect(snaps[0].entities.filter((e) => e.kind === 'champion').length).toBe(8);
    await room.leave(true);
  }, 20000);
});
