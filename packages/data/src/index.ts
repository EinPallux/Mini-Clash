export { SOUND_CUES } from './audio';
export { BUFFS } from './buffs';
export { FATHOM } from './champions/fathom';
export { GRUKK } from './champions/grukk';
export { MORTIS } from './champions/mortis';
export { RATTLE } from './champions/rattle';
export { ROOK } from './champions/rook';
export { SYLVA } from './champions/sylva';
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
export { QUICK_CHAT, STRINGS, type StringKey } from './strings';
export { CORE_DEF, type CoreDef, TOWER_DEF, type TowerDef } from './structures';
export * from './types';
export { UNITS } from './units';

import { FATHOM } from './champions/fathom';
import { GRUKK } from './champions/grukk';
import { MORTIS } from './champions/mortis';
import { RATTLE } from './champions/rattle';
import { ROOK } from './champions/rook';
import { SYLVA } from './champions/sylva';
import type { ChampionDef } from './types';

export const CHAMPIONS: Record<string, ChampionDef> = {
  [ROOK.id]: ROOK,
  [FATHOM.id]: FATHOM,
  [MORTIS.id]: MORTIS,
  [RATTLE.id]: RATTLE,
  [GRUKK.id]: GRUKK,
  [SYLVA.id]: SYLVA,
};
export const CHAMPION_LIST: ChampionDef[] = [ROOK, FATHOM, MORTIS, RATTLE, GRUKK, SYLVA];
