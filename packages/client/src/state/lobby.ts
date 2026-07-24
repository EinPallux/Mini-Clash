import type {
  LobbyClientMsg,
  LobbyMatchMsg,
  LobbySelectSnap,
  LobbySnap,
} from '@mini-clash/protocol';
import { Client as ColyseusClient, type Room } from 'colyseus.js';
import { create } from 'zustand';
import { serverEndpoint } from '../game/link';
import { useSession } from './session';

/**
 * The party/lobby connection (UI_UX §5). Lives outside any screen so the dock
 * stays ambient: you can browse the hub — or play a match on a second socket —
 * while the lobby room stays connected for "Play Again".
 */

export type LobbyStatus = 'idle' | 'connecting' | 'in' | 'error';

interface LobbyState {
  status: LobbyStatus;
  /** Friendly failure ("that code isn't live…") — shown by the join UI. */
  error: string | null;
  snap: LobbySnap | null;
  select: LobbySelectSnap | null;
  /** Wall-clock stamp of the last select view (local countdown base). */
  selectAt: number;
  myKey: string;
  /** Pending ?join=CODE deep link, consumed by the hub once a profile exists. */
  pendingCode: string | null;
  create: (name: string) => Promise<boolean>;
  join: (code: string, name: string) => Promise<boolean>;
  send: (msg: LobbyClientMsg) => void;
  leave: () => void;
  setPendingCode: (code: string | null) => void;
  clearError: () => void;
}

let room: Room | null = null;

/** ws(s):// endpoint → http(s):// for the code-lookup call. */
function httpEndpoint(): string {
  return serverEndpoint().replace(/^ws/, 'http');
}

function bind(r: Room, set: (partial: Partial<LobbyState>) => void): void {
  room = r;
  r.onMessage('welcome', (msg: { key: string }) => set({ myKey: msg.key }));
  r.onMessage('lobby', (snap: LobbySnap) => set({ snap, status: 'in' }));
  r.onMessage('select', (snap: LobbySelectSnap) => {
    set({ select: snap, selectAt: performance.now() });
  });
  r.onMessage('match', (msg: LobbyMatchMsg) => {
    // Handoff: the lobby stays connected; the match runs on its own socket.
    const session = useSession.getState();
    session.setMatchJoin(msg);
    session.setMatchMode('bridge');
    session.setBridgeLineup(null);
    set({ select: null });
    session.goto('match');
  });
  r.onMessage('lobbyError', (msg: { message: string }) => {
    set({ error: msg.message });
  });
  r.onLeave(() => {
    if (room === r) {
      room = null;
      set({
        status: 'error',
        error: 'lobby connection lost',
        snap: null,
        select: null,
        myKey: '',
      });
    }
  });
}

export const useLobby = create<LobbyState>()((set, get) => ({
  status: 'idle',
  error: null,
  snap: null,
  select: null,
  selectAt: 0,
  myKey: '',
  pendingCode: null,

  create: async (name: string): Promise<boolean> => {
    get().leave();
    set({ status: 'connecting', error: null });
    try {
      const client = new ColyseusClient(serverEndpoint());
      const r = await client.create('lobby', { name });
      bind(r, set);
      set({ status: 'in' });
      return true;
    } catch (err) {
      set({
        status: 'error',
        error: `couldn't reach the lobby server — ${err instanceof Error ? err.message : 'offline?'}`,
      });
      return false;
    }
  },

  join: async (code: string, name: string): Promise<boolean> => {
    get().leave();
    set({ status: 'connecting', error: null });
    const clean = code.trim().toUpperCase();
    try {
      const res = await fetch(`${httpEndpoint()}/lobby/${encodeURIComponent(clean)}`);
      if (!res.ok) {
        set({ status: 'error', error: `no lobby is live at ${clean}` });
        return false;
      }
      const { roomId } = (await res.json()) as { roomId: string };
      const client = new ColyseusClient(serverEndpoint());
      const r = await client.joinById(roomId, { name });
      bind(r, set);
      set({ status: 'in' });
      return true;
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : `couldn't join ${clean}`,
      });
      return false;
    }
  },

  send: (msg: LobbyClientMsg): void => {
    room?.send(msg.t, msg);
  },

  leave: (): void => {
    const r = room;
    room = null; // marks the leave as intentional for the onLeave handler
    r?.leave(true).catch(() => {
      /* already gone */
    });
    set({ status: 'idle', error: null, snap: null, select: null, myKey: '' });
  },

  setPendingCode: (code) => set({ pendingCode: code }),
  clearError: () => set({ error: null }),
}));
