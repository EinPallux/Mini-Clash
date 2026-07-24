import type {
  Intent,
  IntentMsg,
  MatchConfig,
  MatchPlayerConfig,
  Snapshot,
  WorkerToClient,
} from '@mini-clash/protocol';
import { SnapshotDecoder } from '@mini-clash/protocol';
import { Client as ColyseusClient, type Room } from 'colyseus.js';

/**
 * Net adapter (TECH §2): one interface, two transports. The game client cannot
 * tell offline from online apart from latency — WorkerLink structured-clones to
 * the sim worker, SocketLink speaks Colyseus to the authoritative server.
 */
export interface NetLink {
  onSnapshot: ((snap: Snapshot) => void) | null;
  /** Fires when the transport dies unexpectedly (server crash, network loss). */
  onDropped: ((reason: string) => void) | null;
  /** Server-side AFK cover state changed (socket transports only). */
  onAfk?: ((covered: boolean) => void) | null;
  /** Team quick-chat line arrived (offline: the local echo of your own). */
  onChat?: ((msg: ChatMsg) => void) | null;
  /** Send a quick-chat phrase id (whitelisted server-side). */
  sendChat?(id: string): void;
  /** Local player's seat id (assigned by the server online; SELF offline). */
  readonly playerId: number;
  /** Smoothed round-trip estimate in ms (0 offline). */
  readonly rttMs: number;
  /** Last intent sequence the authority confirmed applying (reconciliation). */
  readonly ackedSeq: number;
  /** Authoritative roster (server-sent online; null offline — config wins). */
  readonly roster: MatchPlayerConfig[] | null;
  start(config: MatchConfig): Promise<void>;
  /** Queue an intent; returns its sequence number. */
  send(intent: Intent): number;
  dispose(): void;
}

export interface ChatMsg {
  player: number;
  name: string;
  phrase: string;
}

export class WorkerLink implements NetLink {
  private worker: Worker;
  private seq = 0;
  private disposed = false;
  onSnapshot: ((snap: Snapshot) => void) | null = null;
  onDropped: ((reason: string) => void) | null = null;
  onChat: ((msg: ChatMsg) => void) | null = null;
  readonly playerId: number;
  readonly rttMs = 0;
  readonly roster = null;
  ackedSeq = -1;

  /** Offline: bots don't banter — just echo our own line locally. */
  sendChat(id: string): void {
    this.onChat?.({ player: this.playerId, name: 'You', phrase: id });
  }

  constructor(playerId: number) {
    this.playerId = playerId;
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  }

  start(config: MatchConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this.worker.addEventListener('message', (ev: MessageEvent<WorkerToClient>) => {
        const msg = ev.data;
        if (msg.t === 'ready') resolve();
        else if (msg.t === 'fatal') reject(new Error(msg.message));
        else if (msg.t === 'snapshot') this.onSnapshot?.(msg.snap);
      });
      this.worker.addEventListener('error', (e) => reject(new Error(e.message)));
      this.worker.postMessage({ t: 'init', config });
    });
  }

  send(intent: Intent): number {
    if (this.disposed) return -1;
    const msg: IntentMsg = { seq: this.seq++, player: this.playerId, intent };
    this.worker.postMessage({ t: 'intents', msgs: [msg] });
    // The worker applies before its next snapshot — everything sent is acked.
    this.ackedSeq = msg.seq;
    return msg.seq;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.postMessage({ t: 'stop' });
    this.worker.terminate();
  }
}

