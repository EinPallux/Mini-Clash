import { BRIDGE, CORE_DEF, type DamageType, TOWER_DEF } from '@mini-clash/data';
import { absorbShields, applyCc, consumeBlock } from './buffs';
import { creditKill, onMiniKilled } from './economy';
import { championStats, hasItemPassive, mitigate, unitStats } from './stats';
import { dist } from './vec';
import type { Entity, World } from './world';

export interface DamageContext {
  source: Entity;
  /**
   * 'aa' = basic attacks (on-hit items) · 'ability' = champion abilities (stormweaver,
   * starcore) · 'unit' = Mini/tower/core damage (juggernaut) · 'item'/'burn' = item
   * procs and DoTs (no re-triggering of hooks).
   */
  tag?: 'aa' | 'ability' | 'unit' | 'item' | 'burn';
}

/** Structures must fall in order: outer → inner → Core (GAME_DESIGN §6). */
export function structureInvulnerable(w: World, target: Entity): boolean {
  if (target.tower?.tier === 'inner') {
    for (const s of w.structures()) {
      if (s.tower?.tier === 'outer' && s.team === target.team) return true;
    }
    return false;
  }
  if (target.core) return target.core.invulnerable;
  return false;
}

/**
 * The one damage funnel: invuln → block → flat reductions → resist → DR → shields → HP,
 * with item hooks and kill credit. Returns post-mitigation damage dealt.
 */
export function dealDamage(
  w: World,
  ctx: DamageContext,
  target: Entity,
  raw: number,
  dtype: DamageType,
): number {
  if (target.dead || raw <= 0) return 0;
  const tag = ctx.tag ?? 'ability';
  const srcChamp = ctx.source.champ;

  if ((target.kind === 'tower' || target.kind === 'core') && structureInvulnerable(w, target)) {
    return 0;
  }

  // Full-block charges (Rook entrance Shieldwall).
  if (consumeBlock(target)) {
    w.fx('rook.passive.block', target.x, target.z, { target: target.id });
    return 0;
  }

  let amount = raw;

  // Executioner's Edge: bonus damage vs low targets.
  if (srcChamp && (tag === 'aa' || tag === 'ability')) {
    const ex = hasItemPassive(ctx.source, 'executioner');
    if (ex && target.hp / target.hpMax < ex.threshold) amount *= 1 + ex.bonus;
  }
  // Ram Minis siege: bonus vs structures, resilience vs tower fire (both from data).
  if (ctx.source.mini && (target.kind === 'tower' || target.kind === 'core')) {
    amount *= ctx.source.mini.def.mini?.vsStructures ?? 1;
  }
  // Mini-vs-Mini bonus so opposing waves grind through instead of stockpiling.
  if (ctx.source.mini && target.kind === 'mini') {
    amount *= ctx.source.mini.def.mini?.vsMinis ?? 1;
  }
  // Champions shred waves — Minis are speed bumps for heroes, walls for each other.
  if (srcChamp && target.kind === 'mini') {
    amount *= BRIDGE.champVsMiniMul;
  }
  if (target.mini && (ctx.source.kind === 'tower' || ctx.source.kind === 'core')) {
    amount *= target.mini.def.mini?.fromStructures ?? 1;
  }
  // Juggernaut Mail: reduced damage from Minis and towers.
  if (target.champ && tag === 'unit') {
    const jug = hasItemPassive(target, 'juggernaut');
    if (jug) amount *= 1 - jug.reduction;
  }

  // Rook passive Stonewall: flat reduction charge every N seconds.
  const tc = target.champ;
  if (tc && tc.def.passive.id === 'stonewall' && (tc.passive.stonewallCd ?? 0) <= 0) {
    const p = tc.def.passive.params;
    amount = Math.max(0, amount - (p.base + p.perLevel * tc.level));
    tc.passive.stonewallCd = p.icd;
    w.fx('rook.passive.block', target.x, target.z, { target: target.id });
    if (amount <= 0) return 0;
  }

  const stats =
    target.kind === 'champion' ? championStats(target) : unitStats(target, resistsOf(target));

  const resist = dtype === 'physical' ? stats.armor : stats.ward;
  let dealt = mitigate(amount, resist);
  dealt *= 1 - stats.damageReduction;

  // Watchtower backdoor protection: halved damage with no enemy Minis nearby.
  if (target.tower && !target.dead) {
    let siege = false;
    for (const u of w.units()) {
      if (u.kind !== 'mini' || u.team === target.team) continue;
      if (dist(target.x, target.z, u.x, u.z) <= TOWER_DEF.backdoorRange) {
        siege = true;
        break;
      }
    }
    if (!siege) dealt *= 1 - TOWER_DEF.backdoorDr;
  }
  if (dealt <= 0) return 0;

  // Combat bookkeeping (before shields — absorbed hits still count as taking damage).
  if (tc) {
    tc.lastDamagedAt = w.time;
    tc.lastCombatAt = w.time;
    if (srcChamp) tc.recentDamagers.set(srcChamp.player, w.time);
  }
  if (srcChamp) {
    srcChamp.lastCombatAt = w.time;
    if (target.kind === 'champion') srcChamp.lastChampHitAt = w.time;
  }

  // Overtime Corebreaker: Cores take double damage (GAME_DESIGN §5).
  if (target.core && w.match?.overtime) dealt *= BRIDGE.overtime.coreDamageMul;

  const toHp = absorbShields(target, dealt);
  target.hp -= toHp;
  if (w.match && (target.kind === 'tower' || target.kind === 'core')) {
    const byTeam = target.team === 0 ? 1 : 0;
    w.match.structDamage[byTeam] += toHp;
  }
  w.emit({
    t: 'damage',
    target: target.id,
    amount: Math.round(dealt),
    dtype,
    x: target.x,
    z: target.z,
  });

  // Attacker item hooks (never re-entered from item/burn damage).
  if (srcChamp && tag === 'aa') {
    const fang = hasItemPassive(ctx.source, 'dragonfang');
    if (fang) {
      const c = srcChamp;
      c.itemState.dragonfang = (c.itemState.dragonfang ?? 0) + 1;
      if (c.itemState.dragonfang >= fang.every) {
        c.itemState.dragonfang = 0;
        let bonus = target.hpMax * fang.pct;
        if (target.kind === 'tower' || target.kind === 'core') {
          bonus = Math.min(bonus, fang.structureCap);
        }
        w.fx('item.dragonfang', target.x, target.z, { source: ctx.source.id, target: target.id });
        dealDamage(w, { source: ctx.source, tag: 'item' }, target, bonus, 'physical');
      }
    }
    if (target.kind !== 'tower' && target.kind !== 'core') {
      const ls = hasItemPassive(ctx.source, 'lifesteal');
      if (ls && dtype === 'physical' && !ctx.source.dead) {
        ctx.source.hp = Math.min(ctx.source.hpMax, ctx.source.hp + dealt * ls.pct);
      }
      const ph = hasItemPassive(ctx.source, 'phantom');
      if (ph) applyCc(target, { kind: 'slow', duration: ph.duration, strength: ph.slow });
    }
  }
  if (srcChamp && tag === 'ability') {
    const sw = hasItemPassive(ctx.source, 'stormweaver');
    if (sw) srcChamp.energy = Math.min(100, srcChamp.energy + sw.energy);
    if (target.kind !== 'tower' && target.kind !== 'core') {
      const sc = hasItemPassive(ctx.source, 'starcore');
      if (sc) scheduleBurn(w, ctx.source.id, target.id, target.hpMax * sc.pct, sc.duration);
    }
  }

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
    kill(w, target, ctx.source);
  }
  return dealt;
}

