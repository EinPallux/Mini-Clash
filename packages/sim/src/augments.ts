import {
  AUGMENTS,
  type AugmentDef,
  type AugmentEffect,
  type DamageType,
  type ScalingValue,
  type Slot,
  type StatKey,
} from '@mini-clash/data';
import type { Entity } from './world';

/**
 * Augment effects (docs/AUGMENTS.md).
 *
 * Everything an augment does is read through the helpers here, so the rest of
 * the sim never learns what an augment *is* — it just asks "how much extra
 * damage?", "what is my wall length?", "is my swap cheaper?". A player carries
 * at most 3 cards, so these scans are trivially short; correctness and locality
 * beat caching at this size.
 *
 * Scope rules (§1): `duo` cards work on whichever half is fielded, `active`
 * cards read the fielded champion only, and a signature functions solely on the
 * champion that owns it — so a Rook signature quietly does nothing while its
 * duo partner is on the deck.
 */

/** Does this card function for the champion currently fielded? */
function functioning(e: Entity, def: AugmentDef): boolean {
  const c = e.champ;
  if (!c) return false;
  if (def.championId && def.championId !== c.def.id) return false;
  return true;
}

/** Every augment on this champion that is currently doing something. */
export function liveAugments(e: Entity): AugmentDef[] {
  const c = e.champ;
  if (!c || c.augments.length === 0) return [];
  const out: AugmentDef[] = [];
  for (const id of c.augments) {
    const def = AUGMENTS[id];
    if (def && functioning(e, def)) out.push(def);
  }
  return out;
}

/** Iterate the live effects of one kind. */
function* effectsOf<K extends AugmentEffect['k']>(
  e: Entity,
  kind: K,
): Generator<Extract<AugmentEffect, { k: K }>> {
  for (const def of liveAugments(e)) {
    for (const eff of def.effects) {
      if (eff.k === kind) yield eff as Extract<AugmentEffect, { k: K }>;
    }
  }
}

/** Params of a live `special` effect by id, or null. */
export function special(e: Entity, id: string): Record<string, number> | null {
  for (const eff of effectsOf(e, 'special')) {
    if (eff.id === id) return eff.params ?? {};
  }
  return null;
}

export function hasAugment(e: Entity, id: string): boolean {
  const c = e.champ;
  if (!c) return false;
  const def = AUGMENTS[id];
  return c.augments.includes(id) && !!def && functioning(e, def);
}

/* --------------------------------- Stats ---------------------------------- */

/** Fold augment stat effects into a champion's resolved totals. */
export function applyAugmentStats(e: Entity, t: Record<StatKey, number>): void {
  const c = e.champ;
  if (!c || c.augments.length === 0) return;
  for (const eff of effectsOf(e, 'stat')) {
    if (eff.add) {
      for (const k of Object.keys(eff.add) as StatKey[]) t[k] += eff.add[k] ?? 0;
    }
  }
  for (const eff of effectsOf(e, 'stat')) {
    if (eff.mul) {
      for (const k of Object.keys(eff.mul) as StatKey[]) t[k] *= eff.mul[k] ?? 1;
    }
  }
  // Last Stand: a cornered champion hardens up.
  const ls = special(e, 'last_stand');
  if (ls && e.hp / Math.max(1, e.hpMax) < (ls.threshold ?? 0.25)) {
    t.armor += ls.armor ?? 0;
    t.ward += ls.ward ?? 0;
  }
}

/* -------------------------------- Damage ---------------------------------- */