/** Server endpoint: same-origin wss in production, localhost in dev, ?server= override. */
export function serverEndpoint(): string {
  const override = new URLSearchParams(window.location.search).get('server');
  if (override) return override;
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  if (env?.VITE_SERVER_URL) return env.VITE_SERVER_URL;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `ws://${window.location.hostname}:2567`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

export interface SocketJoin {
  roomId: string;
  token: string;
}

/** sessionStorage key holding the refresh-proof rejoin ticket (GAME_DESIGN §17). */
export const REJOIN_KEY = 'mc.rejoin';

export interface RejoinTicket {
  roomId: string;
  token: string;
  seat: number;
  at: number;
}

export function readRejoinTicket(): RejoinTicket | null {
  try {
    const raw = sessionStorage.getItem(REJOIN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as RejoinTicket;
    if (typeof t.roomId !== 'string' || typeof t.token !== 'string') return null;
    // Matches cap out well under 30 minutes — older tickets are dead rooms.
    if (Date.now() - t.at > 30 * 60 * 1000) return null;
    return t;
  } catch {
    return null;
  }
}

export function clearRejoinTicket(): void {
  try {
    sessionStorage.removeItem(REJOIN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class SocketLink implements NetLink {
  private room: Room | null = null;
  private seq = 0;
  private disposed = false;
  private rtt = 0;
  private rttTimer: ReturnType<typeof setInterval> | null = null;
  onSnapshot: ((snap: Snapshot) => void) | null = null;
  onDropped: ((reason: string) => void) | null = null;
  /** Server put a bot on our seat (AFK) / gave it back. */
  onAfk: ((covered: boolean) => void) | null = null;
  onChat: ((msg: ChatMsg) => void) | null = null;
  playerId = 0;
  /** Last intent sequence the server acknowledged applying (reconciliation). */
  ackedSeq = -1;
  /** Authoritative roster from the server's seat message. */
  roster: MatchPlayerConfig[] | null = null;

  constructor(private opts: { endpoint?: string; name?: string; join?: SocketJoin } = {}) {}

  get rttMs(): number {
    return this.rtt;
  }

  async start(config: MatchConfig): Promise<void> {
    const client = new ColyseusClient(this.opts.endpoint ?? serverEndpoint());
    // Lobby matches join a reserved seat by token; solo online creates a room.
    let room: Room;
    try {
      room = this.opts.join
        ? await client.joinById(this.opts.join.roomId, {
            name: this.opts.name,
            token: this.opts.join.token,
          })
        : await client.create('bridge', {
            name: this.opts.name,
            roster: config.players,
            seed: config.seed,
            rig: config.rig,
          });
    } catch (err) {
      // Dead room / spent token: burn the ticket so boot stops retrying it.
      clearRejoinTicket();
      throw err instanceof Error ? err : new Error(String(err));
    }
    this.room = room;

    const seated = new Promise<void>((resolve) => {
      room.onMessage(
        'seat',
        (msg: { player: number; roster?: MatchPlayerConfig[]; rejoin?: string }) => {
          this.playerId = msg.player;
          if (Array.isArray(msg.roster)) this.roster = msg.roster;
          // Every seat message carries a fresh one-time rejoin token: a tab
          // refresh mid-match reads it back and lands on the same seat.
          if (typeof msg.rejoin === 'string') {
            try {
              sessionStorage.setItem(
                REJOIN_KEY,
                JSON.stringify({
                  roomId: room.roomId,
                  token: msg.rejoin,
                  seat: msg.player,
                  at: Date.now(),
                } satisfies RejoinTicket),
              );
            } catch {
              /* storage unavailable — refresh just won't resume */
            }
          }
          resolve();
        },
      );
    });
    room.onMessage('afk', (msg: { on: boolean }) => {
      this.onAfk?.(Boolean(msg?.on));
    });
    room.onMessage('chat', (msg: ChatMsg) => {
      this.onChat?.(msg);
    });
    // Binary delta snapshots (TECH §6): decode against accumulated state; a
    // delta arriving before our baseline returns null and is skipped.
    const decoder = new SnapshotDecoder();
    room.onMessage('snapb', (raw: Uint8Array | ArrayBuffer) => {
      const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const snap = decoder.decode(buf);
      if (!snap) return;
      if (typeof snap.ack === 'number') this.ackedSeq = snap.ack;
      this.onSnapshot?.(snap);
    });
    room.onMessage('rtt', (msg: { t: number }) => {
      const sample = Math.max(1, performance.now() - msg.t);
      this.rtt = this.rtt === 0 ? sample : this.rtt * 0.8 + sample * 0.2;
    });
    room.onLeave((code) => {
      if (!this.disposed) this.onDropped?.(`connection lost (${code})`);
    });
    room.onError((code, message) => {
      if (!this.disposed) this.onDropped?.(message ?? `room error ${code}`);
    });

    room.send('ready', {});
    await seated;
    this.rttTimer = setInterval(() => {
      if (this.room) this.room.send('rtt', { t: performance.now() });
    }, 2000);
  }

  send(intent: Intent): number {
    if (this.disposed || !this.room) return -1;
    const seq = this.seq++;
    this.room.send('intents', [{ seq, player: this.playerId, intent }]);
    return seq;
  }

  sendChat(id: string): void {
    if (!this.disposed) this.room?.send('chat', { id });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rttTimer !== null) clearInterval(this.rttTimer);
    // Deliberate exit — a refresh never runs this, so the ticket survives it.
    clearRejoinTicket();
    this.room?.leave(true).catch(() => {
      /* already gone */
    });
    this.room = null;
  }
}
