import { createServer } from 'node:http';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Server } from 'colyseus';
import { lookupLobby } from './lobby-registry';
import { BridgeRoom } from './rooms/BridgeRoom';
import { LobbyRoom } from './rooms/LobbyRoom';

/**
 * Mini Clash game server (TECH §2): Colyseus rooms hosting the deterministic sim.
 * One process runs many rooms; the platform api (v0.7+) will front auth/tickets.
 */

const port = Number(process.env.PORT ?? 2567);

const http = createServer((req, res) => {
  // The lobby lookup is called cross-origin from the dev client.
  const cors = { 'access-control-allow-origin': '*' };
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }
  const lobby = req.url?.match(/^\/lobby\/([A-Za-z0-9]{6})$/);
  if (lobby) {
    const roomId = lookupLobby(lobby[1]);
    if (roomId) {
      res.writeHead(200, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify({ roomId }));
    } else {
      res.writeHead(404, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify({ error: 'no such lobby' }));
    }
    return;
  }
  res.writeHead(404, cors);
  res.end();
});

const server = new Server({ transport: new WebSocketTransport({ server: http }) });
server.define('bridge', BridgeRoom);
server.define('lobby', LobbyRoom);

server.listen(port).then(() => {
  console.info(`mini-clash server listening on :${port}`);
});