/** Conditional damage multiplier this attacker gets against this target. */
export function augmentDamageMul(
  source: Entity,
  target: Entity,
  tag: 'aa' | 'ability' | 'unit' | 'item' | 'burn',
): number {
  const c = source.champ;
  if (!c || c.augments.length === 0) return 1;
  let mul = 1;
  for (const eff of effectsOf(source, 'damage')) {
    const scope = eff.tag ?? 'all';
    if (scope !== 'all' && scope !== tag) continue;
    switch (eff.when) {
      case 'all':
        mul *= eff.mul;
        break;
      case 'ccd':
        if (
          target.airborne > 0 ||
          target.buffs.some(
            (b) => b.id.startsWith('cc_') || b.id === 'cc_stun' || b.id === 'cc_root',
          )
        ) {
          mul *= eff.mul;
        }
        break;
      case 'lowHp':
        if (target.hpMax > 0 && target.hp / target.hpMax < (eff.threshold ?? 0.3)) mul *= eff.mul;
        break;
      case 'higherMaxHp':
        if (target.hpMax > source.hpMax) mul *= eff.mul;
        break;
      case 'structures':
        if (target.kind === 'tower' || target.kind === 'core') mul *= eff.mul;
        break;
      case 'shielded':
        if (target.buffs.some((b) => (b.shieldLeft ?? 0) > 0)) mul *= eff.mul;
        break;
    }
  }
  // Kinetic Battery: distance run since the last hit, spent on this one.
  const kin = special(source, 'kinetic');
  if (kin && (tag === 'aa' || tag === 'ability')) {
    mul *= 1 + Math.min(kin.cap ?? 0.15, (c.augState.kinetic ?? 0) * (kin.perUnit ?? 0.01));
  }
  return mul;
}

/** Slow-resistance from augments (Juggernaut Frame), as a 0..1 fraction. */
export function slowResist(e: Entity): number {
  return special(e, 'slow_resist')?.pct ?? 0;
}

/* ------------------------------ Named params ------------------------------ */

/**
 * A tunable an ability reads at its own resolve site, e.g.
 * `augParam(caster, 'rook.wallLength', 3)`. Signatures reshape kits through
 * these without the engine knowing which champion is which.
 */
export function augParam(e: Entity, key: string, base: number): number {
  const c = e.champ;
  if (!c || c.augments.length === 0) return base;
  let v = base;
  for (const eff of effectsOf(e, 'param')) {
    if (eff.key !== key) continue;
    const mode = eff.mode ?? 'mul';
    if (mode === 'mul') v *= eff.value;
    else if (mode === 'add') v += eff.value;
    else v = eff.value;
  }
  return v;
}

/** Convenience for boolean knobs (`set` to 1 = on). */
export function augFlag(e: Entity, key: string): boolean {
  return augParam(e, key, 0) > 0;
}

/* -------------------------------- Tag Team -------------------------------- */

export interface DuoMods {
  swapCd: number | null;
  swapCdDelta: number;
  swapCharges: number;
  benchCdRate: number;
  entrancePotency: number;
  swapMs: number | null;
  swapMsDuration: number | null;
  freeCastWindow: number;
  shieldOnSwap: ScalingValue | null;
  resolvePerSec: number;
  resolveCap: number;
}

export function duoMods(e: Entity): DuoMods {
  const m: DuoMods = {
    swapCd: null,
    swapCdDelta: 0,
    swapCharges: 1,
    benchCdRate: 1,
    entrancePotency: 1,
    swapMs: null,
    swapMsDuration: null,
    freeCastWindow: 0,
    shieldOnSwap: null,
    resolvePerSec: 0,
    resolveCap: 0,
  };
  for (const eff of effectsOf(e, 'duo')) {
    if (eff.swapCdSet !== undefined) m.swapCd = eff.swapCdSet;
    if (eff.swapCdDelta !== undefined) m.swapCdDelta += eff.swapCdDelta;
    if (eff.swapCharges !== undefined) m.swapCharges = Math.max(m.swapCharges, eff.swapCharges);
    if (eff.benchCdRate !== undefined) m.benchCdRate *= eff.benchCdRate;
    if (eff.entrancePotency !== undefined) m.entrancePotency *= eff.entrancePotency;
    if (eff.swapMs !== undefined) m.swapMs = eff.swapMs;
    if (eff.swapMsDuration !== undefined) m.swapMsDuration = eff.swapMsDuration;
    if (eff.freeCastWindow !== undefined)
      m.freeCastWindow = Math.max(m.freeCastWindow, eff.freeCastWindow);
    if (eff.shieldOnSwap !== undefined) m.shieldOnSwap = eff.shieldOnSwap;
    if (eff.resolvePerSec !== undefined) m.resolvePerSec += eff.resolvePerSec;
    if (eff.resolveCap !== undefined) m.resolveCap = Math.max(m.resolveCap, eff.resolveCap);
  }
  return m;
}

