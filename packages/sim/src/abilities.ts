import type { AbilityDef, Slot } from '@mini-clash/data';
import { applyBuffById } from './buffs';
import { dealDamage } from './combat';
import { executeActions } from './actions';
import { championStats, resolveScaling } from './stats';
import { dist, norm } from './vec';
import type { Entity, World } from './world';

const AA_ACQUIRE_BONUS = 2.5;

export type DenyReason = 'cooldown' | 'energy' | 'dead' | 'casting';

/** Attackability: enemies always; kegs only via explicit clicks (handled at intent level). */
export function canAttack(attacker: Entity, target: Entity): boolean {
  if (target.dead) return false;
  if (target.kind === 'keg') return true;
  return target.team !== attacker.team && (target.kind === 'champion' || target.kind === 'dummy');
}

export function tryCast(w: World, e: Entity, slot: Slot, aimX: number, aimZ: number, noCooldowns: boolean, infiniteEnergy: boolean): DenyReason | null {
  const c = e.champ;
  if (!c) return null;
  if (e.dead) return 'dead';

  // Recast stage takes priority (free, instant).
  if (c.recast && c.recast.slot === slot) {
    const ability = c.recast.ability;
    const [fx, fz] = norm(aimX - e.x, aimZ - e.z);
    e.fx = fx;
    e.fz = fz;
    executeActions({ w, caster: e, ability, ox: e.x, oz: e.z, aimX, aimZ, fx, fz }, ability.recast?.actions ?? []);
    w.fx(`${c.def.id}.${slot}.recast`, e.x, e.z, { fx, fz, source: e.id });
    c.cds[slot] = noCooldowns ? 0 : ability.cooldown;
    c.recast = null;
    return null;
  }

  if (c.cast && c.cast.kind !== 'aa') return 'casting';
  if (c.cds[slot] > 0.001) return 'cooldown';
  const ability = c.def.abilities[slot];
  if (!infiniteEnergy && c.energy < ability.cost) return 'energy';

  // Cancel an in-flight basic-attack windup — abilities take priority.
  if (c.cast?.kind === 'aa') c.cast = null;

  // Aim resolution: point-aims clamp into range; direction/skillshot normalize from self.
  let ax = aimX;
  let az = aimZ;
  const d = dist(e.x, e.z, aimX, aimZ);
  if (ability.aim === 'self') {
    ax = e.x;
    az = e.z;
  } else if ((ability.aim === 'point' || ability.aim === 'skillshot') && d > ability.range) {
    const [nx, nz] = norm(aimX - e.x, aimZ - e.z);
    ax = e.x + nx * ability.range;
    az = e.z + nz * ability.range;
  }
  // Point-targets must land on walkable ground (walls, kegs).
  if (ability.aim === 'point') {
    [ax, az] = w.nav.nearestOpen(ax, az);
  }

  const [fx, fz] = norm(ax - e.x, az - e.z);
  if (ability.aim !== 'self' && d > 0.05) {
    e.fx = fx;
    e.fz = fz;
  }

  if (!infiniteEnergy) c.energy = Math.max(0, c.energy - ability.cost);
  c.dancing = false;

  if (ability.castTime > 0) {
    c.cast = { kind: slot, ability, tLeft: ability.castTime, tTotal: ability.castTime, aimX: ax, aimZ: az };
    w.fx(`${c.def.id}.${slot}.windup`, e.x, e.z, { fx, fz, source: e.id });
  } else {
    commitAbility(w, e, ability, ax, az, noCooldowns);
  }
  return null;
}

export function commitAbility(w: World, e: Entity, ability: AbilityDef, aimX: number, aimZ: number, noCooldowns: boolean): void {
  const c = e.champ;
  if (!c) return;
  const [fx, fz] = norm(aimX - e.x, aimZ - e.z);
  executeActions({ w, caster: e, ability, ox: e.x, oz: e.z, aimX, aimZ, fx, fz }, ability.actions);
  w.fx(`${c.def.id}.${ability.slot}.cast`, e.x, e.z, { fx, fz, source: e.id });

  if (ability.recast) {
    // Cooldown waits until the recast resolves or its window closes.
    c.recast = { slot: ability.slot, tLeft: ability.recast.window, ability };
  } else {
    c.cds[ability.slot] = noCooldowns ? 0 : ability.cooldown;
  }

  // Apply any buffered order issued during the windup.
  if (c.pendingOrder) {
    c.order = c.pendingOrder;
    c.pendingOrder = null;
    c.path = [];
  }
}

