import type { ClientToWorker, IntentMsg, WorkerToClient } from '@mini-clash/protocol';
import { Sim } from '@mini-clash/sim';

/** Worker-hosted simulation (TECH §2): the same sim the server will run in v0.3. */

let sim: Sim | null = null;
let queue: IntentMsg[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function post(msg: WorkerToClient): void {
  (self as unknown as { postMessage(m: WorkerToClient): void }).postMessage(msg);
}

self.addEventListener('message', (ev: MessageEvent<ClientToWorker>) => {
  const msg = ev.data;
  switch (msg.t) {
    case 'init': {
      try {
        sim = new Sim(msg.config);
      } catch (err) {
        post({ t: 'fatal', message: err instanceof Error ? err.message : String(err) });
        return;
      }
      post({ t: 'ready' });
      const tickMs = 1000 / 30;
      let last = performance.now();
      let acc = 0;
      timer = setInterval(() => {
        if (!sim) return;
        const now = performance.now();
        acc += now - last;
        last = now;
        // Catch up after tab throttling, but never spiral (cap 10 ticks).
        let steps = 0;
        while (acc >= tickMs && steps < 10) {
          sim.applyIntents(queue);
          queue = [];
          const snap = sim.tick();
          post({ t: 'snapshot', snap });
          acc -= tickMs;
          steps++;
        }
        if (steps === 10) acc = 0;
      }, tickMs / 2);
      break;
    }
    case 'intents':
      queue.push(...msg.msgs);
      break;
    case 'stop':
      if (timer !== null) clearInterval(timer);
      sim = null;
      self.close();
      break;
  }
});
