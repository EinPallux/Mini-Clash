import {
  type AbilityDef,
  type Action,
  type AreaShape,
  BUFFS,
  PROJECTILES,
  type ScalingValue,
  UNITS,
} from '@mini-clash/data';
import { augFlag, augParam, special } from './augments';
import { applyBuff, applyBuffById, applyCc, shieldTotal } from './buffs';
import { dealDamage, displace } from './combat';
import { healEntity } from './heal';
import { spawnMini } from './minis';
import { launchPetDash } from './pets';
import { resolveScaling as baseScaling, championStats } from './stats';
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
  /** Potency multiplier for this cast (Overcharge, echo/split re-casts). 1 = normal. */
  power?: number;
}

export function executeActions(ctx: ActionCtx, actions: readonly Action[]): void {
  for (const a of actions) executeAction(ctx, a);
}

/**
 * Every number an action produces, scaled for this cast. `ctx.power` folds in
 * Overcharge and the reduced-power re-casts from Splitter / Mirror Strike /
 * Echo Cast, so no individual action has to know those cards exist.
 */
function amt(ctx: ActionCtx, v: ScalingValue): number {
  const c = ctx.caster.champ;
  if (!c) return 0;
  const s = championStats(ctx.caster);
  return baseScaling(v, c.level, s.ad, s.ap) * (ctx.power ?? 1);
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
      // Double Shift widens War Bellow; every other cone reads its data angle.
      hit = inCone(
        px,
        pz,
        ctx.fx,
        ctx.fz,
        cosHalf(Math.min(340, augParam(caster, 'grukk.bellowConeMul', shape.angleDeg))),
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
      const damage = def.damage ? amt(ctx, def.damage.amount) : 0;
      // Knife Juggler: every dagger is thrown twice — out, then back through
      // whatever it missed on the way. The return leg is a mirrored shot.
      const juggler = special(caster, 'knife_juggler');
      if (juggler && ctx.ability.slot === 'q') {
        const casterId = caster.id;
        const outX = ctx.ox + dx * def.maxRange;
        const outZ = ctx.oz + dz * def.maxRange;
        w.schedule(def.maxRange / Math.max(1, def.speed), (world) => {
          const src = world.get(casterId);
          if (!src || src.dead) return;
          const [bx, bz] = norm(src.x - outX, src.z - outZ);
          world.add({
            kind: 'projectile',
            srcLabel: ctx.ability.slot,
            team: src.team,
            x: outX,
            z: outZ,
            fx: bx,
            fz: bz,
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
              owner: src.id,
              ownerPlayer: c.player,
              dirX: bx,
              dirZ: bz,
              speed: def.speed,
              traveled: 0,
              maxRange: def.maxRange,
              pulsesFired: 0,
              hitIds: new Set(),
              damage: damage * (juggler.power ?? 0.4),
              dtype: def.damage?.type ?? 'physical',
              color: def.visual.color,
              size: def.visual.size * 0.85,
            },
          });
        });
      }
      w.add({
        kind: 'projectile',
        srcLabel: ctx.ability.slot,
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
      // Ramparts of the Old Bridge stretches the span and makes it eat shots.
      const length = augParam(caster, 'rook.wallLength', a.length);
      const cells = w.nav.stampWall(ctx.aimX, ctx.aimZ, fx, fz, length, a.thickness);
      w.add({
        kind: 'wall',
        team: caster.team,
        x: ctx.aimX,
        z: ctx.aimZ,
        fx,
        fz,
        radius: length / 2,
        hp: 1,
        hpMax: 1,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        wall: {
          tLeft: a.duration,
          duration: a.duration,
          length,
          cells,
          allyBuff: a.allyBuff,
          owner: caster.id,
          blocksProjectiles: augFlag(caster, 'rook.wallBlocksProjectiles'),
        },
      });
      break;
    }

    case 'summon': {
      const unit = UNITS[a.unit];
      if (!unit) throw new Error(`unknown unit '${a.unit}'`);
      const ent = w.add({
        kind: 'keg',
        srcLabel: ctx.ability.slot,
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
      const amount = amt(ctx, a.amount);
      const step = a.length / a.count;
      // Fleet Admiral: a second ship comes up the opposite flank, offset across
      // the firing line so the two broadsides bracket whatever is between them.
      const fleet = special(caster, 'fleet_admiral');
      const lanes: { ox: number; oz: number; power: number }[] = [
        { ox: ctx.ox, oz: ctx.oz, power: 1 },
      ];
      if (fleet) {
        const across = 3.2;
        lanes[0] = { ox: ctx.ox - -dz * across * 0.5, oz: ctx.oz - dx * across * 0.5, power: 1 };
        lanes.push({
          ox: ctx.ox + -dz * across * 0.5,
          oz: ctx.oz + dx * across * 0.5,
          power: fleet.power ?? 1,
        });
      }
      for (const lane of lanes) {
        const hits = new Map<number, number>();
        for (let i = 0; i < a.count; i++) {
          const px = lane.ox + dx * step * (i + 0.5);
          const pz = lane.oz + dz * step * (i + 0.5);
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
              if (src) {
                dealDamage(
                  world,
                  { source: src, label: ctx.ability.slot },
                  u,
                  amount * lane.power,
                  a.type,
                );
              }
            }
          });
        }
      }
      break;
    }

    case 'heal': {
      const amount = amt(ctx, a.amount);
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
      const amount = amt(ctx, a.amount);
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
              dealDamage(world, { source: src, label: ctx.ability.slot }, u, amount, a.type);
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
      // Blood Waltz: the bats leave a slick of blood along the whole dash.
      const waltz = special(caster, 'blood_waltz');
      if (waltz) {
        const steps = Math.max(2, Math.round(end / 1.2));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          w.add({
            kind: 'zone',
            srcLabel: ctx.ability.slot,
            team: caster.team,
            x: fromX + dx * end * t,
            z: fromZ + dz * end * t,
            fx: dx,
            fz: dz,
            radius: waltz.radius ?? 1.4,
            hp: 1,
            hpMax: 1,
            dead: false,
            airborne: 0,
            airborneTotal: 0,
            buffs: [],
            zone: {
              owner: caster.id,
              variant: 'trail',
              tLeft: waltz.seconds ?? 3,
              duration: waltz.seconds ?? 3,
              radius: waltz.radius ?? 1.4,
              allyMs: waltz.allyMs ?? 0.15,
              enemySlow: waltz.enemySlow ?? 0.15,
            },
          });
        }
        w.fx('augment.waltz', fromX, fromZ, { fx: dx, fz: dz, source: caster.id });
      }
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
      // Vex dissolves into bats: nothing can pick him as a target mid-waltz.
      if (a.untargetable) {
        applyBuff(caster, {
          id: 'wisp_untargetable',
          name: 'Untargetable',
          duration: a.duration,
        });
      }
      if (a.healOnLand) {
        const missing = Math.max(0, caster.hpMax - caster.hp);
        const amt =
          a.healOnLand.base +
          (a.healOnLand.perLevel ?? 0) * (c.level - 1) +
          (a.healOnLand.missingHpFrac ?? 0) * missing;
        const casterId = caster.id;
        w.schedule(a.duration, (world) => {
          const src = world.get(casterId);
          if (src && !src.dead) healEntity(src, src, amt);
        });
      }
      grantDashCharges(w, caster);
      if (a.amount && a.type) {
        const amount = amt(ctx, a.amount);
        for (const u of [...w.enemiesOf(caster.team)]) {
          if (u.kind === 'keg') continue;
          if (!inRect(fromX, fromZ, dx, dz, end + 0.4, a.width, u.x, u.z, u.radius)) continue;
          dealDamage(w, { source: caster, label: ctx.ability.slot }, u, amount, a.type);
          if (a.tipPull && u.kind === 'champion') {
            const along = (u.x - fromX) * dx + (u.z - fromZ) * dz;
            if (along >= end - a.tipPull.zone) {
              const [px, pz] = norm(fromX - u.x, fromZ - u.z);
              displace(w, u, px, pz, a.tipPull.pull);
            }
          }
          // Exact Change: Skewer pays Grukk back for every champion it catches.
          if (u.kind === 'champion') {
            const refund = augParam(caster, 'grukk.skewerRefund', 0);
            if (refund > 0) c.energy = Math.min(100, c.energy + refund);
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
        srcLabel: ctx.ability.slot,
        team: caster.team,
        x: caster.x,
        z: caster.z,
        fx: caster.fx,
        fz: caster.fz,
        radius: unit.radius,
        // Skeleton Key reinforces the skull so it survives being noticed.
        hp: augParam(caster, 'rattle.skullHp', unit.hp),
        hpMax: augParam(caster, 'rattle.skullHp', unit.hp),
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
          tauntRadius: augParam(caster, 'rattle.skullTaunt', 0) || undefined,
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
      const amount = amt(ctx, a.amount);
      dealDamage(w, { source: caster, label: ctx.ability.slot }, target, amount, a.type);
      // Repo Man: anything left under the threshold is repossessed on the spot.
      const repo = special(caster, 'repo_man');
      if (
        repo &&
        !target.dead &&
        target.hp / Math.max(1, target.hpMax) <= (repo.threshold ?? 0.12)
      ) {
        w.fx('augment.execute', target.x, target.z, { source: caster.id, target: target.id });
        dealDamage(
          w,
          { source: caster, tag: 'item', label: 'augment' },
          target,
          target.hp + 1,
          a.type,
        );
      }
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
      // Double Shift: the shield doubles once Grukk is genuinely in trouble.
      const lowMul =
        caster.hp / Math.max(1, caster.hpMax) < 0.4
          ? augParam(caster, 'grukk.bellowLowHpShieldMul', 1)
          : 1;
      const amount = amt(ctx, a.amount) * lowMul;
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
          variant: 'garden',
          // Heartwood: the ward walks with Sylva and carries allies along.
          follows: special(caster, 'heartwood') ? true : undefined,
          allyMs: special(caster, 'heartwood')?.ms,
          tLeft: a.duration,
          duration: a.duration,
          radius: a.radius,
          healPerSec: amt(ctx, a.healPerSec),
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
      const amount = amt(ctx, a.amount);
      for (const target of shapeTargets(ctx, 'self', a.shape, 'enemies')) {
        dealDamage(w, { source: caster, label: ctx.ability.slot }, target, amount, a.type);
        applyCc(target, { kind: 'root', duration: rootDur });
      }
      break;
    }

    case 'beam': {
      // Instant hitscan corridor from the caster along facing (Boltz Q).
      const amount = amt(ctx, a.amount);
      let refunded = false;
      for (const target of shapeTargets(
        { ...ctx, ox: caster.x, oz: caster.z },
        'self',
        { kind: 'rect', length: a.length, width: a.width },
        'enemies',
      )) {
        let dmg = amount;
        if (a.vsShieldMul && shieldTotal(target) > 0) dmg *= a.vsShieldMul;
        dealDamage(w, { source: caster, label: ctx.ability.slot }, target, dmg, a.type);
        if (target.kind === 'champion') {
          if (a.energyRefundOnChamp && !refunded && !target.dead) {
            refunded = true;
            c.energy = Math.min(100, c.energy + a.energyRefundOnChamp);
          }
          // Vex's lash primes a lunging follow-up basic.
          if (a.onChampBuffSelf) applyBuffById(caster, a.onChampBuffSelf);
          // Debt Interest: tally marks climb the victim until the debt is called.
          const debt = special(caster, 'debt_interest');
          if (debt && !target.dead) {
            applyBuff(target, {
              id: 'vex_debt',
              name: 'Crimson Tally',
              duration: debt.window ?? 6,
              maxStacks: debt.stacks ?? 3,
            });
            const mark = target.buffs.find((b) => b.id === 'vex_debt');
            if (mark && mark.stacks >= (debt.stacks ?? 3)) {
              target.buffs.splice(target.buffs.indexOf(mark), 1);
              applyCc(target, { kind: 'stun', duration: debt.stun ?? 0.8 });
              w.fx('augment.debt', target.x, target.z, {
                source: caster.id,
                target: target.id,
              });
            }
          }
        }
      }
      // Overvolt: the beam arcs on to one more body outside the corridor.
      const volt = special(caster, 'overvolt');
      if (volt) {
        const struck = new Set(
          shapeTargets(
            { ...ctx, ox: caster.x, oz: caster.z },
            'self',
            { kind: 'rect', length: a.length, width: a.width },
            'enemies',
          ).map((u) => u.id),
        );
        let best: Entity | undefined;
        let bestD = volt.radius ?? 4.5;
        for (const u of w.enemiesOf(caster.team)) {
          if (u.kind === 'keg' || u.dead || struck.has(u.id)) continue;
          const d = dist(caster.x, caster.z, u.x, u.z);
          if (d < bestD) {
            bestD = d;
            best = u;
          }
        }
        if (best) {
          dealDamage(
            w,
            { source: caster, tag: 'item', label: 'augment' },
            best,
            amount * (volt.power ?? 0.6),
            a.type,
          );
          w.fx('augment.chain', best.x, best.z, { source: caster.id, target: best.id });
        }
      }
      if (a.fx) w.fx(a.fx, caster.x, caster.z, { fx: ctx.fx, fz: ctx.fz, source: caster.id });
      break;
    }

    case 'field': {
      const spawnField = (world: World, fx: number, fz: number): void => {
        const src = world.get(caster.id);
        // Impact burst (pod slam) resolves at the landing point.
        if (a.impact) {
          const impact = amt(ctx, a.impact.amount);
          for (const u of [...world.enemiesOf(caster.team)]) {
            if (u.kind === 'keg') continue;
            if (dist(ctx.aimX, ctx.aimZ, u.x, u.z) <= a.impact.radius + u.radius) {
              dealDamage(
                world,
                { source: src ?? caster, label: ctx.ability.slot },
                u,
                impact,
                a.impact.type,
              );
              if (a.impact.cc) {
                if (a.impact.cc.kind === 'knockback') {
                  const [dx, dz] = norm(u.x - ctx.aimX, u.z - ctx.aimZ);
                  displace(world, u, dx, dz, a.impact.cc.strength ?? 1);
                } else {
                  applyCc(u, a.impact.cc);
                }
              }
            }
          }
          if (a.impact.fx) world.fx(a.impact.fx, ctx.aimX, ctx.aimZ, { source: caster.id });
        }
        // Habitat Module inflates the shell and turns it into a field hospital.
        const radius = augParam(caster, 'boltz.domeRadius', a.radius);
        const regenPct = augParam(caster, 'boltz.domeRegenPct', 0);
        const navCells = a.blocksMovement
          ? world.nav.stampDisc(ctx.aimX, ctx.aimZ, radius)
          : undefined;
        world.add({
          kind: 'zone',
          srcLabel: ctx.ability.slot,
          team: caster.team,
          x: ctx.aimX,
          z: ctx.aimZ,
          fx,
          fz,
          radius,
          hp: 1,
          hpMax: 1,
          dead: false,
          airborne: 0,
          airborneTotal: 0,
          buffs: [],
          zone: {
            owner: caster.id,
            variant: a.variant,
            tLeft: a.duration,
            duration: a.duration,
            radius,
            blocksProjectiles: a.blocksProjectiles,
            allyBuff: a.allyBuff,
            navCells,
            regenPct: regenPct > 0 ? regenPct : undefined,
            expireFx: a.variant === 'pod' ? 'boltz.pod.launch' : undefined,
          },
        });
      };
      // Kessler Protocol: the strike walks down the line as three impacts.
      const kessler = special(caster, 'kessler');
      if (kessler) {
        const extra = kessler.extra ?? 2;
        const spacing = kessler.spacing ?? 2.6;
        const power = kessler.power ?? 0.6;
        for (let i = 1; i <= extra; i++) {
          const kx = ctx.aimX + ctx.fx * spacing * i;
          const kz = ctx.aimZ + ctx.fz * spacing * i;
          const casterId = caster.id;
          if (a.telegraphFx) w.fx(a.telegraphFx, kx, kz, { source: casterId });
          w.schedule((a.delay ?? 0) + 0.2 * i, (world) => {
            const src = world.get(casterId);
            if (!src || src.dead || !a.impact) return;
            const boom = amt({ ...ctx, w: world, caster: src }, a.impact.amount) * power;
            for (const u of [...world.enemiesOf(src.team)]) {
              if (u.kind === 'keg' || u.dead) continue;
              if (dist(kx, kz, u.x, u.z) > a.impact.radius + u.radius) continue;
              dealDamage(
                world,
                { source: src, tag: 'item', label: 'augment' },
                u,
                boom,
                a.impact.type,
              );
              if (a.impact.cc && a.impact.cc.kind !== 'knockback') applyCc(u, a.impact.cc);
            }
            if (a.impact.fx) world.fx(a.impact.fx, kx, kz, { source: casterId });
          });
        }
      }
      if (a.delay) {
        if (a.telegraphFx) w.fx(a.telegraphFx, ctx.aimX, ctx.aimZ, { source: caster.id });
        w.schedule(a.delay, (world) => {
          const src = world.get(caster.id);
          if (!src || src.dead) return;
          spawnField(world, ctx.fx, ctx.fz);
        });
      } else {
        spawnField(w, ctx.fx, ctx.fz);
      }
      break;
    }

    case 'curse': {
      // Separation Anxiety banks seconds on Boo! hits; the curse spends them.
      const curseBonus = c.augState.cursePlus ?? 0;
      c.augState.cursePlus = 0;
      // Midnight Society: the hour raises an escort out of the cursed ground.
      const society = special(caster, 'midnight_society');
      if (society) {
        const n = society.count ?? 3;
        for (let i = 0; i < n; i++) {
          const ang = (Math.PI * 2 * i) / n;
          spawnMini(
            w,
            'mini_bruiser',
            caster.team,
            ctx.aimX + Math.cos(ang) * (a.radius * 0.6),
            ctx.aimZ + Math.sin(ang) * (a.radius * 0.6),
          );
        }
        w.fx('augment.society', ctx.aimX, ctx.aimZ, { source: caster.id });
      }
      w.add({
        kind: 'zone',
        srcLabel: ctx.ability.slot,
        team: caster.team,
        x: ctx.aimX,
        z: ctx.aimZ,
        fx: ctx.fx,
        fz: ctx.fz,
        radius: a.radius,
        hp: 1,
        hpMax: 1,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        zone: {
          owner: caster.id,
          variant: 'curse',
          tLeft: a.duration + curseBonus,
          duration: a.duration + curseBonus,
          radius: a.radius,
          // Restricted Section turns the maelstrom into a vortex with a finale.
          pullPerSec: special(caster, 'restricted_section')?.pullPerSec,
          expireSilence: special(caster, 'restricted_section')?.silence,
          enemyDmgPerSec: amt(ctx, a.dmgPerSec),
          enemyBuff: a.enemyBuff,
          disableMinis: a.disableMinis,
          expireFear: a.expireFear,
          tickFx: a.tickFx,
        },
      });
      break;
    }

    case 'petDash': {
      const [dx, dz] = norm(ctx.aimX - caster.x, ctx.aimZ - caster.z);
      launchPetDash(w, caster, dx, dz, {
        distance: a.distance,
        width: a.width,
        damage: amt(ctx, a.amount),
        dtype: a.type,
        stealMs: a.stealMs,
      });
      break;
    }

    case 'pickup': {
      const unit = UNITS[a.unit];
      if (!unit) throw new Error(`unknown unit '${a.unit}'`);
      const ent = w.add({
        kind: 'pickup',
        srcLabel: ctx.ability.slot,
        team: caster.team,
        x: ctx.aimX,
        z: ctx.aimZ,
        fx: 1,
        fz: 0,
        radius: unit.radius,
        hp: 1,
        hpMax: 1,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        pickup: {
          def: unit,
          owner: caster.id,
          ownerPlayer: c.player,
          tLeft: a.duration,
          heal: amt(ctx, a.heal),
          ownerFallbackFrac: a.ownerFallbackFrac ?? 0.5,
          empowersPet: a.empowersPet ?? false,
          tossPhase: 0.001,
        },
      });
      w.fx('piper.w.toss', ent.x, ent.z, { source: caster.id, target: ent.id });
      // Sharing Is Caring: the snack shatters into a little scatter of them.
      const share = special(caster, 'sharing_is_caring');
      if (share) {
        const extra = Math.max(0, (share.count ?? 3) - 1);
        for (let i = 0; i < extra; i++) {
          const ang = (Math.PI * 2 * (i + 1)) / (extra + 1);
          w.add({
            kind: 'pickup',
            srcLabel: ctx.ability.slot,
            team: caster.team,
            x: ctx.aimX + Math.cos(ang) * 0.9,
            z: ctx.aimZ + Math.sin(ang) * 0.9,
            fx: 1,
            fz: 0,
            radius: unit.radius * 0.8,
            hp: 1,
            hpMax: 1,
            dead: false,
            airborne: 0,
            airborneTotal: 0,
            buffs: [],
            pickup: {
              def: unit,
              owner: caster.id,
              ownerPlayer: c.player,
              tLeft: a.duration,
              heal: amt(ctx, a.heal) * (share.power ?? 0.55),
              ownerFallbackFrac: a.ownerFallbackFrac ?? 0.5,
              empowersPet: a.empowersPet ?? false,
              tossPhase: 0.001,
            },
          });
        }
        w.fx('augment.share', ctx.aimX, ctx.aimZ, { source: caster.id });
      }
      break;
    }

    case 'waves': {
      // A stampede: N pulses through the same shape. Anyone caught by every wave
      // eats the finisher — the reward for reading the whole cone, not one edge.
      const amount = amt(ctx, a.amount);
      const hits = new Map<number, number>();
      const casterId = caster.id;
      const frozen: ActionCtx = { ...ctx };
      for (let i = 0; i < a.count; i++) {
        const isLast = i === a.count - 1;
        w.schedule((a.startDelay ?? 0) + a.interval * i, (world) => {
          const src = world.get(casterId);
          if (!src || src.dead) return;
          const here: ActionCtx = { ...frozen, w: world, ox: src.x, oz: src.z };
          if (a.waveFx)
            world.fx(a.waveFx, src.x, src.z, { fx: frozen.fx, fz: frozen.fz, source: casterId });
          // Apex Herd: the final wave comes in heavier — everyone it touches
          // gets the knock-up, not just whoever ate all three.
          const apex = isLast ? special(src, 'apex_herd') : null;
          for (const target of shapeTargets(here, 'self', a.shape, 'enemies')) {
            dealDamage(world, { source: src, label: frozen.ability.slot }, target, amount, a.type);
            if (a.cc) applyCc(target, a.cc);
            if (apex) applyCc(target, { kind: 'slow', duration: 2, strength: apex.slow ?? 0.3 });
            const n = (hits.get(target.id) ?? 0) + 1;
            hits.set(target.id, n);
            const earned = apex ? n >= 1 : n >= a.count;
            if (isLast && a.ccOnAllWaves && earned && target.kind === 'champion') {
              applyCc(
                target,
                apex
                  ? { ...a.ccOnAllWaves, duration: apex.knockup ?? a.ccOnAllWaves.duration }
                  : a.ccOnAllWaves,
              );
            }
          }
        });
      }
      break;
    }

    case 'invite': {
      // Crimson Banquet: everyone in the circle becomes a guest. The amp and the
      // heal bonus live on the caster's passive scratch, keyed to the buff.
      const guests = shapeTargets(ctx, a.at, a.shape, 'enemies').filter(
        (u) => u.kind === 'champion',
      );
      // Eternal Host keeps the table set for longer.
      const stay = augParam(caster, 'vex.inviteDuration', BUFFS[a.buff]?.duration ?? 3);
      for (const g of guests) {
        applyBuff(g, { ...BUFFS[a.buff], duration: stay });
        w.fx('vex.r.invite', g.x, g.z, { source: caster.id, target: g.id });
      }
      c.passive.inviteAmp = a.damageAmp;
      c.passive.inviteHeal = a.healPct;
      if (a.resetSlotOnGuestDeath) {
        c.passive.guestResetSlot =
          a.resetSlotOnGuestDeath === 'q' ? 0 : a.resetSlotOnGuestDeath === 'w' ? 1 : 2;
      }
      break;
    }

    case 'blink': {
      // Drop the decoy at the pre-blink position, then teleport to the aim point.
      if (a.decoy) {
        const unit = UNITS[a.decoy];
        if (unit) {
          const ent = w.add({
            kind: 'keg',
            srcLabel: ctx.ability.slot,
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
              fuseLeft: a.decoyDuration ?? 3,
              tossPhase: 1,
              ad: stats.ad,
              level: c.level,
              decoy: { hitsLeft: 2 },
            },
          });
          w.fx('wisp.decoy.place', ent.x, ent.z, { source: caster.id, target: ent.id });
        }
      }
      const [tx, tz] = w.nav.nearestOpen(ctx.aimX, ctx.aimZ);
      caster.x = tx;
      caster.z = tz;
      c.path = [];
      c.order = null;
      if (a.selfBuff) applyBuffById(caster, a.selfBuff);
      break;
    }
  }
}

