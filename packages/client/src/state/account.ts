import { create } from 'zustand';
import { ApiError, deviceKey, OfflineError, request, setCsrf } from './api';

/**
 * The account (TECH §9, UI_UX §13).
 *
 * One store holds everything the hub reads, and it is deliberately tolerant of
 * having none of it: `status: 'offline'` is a first-class state, not a failure
 * screen. Training and vs-bots have never needed an account and still do not —
 * the hub simply stops promising rewards it cannot deliver, and says so.
 *
 * The store never invents state. Every mutation returns the server's new
 * numbers and those are what land here, so a coin balance on screen is one the
 * database agrees with rather than one the client optimistically guessed.
 */

export interface AccountUser {
  id: string;
  kind: 'guest' | 'registered';
  name: string;
  email: string | null;
}

export interface AccountProfile {
  level: number;
  xp: number;
  coins: number;
  bannerId: string;
  showcase: string[];
  settings: Record<string, unknown>;
  winStreak: number;
  lastWinDay: string | null;
}

export interface MasteryEntry {
  championId: string;
  xp: number;
  level: number;
  progress: { into: number; needed: number } | null;
  claimable: { level: number; coins: number } | null;
}

export interface LifetimeStats {
  matches: number;
  wins: number;
  winrate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  favoriteDuo: { ids: string[]; matches: number } | null;
  topAugment: { id: string; picks: number } | null;
  topChampion: { id: string; matches: number } | null;
}

export interface ChampionEntry {
  id: string;
  name: string;
  title: string;
  role: string;
  difficulty: number;
  price: number;
  owned: boolean;
  free: boolean;
  playable: boolean;
  mastery: { xp: number; level: number } | null;
}

export interface QuestEntry {
  id: string;
  cadence: 'daily' | 'weekly';
  name: string;
  metric: string;
  target: number;
  coins: number;
  progress: number;
  state: 'active' | 'ready' | 'claimed';
  rerolled: boolean;
  resetAt: string;
}

export interface QuestsView {
  daily: QuestEntry[];
  weekly: QuestEntry[];
  rerollAvailable: boolean;
  streak: number;
  lastWinDay: string | null;
}

export interface HistoryEntry {
  matchId: string;
  mode: string;
  startedAt: string;
  duration: number;
  won: boolean;
  teamId: number;
  duo: string[];
  stats: Record<string, number>;
  augments: string[];
}

export type AccountStatus = 'loading' | 'signedOut' | 'ready' | 'offline';

interface AccountState {
  status: AccountStatus;
  user: AccountUser | null;
  profile: AccountProfile | null;
  unlocks: Record<string, string[]>;
  mastery: MasteryEntry[];
  lifetime: LifetimeStats | null;
  champions: ChampionEntry[];
  rotation: string[];
  renamePrice: number;
  /** Last thing that went wrong, for a screen to surface. Cleared on success. */
  error: string | null;

  boot: () => Promise<void>;
  refresh: () => Promise<void>;
  loadChampions: () => Promise<void>;
  signInGuest: (name: string) => Promise<void>;
  upgrade: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutOthers: () => Promise<void>;
  rename: (name: string) => Promise<{ charged: number }>;
  deleteAccount: (confirm: string) => Promise<void>;
  purchase: (kind: string, refId: string) => Promise<{ paid: number; coins: number }>;
  claimQuest: (questId: string) => Promise<number>;
  rerollQuest: (questId: string) => Promise<void>;
  claimMastery: (championId: string) => Promise<{ level: number; coins: number }>;
  saveSettings: (settings: Record<string, unknown>) => Promise<void>;
  setShowcase: (ids: string[]) => Promise<void>;
  quests: () => Promise<QuestsView>;
  history: (limit?: number) => Promise<HistoryEntry[]>;
  matchDetail: (matchId: string) => Promise<unknown>;
  clearError: () => void;
}

interface MeResponse {
  user: AccountUser | null;
  csrf: string | null;
  renamePrice?: number;
}

interface ProfileResponse {
  user: AccountUser;
  profile: AccountProfile;
  unlocks: Record<string, string[]>;
  mastery: MasteryEntry[];
  lifetime: LifetimeStats;
}

/** Turn any thrown thing into the store's error/offline state. */
function fault(e: unknown): { status?: AccountStatus; error: string } {
  if (e instanceof OfflineError) return { status: 'offline', error: 'offline' };
  if (e instanceof ApiError) return { error: e.code };
  return { error: 'unknown' };
}

