export * from './types';
export * from './constants';
export * from './schemas';
export { BUFFS } from './buffs';
export { PROJECTILES } from './projectiles';
export { UNITS } from './units';
export { FX } from './fx';
export { SOUND_CUES } from './audio';
export { STRINGS, type StringKey } from './strings';
export { ROOK } from './champions/rook';
export { FATHOM } from './champions/fathom';
export { TRAINING_MAP } from './maps/training';

import { FATHOM } from './champions/fathom';
import { ROOK } from './champions/rook';
import type { ChampionDef } from './types';

export const CHAMPIONS: Record<string, ChampionDef> = {
  [ROOK.id]: ROOK,
  [FATHOM.id]: FATHOM,
};
export const CHAMPION_LIST: ChampionDef[] = [ROOK, FATHOM];
