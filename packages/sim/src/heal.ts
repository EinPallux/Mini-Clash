import { applyBuff } from './buffs';
import { hasItemPassive } from './stats';
import type { Entity } from './world';

/**
 * All champion-sourced healing funnels here (Lifebloom Idol hooks).
 *
 * Lives in its own module so both the ability interpreter and the pet/pickup
 * systems can heal without importing each other.
 */
export function healEntity(healer: Entity, target: Entity, amount: number): void {
  if (target.dead) return;
  let total = amount;
  const lb = hasItemPassive(healer, 'lifebloom');
  if (lb) {
    total *= 1 + lb.healPower;
    applyBuff(target, {
      id: 'item_lifebloom_ms',
      name: 'Lifebloom',
      duration: lb.duration,
      mul: { moveSpeed: 1 + lb.ms },
    });
  }
  target.hp = Math.min(target.hpMax, target.hp + total);
}
