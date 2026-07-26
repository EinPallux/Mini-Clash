import { randomBytes } from 'node:crypto';
import { QUICK_CHAT } from '@mini-clash/data';
import { SnapshotEncoder } from '@mini-clash/protocol';
import { Sim, stateHash } from '@mini-clash/sim';
import type { Client } from 'colyseus';
import { Room } from 'colyseus';
import { linked, reportMatch, verifyJoinTicket } from '../api-client';
import { log } from '../log';
import {
  clientsGauge,
  joinsCounter,
  leavesCounter,
  roomsGauge,
  snapshotBytes,
  tickHistogram,
} from '../metrics';

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

/** 45 s without input → bot takeover (GAME_DESIGN §17). Env-tunable for tests. */
function afkMs(): number {
  return Number(process.env.MC_AFK_MS ?? 45_000);
}

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
import { buildReport, MatchTally } from '../report';

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
  private intentBudget = new Map<string, { windowStart: number; count: number }>();
  /** Lobby handoff: one-time token → seat (lobby-created rooms only). */
  private reservations = new Map<string, { player: number; name: string }>();
  /** Lobby-created rooms never seat tokenless walk-ins. */
  private invitational = false;
  /** Reserved humans that haven't arrived yet (bot-covered if the match starts). */
  private awaited = new Set<number>();
  /** Clients that finished loading. */
  private loaded = new Set<string>();
  private startCap: ReturnType<typeof setTimeout> | null = null;
  /** Last intent wall-clock per client (AFK detection, GAME_DESIGN §17). */
  private lastIntent = new Map<string, number>();
  /** Binary delta-snapshot encoders, one per team view (TECH §6). */
  private encoders: [SnapshotEncoder, SnapshotEncoder] = [
    new SnapshotEncoder(),
    new SnapshotEncoder(),
  ];
  /** Seats bot-covered because their human idled (reclaim on next intent). */
  private afkSeats = new Set<number>();
  private simStartedAt = 0;
  /** Objective and swap counters, folded in as the match runs (TECH §9). */
  private tally = new MatchTally();
  /** seat → account id, from the api-signed join ticket. Bots and unlinked
   * play have none, and a seat with none is simply not paid. */
  private users = new Map<number, string>();
  /** Guards against reporting the same match twice if the room folds oddly. */
  private reported = false;
  /** Stable id for this match, minted when the sim starts. */
  private matchId = '';

  override onCreate(options: JoinOptions): void {
    this.maxClients = 8;
    const roster = validateRoster(options);
    this.match = createMatchState(roster, options);
    this.setMetadata({ mode: 'bridge', code: this.match.code });
    roomsGauge.inc();
    log.info({ room: this.roomId, code: this.match.code, seed: this.match.seed }, 'room created');
    const reserved = (options as { reservations?: unknown }).reservations;
    if (reserved && typeof reserved === 'object') {
      for (const [token, entry] of Object.entries(reserved as Record<string, unknown>)) {
        const e = entry as { player?: unknown; name?: unknown };
        if (typeof e?.player === 'number') {
          this.reservations.set(token, {
            player: e.player,
            name: typeof e.name === 'string' ? e.name.slice(0, 24) : '',
          });
          this.awaited.add(e.player);
          this.invitational = true;
        }
      }
    }

    this.onMessage('intents', (client, msgs: unknown) => {
      delayed(() => this.applyIntentBatch(client, msgs));
    });

    this.onMessage('rtt', (client, msg: unknown) => {
      delayed(() => client.send('rtt', msg));
    });

    this.onMessage('chat', (client, msg: unknown) => {
      delayed(() => this.relayChat(client, msg));
    });

    this.onMessage('ready', (client) => {
      this.loaded.add(client.sessionId);
      // Start once every connected human loaded and every reserved seat arrived;
      // slow loaders get a 20 s cap (UI_UX §7) — a bot stands in until arrival.
      if (this.startCap === null) {
        this.startCap = setTimeout(() => this.startIfReady(), 20_000);
      }
      if (this.everyoneReady()) this.startIfReady();
    });
  }

  private everyoneReady(): boolean {
    if (this.awaited.size > 0) return false;
    for (const client of this.clients) {
      if (!this.loaded.has(client.sessionId)) return false;
    }
    return true;
  }

  private applyIntentBatch(client: Client, msgs: unknown): void {
    if (!this.sim || !Array.isArray(msgs)) return;
    const player = this.seats.get(client.sessionId);
    if (player === undefined) return;
    this.lastIntent.set(client.sessionId, Date.now());
    // Any input reclaims an AFK-covered seat instantly (GAME_DESIGN §17).
    if (this.afkSeats.has(player)) {
      this.afkSeats.delete(player);
      this.match.reclaimSeat(this.sim, player);
      client.send('afk', { on: false });
    }
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

  /** One-time rejoin/handoff token for a seat (refresh-proof, GAME_DESIGN §17). */
  private mintRejoin(player: number, name: string): string {
    const token = randomBytes(12).toString('hex');
    this.reservations.set(token, { player, name });
    return token;
  }

  private sendSeat(client: Client, player: number, name: string): void {
    // A (re)joined client has no snapshot context — key the next frame.
    this.encoders[this.match.teamOf(player)].forceBaseline();
    joinsCounter.inc();
    clientsGauge.inc();
    log.info({ room: this.roomId, player, name }, 'seat assigned');
    client.send('seat', {
      player,
      roster: this.match.roster,
      seed: this.match.seed,
      rejoin: this.mintRejoin(player, name),
    });
  }

  override async onJoin(
    client: Client,
    options: JoinOptions & { token?: string; ticket?: string },
  ): Promise<void> {
    // Identity comes from the api's signed ticket, never from what the browser
    // says it is. Without a linked api there is no ticket and no payout — the
    // match still plays, it just does not count for anything (TECH §10).
    const claims = await verifyJoinTicket(options?.ticket);
    if (linked() && !claims) throw new Error('sign in to play online');

    // Seat tokens: lobby handoff or a refresh-proof rejoin — either maps to the
    // exact seat it was minted for.
    const token = typeof options?.token === 'string' ? options.token : null;
    if (token !== null) {
      const entry = this.reservations.get(token);
      if (!entry) throw new Error('invalid seat token');
      this.reservations.delete(token);
      this.awaited.delete(entry.player);
      this.seats.set(client.sessionId, entry.player);
      // Arriving after the cap (or after a refresh): take the seat back from
      // its cover bot.
      if (this.sim && this.match.covered.has(entry.player)) {
        this.afkSeats.delete(entry.player);
        this.match.reclaimSeat(this.sim, entry.player);
      }
      if (claims) this.users.set(entry.player, claims.sub);
      this.sendSeat(client, entry.player, claims?.name ?? entry.name);
      if (this.everyoneReady()) this.startIfReady();
      return;
    }
    // Lobby-created rooms are invitation-only — no tokenless walk-ins.
    if (this.invitational) {
      throw new Error('this match is private');
    }
    // Solo flow: the creating human takes the first unclaimed human seat.
    const seat = this.match.claimSeat(claims?.name ?? options?.name);
    if (seat === null) {
      throw new Error('room is full');
    }
    this.seats.set(client.sessionId, seat);
    if (claims) this.users.set(seat, claims.sub);
    this.sendSeat(client, seat, claims?.name ?? options?.name ?? '');
  }

  private startIfReady(): void {
    if (this.sim) return;
    if (this.startCap !== null) {
      clearTimeout(this.startCap);
      this.startCap = null;
    }
    this.sim = new Sim(this.match.config());
    this.simStartedAt = Date.now();
    this.matchId = `m_${randomBytes(12).toString('hex')}`;
    log.info({ room: this.roomId, awaited: this.awaited.size }, 'sim started');
    // Reserved humans that never arrived: a bot stands in until they do.
    for (const player of this.awaited) {
      this.match.coverSeat(this.sim, player);
    }
    let tickIndex = 0;
    this.setSimulationInterval(() => {
      const sim = this.sim;
      if (!sim) return;
      const t0 = performance.now();
      sim.step(); // step() leaves events queued until we broadcast them
      tickHistogram.observe(performance.now() - t0);
      tickIndex++;
      // 20 Hz downstream from a 30 Hz sim: send on 2 of every 3 ticks.
      if (tickIndex % 3 !== 0) this.broadcastSnapshots();
      if (tickIndex % 30 === 0) this.sweepAfk();
      // Desync spot-checks (ROADMAP v0.3 acceptance): a state-hash line every
      // 30 s — replays/rejoins of the same match must reproduce these exactly.
      if (tickIndex % 900 === 0) {
        log.info({ room: this.roomId, tick: tickIndex, hash: stateHash(sim) }, 'state hash');
      }
      if (sim.world.match?.over && !this.match.overAt) {
        this.match.overAt = Date.now();
        log.info(
          { room: this.roomId, winner: sim.world.match.over.winner, time: sim.world.time },
          'match over',
        );
        // Report before the podium rather than after: a player who closes the
        // tab the moment they see VICTORY still gets paid.
        void this.report();
        // Hold the room for the podium/summary, then fold it.
        this.clock.setTimeout(() => this.disconnect(), 90_000);
      }
    }, 1000 / 30);
  }

  /**
   * Send the finished match to the api (TECH §9).
   *
   * Fire-and-forget from the tick loop, but never fire-and-forget in effect:
   * `reportMatch` retries with backoff, and the api keys on the match id, so a
   * retry that duplicates a report that actually landed pays nobody twice.
   */
  private async report(): Promise<void> {
    const sim = this.sim;
    if (!sim || this.reported) return;
    this.reported = true;
    // The final tick's events have not been broadcast yet — count them first.
    this.tally.note(sim, sim.world.events);
    if (!linked()) {
      log.info({ room: this.roomId }, 'no api configured — match not recorded');
      return;
    }
    if (this.users.size === 0) {
      log.info({ room: this.roomId }, 'no signed-in players — match not recorded');
      return;
    }
    const payload = buildReport(sim, this.match, this.tally, {
      matchId: this.matchId,
      startedAt: new Date(this.simStartedAt),
      users: this.users,
    });
    await reportMatch(payload);
  }

  /** Did this client have a draft open last frame? (edge-triggers the clear). */
  private lastDraft = new Map<string, boolean>();

  private broadcastSnapshots(): void {
    const sim = this.sim;
    if (!sim) return;
    const buffers: Record<number, Uint8Array> = {
      0: this.encoders[0].encode(this.filterView(sim.snapshotFor(0), 0)),
      1: this.encoders[1].encode(this.filterView(sim.snapshotFor(1), 1)),
    };
    this.tally.note(sim, sim.world.events);
    sim.drainEvents();
    for (const client of this.clients) {
      const player = this.seats.get(client.sessionId);
      if (player === undefined) continue;
      const team = this.match.teamOf(player);
      const ack = this.acked.get(client.sessionId);
      // Per-client copy so the intent ack can be patched into the header.
      const payload = new Uint8Array(buffers[team]);
      if (ack !== undefined) {
        new DataView(payload.buffer, payload.byteOffset).setInt32(3, ack);
      }
      snapshotBytes.inc(payload.length);
      delayed(() => client.send('snapb', payload));
      // The draft is the one thing that cannot ride the team-shared buffer: a
      // teammate must not read your offers either (AUGMENTS §1). It is tiny and
      // exists for ~45 s three times a match, so it goes per-client as JSON.
      const draft = sim.draftOf(player);
      const had = this.lastDraft.get(client.sessionId) ?? false;
      if (draft) {
        this.lastDraft.set(client.sessionId, true);
        delayed(() => client.send('draft', draft));
      } else if (had) {
        this.lastDraft.set(client.sessionId, false);
        delayed(() => client.send('draft', null));
      }
    }
  }

  /** Team-scoped quick-chat relay (GAME_DESIGN §17): whitelist + rate limit. */
  private lastChat = new Map<string, number>();

  private relayChat(client: Client, msg: unknown): void {
    const id = (msg as { id?: unknown })?.id;
    if (typeof id !== 'string' || !QUICK_CHAT[id]) return;
    const player = this.seats.get(client.sessionId);
    if (player === undefined) return;
    const now = Date.now();
    if (now - (this.lastChat.get(client.sessionId) ?? 0) < 700) return;
    this.lastChat.set(client.sessionId, now);
    this.lastIntent.set(client.sessionId, now); // chatting is not AFK
    const seat = this.match.roster.find((p) => p.id === player);
    const team = this.match.teamOf(player);
    const payload = { player, name: seat?.name ?? `P${player}`, phrase: id };
    for (const c of this.clients) {
      const p = this.seats.get(c.sessionId);
      if (p !== undefined && this.match.teamOf(p) === team) {
        delayed(() => c.send('chat', payload));
      }
    }
  }

  /** Idle humans lose their seat to a bot until they act again (GAME_DESIGN §17). */
  private sweepAfk(): void {
    const sim = this.sim;
    if (!sim || sim.world.match?.over) return;
    const cutoff = Date.now() - afkMs();
    for (const client of this.clients) {
      const player = this.seats.get(client.sessionId);
      if (player === undefined || this.match.covered.has(player)) continue;
      const seat = this.match.roster.find((p) => p.id === player);
      if (!seat || seat.bot) continue;
      const last = this.lastIntent.get(client.sessionId) ?? this.simStartedAt;
      if (last < cutoff) {
        this.afkSeats.add(player);
        this.match.coverSeat(sim, player);
        client.send('afk', { on: true });
      }
    }
  }

  /**
   * Team-scope the event feed. Pings are team comms; draft events are private
   * to the drafting team, because an enemy must never read your offers or learn
   * a pick before the card shows itself on the field (AUGMENTS §1, UI_UX §9).
   * Everything else is public.
   */
  private filterView(
    snap: ReturnType<Sim['snapshotFor']>,
    team: 0 | 1,
  ): ReturnType<Sim['snapshotFor']> {
    return {
      ...snap,
      events: snap.events.filter((ev) => {
        switch (ev.t) {
          case 'ping':
          case 'draftOpen':
          case 'draftReroll':
          case 'augmentPicked':
            return ev.team === team;
          default:
            return true;
        }
      }),
    };
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.seats.get(client.sessionId);
    if (player === undefined) return;
    leavesCounter.inc();
    clientsGauge.dec();
    log.info({ room: this.roomId, player, consented }, 'client left');
    const matchOver = this.sim?.world.match?.over ?? false;
    if (!consented && !matchOver) {
      // Hold the seat 90 s (GAME_DESIGN §17); the sim's bot brain covers it.
      // Dropping during loading counts too — the sim covers the seat at start.
      if (this.sim) this.match.coverSeat(this.sim, player);
      else this.awaited.add(player);
      try {
        await this.allowReconnection(client, 90);
        this.awaited.delete(player);
        this.afkSeats.delete(player);
        if (this.sim && this.match.covered.has(player)) this.match.reclaimSeat(this.sim, player);
        this.seats.set(client.sessionId, player);
        this.sendSeat(client, player, '');
        return;
      } catch {
        // Reservation expired — the bot keeps the seat for the rest of the match.
      }
    }
    this.seats.delete(client.sessionId);
    this.intentBudget.delete(client.sessionId);
    this.loaded.delete(client.sessionId);
    this.lastIntent.delete(client.sessionId);
    // A leaver may have been the last thing loading was waiting on.
    if (!this.sim && this.startCap !== null && this.everyoneReady()) this.startIfReady();
  }

  override onDispose(): void {
    if (this.startCap !== null) clearTimeout(this.startCap);
    this.sim = null;
    roomsGauge.dec();
    log.info({ room: this.roomId }, 'room disposed');
  }
}