export function updateCasts(w: World, e: Entity, dt: number, noCooldowns: boolean): void {
  const c = e.champ;
  if (!c || e.dead) return;

  // Cooldowns, energy, passives.
  for (const s of ['q', 'w', 'r'] as const) c.cds[s] = Math.max(0, c.cds[s] - dt);
  c.aaCd = Math.max(0, c.aaCd - dt);
  c.energy = Math.min(100, c.energy + 4 * dt);
  if (c.passive.stonewallCd !== undefined) c.passive.stonewallCd = Math.max(0, c.passive.stonewallCd - dt);

  if (c.recast) {
    c.recast.tLeft -= dt;
    if (c.recast.tLeft <= 0) {
      c.cds[c.recast.slot] = noCooldowns ? 0 : c.recast.ability.cooldown;
      c.recast = null;
    }
  }

  if (c.cast) {
    c.cast.tLeft -= dt;
    if (c.cast.tLeft <= 0) {
      const cast = c.cast;
      c.cast = null;
      if (cast.kind === 'aa') {
        commitAutoAttack(w, e, cast.target);
      } else if (cast.ability) {
        commitAbility(w, e, cast.ability, cast.aimX, cast.aimZ, noCooldowns);
      }
    }
  }

  // Leap integration.
  if (c.leap) {
    c.leap.tLeft -= dt;
    const t = 1 - Math.max(0, c.leap.tLeft) / c.leap.tTotal;
    e.x = c.leap.fromX + (c.leap.toX - c.leap.fromX) * t;
    e.z = c.leap.fromZ + (c.leap.toZ - c.leap.fromZ) * t;
    if (c.leap.tLeft <= 0) {
      const leap = c.leap;
      c.leap = null;
      e.x = leap.toX;
      e.z = leap.toZ;
      const [fx, fz] = norm(e.fx, e.fz);
      executeActions(
        { w, caster: e, ability: leap.ability, ox: e.x, oz: e.z, aimX: e.x, aimZ: e.z, fx, fz },
        leap.onLand,
      );
      w.fx(`${c.def.id}.r.land`, e.x, e.z, { fx, fz, source: e.id });
    }
  }
}