export const useAccount = create<AccountState>()((set, get) => ({
  status: 'loading',
  user: null,
  profile: null,
  unlocks: {},
  mastery: [],
  lifetime: null,
  champions: [],
  rotation: [],
  renamePrice: 0,
  error: null,

  /**
   * First contact. Asks who we are; a `null` user is a normal answer on a first
   * visit, not an error, and the catalog loads either way so a signed-out
   * visitor can still browse champions and see what they cost.
   */
  boot: async () => {
    try {
      const me = await request<MeResponse>('/auth/me');
      setCsrf(me.csrf);
      if (!me.user) {
        set({ status: 'signedOut', user: null, renamePrice: me.renamePrice ?? 0 });
      } else {
        set({ status: 'ready', user: me.user, renamePrice: me.renamePrice ?? 0 });
        await get().refresh();
      }
    } catch (e) {
      set({ ...fault(e), status: fault(e).status ?? 'signedOut' });
    }
    await get().loadChampions();
  },

  refresh: async () => {
    try {
      const p = await request<ProfileResponse>('/profile');
      set({
        status: 'ready',
        user: p.user,
        profile: p.profile,
        unlocks: p.unlocks,
        mastery: p.mastery,
        lifetime: p.lifetime,
        error: null,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setCsrf(null);
        set({ status: 'signedOut', user: null, profile: null });
        return;
      }
      set(fault(e));
    }
  },

  loadChampions: async () => {
    try {
      const view = await request<{ rotation: string[]; champions: ChampionEntry[] }>('/champions');
      set({ champions: view.champions, rotation: view.rotation });
    } catch (e) {
      // The catalog is also compiled into the client, so failing to fetch the
      // *ownership* view is survivable — the screens fall back to locked.
      set(fault(e));
    }
  },

  signInGuest: async (name) => {
    try {
      const res = await request<{ user: AccountUser; csrf: string }>('/auth/guest', {
        method: 'POST',
        body: { name, deviceKey: deviceKey() },
      });
      setCsrf(res.csrf);
      set({ status: 'ready', user: res.user, error: null });
      await get().refresh();
      await get().loadChampions();
    } catch (e) {
      set(fault(e));
      throw e;
    }
  },

  upgrade: async (email, password) => {
    try {
      const res = await request<{ user: AccountUser; csrf: string }>('/auth/upgrade', {
        method: 'POST',
        body: { email, password },
      });
      setCsrf(res.csrf);
      set({ user: res.user, error: null });
    } catch (e) {
      set(fault(e));
      throw e;
    }
  },

  login: async (email, password) => {
    try {
      const res = await request<{ user: AccountUser; csrf: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setCsrf(res.csrf);
      set({ status: 'ready', user: res.user, error: null });
      await get().refresh();
      await get().loadChampions();
    } catch (e) {
      set(fault(e));
      throw e;
    }
  },

  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      // Even if the call fails, forget everything locally — the player asked.
    }
    setCsrf(null);
    set({
      status: 'signedOut',
      user: null,
      profile: null,
      unlocks: {},
      mastery: [],
      lifetime: null,
      error: null,
    });
    await get().loadChampions();
  },

  logoutOthers: async () => {
    try {
      await request('/auth/logout-others', { method: 'POST' });
      set({ error: null });
    } catch (e) {
      set(fault(e));
      throw e;
    }
  },

  rename: async (name) => {
    try {
      const res = await request<{ name: string; charged: number }>('/auth/rename', {
        method: 'POST',
        body: { name },
      });
      const me = await request<MeResponse>('/auth/me');
      set((s) => ({
        user: s.user ? { ...s.user, name: res.name } : s.user,
        renamePrice: me.renamePrice ?? s.renamePrice,
        error: null,
      }));
      await get().refresh();
      return { charged: res.charged };
    } catch (e) {
      set(fault(e));
      throw e;
    }
  },

  deleteAccount: async (confirm) => {
    await request('/auth/delete', { method: 'POST', body: { confirm } });
    setCsrf(null);
    set({ status: 'signedOut', user: null, profile: null, unlocks: {}, mastery: [] });
  },

  /**
   * Buy something.
   *
   * The idempotency key is derived from what is being bought rather than
   * generated per click, so a double-click, a rage-click and a retry after a
   * timeout are all the same purchase to the server.
   */
  purchase: async (kind, refId) => {
    const user = get().user;
    try {
      const res = await request<{ paid: number; coins: number }>('/shop/purchase', {
        method: 'POST',
        body: { kind, refId },
        idempotencyKey: `${user?.id ?? 'anon'}:${kind}:${refId}`,
      });
      set({ error: null });
      await Promise.all([get().refresh(), get().loadChampions()]);
      return res;
    } catch (e) {
      set(fault(e));
      throw e;
    }
  },

  claimQuest: async (questId) => {
    const res = await request<{ coins: number }>('/quests/claim', {
      method: 'POST',
      body: { questId },
    });
    await get().refresh();
    return res.coins;
  },

  rerollQuest: async (questId) => {
    await request('/quests/reroll', { method: 'POST', body: { questId } });
  },

  claimMastery: async (championId) => {
    const res = await request<{ level: number; coins: number }>('/mastery/claim', {
      method: 'POST',
      body: { championId },
    });
    await get().refresh();
    return res;
  },

  saveSettings: async (settings) => {
    if (!get().user) return;
    try {
      await request('/profile/settings', { method: 'PUT', body: { settings } });
    } catch {
      // Settings are always applied and stored locally first; syncing them is
      // a convenience, and failing to sync must never block the UI.
    }
  },

  setShowcase: async (ids) => {
    try {
      await request('/profile/showcase', { method: 'PUT', body: { showcase: ids } });
      await get().refresh();
    } catch (e) {
      set(fault(e));
      throw e;
    }
  },

  quests: async () => request<QuestsView>('/quests'),
  history: async (limit = 30) =>
    (await request<{ matches: HistoryEntry[] }>(`/history?limit=${limit}`)).matches,
  matchDetail: async (matchId) => request(`/history/${encodeURIComponent(matchId)}`),

  clearError: () => set({ error: null }),
}));

/** True when rewards are actually being recorded — the hub says so honestly. */
export function rewardsActive(state: Pick<AccountState, 'status' | 'user'>): boolean {
  return state.status === 'ready' && state.user !== null;
}
