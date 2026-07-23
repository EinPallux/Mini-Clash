import type {
  Intent,
  IntentMsg,
  MatchConfig,
  Snapshot,
  WorkerToClient,
} from '@mini-clash/protocol';

/**
 * WorkerLink — the offline implementation of the net adapter interface (TECH §2).
 * SocketLink (v0.3) will present the same surface over Colyseus.
 */
export class WorkerLink {
  private worker: Worker;
  private seq = 0;
  private disposed = false;
  onSnapshot: ((snap: Snapshot) => void) | null = null;

  constructor() {
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

  send(player: number, intent: Intent): void {
    if (this.disposed) return;
    const msg: IntentMsg = { seq: this.seq++, player, intent };
    this.worker.postMessage({ t: 'intents', msgs: [msg] });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.postMessage({ t: 'stop' });
    this.worker.terminate();
  }
}
