import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type Palette = 'default' | 'blueOrange' | 'magentaTeal';

export interface Keybinds {
  castQ: string;
  castW: string;
  castR: string;
  attackMove: string;
  stop: string;
  dance: string;
  swap: string;
}

export const DEFAULT_KEYBINDS: Keybinds = {
  castQ: 'KeyQ',
  castW: 'KeyW',
  castR: 'KeyR',
  attackMove: 'KeyA',
  stop: 'KeyS',
  dance: 'KeyT',
  swap: 'Space',
};

interface SettingsState {
  quality: Quality;
  fpsCap: 0 | 30 | 60;
  screenShake: boolean;
  hitFlash: boolean;
  reducedVfx: boolean;
  palette: Palette;
  textScale: number;
  volumes: { master: number; music: number; sfx: number; ui: number };
  keybinds: Keybinds;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'setVolume' | 'setKeybind'>>) => void;
  setVolume: (bus: keyof SettingsState['volumes'], v: number) => void;
  setKeybind: (action: keyof Keybinds, code: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      quality: 'auto',
      fpsCap: 0,
      screenShake: true,
      hitFlash: true,
      reducedVfx: false,
      palette: 'default',
      textScale: 1,
      volumes: { master: 0.8, music: 0.7, sfx: 0.9, ui: 0.8 },
      keybinds: { ...DEFAULT_KEYBINDS },
      set: (patch) => set(patch),
      setVolume: (bus, v) => set((s) => ({ volumes: { ...s.volumes, [bus]: v } })),
      setKeybind: (action, code) => set((s) => ({ keybinds: { ...s.keybinds, [action]: code } })),
    }),
    { name: 'mc.settings' },
  ),
);

/** Team/threat colors under the active accessibility palette (ART_DIRECTION §4). */
export function paletteColors(p: Palette): { ally: number; enemy: number; self: number } {
  switch (p) {
    case 'blueOrange':
      return { ally: 0x3ba7ff, enemy: 0xff9d2e, self: 0x5dff9e };
    case 'magentaTeal':
      return { ally: 0x2ee6c8, enemy: 0xff4dd2, self: 0xd6ff5d };
    default:
      return { ally: 0x3ba7ff, enemy: 0xff4d4d, self: 0x5dff9e };
  }
}

export function applyTextScale(scale: number): void {
  document.documentElement.style.setProperty('--text-scale', String(scale));
}
