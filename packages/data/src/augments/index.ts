import { GENERIC_AUGMENTS } from './generic';
import { SIGNATURE_AUGMENTS } from './signatures';
import type { AugmentDef } from './types';

export { GENERIC_AUGMENTS } from './generic';
export { SIGNATURE_AUGMENTS } from './signatures';
export type {
  AugmentCategory,
  AugmentDef,
  AugmentEffect,
  AugmentRarity,
  AugmentRequirement,
  AugmentScope,
  AugmentTag,
  DamageCondition,
} from './types';

/** The whole catalog: 48 generic + 3 signatures per champion (AUGMENTS.md §3). */
export const AUGMENT_LIST: AugmentDef[] = [...GENERIC_AUGMENTS, ...SIGNATURE_AUGMENTS];

export const AUGMENTS: Record<string, AugmentDef> = Object.fromEntries(
  AUGMENT_LIST.map((a) => [a.id, a]),
);

/** Signatures belonging to a champion (either half of a duo may be offered them). */
export function signaturesFor(championId: string): AugmentDef[] {
  return SIGNATURE_AUGMENTS.filter((a) => a.championId === championId);
}
