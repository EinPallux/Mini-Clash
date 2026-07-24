import {
  type AbilityDef,
  type Action,
  type AreaShape,
  BUFFS,
  PROJECTILES,
  UNITS,
} from '@mini-clash/data';
import { applyBuff, applyCc } from './buffs';
import { dealDamage, displace } from './combat';
import { championStats, hasItemPassive, resolveScaling } from './stats';
import { dist, inCone, inRect, norm } from './vec';
import type { Entity, World } from './world';

/** Cosines of data-constant cone half-angles, computed once (determinism note in TECH §4). */
const cosCache = new Map<number, number>();
function cosHalf(angleDeg: number): number {
  let v = cosCache.get(angleDeg);
  if (v === undefined) {
    v = Math.cos(((angleDeg / 2) * Math.PI) / 180);
    cosCache.set(angleDeg, v);
  }
  return v;
}

const sinCache = new Map<number, number>();
function sinOf(angleDeg: number): number {
  let v = sinCache.get(angleDeg);
  if (v === undefined) {
    v = Math.sin((angleDeg * Math.PI) / 180);
    sinCache.set(angleDeg, v);
  }
  return v;
}

export interface ActionCtx {
  w: World;
  caster: Entity;
  ability: AbilityDef;
  /** Execution origin (caster position, or landing point for leap chains). */
  ox: number;
  oz: number;
  aimX: number;
  aimZ: number;
  fx: number;
  fz: number;
}

export function executeActions(ctx: ActionCtx, actions: readonly Action[]): void {
  for (const a of actions) executeAction(ctx, a);
}

function shapeTargets(
  ctx: ActionCtx,
  at: 'aim' | 'self',
  shape: AreaShape,
  team: 'enemies' | 'allies',
): Entity[] {
  const { w, caster } = ctx;
  const px = at === 'aim' ? ctx.aimX : ctx.ox;
  const pz = at === 'aim' ? ctx.aimZ : ctx.oz;
  const out: Entity[] = [];
  for (const u of w.units()) {
    if (u.kind === 'keg') continue; // kegs interact via attacks only
    const isAlly = u.team === caster.team;
    if (team === 'enemies' ? isAlly : !isAlly) continue;
    let hit = false;
    if (shape.kind === 'circle') {
      hit = dist(px, pz, u.x, u.z) <= shape.radius + u.radius;
    } else if (shape.kind === 'cone') {
      hit = inCone(
        px,
        pz,
        ctx.fx,
        ctx.fz,
        cosHalf(shape.angleDeg),
        shape.radius,
        u.x,
        u.z,
        u.radius,
      );
    } else {
      hit = inRect(px, pz, ctx.fx, ctx.fz, shape.length, shape.width, u.x, u.z, u.radius);
    }
    if (hit) out.push(u);
  }
  return out;
}

