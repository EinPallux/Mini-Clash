import { createServer } from 'node:http';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { CHAMPION_LIST, CHAMPIONS } from '@mini-clash/data';
import type { LobbyMatchMsg, LobbySelectSnap, LobbySnap, Snapshot } from '@mini-clash/protocol';
import { SnapshotDecoder } from '@mini-clash/protocol';
import { Server } from 'colyseus';
import { Client as JsClient, type Room as JsRoom } from 'colyseus.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lookupLobby } from '../src/lobby-registry';
import { BridgeRoom } from '../src/rooms/BridgeRoom';
import { LobbyRoom } from '../src/rooms/LobbyRoom';

/**
 * Lobby contract (UI_UX §5): codes, seats, bots, readiness, crown migration,
 * the server-side select deal, and the reservation handoff into a BridgeRoom.
 */

let server: Server;
let port: number;

beforeAll(async () => {
  const http = createServer();
  server = new Server({ transport: new WebSocketTransport({ server: http }) });
  server.define('bridge', BridgeRoom);
  server.define('lobby', LobbyRoom);
  await server.listen(0);
  const addr = http.address();
  if (typeof addr === 'object' && addr) port = addr.port;
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

async function waitFor(cond: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 50));
  }
}

interface Member {
  room: JsRoom;
  key: string;
  lobby: LobbySnap | null;
  select: LobbySelectSnap | null;
  match: LobbyMatchMsg | null;
}

function track(room: JsRoom): Member {
  const m: Member = { room, key: '', lobby: null, select: null, match: null };
  room.onMessage('welcome', (msg: { key: string }) => {
    m.key = msg.key;
  });
  room.onMessage('lobby', (snap: LobbySnap) => {
    m.lobby = snap;
  });
  room.onMessage('select', (snap: LobbySelectSnap) => {
    m.select = snap;
  });
  room.onMessage('match', (msg: LobbyMatchMsg) => {
    m.match = msg;
  });
  room.onMessage('lobbyError', () => {});
  return m;
}

