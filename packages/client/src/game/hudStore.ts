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

interface HudState {
  champion: HudChampion | null;
  dummies: HudDummy[];
  deniedAt: number;
  deniedReason: string;
  fps: number;
  noCooldowns: boolean;
  infiniteEnergy: boolean;
  setFlags: (f: { noCooldowns?: boolean; infiniteEnergy?: boolean }) => void;
  applySnapshot: (snap: Snapshot, selfPlayer: number) => void;
  denied: (reason: string) => void;
  setFps: (fps: number) => void;
  reset: () => void;
}

export const useHud = create<HudState>()((set) => ({
  champion: null,
  dummies: [],
  deniedAt: 0,
  deniedReason: '',
  fps: 0,
  noCooldowns: false,
  infiniteEnergy: false,
  setFlags: (f) => set(f),
  denied: (reason) => set({ deniedAt: Date.now(), deniedReason: reason }),
  setFps: (fps) => set({ fps }),
  reset: () => set({ champion: null, dummies: [], noCooldowns: false, infiniteEnergy: false }),
  applySnapshot: (snap, selfPlayer) => {
    let champion: HudChampion | null = null;
    const dummies: HudDummy[] = [];
    for (const e of snap.entities) {
      if (e.kind === 'champion' && e.player === selfPlayer) {
        champion = {
          championId: e.championId,
          hp: Math.ceil(e.hp),
          hpMax: Math.round(e.hpMax),
          energy: Math.floor(e.energy),
          level: e.level,
          dead: e.dead,
          respawnIn: Math.ceil(e.respawnIn * 10) / 10,
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
    set((s) => {
      // Cheap dirty check to skip identical frames.
      if (
        JSON.stringify(s.champion) === JSON.stringify(champion) &&
        JSON.stringify(s.dummies) === JSON.stringify(dummies)
      ) {
        return s;
      }
      return { champion, dummies };
    });
  },
}));
