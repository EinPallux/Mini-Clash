import { EVENTS, type MapDef, type Team } from '@mini-clash/data';
import { applyBuff } from './buffs';
import { dealDamage } from './combat';
import { elderShield } from './eventKinds';
import { dist, norm } from './vec';
import type { Entity, World } from './world';

type Battle = NonNullable<MapDef['battle']>;

/**
 * The Clash Golem (GAME_DESIGN §9).
 *
 * Two lives in one entity. **Neutral**, it stands on the altar and slams
 * whoever comes close — a shared objective nobody owns. **Converted** (the team
 * that lands the killing blow takes it), it marches that team's lane as a siege
 * engine: taunting towers, shrugging off 40% of their fire, and buffing the
 * Minis around it. The Elder shields allied champions on top of that.
 *
 * It is not a Mini: it never body-blocks, never joins a wave, and its lane walk
 * is its own so a converted golem cannot be dragged off objective by chip
 * damage the way a Ram can.
 */

const AGGRO = 5.5;

export function updateGolem(w: World, e: Entity, battle: Battle, dt: number): void {
  const g = e.golem;
  if (!g) return;
  if (e.dead) {
    // Killed. Worth an event of its own: a converted golem dying is a real
    // objective swing, and without it the only way to notice was an entity
    // quietly leaving the snapshot.
    w.emit({ t: 'golemDied', team: g.owner, elder: g.elder });
    w.fx('event.golem.death', e.x, e.z, { source: e.id });
    w.remove(e.id);
    return;
  }
  if (e.airborne > 0) return;

  const p = EVENTS.clashGolem.params;
  g.atkCd = Math.max(0, g.atkCd - dt);

  if (g.owner === null) {
    updateNeutral(w, e, dt);
    return;
  }
  // The siege is a window, not a permanent teammate (§9.1). When it runs out
  // the golem crumbles wherever it stands — no kill credit, no gold; the value
  // was always the towers you took with it.
  g.siegeLeft -= dt;
  if (g.siegeLeft <= 0) {
    w.emit({ t: 'golemExpired', team: g.owner, elder: g.elder });
    w.fx('event.golem.death', e.x, e.z, { source: e.id });
    w.remove(e.id);
    return;
  }
  elderShield(w, e, dt);
  updateSiege(w, e, battle, g.owner, dt, p);
}

/** Neutral: hold the altar, slam anything that walks into reach. */
function updateNeutral(w: World, e: Entity, dt: number): void {
  const g = e.golem;
  if (!g) return;
  const p = EVENTS.clashGolem.params;

  let best: Entity | undefined;
  let bestD = AGGRO;
  for (const u of w.champions()) {
    if (u.dead) continue;
    const d = dist(e.x, e.z, u.x, u.z);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  g.targetId = best?.id ?? null;
  if (!best) {
    // Drift back to the altar so it never wanders off its own objective.
    const home = dist(e.x, e.z, 0, 0);
    if (home > 0.6) {
      const [dx, dz] = norm(-e.x, -e.z);
      e.x += dx * p.moveSpeed * dt;
      e.z += dz * p.moveSpeed * dt;
      e.fx = dx;
      e.fz = dz;
    }
    return;
  }

  const [fx, fz] = norm(best.x - e.x, best.z - e.z);
  e.fx = fx;
  e.fz = fz;
  if (bestD > p.attackRange + best.radius) {
    e.x += fx * p.moveSpeed * dt;
    e.z += fz * p.moveSpeed * dt;
    return;
  }
  if (g.atkCd > 0) return;
  g.atkCd = p.attackEvery;
  slam(w, e, g.damage, p.slamRadius, best.x, best.z);
}

/** Converted: walk the owner's lane, hit structures, carry the wave. */
function updateSiege(
  w: World,
  e: Entity,
  battle: Battle,
  owner: Team,
  dt: number,
  p: Record<string, number>,
): void {
  const g = e.golem;
  if (!g) return;

  // Buff the Minis travelling with it — this is what makes a golem a push
  // rather than a big champion (§9).
  for (const u of w.entities) {
    if (u.kind !== 'mini' || u.team !== owner || u.dead) continue;
    if (dist(e.x, e.z, u.x, u.z) > p.auraRadius) continue;
    applyBuff(u, {
      id: 'golem_march',
      name: 'Golem March',
      duration: 0.5,
      damageAmp: p.miniDamageMul - 1,
    });
  }

  // Target priority: structures first — it is a siege engine, not a duelist.
  let target: Entity | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const u of w.entities) {
    if (u.dead || u.team === owner) continue;
    const isStruct = u.kind === 'tower' || u.kind === 'core';
    const inRange = dist(e.x, e.z, u.x, u.z);
    if (isStruct && inRange <= AGGRO + u.radius) {
      target = u;
      break;
    }
    if ((u.kind === 'champion' || u.kind === 'mini') && inRange < bestD && inRange <= AGGRO) {
      bestD = inRange;
      target = u;
    }
  }
  g.targetId = target?.id ?? null;

  if (target) {
    const [fx, fz] = norm(target.x - e.x, target.z - e.z);
    e.fx = fx;
    e.fz = fz;
    const reach = p.attackRange + target.radius;
    if (dist(e.x, e.z, target.x, target.z) > reach) {
      e.x += fx * p.moveSpeed * dt;
      e.z += fz * p.moveSpeed * dt;
      return;
    }
    if (g.atkCd > 0) return;
    g.atkCd = p.attackEvery;
    slam(w, e, g.damage, p.slamRadius, target.x, target.z);
    return;
  }

  // Nothing in reach: keep walking the lane toward the enemy Core.
  const lane = battle.lane;
  const idx = owner === 0 ? g.lane : lane.length - 1 - g.lane;
  const [gx, gz] = lane[Math.max(0, Math.min(lane.length - 1, idx))];
  const [dx, dz] = norm(gx - e.x, gz - e.z);
  e.fx = dx;
  e.fz = dz;
  e.x += dx * p.moveSpeed * dt;
  e.z += dz * p.moveSpeed * dt;
  if (dist(e.x, e.z, gx, gz) < 1.2 && g.lane < lane.length - 1) g.lane++;
}

/** One heavy slam: everything in the radius, structures included. */
function slam(w: World, e: Entity, damage: number, radius: number, ax: number, az: number): void {
  const g = e.golem;
  const owner = g?.owner ?? null;
  for (const u of [...w.entities]) {
    if (u.dead || u.id === e.id) continue;
    if (u.kind === 'projectile' || u.kind === 'zone' || u.kind === 'orb') continue;
    if (u.kind === 'pickup' || u.kind === 'flower' || u.kind === 'wall') continue;
    // Neutral hits everyone; converted hits the other side only.
    if (owner !== null && u.team === owner) continue;
    if (owner === null && u.kind !== 'champion') continue;
    if (dist(ax, az, u.x, u.z) > radius + u.radius) continue;
    dealDamage(w, { source: e, tag: 'unit', label: 'golem' }, u, damage, 'physical');
  }
  w.fx('event.golem.slam', ax, az, { source: e.id });
}

/**
 * Tower fire into a converted golem (§9: 40% resist). Applied at the damage
 * funnel rather than as a stat so it only ever blunts *structures*, which is
 * what makes taking the golem a siege advantage instead of a duel advantage.
 */
export function golemTowerResist(target: Entity, source: Entity): number {
  const g = target.golem;
  if (!g || g.owner === null) return 1;
  if (source.kind !== 'tower' && source.kind !== 'core') return 1;
  return 1 - EVENTS.clashGolem.params.towerResist;
}
