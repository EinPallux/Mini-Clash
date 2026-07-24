import type {
  Intent,
  IntentMsg,
  MatchConfig,
  Snapshot,
  WorkerToClient,
} from '@mini-clash/protocol';
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
  /** Local player's seat id (assigned by the server online; SELF offline). */
  readonly playerId: number;
  /** Smoothed round-trip estimate in ms (0 offline). */
  readonly rttMs: number;
  start(config: MatchConfig): Promise<void>;
  send(intent: Intent): void;
  dispose(): void;
}

export class WorkerLink implements NetLink {
  private worker: Worker;
  private seq = 0;
  private disposed = false;
  onSnapshot: ((snap: Snapshot) => void) | null = null;
  onDropped: ((reason: string) => void) | null = null;
  readonly playerId: number;
  readonly rttMs = 0;

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

  send(intent: Intent): void {
    if (this.disposed) return;
    const msg: IntentMsg = { seq: this.seq++, player: this.playerId, intent };
    this.worker.postMessage({ t: 'intents', msgs: [msg] });
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

export class SocketLink implements NetLink {
  private room: Room | null = null;
  private seq = 0;
  private disposed = false;
  private rtt = 0;
  private rttTimer: ReturnType<typeof setInterval> | null = null;
  onSnapshot: ((snap: Snapshot) => void) | null = null;
  onDropped: ((reason: string) => void) | null = null;
  playerId = 0;
  /** Last intent sequence the server acknowledged applying (reconciliation). */
  ackedSeq = -1;

  constructor(
    private endpoint = serverEndpoint(),
    private joinName?: string,
  ) {}

  get rttMs(): number {
    return this.rtt;
  }

  async start(config: MatchConfig): Promise<void> {
    const client = new ColyseusClient(this.endpoint);
    const room = await client.create('bridge', {
      name: this.joinName,
      roster: config.players,
      seed: config.seed,
      rig: config.rig,
    });
    this.room = room;

    const seated = new Promise<void>((resolve) => {
      room.onMessage('seat', (msg: { player: number }) => {
        this.playerId = msg.player;
        resolve();
      });
    });
    room.onMessage('snap', (snap: Snapshot & { ack?: number }) => {
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

  send(intent: Intent): void {
    if (this.disposed || !this.room) return;
    this.room.send('intents', [{ seq: this.seq++, player: this.playerId, intent }]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rttTimer !== null) clearInterval(this.rttTimer);
    this.room?.leave(true).catch(() => {
      /* already gone */
    });
    this.room = null;
  }
}