function executeAction(ctx: ActionCtx, a: Action): void {
  const { w, caster } = ctx;
  const c = caster.champ;
  if (!c) return;
  const stats = championStats(caster);

  switch (a.t) {
    case 'areaDamage': {
      if (a.delay) {
        // Telegraphed eruption: the zone locks at cast, resolves after the delay.
        const frozen: ActionCtx = { ...ctx };
        if (a.telegraphFx) w.fx(a.telegraphFx, frozen.aimX, frozen.aimZ, { source: caster.id });
        w.schedule(a.delay, (world) => {
          const src = world.get(caster.id);
          if (!src || src.dead) return;
          resolveAreaDamage({ ...frozen, w: world }, { ...a, delay: undefined });
        });
        break;
      }
      resolveAreaDamage(ctx, a);
      break;
    }

    case 'projectile': {
      const def = PROJECTILES[a.proj];
      if (!def) throw new Error(`unknown projectile '${a.proj}'`);
      let [dx, dz] = norm(ctx.aimX - ctx.ox, ctx.aimZ - ctx.oz);
      if (a.angleOffsetDeg) {
        // Fan spreads use data-constant angles — cached like cone cosines.
        const cos = cosHalf(a.angleOffsetDeg * 2);
        const sin = sinOf(a.angleOffsetDeg);
        [dx, dz] = [dx * cos - dz * sin, dx * sin + dz * cos];
      }
      const damage = def.damage
        ? resolveScaling(def.damage.amount, c.level, stats.ad, stats.ap)
        : 0;
      w.add({
        kind: 'projectile',
        team: caster.team,
        x: ctx.ox + dx * (caster.radius + 0.2),
        z: ctx.oz + dz * (caster.radius + 0.2),
        fx: dx,
        fz: dz,
        radius: def.radius,
        hp: 1,
        hpMax: 1,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        proj: {
          def,
          style: 'def',
          owner: caster.id,
          ownerPlayer: c.player,
          dirX: dx,
          dirZ: dz,
          speed: def.speed,
          traveled: 0,
          maxRange: def.maxRange,
          pulsesFired: 0,
          hitIds: new Set(),
          damage,
          dtype: def.damage?.type ?? 'physical',
          color: def.visual.color,
          size: def.visual.size,
        },
      });
      break;
    }

    case 'buff': {
      const def = BUFFS[a.buff];
      if (!def) throw new Error(`unknown buff '${a.buff}'`);
      if (a.who === 'self') {
        applyBuff(caster, def);
      } else {
        const team = a.who === 'alliesInShape' ? 'allies' : 'enemies';
        const shape = a.shape ?? { kind: 'circle', radius: 3 };
        for (const t of shapeTargets(ctx, a.at ?? 'self', shape, team)) applyBuff(t, def);
      }
      break;
    }

    case 'leap': {
      // Clamped to ability range at cast validation.
      c.leap = {
        tLeft: a.duration,
        tTotal: a.duration,
        fromX: caster.x,
        fromZ: caster.z,
        toX: ctx.aimX,
        toZ: ctx.aimZ,
        onLand: a.onLand,
        ability: ctx.ability,
      };
      break;
    }

    case 'wall': {
      const [fx, fz] = norm(ctx.aimX - caster.x, ctx.aimZ - caster.z);
      const cells = w.nav.stampWall(ctx.aimX, ctx.aimZ, fx, fz, a.length, a.thickness);
      w.add({
        kind: 'wall',
        team: caster.team,
        x: ctx.aimX,
        z: ctx.aimZ,
        fx,
        fz,
        radius: a.length / 2,
        hp: 1,
        hpMax: 1,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        wall: {
          tLeft: a.duration,
          duration: a.duration,
          length: a.length,
          cells,
          allyBuff: a.allyBuff,
          owner: caster.id,
        },
      });
      break;
    }

    case 'summon': {
      const unit = UNITS[a.unit];
      if (!unit) throw new Error(`unknown unit '${a.unit}'`);
      const ent = w.add({
        kind: 'keg',
        team: caster.team,
        x: ctx.aimX,
        z: ctx.aimZ,
        fx: 1,
        fz: 0,
        radius: unit.radius,
        hp: unit.hp,
        hpMax: unit.hp,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        keg: {
          def: unit,
          owner: caster.id,
          ownerPlayer: c.player,
          fuseLeft: unit.explode?.delay ?? 0,
          tossPhase: a.arcToss ? 0.001 : 1,
          ad: stats.ad,
          level: c.level,
        },
      });
      w.fx('keg.spawn', ent.x, ent.z, { source: caster.id, target: ent.id });
      break;
    }

    case 'volley': {
      const [dx, dz] = norm(ctx.aimX - ctx.ox, ctx.aimZ - ctx.oz);
      const ox = ctx.ox;
      const oz = ctx.oz;
      const amount = resolveScaling(a.amount, c.level, stats.ad, stats.ap);
      const hits = new Map<number, number>();
      const step = a.length / a.count;
      for (let i = 0; i < a.count; i++) {
        const px = ox + dx * step * (i + 0.5);
        const pz = oz + dz * step * (i + 0.5);
        const delay = (a.startDelay ?? 0) + a.interval * i;
        const casterId = caster.id;
        w.schedule(delay, (world) => {
          world.fx(`${c.def.id}.r.volley`, px, pz, { source: casterId });
          for (const u of world.units()) {
            if (u.team === caster.team || u.kind === 'keg') continue;
            if (dist(px, pz, u.x, u.z) > a.pulseRadius + u.radius) continue;
            const n = hits.get(u.id) ?? 0;
            if (n >= a.maxHitsPerTarget) continue;
            hits.set(u.id, n + 1);
            const src = world.get(casterId);
            if (src) dealDamage(world, { source: src }, u, amount, a.type);
          }
        });
      }
      break;
    }

    case 'heal': {
      const amount = resolveScaling(a.amount, c.level, stats.ad, stats.ap);
      healEntity(caster, caster, amount);
      break;
    }

    case 'channel': {
      // Caster-centred ticks that follow the caster; movement dampened, not locked.
      applyBuff(caster, {
        id: `${ctx.ability.id}_channel`,
        name: ctx.ability.name,
        duration: a.duration,
        mul: { moveSpeed: a.moveSpeedMul },
      });
      const amount = resolveScaling(a.amount, c.level, stats.ad, stats.ap);
      const ticks = Math.floor(a.duration / a.tickEvery);
      const casterId = caster.id;
      for (let i = 1; i <= ticks; i++) {
        w.schedule(a.tickEvery * i, (world) => {
          const src = world.get(casterId);
          if (!src || src.dead) return;
          if (a.tickFx) world.fx(a.tickFx, src.x, src.z, { source: casterId });
          for (const u of [...world.enemiesOf(src.team)]) {
            if (u.kind === 'keg') continue;
            if (dist(src.x, src.z, u.x, u.z) <= a.radius + u.radius) {
              dealDamage(world, { source: src }, u, amount, a.type);
              if (a.ccPerTick) applyCc(u, a.ccPerTick);
            }
          }
        });
      }
      break;
    }

    case 'dash': {
      // Clamp the dash to open ground, sweep the corridor, pull tip victims back.
      const [dx, dz] = norm(ctx.aimX - caster.x, ctx.aimZ - caster.z);
      let end = a.distance;
      for (let d = a.distance; d > 0.2; d -= 0.2) {
        if (!w.nav.isBlockedAt(caster.x + dx * d, caster.z + dz * d)) {
          end = d;
          break;
        }
      }
      const fromX = caster.x;
      const fromZ = caster.z;
      c.leap = {
        tLeft: a.duration,
        tTotal: a.duration,
        fromX,
        fromZ,
        toX: fromX + dx * end,
        toZ: fromZ + dz * end,
        onLand: [],
        ability: ctx.ability,
      };
      grantDashCharges(w, caster);
      if (a.amount && a.type) {
        const amount = resolveScaling(a.amount, c.level, stats.ad, stats.ap);
        for (const u of [...w.enemiesOf(caster.team)]) {
          if (u.kind === 'keg') continue;
          if (!inRect(fromX, fromZ, dx, dz, end + 0.4, a.width, u.x, u.z, u.radius)) continue;
          dealDamage(w, { source: caster }, u, amount, a.type);
          if (a.tipPull && u.kind === 'champion') {
            const along = (u.x - fromX) * dx + (u.z - fromZ) * dz;
            if (along >= end - a.tipPull.zone) {
              const [px, pz] = norm(fromX - u.x, fromZ - u.z);
              displace(w, u, px, pz, a.tipPull.pull);
            }
          }
        }
      }
      break;
    }

    case 'placeMarker': {
      const unit = UNITS[a.unit];
      if (!unit) throw new Error(`unknown unit '${a.unit}'`);
      const ent = w.add({
        kind: 'keg',
        team: caster.team,
        x: caster.x,
        z: caster.z,
        fx: caster.fx,
        fz: caster.fz,
        radius: unit.radius,
        hp: unit.hp,
        hpMax: unit.hp,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        keg: {
          def: unit,
          owner: caster.id,
          ownerPlayer: c.player,
          fuseLeft: a.duration,
          tossPhase: 1,
          ad: stats.ad,
          level: c.level,
        },
      });
      c.passive[a.marker] = ent.id;
      w.fx('rattle.skull.place', ent.x, ent.z, { source: caster.id, target: ent.id });
      break;
    }

    case 'blinkToMarker': {
      const id = c.passive[a.marker];
      const marker = id !== undefined ? w.get(id) : undefined;
      if (!marker || marker.dead || marker.kind !== 'keg') break;
      w.fx('rattle.skull.return.out', caster.x, caster.z, { source: caster.id });
      const [tx, tz] = w.nav.nearestOpen(marker.x, marker.z);
      caster.x = tx;
      caster.z = tz;
      c.path = [];
      grantDashCharges(w, caster);
      w.remove(marker.id);
      c.passive[a.marker] = -1;
      w.fx('rattle.skull.return.in', caster.x, caster.z, { source: caster.id });
      break;
    }

    case 'blinkStrike': {
      // Nearest enemy unit around the aim point; champions take priority.
      let target: Entity | undefined;
      let bestD = Number.POSITIVE_INFINITY;
      let champFound = false;
      for (const u of w.enemiesOf(caster.team)) {
        if (u.kind === 'keg') continue;
        const d = dist(ctx.aimX, ctx.aimZ, u.x, u.z);
        if (d > 1.6 + u.radius) continue;
        const isChamp = u.kind === 'champion';
        if ((isChamp && !champFound) || (isChamp === champFound && d < bestD)) {
          bestD = d;
          target = u;
          champFound = isChamp;
        }
      }
      if (!target) break;
      w.fx('rattle.r.vanish', caster.x, caster.z, { source: caster.id });
      const [ax, az] = norm(target.x - caster.x, target.z - caster.z);
      const [tx, tz] = w.nav.nearestOpen(
        target.x + ax * (a.behind + target.radius),
        target.z + az * (a.behind + target.radius),
      );
      caster.x = tx;
      caster.z = tz;
      caster.fx = -ax;
      caster.fz = -az;
      c.path = [];
      grantDashCharges(w, caster);
      const amount = resolveScaling(a.amount, c.level, stats.ad, stats.ap);
      dealDamage(w, { source: caster }, target, amount, a.type);
      if (a.harvest && !target.dead) {
        c.passive.harvestId = target.id;
        c.passive.harvestUntil = w.time + a.harvest.window;
        c.passive.harvestRefund = a.harvest.refund;
        c.passive.harvestMs = a.harvest.msBonus;
        c.passive.harvestMsDur = a.harvest.msDuration;
      }
      w.fx('rattle.r.strike', target.x, target.z, { source: caster.id, target: target.id });
      break;
    }

    case 'shieldSelf': {
      const amount = resolveScaling(a.amount, c.level, stats.ad, stats.ap);
      applyBuff(caster, {
        id: a.buffId,
        name: ctx.ability.name,
        duration: a.duration,
        shield: amount,
      });
      break;
    }

    case 'bloom': {
      const px = a.at === 'aim' ? ctx.aimX : ctx.ox;
      const pz = a.at === 'aim' ? ctx.aimZ : ctx.oz;
      bloomFlowersIn(w, caster, px, pz, ctx.fx, ctx.fz, a.shape);
      break;
    }

    case 'zone': {
      w.add({
        kind: 'zone',
        team: caster.team,
        x: ctx.aimX,
        z: ctx.aimZ,
        fx: 1,
        fz: 0,
        radius: a.radius,
        hp: 1,
        hpMax: 1,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        zone: {
          owner: caster.id,
          tLeft: a.duration,
          duration: a.duration,
          radius: a.radius,
          healPerSec: resolveScaling(a.healPerSec, c.level, stats.ad, stats.ap),
          enemyDamageAmp: a.enemyDamageAmp,
          cleanseSlows: a.cleanseSlows,
          cleansed: new Set(),
        },
      });
      break;
    }

    case 'vineGrasp': {
      const bloomed = bloomFlowersIn(w, caster, ctx.ox, ctx.oz, ctx.fx, ctx.fz, a.shape);
      const rootDur = a.baseRoot + Math.min(a.rootMax, a.rootPerFlower * bloomed);
      const amount = resolveScaling(a.amount, c.level, stats.ad, stats.ap);
      for (const target of shapeTargets(ctx, 'self', a.shape, 'enemies')) {
        dealDamage(w, { source: caster }, target, amount, a.type);
        applyCc(target, { kind: 'root', duration: rootDur });
      }
      break;
    }
  }
}

