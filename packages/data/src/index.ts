export { SOUND_CUES } from './audio';
export * from './augments';
export { BUFFS } from './buffs';
export { BOLTZ } from './champions/boltz';
export { FATHOM } from './champions/fathom';
export { GRUKK } from './champions/grukk';
export { MORTIS } from './champions/mortis';
export { PIPER } from './champions/piper';
export { RATTLE } from './champions/rattle';
export { ROOK } from './champions/rook';
export { SYLVA } from './champions/sylva';
export { VEX } from './champions/vex';
export { WISP } from './champions/wisp';
export * from './constants';
export * from './cosmetics';
export * from './events';
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
export * from './meta';
export { PROJECTILES } from './projectiles';
export * from './schemas';
export { QUICK_CHAT, STRINGS, type StringKey } from './strings';
export { CORE_DEF, type CoreDef, TOWER_DEF, type TowerDef } from './structures';
export * from './types';
export { UNITS } from './units';

import { BOLTZ } from './champions/boltz';
import { FATHOM } from './champions/fathom';
import { GRUKK } from './champions/grukk';
import { MORTIS } from './champions/mortis';
import { PIPER } from './champions/piper';
import { RATTLE } from './champions/rattle';
import { ROOK } from './champions/rook';
import { SYLVA } from './champions/sylva';
import { VEX } from './champions/vex';
import { WISP } from './champions/wisp';
import type { ChampionDef } from './types';

export const CHAMPIONS: Record<string, ChampionDef> = {
  [ROOK.id]: ROOK,
  [FATHOM.id]: FATHOM,
  [MORTIS.id]: MORTIS,
  [RATTLE.id]: RATTLE,
  [GRUKK.id]: GRUKK,
  [SYLVA.id]: SYLVA,
  [BOLTZ.id]: BOLTZ,
  [WISP.id]: WISP,
  [PIPER.id]: PIPER,
  [VEX.id]: VEX,
};
export const CHAMPION_LIST: ChampionDef[] = [
  ROOK,
  FATHOM,
  MORTIS,
  RATTLE,
  GRUKK,
  SYLVA,
  BOLTZ,
  WISP,
  PIPER,
  VEX,
];