/* -------------------------------- Economy --------------------------------- */

export interface EconomyMods {
  goldMul: number;
  miniBonusGold: number;
  orbHealMul: number;
  orbMs: number;
  energyRegen: number;
  respawnMul: number;
  eventDamageMul: number;
  orbSense: boolean;
}

export function economyMods(e: Entity): EconomyMods {
  const m: EconomyMods = {
    goldMul: 1,
    miniBonusGold: 0,
    orbHealMul: 1,
    orbMs: 0,
    energyRegen: 0,
    respawnMul: 1,
    eventDamageMul: 1,
    orbSense: false,
  };
  for (const eff of effectsOf(e, 'economy')) {
    if (eff.goldMul !== undefined) m.goldMul *= eff.goldMul;
    if (eff.miniBonusGold !== undefined) m.miniBonusGold += eff.miniBonusGold;
    if (eff.orbHealMul !== undefined) m.orbHealMul *= eff.orbHealMul;
    if (eff.orbMs !== undefined) m.orbMs = Math.max(m.orbMs, eff.orbMs);
    if (eff.energyRegen !== undefined) m.energyRegen += eff.energyRegen;
    if (eff.respawnMul !== undefined) m.respawnMul *= eff.respawnMul;
    if (eff.eventDamageMul !== undefined) m.eventDamageMul *= eff.eventDamageMul;
    if (eff.orbSense) m.orbSense = true;
  }
  return m;
}

/** Energy cost multiplier (Last Stand discount). */
export function energyCostMul(e: Entity): number {
  const ls = special(e, 'last_stand');
  if (ls && e.hp / Math.max(1, e.hpMax) < (ls.threshold ?? 0.25)) return ls.costMul ?? 1;
  return 1;
}

/* ------------------------------- Cast mods -------------------------------- */

export interface CastMod {
  mode: 'split' | 'mirror' | 'echo';
  power: number;
  delay: number;
  spreadDeg: number;
}

/** The cast modifier active on a slot, if any (Splitter / Mirror Strike / Echo Cast). */
export function castModFor(e: Entity, slot: Slot): CastMod | null {
  for (const eff of effectsOf(e, 'castMod')) {
    if (eff.slot !== slot) continue;
    return {
      mode: eff.mode,
      power: eff.power,
      delay: eff.delay ?? 1,
      spreadDeg: eff.spreadDeg ?? 11,
    };
  }
  return null;
}

/** Ultimate potency multiplier (Overcharge). */
export function ultPower(e: Entity, slot: Slot): number {
  if (slot !== 'r') return 1;
  let mul = 1;
  for (const eff of effectsOf(e, 'ultPower')) mul *= eff.mul;
  return mul;
}

/* ------------------------------ Basic riders ------------------------------ */

export interface BasicRider {
  bonus?: ScalingValue;
  dtype: DamageType;
  burnSeconds: number;
  chain?: { count: number; mul: number; radius: number };
  push: number;
}

/**
 * Basic-attack riders that should fire for this swing. `count` is the champion's
 * running basic-attack tally, so `every: 3` cards land on every third shot.
 */
export function basicRiders(e: Entity, count: number): BasicRider[] {
  const out: BasicRider[] = [];
  for (const eff of effectsOf(e, 'onBasic')) {
    if (eff.every && count % eff.every !== 0) continue;
    out.push({
      bonus: eff.bonus,
      dtype: eff.dtype ?? 'physical',
      burnSeconds: eff.burnSeconds ?? 0,
      chain: eff.chain,
      push: eff.push ?? 0,
    });
  }
  return out;
}
