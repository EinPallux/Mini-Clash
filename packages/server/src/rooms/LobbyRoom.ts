import { randomBytes } from 'node:crypto';
import type { Client } from '@colyseus/core';
import { matchMaker, Room } from '@colyseus/core';
import { CHAMPION_LIST } from '@mini-clash/data';
import type {
  BotTier,
  LobbySeatSnap,
  LobbySelectSnap,
  LobbySnap,
  MatchPlayerConfig,
} from '@mini-clash/protocol';
import { issueLobbyCode, releaseLobbyCode } from '../lobby-registry';

/**
 * Custom lobby (UI_UX §5): two team columns of 4 seats, joinable by 6-char
 * code, per-seat bot difficulty, bot-fill, leader START gated on readiness.
 * START runs the champion-select deal server-side (per-human deal + 2 rerolls,
 * shared team bench with atomic swaps, 45 s auto-lock), then composes the
 * authoritative roster and hands every human a seat reservation into a fresh
 * BridgeRoom. The lobby survives the match for "Play Again".
 */

const SELECT_SECONDS = 60;
const TIERS: BotTier[] = ['recruit', 'veteran', 'elite'];
const BOT_NAMES = ['Krag', 'Nyx', 'Piston', 'Moxie', 'Thorn', 'Ember', 'Gruff', 'Fizz'];

interface HumanSeat {
  kind: 'human';
  sessionId: string;
  name: string;
  ready: boolean;
  joinedAt: number;
}

interface BotSeat {
  kind: 'bot';
  tier: BotTier;
}

type Seat = HumanSeat | BotSeat | null;

interface SelectSeat {
  /** [active, bench] — the pair this seat will play (GAME_DESIGN §7.1). */
  duo: [string, string];
  rerolls: number;
  locked: boolean;
}

export class LobbyRoom extends Room {
  private code = '';
  /** Index = team * 4 + column position. */
  private seats: Seat[] = [null, null, null, null, null, null, null, null];
  private leader: string | null = null;
  private botFill = true;
  private phase: 'lobby' | 'select' = 'lobby';
  private joinCounter = 0;
  /** Per-seat select state (index-aligned with seats; bots lock instantly). */
  private select: (SelectSeat | null)[] = [];
  private benches: [string[], string[]] = [[], []];
  private selectDeadline = 0;
  private selectTimer: ReturnType<typeof setTimeout> | null = null;

  override onCreate(): void {
    this.maxClients = 8;
    this.autoDispose = true;
    this.code = issueLobbyCode(this.roomId);
    this.setMetadata({ mode: 'lobby', code: this.code });

    this.onMessage('seat', (client, msg: unknown) => this.moveSeat(client, msg));
    this.onMessage('bot', (client, msg: unknown) => this.setBot(client, msg));
    this.onMessage('fill', (client, msg: unknown) => {
      if (client.sessionId !== this.leader || this.phase !== 'lobby') return;
      this.botFill = Boolean((msg as { on?: unknown })?.on);
      this.broadcastLobby();
    });
    this.onMessage('ready', (client, msg: unknown) => {
      const seat = this.humanSeat(client.sessionId);
      if (!seat || this.phase !== 'lobby') return;
      seat.ready = Boolean((msg as { on?: unknown })?.on);
      this.broadcastLobby();
    });
    this.onMessage('start', (client) => this.startSelect(client));
    this.onMessage('reroll', (client, msg: unknown) => this.reroll(client, msg));
    this.onMessage('swap', (client, msg: unknown) => this.swap(client, msg));
    this.onMessage('lock', (client) => this.lockIn(client));
  }

  override onJoin(client: Client, options: { name?: string } | undefined): void {
    if (this.phase !== 'lobby') throw new Error('match starting — try again in a moment');
    const free = this.seats.findIndex((s) => s === null);
    if (free === -1) throw new Error('lobby is full');
    const name =
      typeof options?.name === 'string' && options.name.trim().length > 0
        ? options.name.trim().slice(0, 24)
        : `Player ${++this.joinCounter}`;
    this.seats[free] = {
      kind: 'human',
      sessionId: client.sessionId,
      name,
      ready: false,
      joinedAt: ++this.joinCounter,
    };
    if (this.leader === null) this.leader = client.sessionId;
    client.send('welcome', { key: client.sessionId, code: this.code });
    this.broadcastLobby();
  }

