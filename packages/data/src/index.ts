export { SOUND_CUES } from './audio';
export { BUFFS } from './buffs';
export { FATHOM } from './champions/fathom';
export { ROOK } from './champions/rook';
export * from './constants';
export { FX } from './fx';
export {
  ITEM_SLOTS,
  ITEMS,
  type ItemDef,
  type ItemTier,
  RELICS,
  type RelicDef,
  SELL_RATIO,
} from './items';
export { SHATTERBRIDGE_MAP } from './maps/shatterbridge';
export { TRAINING_MAP } from './maps/training';
export { PROJECTILES } from './projectiles';
export * from './schemas';
export { STRINGS, type StringKey } from './strings';
export { CORE_DEF, type CoreDef, TOWER_DEF, type TowerDef } from './structures';
export * from './types';
export { UNITS } from './units';

import { FATHOM } from './champions/fathom';
import { ROOK } from './champions/rook';
import type { ChampionDef } from './types';

export const CHAMPIONS: Record<string, ChampionDef> = {
  [ROOK.id]: ROOK,
  [FATHOM.id]: FATHOM,
};
export const CHAMPION_LIST: ChampionDef[] = [ROOK, FATHOM];