function resistsOf(target: Entity): { armor: number; ward: number } {
  if (target.tower) return { armor: TOWER_DEF.armor, ward: TOWER_DEF.ward };
  if (target.core) return { armor: CORE_DEF.armor, ward: CORE_DEF.ward };
  const def = target.dummy?.def ?? target.keg?.def ?? target.mini?.def;
  return { armor: def?.armor ?? 0, ward: def?.ward ?? 0 };
}

/** Starcore Staff burn: total damage over 4 pulses, tagged so it never re-procs. */
function scheduleBurn(
  w: World,
  sourceId: number,
  targetId: number,
  total: number,
  duration: number,
): void {
  const pulses = 4;
  for (let i = 1; i <= pulses; i++) {
    w.schedule((duration / pulses) * i, (world) => {
      const src = world.get(sourceId);
      const tgt = world.get(targetId);
      if (!src || !tgt || tgt.dead) return;
      dealDamage(world, { source: src, tag: 'burn' }, tgt, total / pulses, 'arcane');
    });
  }
}

export function kill(w: World, target: Entity, by?: Entity): void {
  if (target.dead) return;
  target.dead = true;
  target.buffs.length = 0;
  w.emit({ t: 'death', id: target.id, x: target.x, z: target.z });

  if (target.kind === 'keg') {
    // Keg death = detonation (handled by keg system to avoid double explosions).
    return;
  }
  if (target.kind === 'mini') {
    // Reward + removal are finished by the Mini system this tick (safe vs live iterators).
    onMiniKilled(w, target, by?.team ?? (target.team === 0 ? 1 : 0));
    return;
  }
  if (target.kind === 'tower' || target.kind === 'core') {
    // Consequences (nav, rewards, exposure, match end) run in the structure update phase.
    w.fx('structure.death', target.x, target.z, { source: target.id });
    return;
  }
  if (target.champ) {
    const c = target.champ;
    c.respawnIn = Math.min(
      BRIDGE.respawnCap,
      BRIDGE.respawnBase + BRIDGE.respawnPerLevel * c.level,
    );
    c.cast = null;
    c.leap = null;
    c.order = null;
    c.pendingOrder = null;
    c.path = [];
    c.aaTarget = null;
    c.dancing = false;
    c.inBrush = false;
    c.brushIdx = -1;
    creditKill(w, target, by);
    w.fx('generic.death', target.x, target.z, { source: target.id });
  }
}

/** Instant displacement (knockback / powder push) with wall clamping. */
export function displace(
  w: World,
  target: Entity,
  dirX: number,
  dirZ: number,
  distance: number,
): void {
  if (target.dead || distance <= 0) return;
  if (target.kind === 'dummy' || target.kind === 'tower' || target.kind === 'core') return;
  const steps = Math.max(1, Math.ceil(distance / 0.2));
  for (let i = 0; i < steps; i++) {
    const nx = target.x + (dirX * distance) / steps;
    const nz = target.z + (dirZ * distance) / steps;
    if (w.nav.isBlockedAt(nx, nz)) break;
    target.x = nx;
    target.z = nz;
  }
}