  override onLeave(client: Client): void {
    const idx = this.seats.findIndex(
      (s) => s?.kind === 'human' && s.sessionId === client.sessionId,
    );
    if (idx === -1) return;
    if (this.phase === 'select') {
      // Mid-select desertion: the seat becomes a bot keeping the current pick.
      this.seats[idx] = { kind: 'bot', tier: 'veteran' };
      const sel = this.select[idx];
      if (sel) sel.locked = true;
    } else {
      this.seats[idx] = null;
    }
    if (this.leader === client.sessionId) this.migrateCrown();
    this.broadcastLobby();
    if (this.phase === 'select') {
      this.broadcastSelect();
      this.finishSelectIfLocked();
    }
  }

  override onDispose(): void {
    if (this.selectTimer !== null) clearTimeout(this.selectTimer);
    releaseLobbyCode(this.code);
  }

  /* ------------------------------- lobby phase ------------------------------ */

  private humanSeat(sessionId: string): HumanSeat | null {
    for (const s of this.seats) {
      if (s?.kind === 'human' && s.sessionId === sessionId) return s;
    }
    return null;
  }

  private migrateCrown(): void {
    let best: { sessionId: string; joinedAt: number } | null = null;
    for (const s of this.seats) {
      if (s?.kind === 'human' && (best === null || s.joinedAt < best.joinedAt)) best = s;
    }
    this.leader = best?.sessionId ?? null;
  }

  private moveSeat(client: Client, msg: unknown): void {
    if (this.phase !== 'lobby') return;
    const target = this.seatIndex(msg);
    if (target === null || this.seats[target] !== null) return;
    const from = this.seats.findIndex(
      (s) => s?.kind === 'human' && s.sessionId === client.sessionId,
    );
    if (from === -1) return;
    this.seats[target] = this.seats[from];
    this.seats[from] = null;
    this.broadcastLobby();
  }

  private setBot(client: Client, msg: unknown): void {
    if (client.sessionId !== this.leader || this.phase !== 'lobby') return;
    const target = this.seatIndex(msg);
    if (target === null || this.seats[target]?.kind === 'human') return;
    const tier = (msg as { tier?: unknown }).tier;
    if (tier === null) {
      this.seats[target] = null;
    } else if (typeof tier === 'string' && TIERS.includes(tier as BotTier)) {
      this.seats[target] = { kind: 'bot', tier: tier as BotTier };
    } else {
      return;
    }
    this.broadcastLobby();
  }