describe('lobby room', () => {
  it('runs the full flow: code join, seats, bots, ready, select, handoff into a private match', async () => {
    const c1 = new JsClient(`ws://127.0.0.1:${port}`);
    const leader = track(await c1.create('lobby', { name: 'Cap' }));
    await waitFor(() => leader.lobby !== null && leader.key !== '');
    const code = leader.lobby!.code;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(lookupLobby(code)).toBeTruthy();

    // Second human joins by code → roomId lookup → joinById.
    const c2 = new JsClient(`ws://127.0.0.1:${port}`);
    const friend = track(await c2.joinById(lookupLobby(code)!, { name: 'Pal' }));
    await waitFor(() => friend.lobby !== null && friend.key !== '');
    expect(leader.lobby!.seats.filter((s) => s.occupant?.kind === 'human').length).toBe(2);

    // Friend moves to the other team; leader can't start until friend readies.
    friend.room.send('seat', { team: 1, idx: 0 });
    await waitFor(() => {
      const seat = leader.lobby!.seats.find((s) => s.team === 1 && s.idx === 0);
      return seat?.occupant?.kind === 'human';
    });
    expect(leader.lobby!.startBlocked).toContain('ready');

    // Leader fills a specific seat with an elite bot; bot-fill covers the rest.
    leader.room.send('bot', { team: 0, idx: 1, tier: 'elite' });
    await waitFor(() => {
      const seat = leader.lobby!.seats.find((s) => s.team === 0 && s.idx === 1);
      return seat?.occupant?.kind === 'bot' && seat.occupant.tier === 'elite';
    });
    // Non-leaders can't place bots.
    friend.room.send('bot', { team: 0, idx: 2, tier: 'recruit' });
    await new Promise((r) => setTimeout(r, 200));
    expect(leader.lobby!.seats.find((s) => s.team === 0 && s.idx === 2)?.occupant).toBeNull();

    friend.room.send('ready', { on: true });
    await waitFor(() => leader.lobby!.startBlocked === null);

    // START deals both humans a DUO; team views never leak enemy picks.
    leader.room.send('start', {});
    await waitFor(() => leader.select !== null && friend.select !== null);
    expect(CHAMPIONS[leader.select!.you.duo[0]]).toBeTruthy();
    expect(CHAMPIONS[leader.select!.you.duo[1]]).toBeTruthy();
    expect(leader.select!.you.duo[0]).not.toBe(leader.select!.you.duo[1]);
    expect(leader.select!.you.rerolls).toBe(2);
    expect(leader.select!.team.filter((t) => !t.bot).length).toBe(1); // friend is enemy-side
    expect(leader.select!.enemyCount).toBe(4);
    // 4 duos = 8 slots. The deal exhausts the roster before repeating, so it is
    // duplicate-free exactly when the roster has 8+ champions (Boltz and Wisp
    // close that gap in v0.4); a single duo never repeats either way.
    const picks = leader.select!.team.flatMap((t) => t.duo);
    expect(picks.length).toBe(8);
    expect(new Set(picks).size).toBe(Math.min(8, CHAMPION_LIST.length));
    for (const t of leader.select!.team) expect(t.duo[0]).not.toBe(t.duo[1]);

    // Reroll slot 1: that half lands on the shared bench, counter decrements.
    const before = leader.select!.you.duo[1];
    const keptActive = leader.select!.you.duo[0];
    leader.room.send('reroll', { slot: 1 });
    await waitFor(() => leader.select!.you.rerolls === 1);
    expect(leader.select!.bench).toContain(before);
    expect(leader.select!.you.duo[1]).not.toBe(before);
    expect(leader.select!.you.duo[0]).toBe(keptActive); // the other half is untouched

    // Swap it back off the bench into that same slot.
    leader.room.send('swap', { championId: before, slot: 1 });
    await waitFor(() => leader.select!.you.duo[1] === before);
    expect(leader.select!.you.duo[0]).toBe(keptActive);

    // Both lock → each human gets a private reservation into the same room.
    leader.room.send('lock', {});
    friend.room.send('lock', {});
    await waitFor(() => leader.match !== null && friend.match !== null);
    expect(leader.match!.roomId).toBe(friend.match!.roomId);
    expect(leader.match!.token).not.toBe(friend.match!.token);
    expect(leader.match!.seat).not.toBe(friend.match!.seat);

    // Tokens seat us at the exact lobby-assigned seats; walk-ins are rejected.
    const m1 = await c1.joinById(leader.match!.roomId, { token: leader.match!.token });
    let seat1: { player: number } | null = null;
    m1.onMessage('seat', (msg: { player: number }) => {
      seat1 = msg;
    });
    m1.onMessage('snapb', () => {});
    const m2 = await c2.joinById(friend.match!.roomId, { token: friend.match!.token });
    let seat2: {
      player: number;
      roster: { id: number; bot?: string; championId: string; benchId?: string }[];
    } | null = null;
    m2.onMessage(
      'seat',
      (msg: {
        player: number;
        roster: { id: number; bot?: string; championId: string; benchId?: string }[];
      }) => {
        seat2 = msg;
      },
    );
    const snaps2: Snapshot[] = [];
    const dec2 = new SnapshotDecoder();
    m2.onMessage('snapb', (raw: Uint8Array | ArrayBuffer) => {
      const s = dec2.decode(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
      if (s) snaps2.push(s);
    });
    await waitFor(() => seat1 !== null && seat2 !== null);
    expect(seat1!.player).toBe(leader.match!.seat);
    expect(seat2!.player).toBe(friend.match!.seat);
    // The composed roster carries the elite bot where the leader placed it
    // (team 0 column position 1 → roster id 2).
    const eliteSeat = seat2!.roster.find((p) => p.id === 2);
    expect(eliteSeat?.bot).toBe('elite');
    // Every seat plays a duo (GAME_DESIGN §7.1).
    for (const p of seat2!.roster) {
      expect(p.benchId).toBeTruthy();
      expect(p.benchId).not.toBe(p.championId);
    }

    await expect(
      new JsClient(`ws://127.0.0.1:${port}`).joinById(leader.match!.roomId, {}),
    ).rejects.toThrow();

    // Both load → the sim starts and snapshots flow.
    m1.send('ready', {});
    m2.send('ready', {});
    await waitFor(() => snaps2.length > 2);
    expect(snaps2[0].entities.filter((e) => e.kind === 'champion').length).toBe(8);

    // Lobby went back to 'lobby' phase for Play Again.
    await waitFor(() => leader.lobby!.phase === 'lobby');

    await m1.leave(true);
    await m2.leave(true);
    await leader.room.leave(true);
    await friend.room.leave(true);
  }, 30000);

  it('migrates the crown when the leader leaves and releases the code on dispose', async () => {
    const c1 = new JsClient(`ws://127.0.0.1:${port}`);
    const leader = track(await c1.create('lobby', { name: 'First' }));
    await waitFor(() => leader.lobby !== null);
    const code = leader.lobby!.code;

    const c2 = new JsClient(`ws://127.0.0.1:${port}`);
    const heir = track(await c2.joinById(lookupLobby(code)!, { name: 'Second' }));
    await waitFor(() => heir.lobby !== null && heir.key !== '');

    await leader.room.leave(true);
    await waitFor(() => {
      const me = heir.lobby!.seats.find(
        (s) => s.occupant?.kind === 'human' && s.occupant.key === heir.key,
      );
      return me?.occupant?.kind === 'human' && me.occupant.leader;
    });

    await heir.room.leave(true);
    await waitFor(() => lookupLobby(code) === null, 5000);
  }, 20000);
});
