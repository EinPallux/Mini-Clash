import type { DamageType, ScalingValue, Slot, StatKey } from '../types';

/**
 * Augment system types (docs/AUGMENTS.md).
 *
 * Augments are *data patches*, not code: every card is a list of typed effects
 * the sim already knows how to apply. That keeps `packages/sim` generic and lets
 * balance move without touching engine code. The handful of genuinely bespoke
 * cards (a revive, a reflect, a full-kit element swap) use `special`, which is
 * the same shape champion passives already use — a named behaviour with its
 * numbers in data.
 */

export type AugmentRarity = 'silver' | 'gold' | 'prismatic';

export type AugmentCategory =
  | 'offense'
  | 'defense'
  | 'mobility'
  | 'tagteam'
  | 'siege'
  | 'signature';

/**
 * `duo` effects follow the player and work on whichever half is fielded.
 * `active` effects only read the currently-fielded champion's own state.
 * Signature augments only function on their champion (and only they are offered them).
 */
export type AugmentScope = 'duo' | 'active';

/** Bot affinity tags (AUGMENTS.md §2) — the utility scorer weights these per champion. */
export type AugmentTag =
  | 'ad'
  | 'ap'
  | 'attackSpeed'
  | 'burst'
  | 'sustain'
  | 'tank'
  | 'mobility'
  | 'utility'
  | 'siege'
  | 'swap'
  | 'economy'
  | 'antiTank'
  | 'execute';

/** Offer prerequisites — cards that would do nothing are never shown. */
export type AugmentRequirement = 'projectileQ' | 'melee' | 'ranged' | 'pet' | 'shieldAbility';

/** What a conditional damage multiplier keys off. */
export type DamageCondition = 'all' | 'ccd' | 'lowHp' | 'higherMaxHp' | 'structures' | 'shielded';

export type AugmentEffect =
  /** Flat/multiplicative stat changes, resolved inside championStats. */
  | { k: 'stat'; add?: Partial<Record<StatKey, number>>; mul?: Partial<Record<StatKey, number>> }
  /** Conditional damage multiplier applied in the damage funnel. */
  | {
      k: 'damage';
      when: DamageCondition;
      mul: number;
      /** Which damage sources qualify (default: everything the champion deals). */
      tag?: 'aa' | 'ability' | 'all';
      /** For `lowHp`: the target HP fraction the bonus starts under. */
      threshold?: number;
    }
  /** Basic-attack riders: bonus damage, burns, chains, pushes. */
  | {
      k: 'onBasic';
      /** Fire only on every Nth basic (default: every one). */
      every?: number;
      bonus?: ScalingValue;
      dtype?: DamageType;
      /** Spread the bonus over this many seconds instead of hitting at once. */
      burnSeconds?: number;
      chain?: { count: number; mul: number; radius: number };
      /** Knock the target back this far. */
      push?: number;
    }
  /** Recast the ability in a slot: split projectiles, mirror it, or echo it. */
  | {
      k: 'castMod';
      slot: Slot;
      mode: 'split' | 'mirror' | 'echo';
      /** Power of the extra cast(s) as a fraction of the original. */
      power: number;
      /** `echo` only: seconds before the repeat. */
      delay?: number;
      /** `split` only: half-angle between the two halves. */
      spreadDeg?: number;
    }
  /** Ultimate potency (damage/heal/duration where the ability supports it). */
  | { k: 'ultPower'; mul: number }
  /**
   * A named tunable the sim reads at a specific site, e.g. `rook.wallLength`.
   * This is how signatures reshape their champion's kit without the engine
   * knowing which champion it is.
   */
  | { k: 'param'; key: string; value: number; mode?: 'mul' | 'add' | 'set' }
  /** Tag Team modifiers (GAME_DESIGN §7.2). */
  | {
      k: 'duo';
      swapCdDelta?: number;
      swapCdSet?: number;
      swapCharges?: number;
      /** Multiplier on how fast the benched half's cooldowns tick. */
      benchCdRate?: number;
      /** Multiplier on entrance effect potency. */
      entrancePotency?: number;
      swapMs?: number;
      swapMsDuration?: number;
      /** Seconds after a swap during which the next ability is free. */
      freeCastWindow?: number;
      /** Shield granted to the champion swapping in. */
      shieldOnSwap?: ScalingValue;
      /** Benched champions bank this fraction of max HP per second as a shield. */
      resolvePerSec?: number;
      resolveCap?: number;
    }
  /** Economy + world-interaction modifiers. */
  | {
      k: 'economy';
      goldMul?: number;
      miniBonusGold?: number;
      orbHealMul?: number;
      orbMs?: number;
      energyRegen?: number;
      respawnMul?: number;
      /** Damage taken from Living Bridge events (v0.6) multiplier. */
      eventDamageMul?: number;
      /** Reveal orb/event timers early on the HUD. */
      orbSense?: boolean;
    }
  /** A bespoke behaviour implemented in the sim, with its numbers here. */
  | { k: 'special'; id: string; params?: Record<string, number> };

export interface AugmentDef {
  id: string;
  name: string;
  rarity: AugmentRarity;
  category: AugmentCategory;
  /** Card text — one sentence, numbers tunable without renaming (§4). */
  description: string;
  /** The on-screen tell. Every augment must have one (the visibility mandate, §1). */
  visual: string;
  scope: AugmentScope;
  /** Signature augments: only this champion is offered them, and only they work. */
  championId?: string;
  /** Cards that would do nothing on this kit are filtered out of offers. */
  requires?: AugmentRequirement;
  tags: AugmentTag[];
  effects: AugmentEffect[];
}