/** Resolve an areaDamage action right now (shared by the immediate + delayed paths). */
function resolveAreaDamage(ctx: ActionCtx, a: Extract<Action, { t: 'areaDamage' }>): void {
  const { w, caster } = ctx;
  const c = caster.champ;
  if (!c) return;
  const stats = championStats(caster);
  const amount = resolveScaling(a.amount, c.level, stats.ad, stats.ap);
  for (const target of shapeTargets(ctx, a.at, a.shape, 'enemies')) {
    dealDamage(w, { source: caster }, target, amount, a.type);
    const cc = target.kind === 'mini' && a.ccMinis ? a.ccMinis : a.cc;
    if (cc) {
      if (cc.kind === 'knockback') {
        const [dx, dz] = norm(target.x - ctx.ox, target.z - ctx.oz);
        displace(w, target, dx, dz, cc.strength ?? 1);
      } else {
        let duration = cc.duration;
        if (a.ccBonusBuff && target.buffs.some((b) => b.id === a.ccBonusBuff?.buff)) {
          duration += a.ccBonusBuff.extra;
        }
        applyCc(target, { ...cc, duration });
      }
    }
  }
}

/** Loose Bones: dashes and blinks charge Rattle's next attack. */
function grantDashCharges(w: World, caster: Entity): void {
  const c = caster.champ;
  if (!c || c.def.passive.id !== 'loose_bones') return;
  const p = c.def.passive.params;
  for (let i = 0; i < p.shardsPerDash; i++) {
    applyBuff(caster, {
      id: 'rattle_bones',
      name: 'Loose Bones',
      duration: p.duration,
      maxStacks: p.maxStacks,
    });
  }
  w.fx('rattle.passive.shards', caster.x, caster.z, { source: caster.id });
}