/** Auto-attack brain: acquire, windup, commit. Runs after cast update. */
export function updateAutoAttack(w: World, e: Entity, _dt: number): void {
  const c = e.champ;
  if (!c || e.dead || c.leap) return;
  if (c.cast && c.cast.kind !== 'aa') return;

  const stats = championStats(e);

  // Resolve current target.
  let target: Entity | undefined;
  if (c.order?.kind === 'attackTarget') {
    const t = w.get(c.order.target);
    if (t && canAttack(e, t)) target = t;
    else {
      c.order = null;
      c.aaTarget = null;
    }
  } else if (c.order?.kind === 'attackMove') {
    // Nearest enemy in acquisition range (kegs excluded from auto-acquire).
    let best: Entity | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    for (const u of w.enemiesOf(e.team)) {
      if (u.kind === 'keg') continue;
      const d = dist(e.x, e.z, u.x, u.z) - u.radius;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (best && bestD <= stats.range + AA_ACQUIRE_BONUS) target = best;
  }
  c.aaTarget = target?.id ?? null;
  if (!target) return;

  const d = dist(e.x, e.z, target.x, target.z) - target.radius;
  if (d > stats.range) return; // movement system walks us in

  // In range: face target, stop, and swing when ready.
  const [fx, fz] = norm(target.x - e.x, target.z - e.z);
  e.fx = fx;
  e.fz = fz;
  c.path = [];

  if (c.cast?.kind === 'aa' || c.aaCd > 0.001) return;
  const interval = 1 / stats.attackSpeed;
  const windup = interval * c.def.attack.windupFrac;
  // aaCd is charged at COMMIT, so cancelling a windup (orb-walking) costs nothing.
  c.cast = { kind: 'aa', tLeft: windup, tTotal: windup, aimX: target.x, aimZ: target.z, target: target.id };
  if (c.def.attack.kind === 'ranged') {
    w.fx(`${c.def.id}.aa.fire`, e.x, e.z, { fx, fz, source: e.id });
  }
}

function commitAutoAttack(w: World, e: Entity, targetId: number | undefined): void {
  const c = e.champ;
  if (!c || targetId === undefined) return;
  const stats = championStats(e);
  c.aaCd = (1 / stats.attackSpeed) * (1 - c.def.attack.windupFrac);
  const target = w.get(targetId);
  if (!target || !canAttack(e, target)) return;

  // Lucky Doubloon (Fathom entrance): consume for +40%.
  let luckyMul = 1;
  const luckyIdx = e.buffs.findIndex((b) => b.id === 'fathom_entrance_luck');
  if (luckyIdx >= 0) {
    luckyMul = 1 + (c.def.entrance.params.bonus ?? 0.4);
    e.buffs.splice(luckyIdx, 1);
  }

  if (c.def.attack.kind === 'melee') {
    const reach = stats.range + 0.6; // forgiveness vs moving targets
    if (dist(e.x, e.z, target.x, target.z) - target.radius <= reach) {
      dealDamage(w, { source: e }, target, stats.ad * luckyMul, 'physical');
      w.fx('generic.melee.hit', target.x, target.z, { source: e.id, target: target.id });
    }
    return;
  }

  // Ranged: homing missile. Powder Rounds passive counts FIRED attacks.
  let powder = false;
  if (c.def.passive.id === 'powder_rounds') {
    c.passive.powderCount = (c.passive.powderCount ?? 0) + 1;
    const every = c.def.passive.params.every;
    if (c.passive.powderCount >= every) {
      c.passive.powderCount = 0;
      powder = true;
    }
  }
  const [dx, dz] = norm(target.x - e.x, target.z - e.z);
  const m = c.def.attack.missile ?? { speed: 20, size: 0.15, color: 0xffffff };
  w.add({
    kind: 'projectile',
    team: e.team,
    x: e.x + dx * (e.radius + 0.3),
    z: e.z + dz * (e.radius + 0.3),
    fx: dx,
    fz: dz,
    radius: m.size,
    hp: 1,
    hpMax: 1,
    dead: false,
    airborne: 0,
    airborneTotal: 0,
    buffs: [],
    proj: {
      style: 'aa',
      owner: e.id,
      ownerPlayer: c.player,
      dirX: dx,
      dirZ: dz,
      speed: m.speed,
      traveled: 0,
      maxRange: stats.range + AA_ACQUIRE_BONUS + 4,
      pulsesFired: 0,
      hitIds: new Set(),
      target: target.id,
      damage: stats.ad,
      dtype: 'physical',
      powder,
      luckyMul,
      color: powder ? 0xffa13b : m.color,
      size: powder ? m.size * 1.6 : m.size,
    },
  });
}

/** Spawn-in effects: entrance + fresh-legs (also used on respawn and champion switch). */
export function applySpawnEffects(w: World, e: Entity): void {
  const c = e.champ;
  if (!c) return;
  applyBuffById(e, 'spawn_haste');
  if (c.def.entrance.id === 'shieldwall') {
    applyBuffById(e, 'rook_entrance_shieldwall');
    const b = e.buffs.find((x) => x.id === 'rook_entrance_shieldwall');
    if (b) b.blockNextHit = true;
  } else if (c.def.entrance.id === 'lucky_doubloon') {
    applyBuffById(e, 'fathom_entrance_luck');
  }
  w.fx('generic.spawn', e.x, e.z, { source: e.id });
}

/** Powder-blast splash resolution (called from projectile impact). */
export function powderBlast(w: World, owner: Entity, target: Entity): void {
  const c = owner.champ;
  if (!c) return;
  const stats = championStats(owner);
  const p = c.def.passive.params;
  const bonus = resolveScaling({ base: p.bonusBase, adRatio: p.bonusAdRatio }, c.level, stats.ad, 0);
  for (const u of w.enemiesOf(owner.team)) {
    if (u.kind === 'keg') continue;
    if (dist(target.x, target.z, u.x, u.z) <= p.splashRadius + u.radius) {
      dealDamage(w, { source: owner }, u, bonus, 'physical');
    }
  }
  w.fx('fathom.passive.blast', target.x, target.z, { source: owner.id, target: target.id });
}
