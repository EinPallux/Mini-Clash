import {
  type AbilityDef,
  type Action,
  type ChampionDef,
  PROJECTILES,
  type ScalingValue,
  UNITS,
} from '@mini-clash/data';

/**
 * Turning a kit description into readable numbers (UI_UX §13: *kit panel with
 * numbers*).
 *
 * Descriptions in `packages/data` are templates — "{dmg} physical damage and a
 * {slow} slow" — because the same sentence has to serve a level-1 preview and a
 * level-18 tooltip. This resolves them from the ability's own actions rather
 * than from a second table of hand-copied numbers, which is the only way the
 * text cannot drift from what the ability actually does.
 *
 * Anything it genuinely cannot work out is left as the raw token rather than
 * replaced with a guess: a visible `{foo}` in a preview is a bug report, a
 * plausible wrong number is not.
 */

/** Damage/heal at a champion level, ignoring items (a bare preview). */
export function valueAt(v: ScalingValue, level: number): number {
  return Math.round(v.base + (v.perLevel ?? 0) * (level - 1));
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const secs = (n: number): string => `${Number(n.toFixed(2))}s`;

/**
 * Walk an action tree collecting the numbers a description might name.
 *
 * A generic deep walk rather than a switch over action kinds. Amounts hide at
 * every depth — inside a projectile's `onHit`, inside a spawned unit's own
 * actions, inside a zone's tick — and a hand-written traversal would silently
 * miss the next shape somebody adds. Damage amounts come out in encounter
 * order, so `{dmg}` is the first thing the ability does and `{dmg2}` the
 * second, which is how the descriptions are written.
 */
function collect(actions: readonly Action[], level: number, out: Record<string, string>): void {
  const damages: number[] = [];
  const heals: number[] = [];
  const shields: number[] = [];
  const seen = new Set<object>();

  const isScaling = (v: unknown): v is ScalingValue =>
    typeof v === 'object' && v !== null && typeof (v as ScalingValue).base === 'number';

  const visit = (node: unknown, kind: string): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, kind);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    if (seen.has(node)) return;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    const nodeKind = typeof obj.t === 'string' ? obj.t : kind;

    // A scaling value is classified by where it sits: a key called `heal` is a
    // heal wherever it appears, and an `amount` takes its meaning from the
    // action holding it (`shieldSelf`, `healAllies`, `areaDamage`…).
    for (const [key, value] of Object.entries(obj)) {
      if (!isScaling(value)) continue;
      const n = valueAt(value, level);
      const label = `${key} ${nodeKind}`.toLowerCase();
      if (label.includes('heal')) heals.push(n);
      else if (label.includes('shield')) shields.push(n);
      else damages.push(n);
    }
    // Damage often lives one indirection away from the cast: on the projectile
    // it fires, or on the unit it summons (Fathom's keg carries its own blast).
    if (nodeKind === 'projectile' && typeof obj.proj === 'string') {
      visit(PROJECTILES[obj.proj], 'projectile');
    }
    if (typeof obj.unit === 'string') visit(UNITS[obj.unit], nodeKind);
    const cc = obj.cc as { kind?: string; duration?: number; strength?: number } | undefined;
    if (cc) {
      if (cc.strength !== undefined) out.slow ??= pct(cc.strength);
      if (cc.duration !== undefined) {
        if (cc.kind === 'slow') out.slowDur ??= secs(cc.duration);
        out.duration ??= secs(cc.duration);
      }
    }
    if (typeof obj.radius === 'number') out.radius ??= String(obj.radius);
    if (typeof obj.range === 'number') out.range ??= String(obj.range);
    if (typeof obj.duration === 'number') out.dur ??= secs(obj.duration);
    if (typeof obj.life === 'number') out.life ??= secs(obj.life);

    for (const [key, value] of Object.entries(obj)) {
      // `shape` and `indicator` carry geometry, not more actions; the numbers
      // above already took what they offer.
      if (key === 'shape' || key === 'indicator') continue;
      if (typeof value === 'object' && value !== null) visit(value, nodeKind);
    }
  };
  visit(actions, 'ability');

  damages.forEach((d, i) => {
    out[i === 0 ? 'dmg' : `dmg${i + 1}`] ??= String(d);
  });
  heals.forEach((h, i) => {
    out[i === 0 ? 'heal' : `heal${i + 1}`] ??= String(h);
  });
  if (shields[0] !== undefined) out.shield ??= String(shields[0]);
}

/** Every placeholder value an ability description can name, at `level`. */
export function abilityNumbers(ability: AbilityDef, level: number): Record<string, string> {
  const out: Record<string, string> = {};
  collect(ability.actions, level, out);
  if (ability.recast) {
    // Recast damage continues the numbering: {dmg2} is the backswing.
    const recast: Record<string, string> = {};
    collect(ability.recast.actions, level, recast);
    if (recast.dmg && out.dmg2 === undefined) out.dmg2 = recast.dmg;
    if (ability.recast.finalActions) {
      const last: Record<string, string> = {};
      collect(ability.recast.finalActions, level, last);
      if (last.dmg && out.dmg3 === undefined) out.dmg3 = last.dmg;
    }
    out.window ??= secs(ability.recast.window);
  }
  out.range ??= String(ability.range);
  const shape = ability.indicator as { radius?: number; length?: number };
  if (shape.radius !== undefined) out.radius ??= String(shape.radius);
  if (shape.length !== undefined) out.range ??= String(shape.length);
  return out;
}

/**
 * Resolve a description.
 *
 * `extra` carries a passive's or entrance's own `params` block, which is
 * already a plain numbers map — those are authored alongside their text and
 * need no derivation.
 */
export function resolveText(
  text: string,
  numbers: Record<string, string | number>,
  extra?: Record<string, number>,
): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = numbers[key] ?? extra?.[key];
    if (value === undefined) return whole;
    // Fractions in a params block are almost always ratios; show them as such.
    if (typeof value === 'number' && value > 0 && value < 1) return pct(value);
    return String(value);
  });
}

/** The finished sentence for one ability slot at `level`. */
export function abilityText(ability: AbilityDef, level = 1): string {
  return resolveText(ability.description, abilityNumbers(ability, level));
}

/** The finished sentence for a passive or an entrance. */
export function passiveText(def: ChampionDef, which: 'passive' | 'entrance'): string {
  const p = def[which];
  return resolveText(p.description, {}, p.params);
}
