import { BUFFS, type BuffDef, type CcSpec } from '@mini-clash/data';
import type { BuffInstance, Entity } from './world';

export function applyBuff(target: Entity, def: BuffDef, opts?: { blockNextHit?: boolean }): void {
  const existing = target.buffs.find((b) => b.id === def.id);
  if (existing) {
    existing.tLeft = def.duration;
    if (def.maxStacks && existing.stacks < def.maxStacks) existing.stacks++;
    if (opts?.blockNextHit) existing.blockNextHit = true;
    return;
  }
  const inst: BuffInstance = { id: def.id, def, tLeft: def.duration, stacks: 1 };
  if (opts?.blockNextHit) inst.blockNextHit = true;
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
  switch (cc.kind) {
    case 'slow': {
      const def: BuffDef = {
        id: `cc_slow_${Math.round((cc.strength ?? 0.2) * 100)}`,
        name: 'Slowed',
        duration: cc.duration,
        mul: { moveSpeed: 1 - (cc.strength ?? 0.2) },
      };
      applyBuff(target, def);
      break;
    }
    case 'knockup': {
      // No DR in training vs dummies; DR window arrives with the full CC system in v0.2.
      target.airborne = Math.max(target.airborne, cc.duration);
      target.airborneTotal = target.airborne;
      break;
    }
    case 'knockback': {
      // v0.1: implemented as an instant displacement by strength units along source facing —
      // handled by the caller (needs direction context).
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
      break;
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