/** Resolve an areaDamage action right now (shared by the immediate + delayed paths). */
function resolveAreaDamage(ctx: ActionCtx, a: Extract<Action, { t: 'areaDamage' }>): void {
  const { w, caster } = ctx;
  const c = caster.champ;
  if (!c) return;
  const amount = amt(ctx, a.amount);
  // Seismic Overtime: Grukk's slams drag the field toward the crater.
  const seismic = ctx.ability.slot === 'r' ? special(caster, 'seismic_overtime') : null;
  for (const target of shapeTargets(ctx, a.at, a.shape, 'enemies')) {
    dealDamage(w, { source: caster, label: ctx.ability.slot }, target, amount, a.type);
    if (seismic && !target.dead) {
      const [px, pz] = norm(ctx.aimX - target.x, ctx.aimZ - target.z);
      displace(w, target, px, pz, seismic.pull ?? 2);
    }
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
    // Nettle Garden: the same bloom that heals allies stings anyone else near it.
    const nettle = special(caster, 'nettle_garden');
    if (nettle) {
      const sting = (nettle.base ?? 35) + (nettle.apRatio ?? 0.2) * stats.ap;
      for (const u of [...w.enemiesOf(caster.team)]) {
        if (u.kind === 'keg' || u.dead) continue;
        if (dist(e.x, e.z, u.x, u.z) <= (nettle.radius ?? 1.5) + u.radius) {
          dealDamage(w, { source: caster, tag: 'item', label: 'augment' }, u, sting, 'arcane');
        }
      }
      w.fx('augment.nettle', e.x, e.z, { source: caster.id });
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

export { healEntity } from './heal';
