import { create } from 'zustand';

export type Screen = 'boot' | 'name' | 'hub' | 'match';

interface Profile {
  id: string;
  name: string;
}

export type MatchMode = 'training' | 'bridge';

interface SessionState {
  screen: Screen;
  profile: Profile | null;
  /** Mode the next match launches into. */
  matchMode: MatchMode;
  /** Champion chosen for the next Training session. */
  trainingChampion: string;
  goto: (s: Screen) => void;
  setProfile: (name: string) => void;
  setMatchMode: (m: MatchMode) => void;
  setTrainingChampion: (id: string) => void;
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
  goto: (s) => set({ screen: s }),
  setProfile: (name) => {
    const existing = loadProfile();
    const profile: Profile = { id: existing?.id ?? crypto.randomUUID(), name };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
  },
  setMatchMode: (m) => set({ matchMode: m }),
  setTrainingChampion: (id) => set({ trainingChampion: id }),
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
