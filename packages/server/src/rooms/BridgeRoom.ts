import { Sim } from '@mini-clash/sim';
import type { Client } from 'colyseus';
import { Room } from 'colyseus';

/**
 * Lag simulation knobs (acceptance: playable at 150 ms + loss). TCP semantics:
 * "loss" manifests as retransmit delay, so a lossy packet is a late packet.
 *   MC_FAKE_LAG_MS    one-way delay applied to both directions
 *   MC_FAKE_JITTER_MS uniform extra 0..N
 *   MC_FAKE_LOSS      probability [0..1] a message is delayed an extra ~200 ms
 */
const FAKE_LAG = Number(process.env.MC_FAKE_LAG_MS ?? 0);
const FAKE_JITTER = Number(process.env.MC_FAKE_JITTER_MS ?? 0);
const FAKE_LOSS = Number(process.env.MC_FAKE_LOSS ?? 0);

function delayed(fn: () => void): void {
  if (FAKE_LAG <= 0 && FAKE_JITTER <= 0 && FAKE_LOSS <= 0) {
    fn();
    return;
  }
  let ms = FAKE_LAG + Math.random() * FAKE_JITTER;
  if (FAKE_LOSS > 0 && Math.random() < FAKE_LOSS) ms += 200;
  setTimeout(fn, ms);
}

import {
  applyIntent,
  createMatchState,
  type JoinOptions,
  type MatchRuntimeState,
  validateRoster,
} from '../match';

/**
 * Authoritative Bridge Brawl room (TECH §6): seats up to 8 (humans + bots),
 * hosts the same deterministic sim the offline worker runs, ticks at 30 Hz and
 * fans out per-team snapshots at 20 Hz (2-of-3 tick cadence). Clients send the
 * same IntentMsg stream as offline — the sim validates everything.
 */
export class BridgeRoom extends Room {
  private match!: MatchRuntimeState;
  private sim: Sim | null = null;
  /** sessionId → playerId. */
  private seats = new Map<string, number>();
  /** sessionId → last intent seq applied (echoed for client reconciliation). */
  private acked = new Map<string, number>();
  /** Reserved seats for reconnect (playerId → reservation deadline). */
  private intentBudget = new Map<string, { windowStart: number; count: number }>();

  override onCreate(options: JoinOptions): void {
    this.maxClients = 8;
    const roster = validateRoster(options);
    this.match = createMatchState(roster, options);
    this.setMetadata({ mode: 'bridge', code: this.match.code });

    this.onMessage('intents', (client, msgs: unknown) => {
      delayed(() => this.applyIntentBatch(client, msgs));
    });

    this.onMessage('rtt', (client, msg: unknown) => {
      delayed(() => client.send('rtt', msg));
    });

    this.onMessage('ready', (client) => {
      // Client finished loading — start ticking once the first human is in.
      void client;
      this.startIfReady();
    });
  }

  private applyIntentBatch(client: Client, msgs: unknown): void {
    if (!this.sim || !Array.isArray(msgs)) return;
    const player = this.seats.get(client.sessionId);
    if (player === undefined) return;
    // ≤30 intents/s per client — drop the excess, never the connection.
    const budget = this.intentBudget.get(client.sessionId) ?? { windowStart: 0, count: 0 };
    const now = Date.now();
    if (now - budget.windowStart > 1000) {
      budget.windowStart = now;
      budget.count = 0;
    }
    for (const raw of msgs) {
      if (budget.count >= 30) break;
      budget.count++;
      // The seat map is the identity authority — the wire player id is ignored.
      applyIntent(this.sim, player, raw);
      const seq = (raw as { seq?: number }).seq;
      if (typeof seq === 'number') this.acked.set(client.sessionId, seq);
    }
    this.intentBudget.set(client.sessionId, budget);
  }

  override onJoin(client: Client, options: JoinOptions): void {
    // v0.3 slice: the creating human takes seat 1; later humans claim bot seats
    // (lobby room hands out explicit seat assignments).
    const seat = this.match.claimSeat(options?.name);
    if (seat === null) {
      throw new Error('room is full');
    }
    this.seats.set(client.sessionId, seat);
    client.send('seat', { player: seat, roster: this.match.roster, seed: this.match.seed });
  }

  private startIfReady(): void {
    if (this.sim) return;
    this.sim = new Sim(this.match.config());
    let tickIndex = 0;
    this.setSimulationInterval(() => {
      const sim = this.sim;
      if (!sim) return;
      sim.step(); // step() leaves events queued until we broadcast them
      tickIndex++;
      // 20 Hz downstream from a 30 Hz sim: send on 2 of every 3 ticks.
      if (tickIndex % 3 !== 0) this.broadcastSnapshots();
      if (sim.world.match?.over && !this.match.overAt) {
        this.match.overAt = Date.now();
        // Hold the room for the podium/summary, then fold it.
        this.clock.setTimeout(() => this.disconnect(), 90_000);
      }
    }, 1000 / 30);
  }

  private broadcastSnapshots(): void {
    const sim = this.sim;
    if (!sim) return;
    const views: Record<number, unknown> = {
      0: this.filterView(sim.snapshotFor(0), 0),
      1: this.filterView(sim.snapshotFor(1), 1),
    };
    sim.drainEvents();
    for (const client of this.clients) {
      const player = this.seats.get(client.sessionId);
      if (player === undefined) continue;
      const team = this.match.teamOf(player);
      const ack = this.acked.get(client.sessionId);
      const payload = ack === undefined ? views[team] : { ...(views[team] as object), ack };
      delayed(() => client.send('snap', payload));
    }
  }

  /** Team-scope the event feed: pings are team comms, everything else is public. */
  private filterView(
    snap: ReturnType<Sim['snapshotFor']>,
    team: 0 | 1,
  ): ReturnType<Sim['snapshotFor']> {
    return {
      ...snap,
      events: snap.events.filter((ev) => ev.t !== 'ping' || ev.team === team),
    };
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.seats.get(client.sessionId);
    if (player === undefined) return;
    if (!consented && this.sim && !this.sim.world.match?.over) {
      // Hold the seat 90 s (GAME_DESIGN §17); the sim's bot brain covers it.
      this.match.coverSeat(this.sim, player);
      try {
        await this.allowReconnection(client, 90);
        this.match.reclaimSeat(this.sim, player);
        this.seats.set(client.sessionId, player);
        client.send('seat', { player, roster: this.match.roster, seed: this.match.seed });
        return;
      } catch {
        // Reservation expired — the bot keeps the seat for the rest of the match.
      }
    }
    this.seats.delete(client.sessionId);
    this.intentBudget.delete(client.sessionId);
  }

  override onDispose(): void {
    this.sim = null;
  }
}