  private seatIndex(msg: unknown): number | null {
    const m = msg as { team?: unknown; idx?: unknown };
    const team = m?.team;
    const idx = m?.idx;
    if (team !== 0 && team !== 1) return null;
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx > 3) return null;
    return team * 4 + idx;
  }

  private startBlocked(): string | null {
    const humans = this.seats.filter((s) => s?.kind === 'human') as HumanSeat[];
    if (humans.length === 0) return 'no players';
    for (const h of humans) {
      if (h.sessionId !== this.leader && !h.ready) return 'waiting for players to ready up';
    }
    if (!this.botFill && this.seats.some((s) => s === null)) {
      return 'seats are empty — enable bot fill or seat more players';
    }
    return null;
  }

  private broadcastLobby(): void {
    const snap: LobbySnap = {
      code: this.code,
      phase: this.phase,
      botFill: this.botFill,
      startBlocked: this.startBlocked(),
      seats: this.seats.map((s, i): LobbySeatSnap => {
        const team = i < 4 ? 0 : 1;
        const idx = i % 4;
        if (s?.kind === 'human') {
          return {
            team,
            idx,
            occupant: {
              kind: 'human',
              key: s.sessionId,
              name: s.name,
              ready: s.sessionId === this.leader ? true : s.ready,
              leader: s.sessionId === this.leader,
            },
          };
        }
        if (s?.kind === 'bot') return { team, idx, occupant: { kind: 'bot', tier: s.tier } };
        return { team, idx, occupant: null };
      }),
    };
    this.broadcast('lobby', snap);
  }

  /* ------------------------------ select phase ------------------------------ */

  private startSelect(client: Client): void {
    if (client.sessionId !== this.leader || this.phase !== 'lobby') return;
    if (this.startBlocked() !== null) return;
    // Bot-fill the empty seats now so the deal covers the full 4v4.
    for (let i = 0; i < 8; i++) {
      if (this.seats[i] === null) this.seats[i] = { kind: 'bot', tier: 'veteran' };
    }
    this.phase = 'select';
    this.benches = [[], []];
    this.select = this.seats.map(() => null);
    // Per-team unique duo deal: 8 distinct champions per team, paired up.
    for (const team of [0, 1] as const) {
      const dealt: string[] = [];
      for (let idx = 0; idx < 4; idx++) {
        const i = team * 4 + idx;
        const active = this.draw([...dealt]);
        dealt.push(active);
        const bench = this.draw([...dealt], active);
        dealt.push(bench);
        const seat = this.seats[i];
        this.select[i] = {
          duo: [active, bench],
          rerolls: 2,
          locked: seat?.kind === 'bot', // bots hold their deal
        };
      }
    }
    this.selectDeadline = Date.now() + SELECT_SECONDS * 1000;
    this.selectTimer = setTimeout(() => this.forceLockAll(), SELECT_SECONDS * 1000);
    this.broadcastLobby();
    this.broadcastSelect();
  }

  /**
   * Draw a champion not in `exclude` (GAME_DESIGN §7.1: no duplicates within a
   * team). A 4v4 of duos wants 8 distinct champions per team, so the rule only
   * fully holds once the roster reaches 8 — until then the deal exhausts the
   * pool first and only then repeats, and `mustDiffer` still guarantees the two
   * halves of one duo are never the same champion.
   */
  private draw(exclude: string[], ...avoid: string[]): string {
    const all = CHAMPION_LIST.map((c) => c.id);
    const pool = all.filter((id) => !exclude.includes(id));
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    // Pool dry (roster smaller than the deal): repeat, but never hand back a
    // champion this seat must not hold — its own other half, or the pick a
    // reroll just spent.
    const fallback = all.filter((id) => !avoid.includes(id));
    const from = fallback.length > 0 ? fallback : all;
    return from[Math.floor(Math.random() * from.length)];
  }

  private selectFor(sessionId: string): { i: number; sel: SelectSeat } | null {
    for (let i = 0; i < 8; i++) {
      const s = this.seats[i];
      if (s?.kind === 'human' && s.sessionId === sessionId) {
        const sel = this.select[i];
        return sel ? { i, sel } : null;
      }
    }
    return null;
  }

  /** Every champion currently held by the team (both halves of every duo). */
  private teamPicks(team: 0 | 1): string[] {
    const out: string[] = [];
    for (let idx = 0; idx < 4; idx++) {
      const sel = this.select[team * 4 + idx];
      if (sel) out.push(sel.duo[0], sel.duo[1]);
    }
    return out;
  }

  /** Validate a duo slot index off the wire. */
  private static slotOf(msg: unknown): 0 | 1 | null {
    const slot = (msg as { slot?: unknown })?.slot;
    return slot === 0 || slot === 1 ? slot : null;
  }

  private reroll(client: Client, msg: unknown): void {
    if (this.phase !== 'select') return;
    const slot = LobbyRoom.slotOf(msg);
    if (slot === null) return;
    const found = this.selectFor(client.sessionId);
    if (!found || found.sel.locked || found.sel.rerolls <= 0) return;
    const team = found.i < 4 ? 0 : 1;
    const exclude = [...this.teamPicks(team), ...this.benches[team]];
    const other = found.sel.duo[slot === 0 ? 1 : 0];
    const spent = found.sel.duo[slot];
    found.sel.rerolls--;
    this.benches[team].push(spent);
    // A reroll must always change the card — never re-draw what it just spent.
    found.sel.duo[slot] = this.draw(exclude, other, spent);
    this.broadcastSelect();
  }

  private swap(client: Client, msg: unknown): void {
    if (this.phase !== 'select') return;
    const found = this.selectFor(client.sessionId);
    if (!found || found.sel.locked) return;
    const championId = (msg as { championId?: unknown })?.championId;
    const slot = LobbyRoom.slotOf(msg);
    if (typeof championId !== 'string' || slot === null) return;
    // Never let a duo hold the same champion twice.
    if (found.sel.duo[slot === 0 ? 1 : 0] === championId) return;
    const team = (found.i < 4 ? 0 : 1) as 0 | 1;
    const bench = this.benches[team];
    const at = bench.indexOf(championId);
    if (at === -1) return; // taken by a teammate already — atomic by design
    bench.splice(at, 1, found.sel.duo[slot]);
    found.sel.duo[slot] = championId;
    this.broadcastSelect();
  }

  private lockIn(client: Client): void {
    if (this.phase !== 'select') return;
    const found = this.selectFor(client.sessionId);
    if (!found || found.sel.locked) return;
    found.sel.locked = true;
    this.broadcastSelect();
    this.finishSelectIfLocked();
  }

  private forceLockAll(): void {
    if (this.phase !== 'select') return;
    for (const sel of this.select) {
      if (sel) sel.locked = true;
    }
    this.broadcastSelect();
    this.finishSelectIfLocked();
  }

  private broadcastSelect(): void {
    const timeLeft = Math.max(0, Math.ceil((this.selectDeadline - Date.now()) / 1000));
    for (const client of this.clients) {
      const found = this.selectFor(client.sessionId);
      if (!found) continue;
      const team = (found.i < 4 ? 0 : 1) as 0 | 1;
      const view: LobbySelectSnap = {
        timeLeft,
        you: {
          duo: [...found.sel.duo] as [string, string],
          rerolls: found.sel.rerolls,
          locked: found.sel.locked,
        },
        team: [0, 1, 2, 3].map((idx) => {
          const i = team * 4 + idx;
          const seat = this.seats[i];
          const sel = this.select[i];
          return {
            key: seat?.kind === 'human' ? seat.sessionId : `bot-${i}`,
            name: seat?.kind === 'human' ? seat.name : BOT_NAMES[i % BOT_NAMES.length],
            duo: (sel ? [...sel.duo] : [CHAMPION_LIST[0].id, CHAMPION_LIST[1].id]) as [
              string,
              string,
            ],
            locked: sel?.locked ?? false,
            bot: seat?.kind !== 'human',
            you: seat?.kind === 'human' && seat.sessionId === client.sessionId,
          };
        }),
        bench: [...this.benches[team]],
        enemyCount: 4,
      };
      client.send('select', view);
    }
  }

  private finishSelectIfLocked(): void {
    if (this.phase !== 'select') return;
    if (this.select.some((sel) => sel && !sel.locked)) return;
    void this.createMatch();
  }

  private async createMatch(): Promise<void> {
    if (this.selectTimer !== null) {
      clearTimeout(this.selectTimer);
      this.selectTimer = null;
    }
    const roster: MatchPlayerConfig[] = [];
    const reservations: Record<string, { player: number; name: string }> = {};
    const tokens = new Map<string, string>(); // sessionId → token
    for (let i = 0; i < 8; i++) {
      const seat = this.seats[i];
      const sel = this.select[i];
      const id = i + 1;
      const team = (i < 4 ? 0 : 1) as 0 | 1;
      if (seat?.kind === 'human') {
        const token = randomBytes(12).toString('hex');
        tokens.set(seat.sessionId, token);
        reservations[token] = { player: id, name: seat.name };
        roster.push({
          id,
          championId: sel?.duo[0] ?? CHAMPION_LIST[0].id,
          benchId: sel?.duo[1] ?? CHAMPION_LIST[1].id,
          team,
          name: seat.name,
        });
      } else {
        roster.push({
          id,
          championId: sel?.duo[0] ?? CHAMPION_LIST[0].id,
          benchId: sel?.duo[1] ?? CHAMPION_LIST[1].id,
          team,
          bot: seat?.kind === 'bot' ? seat.tier : 'veteran',
          name: BOT_NAMES[i % BOT_NAMES.length],
        });
      }
    }
    try {
      const listing = await matchMaker.createRoom('bridge', {
        roster,
        seed: Math.floor(Math.random() * 0xffffffff),
        reservations,
      });
      for (const client of this.clients) {
        const token = tokens.get(client.sessionId);
        const player = token ? reservations[token]?.player : undefined;
        if (token && player !== undefined) {
          client.send('match', { roomId: listing.roomId, token, seat: player });
        }
      }
    } catch (err) {
      this.broadcast('lobbyError', {
        message: `could not start the match — ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    }
    // Back to the lobby for "Play Again" (seats keep their occupants + bots).
    this.phase = 'lobby';
    this.select = [];
    this.benches = [[], []];
    for (const s of this.seats) {
      if (s?.kind === 'human') s.ready = false;
    }
    this.broadcastLobby();
  }
}
