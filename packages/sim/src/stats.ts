import { ITEMS, RESIST_CONSTANT, type ScalingValue, type StatKey } from '@mini-clash/data';
import type { Entity } from './world';

/** Resolved per-tick stat totals for a champion (base + level growth + items + buffs). */
export interface StatTotals {
  hpMax: number;
  ad: number;
  ap: number;
  attackSpeed: number;
  moveSpeed: number;
  armor: number;
  ward: number;
  haste: number;
  range: number;
  damageReduction: number;
}

const ATTACK_SPEED_CAP = 2.5;

/** Aggregated additive stats from carried items. */
export function itemAdds(items: string[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const id of items) {
    const def = ITEMS[id];
    if (!def?.add) continue;
    for (const k of Object.keys(def.add) as StatKey[]) {
      out[k] = (out[k] ?? 0) + (def.add[k] ?? 0);
    }
  }
  return out;
}

/** Params of a carried item passive, or null. */
export function hasItemPassive(e: Entity, passiveId: string): Record<string, number> | null {
  const c = e.champ;
  if (!c) return null;
  for (const id of c.items) {
    const p = ITEMS[id]?.passive;
    if (p && p.id === passiveId) return p.params;
  }
  return null;
}

export function championStats(e: Entity): StatTotals {
  const c = e.champ;
  if (!c) throw new Error('not a champion');
  const s = c.def.stats;
  const lv = c.level - 1;
  const t: StatTotals = {
    hpMax: s.hp + s.hpPerLevel * lv,
    ad: s.ad + s.adPerLevel * lv,
    ap: 0,
    attackSpeed: s.attackSpeed + s.attackSpeedPerLevel * lv,
    moveSpeed: s.moveSpeed,
    armor: s.armor + s.armorPerLevel * lv,
    ward: s.ward + s.wardPerLevel * lv,
    haste: 0,
    range: s.range,
    damageReduction: 0,
  };
  if (c.items.length > 0) {
    const adds = itemAdds(c.items);
    for (const k of Object.keys(adds) as StatKey[]) t[k] += adds[k] ?? 0;
  }
  applyBuffs(e, t);
  t.attackSpeed = Math.min(ATTACK_SPEED_CAP, t.attackSpeed);
  return t;
}

/** Non-champion units: flat def stats + buffs (slows on dummies). */
export function unitStats(e: Entity, base: { armor: number; ward: number }): StatTotals {
  const t: StatTotals = {
    hpMax: e.hpMax,
    ad: 0,
    ap: 0,
    attackSpeed: 0,
    moveSpeed: 0,
    armor: base.armor,
    ward: base.ward,
    haste: 0,
    range: 0,
    damageReduction: 0,
  };
  applyBuffs(e, t);
  return t;
}

function applyBuffs(e: Entity, t: StatTotals): void {
  // Additive first, then multiplicative (GAME_DESIGN §10.1 conventions).
  for (const b of e.buffs) {
    if (b.def.add) {
      for (const k of Object.keys(b.def.add) as StatKey[]) {
        t[k] += (b.def.add[k] ?? 0) * b.stacks;
      }
    }
  }
  for (const b of e.buffs) {
    if (b.def.mul) {
      for (const k of Object.keys(b.def.mul) as StatKey[]) {
        t[k] *= (b.def.mul[k] ?? 1) ** b.stacks;
      }
    }
    if (b.def.damageReduction) {
      t.damageReduction = 1 - (1 - t.damageReduction) * (1 - b.def.damageReduction);
    }
    if (b.def.decayingMsBonus) {
      const frac = b.tLeft / b.def.duration;
      t.moveSpeed *= 1 + b.def.decayingMsBonus * frac;
    }
  }
  return;
}

/** Effective cooldown after haste (haste 0.15 = 15% faster cycling). */
export function hastedCooldown(base: number, haste: number): number {
  return base / (1 + haste);
}

export function resolveScaling(v: ScalingValue, level: number, ad: number, ap: number): number {
  return v.base + (v.perLevel ?? 0) * (level - 1) + (v.adRatio ?? 0) * ad + (v.apRatio ?? 0) * ap;
}

/** Post-mitigation damage through a resist value. */
export function mitigate(raw: number, resist: number): number {
  return (raw * RESIST_CONSTANT) / (RESIST_CONSTANT + Math.max(0, resist));
}
