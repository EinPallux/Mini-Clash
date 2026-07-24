import { CHAMPION_LIST, CHAMPIONS } from '@mini-clash/data';
import type { BotTier, Intent, MatchConfig, MatchPlayerConfig } from '@mini-clash/protocol';
import type { Sim } from '@mini-clash/sim';

/**
 * Room-side match bookkeeping shared by the bridge room (and the lobby room
 * later): roster validation, seat claims, bot cover on disconnect. Everything
 * gameplay-authoritative stays inside the sim — this is seating, not rules.
 */

export interface JoinOptions {
  name?: string;
  roster?: MatchPlayerConfig[];
  seed?: number;
  rig?: MatchConfig['rig'];
}

const TIERS: BotTier[] = ['recruit', 'veteran', 'elite'];
const BOT_NAMES = ['Krag', 'Nyx', 'Piston', 'Moxie', 'Thorn', 'Ember', 'Gruff', 'Fizz'];

/** Server-side roster sanity: 8 seats, 4v4, known champions, sane names. */
export function validateRoster(options: JoinOptions): MatchPlayerConfig[] {
  const roster = options.roster;
  if (!Array.isArray(roster) || roster.length !== 8) return defaultRoster(options);
  const teams: Record<number, number> = { 0: 0, 1: 0 };
  const ids = new Set<number>();
  for (const p of roster) {
    if (typeof p.id !== 'number' || ids.has(p.id)) return defaultRoster(options);
    ids.add(p.id);
    if (p.team !== 0 && p.team !== 1) return defaultRoster(options);
    teams[p.team]++;
    if (!CHAMPIONS[p.championId]) return defaultRoster(options);
    if (p.bot !== undefined && !TIERS.includes(p.bot)) return defaultRoster(options);
  }
  if (teams[0] !== 4 || teams[1] !== 4) return defaultRoster(options);
  return roster.map((p) => ({
    ...p,
    name: typeof p.name === 'string' ? p.name.slice(0, 24) : undefined,
  }));
}

function defaultRoster(options: JoinOptions): MatchPlayerConfig[] {
  const pool = CHAMPION_LIST.map((c) => c.id);
  const pick = (i: number): string => pool[i % pool.length];
  const players: MatchPlayerConfig[] = [{ id: 1, championId: pick(0), team: 0 }];
  for (let i = 0; i < 7; i++) {
    players.push({
      id: 2 + i,
      championId: pick(i + 1),
      team: i < 3 ? 0 : 1,
      bot: 'veteran',
      name: BOT_NAMES[i],
    });
  }
  void options;
  return players;
}

export interface MatchRuntimeState {
  roster: MatchPlayerConfig[];
  seed: number;
  code: string;
  rig?: MatchConfig['rig'];
  overAt: number | null;
  /** Seats currently driven by a cover-bot because their human dropped. */
  covered: Set<number>;
  config(): MatchConfig;
  claimSeat(name?: string): number | null;
  teamOf(player: number): 0 | 1;
  coverSeat(sim: Sim, player: number): void;
  reclaimSeat(sim: Sim, player: number): void;
}

export function createMatchState(
  roster: MatchPlayerConfig[],
  options: JoinOptions,
): MatchRuntimeState {
  const claimed = new Set<number>();
  const seed =
    typeof options.seed === 'number' ? options.seed >>> 0 : Math.floor(Math.random() * 0xffffffff);
  return {
    roster,
    seed,
    code: randomCode(),
    rig: options.rig,
    overAt: null,
    covered: new Set(),
    config(): MatchConfig {
      return {
        mode: 'bridge',
        seed: this.seed,
        mapId: 'shatterbridge',
        players: this.roster,
        rig: this.rig,
      };
    },
    claimSeat(name?: string): number | null {
      const humanSeats = this.roster.filter((p) => !p.bot);
      for (const seat of humanSeats) {
        if (!claimed.has(seat.id)) {
          claimed.add(seat.id);
          if (name) seat.name = name.slice(0, 24);
          return seat.id;
        }
      }
      return null;
    },
    teamOf(player: number): 0 | 1 {
      return this.roster.find((p) => p.id === player)?.team ?? 0;
    },
    coverSeat(sim: Sim, player: number): void {
      this.covered.add(player);
      sim.coverSeat(player, 'veteran');
    },
    reclaimSeat(sim: Sim, player: number): void {
      this.covered.delete(player);
      sim.releaseSeat(player);
    },
  };
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

/** Shape-check one wire intent, then hand it to the sim under the seat's identity. */
export function applyIntent(sim: Sim, player: number, raw: unknown): void {
  const msg = raw as { seq?: number; intent?: Intent };
  if (!msg || typeof msg !== 'object' || !msg.intent || typeof msg.intent !== 'object') return;
  const t = (msg.intent as { t?: unknown }).t;
  if (typeof t !== 'string') return;
  if (t === 'trainer') return; // cheats never cross the wire
  sim.applyIntents([{ seq: msg.seq ?? 0, player, intent: msg.intent }]);
}
