import { type Slot, UNITS } from '@mini-clash/data';
import type { ChampionSnap, Snapshot } from '@mini-clash/protocol';
import { create } from 'zustand';

/** HUD-facing view of the match state, refreshed from snapshots (rounded to avoid re-render churn). */

export interface HudChampion {
  championId: string;
  hp: number;
  hpMax: number;
  energy: number;
  level: number;
  dead: boolean;
  respawnIn: number;
  gold: number;
  items: string[];
  relic: { id: string; cd: number; cdMax: number } | null;
  cooldowns: Record<Slot, number>;
  cooldownMax: Record<Slot, number>;
  recastSlot: Slot | null;
  passive: Record<string, number>;
  stats: ChampionSnap['stats'];
}

export interface HudDummy {
  id: number;
  label: string;
  dps: number;
  active: boolean;
  hpFrac: number;
}

export interface HudMatch {
  mode: 'training' | 'bridge';
  /** Whole seconds since match start. */
  time: number;
  barrierDown: boolean;
  teamKills: [number, number];
  towersDown: [number, number];
  winner: number | null;
  over: boolean;
  nextOrbIn: number | null;
  overtime: boolean;
  suddenDeath: boolean;
}

/** Team-frame / scoreboard row. Brush-hidden enemies keep their last-known values. */
export interface HudSeat {
  player: number;
  team: number;
  championId: string;
  name: string;
  bot: boolean;
  level: number;
  hpFrac: number;
  dead: boolean;
  respawnIn: number;
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  items: string[];
  /** False while omitted from the snapshot (concealed in brush). */
  visible: boolean;
}

export interface FeedEntry {
  id: number;
  kind: 'kill' | 'tower' | 'surrender';
  /** Champion ids for portrait chips (kill entries). */
  killerChamp?: string;
  victimChamp?: string;
  killerName?: string;
  victimName?: string;
  /** Team of the actor (colors the entry edge). */
  team: number;
  text?: string;
  at: number;
}

interface HudState {
  champion: HudChampion | null;
  dummies: HudDummy[];
  match: HudMatch | null;
  seats: HudSeat[];
  feed: FeedEntry[];
  shopMsg: { at: number; ok: boolean; reason?: string } | null;
  deniedAt: number;
  deniedReason: string;
  fps: number;
  noCooldowns: boolean;
  infiniteEnergy: boolean;
  setFlags: (f: { noCooldowns?: boolean; infiniteEnergy?: boolean }) => void;
  applySnapshot: (snap: Snapshot, selfPlayer: number) => void;
  addFeed: (entry: Omit<FeedEntry, 'id' | 'at'>) => void;
  shopResult: (ok: boolean, reason?: string) => void;
  denied: (reason: string) => void;
  setFps: (fps: number) => void;
  reset: () => void;
}

let feedId = 1;

export const useHud = create<HudState>()((set, get) => ({
  champion: null,
  dummies: [],
  match: null,
  seats: [],
  feed: [],
  shopMsg: null,
  deniedAt: 0,
  deniedReason: '',
  fps: 0,
  noCooldowns: false,
  infiniteEnergy: false,
  setFlags: (f) => set(f),
  denied: (reason) => set({ deniedAt: Date.now(), deniedReason: reason }),
  setFps: (fps) => set({ fps }),
  addFeed: (entry) =>
    set((s) => ({ feed: [...s.feed.slice(-5), { ...entry, id: feedId++, at: Date.now() }] })),
  shopResult: (ok, reason) => set({ shopMsg: { at: Date.now(), ok, reason } }),
  reset: () =>
    set({
      champion: null,
      dummies: [],
      match: null,
      seats: [],
      feed: [],
      shopMsg: null,
      noCooldowns: false,
      infiniteEnergy: false,
    }),
  applySnapshot: (snap, selfPlayer) => {
    const match: HudMatch = {
      mode: snap.match.mode,
      time: Math.floor(snap.match.time),
      barrierDown: snap.match.barrierDown,
      teamKills: snap.match.teamKills,
      towersDown: snap.match.towersDown,
      winner: snap.match.over?.winner ?? null,
      over: snap.match.over !== null,
      nextOrbIn: snap.match.nextOrbIn === null ? null : Math.ceil(snap.match.nextOrbIn),
      overtime: snap.match.overtime,
      suddenDeath: snap.match.suddenDeath,
    };
    let champion: HudChampion | null = null;
    const dummies: HudDummy[] = [];
    const present = new Map<number, ChampionSnap>();
    for (const e of snap.entities) {
      if (e.kind === 'champion') {
        present.set(e.player, e);
        if (e.player === selfPlayer) {
          champion = {
            championId: e.championId,
            hp: Math.ceil(e.hp),
            hpMax: Math.round(e.hpMax),
            energy: Math.floor(e.energy),
            level: e.level,
            dead: e.dead,
            respawnIn: Math.ceil(e.respawnIn * 10) / 10,
            gold: Math.floor(e.gold),
            items: e.items,
            relic: e.relic
              ? {
                  id: e.relic.id,
                  cd: Math.ceil(e.relic.cd * 10) / 10,
                  cdMax: e.relic.cdMax,
                }
              : null,
            cooldowns: {
              q: Math.ceil(e.cooldowns.q * 10) / 10,
              w: Math.ceil(e.cooldowns.w * 10) / 10,
              r: Math.ceil(e.cooldowns.r * 10) / 10,
            },
            cooldownMax: e.cooldownMax,
            recastSlot: e.recast?.slot ?? null,
            passive: e.passive,
            stats: e.stats,
          };
        }
      } else if (e.kind === 'dummy') {
        dummies.push({
          id: e.id,
          label: UNITS[e.unitId]?.name ?? e.unitId,
          dps: e.dps,
          active: e.windowActive,
          hpFrac: Math.round((e.hp / e.hpMax) * 100) / 100,
        });
      }
    }

    // Seats: update from present champions; carry last-known rows for the concealed.
    const prev = get().seats;
    const seats: HudSeat[] = [];
    const seen = new Set<number>();
    const toSeat = (e: ChampionSnap): HudSeat => ({
      player: e.player,
      team: e.team,
      championId: e.championId,
      name: e.name,
      bot: e.bot,
      level: e.level,
      hpFrac: Math.round(Math.max(0, e.hp / e.hpMax) * 50) / 50,
      dead: e.dead,
      respawnIn: Math.ceil(e.respawnIn),
      kills: e.kills,
      deaths: e.deaths,
      assists: e.assists,
      gold: Math.floor(e.gold / 25) * 25,
      items: e.items,
      visible: true,
    });
    for (const e of present.values()) {
      seats.push(toSeat(e));
      seen.add(e.player);
    }
    for (const old of prev) {
      if (!seen.has(old.player)) seats.push({ ...old, visible: false });
    }
    seats.sort((a, b) => a.team - b.team || a.player - b.player);

    set((s) => {
      // Cheap dirty check to skip identical frames.
      if (
        JSON.stringify(s.champion) === JSON.stringify(champion) &&
        JSON.stringify(s.dummies) === JSON.stringify(dummies) &&
        JSON.stringify(s.match) === JSON.stringify(match) &&
        JSON.stringify(s.seats) === JSON.stringify(seats)
      ) {
        return s;
      }
      return { champion, dummies, match, seats };
    });
  },
}));
