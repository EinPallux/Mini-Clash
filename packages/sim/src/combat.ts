import type { DamageType } from '@mini-clash/data';
import { consumeBlock } from './buffs';
import { championStats, mitigate, unitStats } from './stats';
import type { Entity, World } from './world';

export interface DamageContext {
  source: Entity;
  /** For fx routing; 'aa' hits reuse generic timelines. */
  tag?: string;
}

/**
 * The one damage funnel: block → resist → DR → HP, with events.
 * Returns post-mitigation damage dealt.
 */
export function dealDamage(
  w: World,
  ctx: DamageContext,
  target: Entity,
  raw: number,
  dtype: DamageType,
): number {
  if (target.dead || raw <= 0) return 0;

  // Full-block charges (Rook entrance Shieldwall).
  if (consumeBlock(target)) {
    w.fx('rook.passive.block', target.x, target.z, { target: target.id });
    return 0;
  }

  // Rook passive Stonewall: flat reduction charge every N seconds.
  let amount = raw;
  const tc = target.champ;
  if (tc && tc.def.passive.id === 'stonewall' && (tc.passive.stonewallCd ?? 0) <= 0) {
    const p = tc.def.passive.params;
    amount = Math.max(0, amount - (p.base + p.perLevel * tc.level));
    tc.passive.stonewallCd = p.icd;
    w.fx('rook.passive.block', target.x, target.z, { target: target.id });
    if (amount <= 0) return 0;
  }

  const stats =
    target.kind === 'champion'
      ? championStats(target)
      : unitStats(target, {
          armor: target.dummy?.def.armor ?? target.keg?.def.armor ?? 0,
          ward: target.dummy?.def.ward ?? target.keg?.def.ward ?? 0,
        });

  const resist = dtype === 'physical' ? stats.armor : stats.ward;
  let dealt = mitigate(amount, resist);
  dealt *= 1 - stats.damageReduction;
  if (dealt <= 0) return 0;

  target.hp -= dealt;
  w.emit({ t: 'damage', target: target.id, amount: Math.round(dealt), dtype, x: target.x, z: target.z });

  if (target.dummy) {
    target.dummy.windowDmg += dealt;
    target.dummy.active = true;
    target.dummy.sinceHit = 0;
    target.dummy.hitPulse = 0.2;
    // Dummies never die — clamp and let the reset window handle recovery.
    if (target.hp < 1) target.hp = 1;
    return dealt;
  }

  if (target.hp <= 0) {
    target.hp = 0;
    if (target.keg) target.keg.killedByTeam = ctx.source.team;
    kill(w, target);
  }
  return dealt;
}

export function kill(w: World, target: Entity): void {
  if (target.dead) return;
  target.dead = true;
  target.buffs.length = 0;
  w.emit({ t: 'death', id: target.id, x: target.x, z: target.z });

  if (target.kind === 'keg') {
    // Keg death = detonation (handled by keg system to avoid double explosions).
    return;
  }
  if (target.champ) {
    const c = target.champ;
    c.respawnIn = Math.min(20, 5 + 1.5 * c.level);
    c.cast = null;
    c.leap = null;
    c.order = null;
    c.path = [];
    c.aaTarget = null;
    c.dancing = false;
    w.fx('generic.death', target.x, target.z, { source: target.id });
  }
}

/** Instant displacement (knockback / powder push) with wall clamping. */
export function displace(w: World, target: Entity, dirX: number, dirZ: number, distance: number): void {
  if (target.dead || distance <= 0) return;
  if (target.kind === 'dummy') return; // dummies are anchored
  const steps = Math.max(1, Math.ceil(distance / 0.2));
  for (let i = 0; i < steps; i++) {
    const nx = target.x + (dirX * distance) / steps;
    const nz = target.z + (dirZ * distance) / steps;
    if (w.nav.isBlockedAt(nx, nz)) break;
    target.x = nx;
    target.z = nz;
  }
}
