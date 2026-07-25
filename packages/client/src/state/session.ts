import type { MatchPlayerConfig } from '@mini-clash/protocol';
import { create } from 'zustand';

export type Screen = 'boot' | 'name' | 'hub' | 'select' | 'lobby' | 'match';

interface Profile {
  id: string;
  name: string;
}

export type MatchMode = 'training' | 'bridge';

/** Lobby → match handoff: join this room with this one-time seat token. */
export interface MatchJoin {
  roomId: string;
  token: string;
  seat: number;
}

interface SessionState {
  screen: Screen;
  profile: Profile | null;
  /** Mode the next match launches into. */
  matchMode: MatchMode;
  /** Champion chosen for the next Training session. */
  trainingChampion: string;
  /** Full 8-seat roster produced by champion select (bridge matches). */
  bridgeLineup: MatchPlayerConfig[] | null;
  /** Set when the next match is an online lobby match (cleared on hub return). */
  matchJoin: MatchJoin | null;
  goto: (s: Screen) => void;
  setProfile: (name: string) => void;
  setMatchMode: (m: MatchMode) => void;
  setTrainingChampion: (id: string) => void;
  setBridgeLineup: (l: MatchPlayerConfig[] | null) => void;
  setMatchJoin: (j: MatchJoin | null) => void;
}

const PROFILE_KEY = 'mc.profile';

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    if (typeof p.id === 'string' && typeof p.name === 'string' && p.name.length > 0) return p;
    return null;
  } catch {
    return null;
  }
}

export const useSession = create<SessionState>()((set) => ({
  screen: 'boot',
  profile: loadProfile(),
  matchMode: 'training',
  trainingChampion: 'rook',
  bridgeLineup: null,
  matchJoin: null,
  goto: (s) => set({ screen: s }),
  setProfile: (name) => {
    const existing = loadProfile();
    const profile: Profile = { id: existing?.id ?? crypto.randomUUID(), name };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
  },
  setMatchMode: (m) => set({ matchMode: m }),
  setTrainingChampion: (id) => set({ trainingChampion: id }),
  setBridgeLineup: (l) => set({ bridgeLineup: l }),
  setMatchJoin: (j) => set({ matchJoin: j }),
}));

const ADJ = [
  'Brave',
  'Sneaky',
  'Mighty',
  'Cosmic',
  'Turbo',
  'Snappy',
  'Golden',
  'Wobbly',
  'Spicy',
  'Lucky',
  'Grumpy',
  'Dashing',
];
const NOUN = [
  'Rook',
  'Keg',
  'Bridge',
  'Golem',
  'Fox',
  'Snowball',
  'Cannon',
  'Sprout',
  'Wisp',
  'Anchor',
  'Banner',
  'Comet',
];

export function randomName(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a}${n}${Math.floor(Math.random() * 90) + 10}`;
}
