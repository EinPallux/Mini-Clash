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
import { championStats, resolveScaling } from './stats';
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

function shapeTargets(ctx: ActionCtx, at: 'aim' | 'self', shape: AreaShape, team: 'enemies' | 'allies'): Entity[] {
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
      hit = inCone(px, pz, ctx.fx, ctx.fz, cosHalf(shape.angleDeg), shape.radius, u.x, u.z, u.radius);
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
      const amount = resolveScaling(a.amount, c.level, stats.ad, stats.ap);
      for (const target of shapeTargets(ctx, a.at, a.shape, 'enemies')) {
        dealDamage(w, { source: caster }, target, amount, a.type);
        if (a.cc) {
          if (a.cc.kind === 'knockback') {
            const [dx, dz] = norm(target.x - ctx.ox, target.z - ctx.oz);
            displace(w, target, dx, dz, a.cc.strength ?? 1);
          } else {
            applyCc(target, a.cc);
          }
        }
      }
      break;
    }

    case 'projectile': {
      const def = PROJECTILES[a.proj];
      if (!def) throw new Error(`unknown projectile '${a.proj}'`);
      const [dx, dz] = norm(ctx.aimX - ctx.ox, ctx.aimZ - ctx.oz);
      const damage = def.damage ? resolveScaling(def.damage.amount, c.level, stats.ad, stats.ap) : 0;
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
        wall: { tLeft: a.duration, duration: a.duration, length: a.length, cells, allyBuff: a.allyBuff, owner: caster.id },
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
      caster.hp = Math.min(caster.hpMax, caster.hp + amount);
      break;
    }
  }
}
