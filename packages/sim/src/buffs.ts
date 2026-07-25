import { BUFFS, type BuffDef, type CcSpec, ITEMS } from '@mini-clash/data';
import { slowResist } from './augments';
import type { BuffInstance, Entity } from './world';

export function applyBuff(target: Entity, def: BuffDef, opts?: { blockNextHit?: boolean }): void {
  const existing = target.buffs.find((b) => b.id === def.id);
  if (existing) {
    existing.tLeft = def.duration;
    if (def.maxStacks && existing.stacks < def.maxStacks) existing.stacks++;
    if (opts?.blockNextHit) existing.blockNextHit = true;
    if (def.shield) existing.shieldLeft = def.shield;
    return;
  }
  const inst: BuffInstance = { id: def.id, def, tLeft: def.duration, stacks: 1 };
  if (opts?.blockNextHit) inst.blockNextHit = true;
  if (def.shield) inst.shieldLeft = def.shield;
  target.buffs.push(inst);
}

export function applyBuffById(target: Entity, id: string): void {
  const def = BUFFS[id];
  if (!def) throw new Error(`unknown buff '${id}'`);
  applyBuff(target, def);
}

/** CC application. Slows become synthetic buffs; knockups set airborne time (cleanse-immune). */
export function applyCc(target: Entity, cc: CcSpec): void {
  if (target.kind === 'wall' || target.kind === 'projectile') return;
  if (target.kind === 'tower' || target.kind === 'core') return; // structures are CC-immune
  switch (cc.kind) {
    case 'slow': {
      // Juggernaut Frame blunts slows before they ever become a buff.
      const strength = (cc.strength ?? 0.2) * (1 - slowResist(target));
      if (strength <= 0.001) break;
      const def: BuffDef = {
        id: `cc_slow_${Math.round(strength * 100)}`,
        name: 'Slowed',
        duration: cc.duration,
        mul: { moveSpeed: 1 - strength },
      };
      applyBuff(target, def);
      break;
    }
    case 'knockup': {
      // No DR in training vs dummies; DR window arrives with the full CC system in v0.2.
      target.airborne = Math.max(target.airborne, cc.duration);
      target.airborneTotal = target.airborne;
      onHardCc(target);
      break;
    }
    case 'knockback': {
      // v0.1: implemented as an instant displacement by strength units along source facing —
      // handled by the caller (needs direction context).
      break;
    }
    case 'silence': {
      // Hands locked, feet free — you can run, you just cannot answer.
      applyBuff(target, { id: 'cc_silence', name: 'Silenced', duration: cc.duration });
      break;
    }
    case 'root':
    case 'stun': {
      const def: BuffDef = {
        id: `cc_${cc.kind}`,
        name: cc.kind === 'root' ? 'Rooted' : 'Stunned',
        duration: cc.duration,
        mul: { moveSpeed: 0 },
      };
      applyBuff(target, def);
      onHardCc(target);
      break;
    }
    case 'fear': {
      // Minis scatter (their AI reads this). Champion fear needs a flee origin —
      // it comes through applyFear(); a bare cc_fear on a champion is a no-op marker.
      if (target.kind === 'mini') {
        applyBuff(target, { id: 'cc_fear', name: 'Feared', duration: cc.duration });
      }
      break;
    }
  }
}

/** Champion fear (Wisp R): flee away from a point, controls locked (hard CC). */
export function applyFear(target: Entity, fromX: number, fromZ: number, duration: number): void {
  const c = target.champ;
  if (!c || target.dead) return;
  c.feared = { tLeft: duration, fromX, fromZ };
  c.cast = null; // hard CC interrupts a windup/channel
  c.recast = null;
  applyBuff(target, { id: 'cc_fear', name: 'Feared', duration });
  onHardCc(target);
}

/** Titan's Bastion: hard CC grants a short damage-reduction window. */
function onHardCc(target: Entity): void {
  const c = target.champ;
  if (!c) return;
  for (const id of c.items) {
    const p = ITEMS[id]?.passive;
    if (p?.id === 'titan') {
      applyBuff(target, {
        id: 'item_titan_dr',
        name: 'Unbroken',
        duration: p.params.duration,
        damageReduction: p.params.dr,
      });
      return;
    }
  }
}

export function tickBuffs(e: Entity, dt: number): void {
  if (e.airborne > 0) e.airborne = Math.max(0, e.airborne - dt);
  for (let i = e.buffs.length - 1; i >= 0; i--) {
    const b = e.buffs[i];
    b.tLeft -= dt;
    if (b.tLeft <= 0) e.buffs.splice(i, 1);
  }
}

/** Consume a full-block charge if present (entrance Shieldwall). */
export function consumeBlock(e: Entity): boolean {
  for (const b of e.buffs) {
    if (b.blockNextHit) {
      b.blockNextHit = false;
      b.tLeft = Math.min(b.tLeft, 0.05);
      return true;
    }
  }
  return false;
}

/** Untargetable window (Wisp's Cold Spot morph): can't be picked as a new target. */
export function isUntargetable(e: Entity): boolean {
  return e.buffs.some((b) => b.id === 'wisp_untargetable');
}

/** Total remaining absorb across shield buffs (HUD + snapshot). */
export function shieldTotal(e: Entity): number {
  let total = 0;
  for (const b of e.buffs) total += b.shieldLeft ?? 0;
  return total;
}

/** Drain `amount` through shield pools; returns the damage that reaches HP. */
export function absorbShields(e: Entity, amount: number): number {
  let left = amount;
  for (let i = 0; i < e.buffs.length && left > 0; i++) {
    const b = e.buffs[i];
    if (b.shieldLeft === undefined || b.shieldLeft <= 0) continue;
    const take = Math.min(b.shieldLeft, left);
    b.shieldLeft -= take;
    left -= take;
    if (b.shieldLeft <= 0.01) {
      e.buffs.splice(i, 1);
      i--;
    }
  }
  return left;
}