/**
 * Bloom the caster's flowers inside a shape: each heals nearby allies off the
 * owner's AP (Sylva's garden). Returns how many bloomed.
 */
export function bloomFlowersIn(
  w: World,
  caster: Entity,
  px: number,
  pz: number,
  fx: number,
  fz: number,
  shape: AreaShape,
): number {
  const c = caster.champ;
  if (!c || c.def.passive.id !== 'pollen_trail') return 0;
  const p = c.def.passive.params;
  const stats = championStats(caster);
  const heal = p.healBase + p.healApRatio * stats.ap;
  let count = 0;
  for (const e of [...w.entities]) {
    if (e.kind !== 'flower' || e.dead || e.flower?.owner !== caster.id) continue;
    let hit = false;
    if (shape.kind === 'circle') hit = dist(px, pz, e.x, e.z) <= shape.radius;
    else if (shape.kind === 'cone')
      hit = inCone(px, pz, fx, fz, cosHalf(shape.angleDeg), shape.radius, e.x, e.z, 0.3);
    else hit = inRect(px, pz, fx, fz, shape.length, shape.width, e.x, e.z, 0.3);
    if (!hit) continue;
    count++;
    for (const ally of w.champions()) {
      if (ally.team !== caster.team) continue;
      if (dist(e.x, e.z, ally.x, ally.z) <= p.healRadius) healEntity(caster, ally, heal);
    }
    w.fx('sylva.flower.bloom', e.x, e.z, { source: caster.id });
    w.remove(e.id);
  }
  return count;
}

/** Plant a pollen flower for `owner`, retiring the oldest past the cap. */
export function plantFlower(
  w: World,
  owner: Entity,
  x: number,
  z: number,
  max: number,
  life: number,
): void {
  const mine = w.entities.filter((e) => e.kind === 'flower' && e.flower?.owner === owner.id);
  if (mine.length >= max) {
    const oldest = mine.reduce((a, b) => (a.id < b.id ? a : b));
    w.remove(oldest.id);
  }
  const ent = w.add({
    kind: 'flower',
    team: owner.team,
    x,
    z,
    fx: 1,
    fz: 0,
    radius: 0.3,
    hp: 1,
    hpMax: 1,
    dead: false,
    airborne: 0,
    airborneTotal: 0,
    buffs: [],
    flower: { owner: owner.id, tLeft: life },
  });
  w.fx('sylva.flower.plant', ent.x, ent.z, { source: owner.id });
}

/** All champion-sourced healing funnels here (Lifebloom Idol hooks). */
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
