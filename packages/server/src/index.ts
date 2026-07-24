import { createServer } from 'node:http';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Server } from 'colyseus';
import { BridgeRoom } from './rooms/BridgeRoom';

/**
 * Mini Clash game server (TECH §2): Colyseus rooms hosting the deterministic sim.
 * One process runs many rooms; the platform api (v0.7+) will front auth/tickets.
 */

const port = Number(process.env.PORT ?? 2567);

const http = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const server = new Server({ transport: new WebSocketTransport({ server: http }) });
server.define('bridge', BridgeRoom);

server.listen(port).then(() => {
  console.info(`mini-clash server listening on :${port}`);
});
