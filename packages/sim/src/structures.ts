import { BRIDGE, CORE_DEF, type MapDef, type Team, TOWER_DEF } from '@mini-clash/data';
import { isHiddenFrom } from './brush';
import { dealDamage } from './combat';
import { grantXp } from './economy';
import { dist } from './vec';
import type { Entity, World } from './world';

/** Watchtowers + Clash Cores (GAME_DESIGN §13.2–§13.3). */

export function spawnStructures(w: World, battle: NonNullable<MapDef['battle']>): void {
  for (const t of battle.towers) {
    const navCells = w.nav.stampWall(t.x, t.z, 1, 0, TOWER_DEF.radius * 2, TOWER_DEF.radius * 2);
    w.add({
      kind: 'tower',
      team: t.team,
      x: t.x,
      z: t.z,
      fx: t.team === 0 ? 1 : -1,
      fz: 0,
      radius: TOWER_DEF.radius,
      hp: TOWER_DEF.hp,
      hpMax: TOWER_DEF.hp,
      dead: false,
      airborne: 0,
      airborneTotal: 0,
      buffs: [],
      tower: { tier: t.tier, shotCd: 0.4, aggro: null, ramp: 0, navCells, fallen: false },
    });
  }
  for (const c of battle.cores) {
    w.nav.stampWall(c.x, c.z, 1, 0, CORE_DEF.radius * 2, CORE_DEF.radius * 2);
    w.add({
      kind: 'core',
      team: c.team,
      x: c.x,
      z: c.z,
      fx: c.team === 0 ? 1 : -1,
      fz: 0,
      radius: CORE_DEF.radius,
      hp: CORE_DEF.hp,
      hpMax: CORE_DEF.hp,
      dead: false,
      airborne: 0,
      airborneTotal: 0,
      buffs: [],
      core: { invulnerable: true, pulseCd: 0 },
    });
  }
}

export function updateTower(w: World, e: Entity, dt: number): void {
  const t = e.tower;
  if (!t) return;

  if (e.dead) {
    if (!t.fallen) onTowerFallen(w, e);
    return;
  }

  t.shotCd = Math.max(0, t.shotCd - dt);

  // Priority: Minis > champion who recently struck an allied champion > nearest champion.
  const inRange = (u: Entity): boolean => dist(e.x, e.z, u.x, u.z) - u.radius <= TOWER_DEF.range;
  let target: Entity | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const u of w.units()) {
    if (u.team === e.team || u.kind !== 'mini' || !inRange(u)) continue;
    const d = dist(e.x, e.z, u.x, u.z);
    if (d < bestD) {
      bestD = d;
      target = u;
    }
  }
  if (!target) {
    const current = t.aggro !== null ? w.get(t.aggro) : undefined;
    let attacker: Entity | undefined;
    let nearest: Entity | undefined;
    let attackerD = Number.POSITIVE_INFINITY;
    let nearestD = Number.POSITIVE_INFINITY;
    for (const u of w.champions()) {
      if (u.team === e.team || !inRange(u) || isHiddenFrom(w, e.team, u)) continue;
      const d = dist(e.x, e.z, u.x, u.z);
      const isAttacker = u.champ !== undefined && w.time - u.champ.lastChampHitAt <= 1.5;
      if (isAttacker && d < attackerD) {
        attackerD = d;
        attacker = u;
      }
      if (d < nearestD) {
        nearestD = d;
        nearest = u;
      }
    }
    if (attacker) {
      // Instant aggro-switch, but stay on the current target if they also qualify.
      const currentQualifies =
        current &&
        !current.dead &&
        current.team !== e.team &&
        current.champ !== undefined &&
        inRange(current) &&
        w.time - current.champ.lastChampHitAt <= 1.5;
      target = currentQualifies ? current : attacker;
    } else if (current && !current.dead && current.kind === 'champion' && inRange(current)) {
      target = current; // stickiness: keep shooting the same champion
    } else {
      target = nearest;
    }
  }

  const newAggro = target?.id ?? null;
  if (newAggro !== t.aggro) {
    t.aggro = newAggro;
    t.ramp = 0;
  }
  if (!target || t.shotCd > 0) return;

  const damage = TOWER_DEF.damage * (1 + TOWER_DEF.rampPct * t.ramp);
  if (target.kind === 'champion') t.ramp++;
  fireMissile(w, e, target, damage);
  t.shotCd = TOWER_DEF.interval;
}

function fireMissile(w: World, tower: Entity, target: Entity, damage: number): void {
  const m = TOWER_DEF.missile;
  w.fx('tower.fire', tower.x, tower.z, { source: tower.id, target: target.id });
  w.add({
    kind: 'projectile',
    team: tower.team,
    x: tower.x,
    z: tower.z,
    fx: 1,
    fz: 0,
    radius: m.size,
    hp: 1,
    hpMax: 1,
    dead: false,
    airborne: 0,
    airborneTotal: 0,
    buffs: [],
    proj: {
      style: 'aa',
      owner: tower.id,
      ownerPlayer: -1,
      dirX: 1,
      dirZ: 0,
      speed: m.speed,
      traveled: 0,
      maxRange: TOWER_DEF.range + 8,
      pulsesFired: 0,
      hitIds: new Set(),
      target: target.id,
      damage,
      dtype: 'physical',
      color: m.color,
      size: m.size,
    },
  });
}

function onTowerFallen(w: World, e: Entity): void {
  const t = e.tower;
  if (!t) return;
  t.fallen = true;
  t.aggro = null;
  w.nav.unstampWall(t.navCells);
  const byTeam: Team = e.team === 0 ? 1 : 0;
  w.emit({ t: 'towerDown', team: e.team, tier: t.tier, byTeam });
  if (w.match) w.match.towersDown[byTeam]++;

  // Global bounty: every champion on the destroying team, dead or alive.
  for (const u of w.entities) {
    if (u.kind !== 'champion' || u.team !== byTeam || !u.champ) continue;
    u.champ.gold += BRIDGE.towerGold;
    grantXp(w, u, BRIDGE.towerXp);
  }

  // Both towers down → the Core is exposed.
  const towersLeft = [...w.structures()].some((s) => s.kind === 'tower' && s.team === e.team);
  if (!towersLeft) {
    for (const s of w.entities) {
      if (s.kind === 'core' && s.team === e.team && s.core) {
        s.core.invulnerable = false;
        w.fx('core.exposed', s.x, s.z, { source: s.id });
      }
    }
  }
}

export function updateCore(w: World, e: Entity, dt: number): void {
  const core = e.core;
  if (!core) return;

  if (e.dead) {
    if (w.match && !w.match.over) {
      const winner: Team = e.team === 0 ? 1 : 0;
      w.match.over = { winner };
      w.emit({ t: 'matchOver', winner });
      w.fx('core.destroyed', e.x, e.z, { source: e.id });
    }
    return;
  }

  core.pulseCd = Math.max(0, core.pulseCd - dt);
  if (core.pulseCd > 0) return;
  let fired = false;
  for (const u of [...w.units()]) {
    if (u.team === e.team || u.kind === 'keg') continue;
    if (dist(e.x, e.z, u.x, u.z) - u.radius <= CORE_DEF.pulseRadius) {
      if (!fired) {
        fired = true;
        w.fx('core.pulse', e.x, e.z, { source: e.id });
      }
      dealDamage(w, { source: e, tag: 'unit' }, u, CORE_DEF.pulseDamage, 'arcane');
    }
  }
  if (fired) core.pulseCd = CORE_DEF.pulseInterval;
}
