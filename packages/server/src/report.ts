import type { Team } from '@mini-clash/data';
import type {
  MatchResultPayload,
  MatchResultSeat,
  MatchSeatStats,
  SimEvent,
} from '@mini-clash/protocol';
import type { Sim } from '@mini-clash/sim';
import type { MatchRuntimeState } from './match';

/**
 * Turning a finished match into the report the api records (TECH §9).
 *
 * Most numbers come straight off the sim's champion state at the final tick.
 * Three do not, because they are things that *happened* rather than things a
 * champion *is*: swaps, towers and golems are tallied from the event stream as
 * the match runs, in `note()`.
 *
 * Towers and golems are credited to the whole team. They are objectives four
 * people take together, and paying only the last hit would reward exactly the
 * behaviour the objective is designed to discourage.
 */
export class MatchTally {
  private swaps = new Map<number, number>();
  private towers: [number, number] = [0, 0];
  private golems: [number, number] = [0, 0];
  /** Entity id → seat, so an fx event can be attributed to a player. */
  private owner = new Map<number, number>();

  /** Fold one tick's events in. Call before the sim drains them. */
  note(sim: Sim, events: readonly SimEvent[]): void {
    for (const e of sim.world.entities) {
      if (e.champ) this.owner.set(e.id, e.champ.player);
    }
    for (const ev of events) {
      if (ev.t === 'towerDown') {
        this.towers[ev.byTeam] += 1;
      } else if (ev.t === 'golemTaken') {
        this.golems[ev.team] += 1;
      } else if (ev.t === 'fx' && ev.key === 'duo.swap' && ev.source !== undefined) {
        const player = this.owner.get(ev.source);
        if (player !== undefined) this.swaps.set(player, (this.swaps.get(player) ?? 0) + 1);
      }
    }
  }

  swapsFor(player: number): number {
    return this.swaps.get(player) ?? 0;
  }

  towersFor(team: Team): number {
    return this.towers[team];
  }

  golemsFor(team: Team): number {
    return this.golems[team];
  }
}

/**
 * Each seat's share of what its team produced, as a 0…1 figure.
 *
 * Kills, assists and damage in equal thirds, each measured against the team's
 * own total, so a low-scoring match does not punish everybody in it. The
 * average seat lands on 0.5 by construction — which is what makes the ±20%
 * swing symmetric rather than a stealth nerf to everyone's payout.
 */
export function performanceShares(
  seats: { player: number; team: Team; kills: number; assists: number; damage: number }[],
): Map<number, number> {
  const out = new Map<number, number>();
  for (const team of [0, 1] as const) {
    const mine = seats.filter((s) => s.team === team);
    if (mine.length === 0) continue;
    const share = (value: number, total: number): number =>
      total > 0 ? value / total : 1 / mine.length;
    const totals = {
      kills: mine.reduce((n, s) => n + s.kills, 0),
      assists: mine.reduce((n, s) => n + s.assists, 0),
      damage: mine.reduce((n, s) => n + s.damage, 0),
    };
    for (const s of mine) {
      // A share of 1/n is the average seat; scale so that maps to 0.5.
      const raw =
        (share(s.kills, totals.kills) +
          share(s.assists, totals.assists) +
          share(s.damage, totals.damage)) /
        3;
      out.set(s.player, clamp01(raw * mine.length * 0.5));
    }
  }
  return out;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export interface ReportContext {
  matchId: string;
  startedAt: Date;
  /** seat → account id, for the humans who arrived with a ticket. */
  users: Map<number, string>;
}

/** Build the payload posted to `/internal/match-result`. */
export function buildReport(
  sim: Sim,
  match: MatchRuntimeState,
  tally: MatchTally,
  ctx: ReportContext,
): MatchResultPayload {
  const w = sim.world;
  const winner = w.match?.over?.winner ?? null;

  const rows = match.roster.map((seat) => {
    const entity = [...w.entities].find((e) => e.champ?.player === seat.id);
    const c = entity?.champ;
    return {
      player: seat.id,
      team: seat.team,
      bot: seat.bot ?? null,
      kills: c?.kills ?? 0,
      deaths: c?.deaths ?? 0,
      assists: c?.assists ?? 0,
      damage: Math.round(c?.damageDealt ?? 0),
      gold: Math.round(c?.gold ?? 0),
      level: c?.level ?? 1,
      // The duo, active half first — the same order the scoreboard shows.
      duo: c ? [c.def.id, ...(c.duo ? [c.duo.def.id] : [])] : [seat.championId],
      augments: c?.augments ? [...c.augments] : [],
    };
  });

  const performance = performanceShares(rows);

  const seats: MatchResultSeat[] = rows.map((r, index) => {
    const stats: MatchSeatStats = {
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
      damage: r.damage,
      gold: r.gold,
      level: r.level,
      towers: tally.towersFor(r.team),
      golems: tally.golemsFor(r.team),
      swaps: tally.swapsFor(r.player),
    };
    return {
      seat: index,
      userId: ctx.users.get(r.player) ?? null,
      botTier: r.bot,
      team: r.team,
      won: winner === r.team,
      duo: r.duo,
      stats,
      augments: r.augments,
      performance: performance.get(r.player) ?? 0.5,
    };
  });

  return {
    matchId: ctx.matchId,
    mode: 'bridge',
    seed: match.seed,
    startedAt: ctx.startedAt.toISOString(),
    duration: Math.round(w.time),
    result: summaryOf(sim, seats, winner),
    seats,
  };
}

/**
 * The summary blob the history detail view replays.
 *
 * Deliberately self-contained: it must render a scoreboard years from now
 * without re-simulating anything or joining against tables that may have moved
 * on, so it carries names and champion ids rather than references to them.
 */
function summaryOf(sim: Sim, seats: MatchResultSeat[], winner: Team | null): unknown {
  const w = sim.world;
  const named = new Map<number, string>();
  for (const e of w.entities) {
    if (e.champ) named.set(e.champ.player, e.champ.name);
  }
  return {
    winner,
    duration: Math.round(w.time),
    overtime: w.match?.overtime ?? false,
    teamKills: w.match?.teamKills ?? [0, 0],
    towersDown: w.match?.towersDown ?? [0, 0],
    events: w.match?.eventLog ?? [],
    scoreboard: seats.map((s, i) => ({
      seat: s.seat,
      name: named.get(i + 1) ?? `P${i + 1}`,
      team: s.team,
      bot: s.botTier,
      duo: s.duo,
      augments: s.augments,
      k: s.stats.kills,
      d: s.stats.deaths,
      a: s.stats.assists,
      damage: s.stats.damage,
      gold: s.stats.gold,
      level: s.stats.level,
    })),
  };
}
