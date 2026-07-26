import { type AbilityDef, BRIDGE, type Slot, TAG_SWAP } from '@mini-clash/data';
import { executeActions, plantFlower } from './actions';
import {
  augParam,
  basicRiders,
  type CastMod,
  castModFor,
  duoMods,
  economyMods,
  energyCostMul,
  special,
  ultPower,
} from './augments';
import { isHiddenFrom } from './brush';
import { applyBuff, applyBuffById, applyCc, isUntargetable } from './buffs';
import { dealDamage, displace, structureInvulnerable } from './combat';
import { petsOf, spawnPet } from './pets';
import { championStats, hastedCooldown, resolveScaling } from './stats';
import { dist, norm } from './vec';
import type { Entity, World } from './world';

const AA_ACQUIRE_BONUS = 2.5;

export type DenyReason = 'cooldown' | 'energy' | 'dead' | 'casting' | 'level';

/** Attackability: enemies always; kegs only via explicit clicks (handled at intent level). */
export function canAttack(w: World, attacker: Entity, target: Entity): boolean {
  if (target.dead) return false;
  if (target.kind === 'keg') return true;
  // The golem carries a `team` even while neutral (the field is not nullable),
  // so ownership decides, not the team tag — otherwise half the map could not
  // hit the objective it is supposed to be racing for.
  if (target.golem) return target.golem.owner !== attacker.team;
  if (target.team === attacker.team) return false;
  if (isUntargetable(target)) return false; // Wisp Cold Spot morph window
  if (target.kind === 'champion' || target.kind === 'dummy' || target.kind === 'mini') return true;
  if (target.kind === 'tower' || target.kind === 'core') return !structureInvulnerable(w, target);
  return false;
}

export function tryCast(
  w: World,
  e: Entity,
  slot: Slot,
  aimX: number,
  aimZ: number,
  noCooldowns: boolean,
  infiniteEnergy: boolean,
): DenyReason | null {
  const c = e.champ;
  if (!c) return null;
  if (e.dead) return 'dead';
  if (c.feared) return 'casting'; // fleeing: controls locked (Wisp R)
  if (c.duo && c.duo.morphT > 0) return 'casting'; // mid-swap: hands off the kit

  // Recast stage takes priority (free, instant). Multi-charge recasts chain (Grukk R).
  if (c.recast && c.recast.slot === slot) {
    const ability = c.recast.ability;
    const spec = ability.recast;
    // Point-style recasts clamp into the ability's range from the caster.
    let ax = aimX;
    let az = aimZ;
    const rd = dist(e.x, e.z, aimX, aimZ);
    if (ability.aim !== 'self' && rd > ability.range) {
      const [nx, nz] = norm(aimX - e.x, aimZ - e.z);
      ax = e.x + nx * ability.range;
      az = e.z + nz * ability.range;
    }
    const [fx, fz] = norm(ax - e.x, az - e.z);
    e.fx = fx;
    e.fz = fz;
    const isFinal = c.recast.left <= 1;
    const actions = isFinal ? (spec?.finalActions ?? spec?.actions ?? []) : (spec?.actions ?? []);
    executeActions(
      { w, caster: e, ability, ox: e.x, oz: e.z, aimX: ax, aimZ: az, fx, fz },
      actions,
    );
    w.fx(`${c.def.id}.${slot}.recast`, e.x, e.z, { fx, fz, ax, az, source: e.id });
    c.lastActionAt = w.time;
    c.recast.left--;
    if (c.recast.left <= 0) {
      c.cds[slot] = noCooldowns ? 0 : hastedCooldown(ability.cooldown, championStats(e).haste);
      c.recast = null;
    }
    return null;
  }

  if (c.cast && c.cast.kind !== 'aa') return 'casting';
  if (e.buffs.some((b) => b.id === 'cc_silence')) return 'casting';
  // Ultimates unlock at level 4 in real matches (GAME_DESIGN §10.3).
  if (slot === 'r' && w.match?.mode === 'bridge' && c.level < BRIDGE.rUnlockLevel) return 'level';
  if (c.cds[slot] > 0.001) return 'cooldown';
  const ability = c.def.abilities[slot];
  // Entrance flourishes can make the next Q free (Rattle, Vex).
  let cost = ability.cost * energyCostMul(e);
  const freeQ = slot === 'q' ? e.buffs.findIndex((b) => b.id === 'entrance_free_q') : -1;
  if (freeQ >= 0) cost = 0;
  // Tag Combo: the first ability after a swap is free, whichever slot it is.
  const combo = e.buffs.findIndex((b) => b.id === 'aug_tag_combo');
  if (combo >= 0) cost = 0;
  if (!infiniteEnergy && c.energy < cost) return 'energy';
  if (freeQ >= 0) e.buffs.splice(freeQ, 1);
  else if (combo >= 0) e.buffs.splice(combo, 1);

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

  if (!infiniteEnergy) c.energy = Math.max(0, c.energy - cost);
  c.dancing = false;

  if (ability.castTime > 0) {
    c.cast = {
      kind: slot,
      ability,
      tLeft: ability.castTime,
      tTotal: ability.castTime,
      aimX: ax,
      aimZ: az,
    };
    w.fx(`${c.def.id}.${slot}.windup`, e.x, e.z, { fx, fz, source: e.id });
  } else {
    commitAbility(w, e, ability, ax, az, noCooldowns);
  }
  return null;
}

export function commitAbility(
  w: World,
  e: Entity,
  ability: AbilityDef,
  aimX: number,
  aimZ: number,
  noCooldowns: boolean,
): void {
  const c = e.champ;
  if (!c) return;
  c.lastActionAt = w.time;
  // Any cast breaks Sheet Slip stealth (the W re-applies it inside its own actions).
  const iv = e.buffs.findIndex((b) => b.id === 'wisp_invis');
  if (iv >= 0) e.buffs.splice(iv, 1);
  const [fx, fz] = norm(aimX - e.x, aimZ - e.z);
  const power = c.augments.length > 0 ? ultPower(e, ability.slot) : 1;
  const mod = c.augments.length > 0 ? castModFor(e, ability.slot) : null;
  const fire = (ax: number, az: number, p: number): void => {
    const [dx, dz] = norm(ax - e.x, az - e.z);
    executeActions(
      { w, caster: e, ability, ox: e.x, oz: e.z, aimX: ax, aimZ: az, fx: dx, fz: dz, power: p },
      ability.actions,
    );
  };

  if (mod?.mode === 'split') {
    // Splitter: one cast becomes a V of two weaker ones, so the tell is the
    // shape of the shot rather than a number on a card.
    const reach = Math.max(0.5, dist(e.x, e.z, aimX, aimZ));
    for (const sign of [-1, 1]) {
      const a = (sign * mod.spreadDeg * Math.PI) / 180;
      fire(
        e.x + (fx * Math.cos(a) - fz * Math.sin(a)) * reach,
        e.z + (fx * Math.sin(a) + fz * Math.cos(a)) * reach,
        power * mod.power,
      );
    }
  } else {
    fire(aimX, aimZ, power);
  }
  w.fx(`${c.def.id}.${ability.slot}.cast`, e.x, e.z, { fx, fz, ax: aimX, az: aimZ, source: e.id });
  if (mod && mod.mode !== 'split') scheduleRecast(w, e, ability, aimX, aimZ, power, mod);

  // Slipstream: the ult itself is the movement tool.
  if (ability.slot === 'r' && c.augments.length > 0) {
    const slip = special(e, 'slipstream');
    if (slip) {
      applyBuff(e, {
        id: 'aug_slipstream',
        name: 'Slipstream',
        duration: slip.seconds ?? 2,
        decayingMsBonus: slip.ms ?? 0.25,
      });
      w.fx('augment.slipstream', e.x, e.z, { source: e.id });
    }
  }

  if (ability.recast) {
    // Cooldown waits until all recasts resolve or the window closes.
    // Seismic Overtime buys Grukk one more slam on the same window.
    c.recast = {
      slot: ability.slot,
      tLeft: ability.recast.window,
      ability,
      left: (ability.recast.charges ?? 1) + (special(e, 'seismic_overtime') ? 1 : 0),
    };
  } else {
    c.cds[ability.slot] = noCooldowns
      ? 0
      : hastedCooldown(ability.cooldown, championStats(e).haste);
  }

  // Apply any buffered order issued during the windup.
  if (c.pendingOrder) {
    c.order = c.pendingOrder;
    c.pendingOrder = null;
    c.path = [];
  }
}

/**
 * The delayed half of Mirror Strike (`mirror`) and Echo Cast (`echo`).
 *
 * Both re-run the same ability at reduced power a beat later — mirror re-aims
 * at the nearest *other* enemy, echo repeats from the original spot. It runs
 * through the world scheduler so the replay stays tick-exact, and it re-reads
 * the caster on arrival: dying (or swapping out) cancels the encore.
 */
function scheduleRecast(
  w: World,
  e: Entity,
  ability: AbilityDef,
  aimX: number,
  aimZ: number,
  power: number,
  mod: CastMod,
): void {
  const ownerId = e.id;
  const championId = e.champ?.def.id;
  w.schedule(mod.delay, (world) => {
    const owner = world.get(ownerId);
    if (!owner || owner.dead || owner.champ?.def.id !== championId) return;
    let ax = aimX;
    let az = aimZ;
    if (mod.mode === 'mirror') {
      // Nearest enemy that is NOT the one we just hit — the point of the card
      // is that the second bolt finds a second body.
      let best: Entity | undefined;
      let bestD = Number.POSITIVE_INFINITY;
      for (const u of world.enemiesOf(owner.team)) {
        if (u.kind === 'keg' || isUntargetable(u)) continue;
        if (dist(aimX, aimZ, u.x, u.z) < 1.2) continue;
        const d = dist(owner.x, owner.z, u.x, u.z);
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }
      if (!best) return; // nobody else on the field: no ghost shot into the void
      ax = best.x;
      az = best.z;
    }
    const [dx, dz] = norm(ax - owner.x, az - owner.z);
    executeActions(
      {
        w: world,
        caster: owner,
        ability,
        ox: owner.x,
        oz: owner.z,
        aimX: ax,
        aimZ: az,
        fx: dx,
        fz: dz,
        power: power * mod.power,
      },
      ability.actions,
    );
    world.fx(`augment.${mod.mode}`, owner.x, owner.z, {
      fx: dx,
      fz: dz,
      ax,
      az,
      source: owner.id,
    });
  });
}

export function updateCasts(w: World, e: Entity, dt: number, noCooldowns: boolean): void {
  const c = e.champ;
  if (!c || e.dead) return;

  // Cooldowns, energy, passives.
  for (const s of ['q', 'w', 'r'] as const) c.cds[s] = Math.max(0, c.cds[s] - dt);
  c.aaCd = Math.max(0, c.aaCd - dt);
  c.energy = Math.min(
    100,
    c.energy + (4 + (c.augments.length > 0 ? economyMods(e).energyRegen : 0)) * dt,
  );
  if (c.passive.stonewallCd !== undefined)
    c.passive.stonewallCd = Math.max(0, c.passive.stonewallCd - dt);
  // The benched half keeps living (GAME_DESIGN §7.2): cooldowns tick, Energy
  // refills — swapping is a resource play precisely because the bench recovers.
  const duo = c.duo;
  if (duo) {
    const mods = c.augments.length > 0 ? duoMods(e) : null;
    const benchRate = mods?.benchCdRate ?? 1;
    duo.swapCd = Math.max(0, duo.swapCd - dt);
    duo.morphT = Math.max(0, duo.morphT - dt);
    // Warm Bench: the benched half recovers faster than the fielded one.
    for (const s of ['q', 'w', 'r'] as const) {
      duo.cds[s] = Math.max(0, duo.cds[s] - dt * benchRate);
    }
    duo.aaCd = Math.max(0, duo.aaCd - dt);
    duo.energy = Math.min(100, duo.energy + 4 * dt * benchRate);
    // Understudy: a benched champion banks Resolve for its next entrance.
    if (mods && mods.resolvePerSec > 0) {
      const cap = e.hpMax * mods.resolveCap;
      c.passive.resolve = Math.min(
        cap,
        (c.passive.resolve ?? 0) + e.hpMax * mods.resolvePerSec * dt,
      );
    }
    if (duo.passive.stonewallCd !== undefined)
      duo.passive.stonewallCd = Math.max(0, duo.passive.stonewallCd - dt);
  }

  // Fear (Wisp R): flee timer; movement reads c.feared, casts/attacks are locked.
  if (c.feared) {
    c.feared.tLeft -= dt;
    if (c.feared.tLeft <= 0) c.feared = null;
  }

  if (c.recast) {
    c.recast.tLeft -= dt;
    if (c.recast.tLeft <= 0) {
      c.cds[c.recast.slot] = noCooldowns
        ? 0
        : hastedCooldown(c.recast.ability.cooldown, championStats(e).haste);
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
      // Castle Drop: the rim of the crater stays up as real, walkable-around
      // terrain — a keep dropped mid-fight, not just a bigger number.
      const drop = special(e, 'castle_drop');
      if (drop) {
        const radius = drop.radius ?? 2.6;
        const cells = w.nav.stampRing(e.x, e.z, radius, 0.7);
        w.add({
          kind: 'zone',
          srcLabel: 'r',
          team: e.team,
          x: e.x,
          z: e.z,
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
            owner: e.id,
            variant: 'pod',
            tLeft: drop.seconds ?? 4,
            duration: drop.seconds ?? 4,
            radius,
            navCells: cells,
          },
        });
        w.fx('augment.castle', e.x, e.z, { source: e.id });
      }
    }
  }
}

/** Auto-attack brain: acquire, windup, commit. Runs after cast update. */
export function updateAutoAttack(w: World, e: Entity, _dt: number): void {
  const c = e.champ;
  if (!c || e.dead || c.leap) return;
  if (c.feared) return; // fleeing: no attacks
  if (c.duo && c.duo.morphT > 0) return; // mid-swap: the weapon isn't there yet
  if (c.cast && c.cast.kind !== 'aa') return;

  const stats = championStats(e);

  // Resolve current target.
  let target: Entity | undefined;
  if (c.order?.kind === 'attackTarget') {
    const t = w.get(c.order.target);
    if (t && canAttack(w, e, t)) target = t;
    else {
      c.order = null;
      c.aaTarget = null;
    }
  } else if (c.order?.kind === 'attackMove') {
    // Acquisition priority (GAME_DESIGN §10.2): champions > lowest-HP Mini > structures.
    const acquireR = stats.range + AA_ACQUIRE_BONUS;
    let champ: Entity | undefined;
    let champD = Number.POSITIVE_INFINITY;
    let mini: Entity | undefined;
    let miniHp = Number.POSITIVE_INFINITY;
    for (const u of w.enemiesOf(e.team)) {
      if (u.kind === 'keg' || isUntargetable(u)) continue;
      const d = dist(e.x, e.z, u.x, u.z) - u.radius;
      if (d > acquireR) continue;
      if (u.kind === 'mini') {
        if (u.hp < miniHp) {
          miniHp = u.hp;
          mini = u;
        }
      } else if (!isHiddenFrom(w, e.team, u) && d < champD) {
        champD = d;
        champ = u;
      }
    }
    target = champ ?? mini;
    if (!target) {
      let structD = Number.POSITIVE_INFINITY;
      for (const s of w.structures()) {
        if (s.team === e.team || structureInvulnerable(w, s)) continue;
        const d = dist(e.x, e.z, s.x, s.z) - s.radius;
        if (d <= acquireR && d < structD) {
          structD = d;
          target = s;
        }
      }
    }
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
  c.cast = {
    kind: 'aa',
    tLeft: windup,
    tTotal: windup,
    aimX: target.x,
    aimZ: target.z,
    target: target.id,
  };
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
  if (!target || !canAttack(w, e, target)) return;
  c.lastActionAt = w.time;
  // Attacking breaks Sheet Slip stealth.
  const iv = e.buffs.findIndex((b) => b.id === 'wisp_invis');
  if (iv >= 0) e.buffs.splice(iv, 1);

  // Lucky Doubloon (Fathom entrance): consume for +40%.
  let luckyMul = 1;
  const luckyIdx = e.buffs.findIndex((b) => b.id === 'fathom_entrance_luck');
  if (luckyIdx >= 0) {
    luckyMul = 1 + (c.def.entrance.params.bonus ?? 0.4);
    e.buffs.splice(luckyIdx, 1);
  }

  if (c.def.attack.kind === 'melee') {
    let reach = stats.range + 0.6; // forgiveness vs moving targets
    // Crimson Lash primes a lunge: the next basic closes 2 u to reach its mark.
    const lunge = e.buffs.findIndex((b) => b.id === 'vex_lunge');
    if (lunge >= 0) {
      e.buffs.splice(lunge, 1);
      const gap = dist(e.x, e.z, target.x, target.z) - target.radius;
      if (gap > reach - 0.4) {
        const [lx, lz] = norm(target.x - e.x, target.z - e.z);
        const step = Math.min(2, gap - (stats.range - 0.2));
        const [nx, nz] = w.nav.nearestOpen(e.x + lx * step, e.z + lz * step);
        e.x = nx;
        e.z = nz;
        c.path = [];
        w.fx('vex.q.lunge', e.x, e.z, { source: e.id, target: target.id });
      }
      reach += 2;
    }
    if (dist(e.x, e.z, target.x, target.z) - target.radius <= reach) {
      dealDamage(w, { source: e, tag: 'aa' }, target, stats.ad * luckyMul, 'physical');
      w.fx('generic.melee.hit', target.x, target.z, { source: e.id, target: target.id });
      applyBasicRiders(w, e, target);
    }
    return;
  }

  // Ranged: homing missile. Powder Rounds passive counts FIRED attacks.
  let powder = false;
  if (c.def.passive.id === 'powder_rounds') {
    c.passive.powderCount = (c.passive.powderCount ?? 0) + 1;
    const every = augParam(e, 'fathom.powderEvery', c.def.passive.params.every);
    if (c.passive.powderCount >= every) {
      c.passive.powderCount = 0;
      powder = true;
    }
  }
  c.passive.basicCount = (c.passive.basicCount ?? 0) + 1;
  // Capacitor (Boltz): a basic after `idle`s of silence carries the charge.
  let capacitor = false;
  if (c.def.passive.id === 'capacitor') {
    const p = c.def.passive.params;
    if (w.time - (c.passive.lastAtk ?? -100) >= p.idle) capacitor = true;
    c.passive.lastAtk = w.time;
    c.passive.charged = 0;
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
      capacitor,
      luckyMul,
      color: powder ? 0xffa13b : capacitor ? 0xd8f4ff : m.color,
      size: powder || capacitor ? m.size * 1.6 : m.size,
    },
  });
}

/** Spawn-in effects: entrance + fresh-legs (also used on respawn and champion switch). */
export function applySpawnEffects(w: World, e: Entity): void {
  const c = e.champ;
  if (!c) return;
  applyBuffById(e, 'spawn_haste');
  applyEntrance(w, e);
}

/** The champion's signature swap-in/spawn micro-effect (GAME_DESIGN §7.2). */
export function applyEntrance(w: World, e: Entity): void {
  const c = e.champ;
  if (!c) return;
  // Dramatic Entrance scales the whole effect: damage, radii, slows, durations.
  const potency = c.augments.length > 0 ? duoMods(e).entrancePotency : 1;
  const p =
    potency === 1
      ? c.def.entrance.params
      : Object.fromEntries(Object.entries(c.def.entrance.params).map(([k, v]) => [k, v * potency]));
  switch (c.def.entrance.id) {
    case 'shieldwall': {
      applyBuffById(e, 'rook_entrance_shieldwall');
      const b = e.buffs.find((x) => x.id === 'rook_entrance_shieldwall');
      if (b) b.blockNextHit = true;
      break;
    }
    case 'lucky_doubloon':
      applyBuffById(e, 'fathom_entrance_luck');
      break;
    case 'reshelved': {
      // Mortis erupts from the ground: a small dust nova.
      const stats = championStats(e);
      const amount = p.base + p.apRatio * stats.ap;
      for (const u of [...w.enemiesOf(e.team)]) {
        if (u.kind === 'keg') continue;
        if (dist(e.x, e.z, u.x, u.z) <= p.radius + u.radius) {
          dealDamage(w, { source: e }, u, amount, 'arcane');
        }
      }
      w.fx('mortis.entrance', e.x, e.z, { source: e.id });
      break;
    }
    case 'ossuary_flourish':
      applyBuff(e, {
        id: 'entrance_free_q',
        name: 'Ossuary Flourish',
        duration: p.window,
      });
      break;
    case 'booth_rules': {
      for (const u of [...w.enemiesOf(e.team)]) {
        if (u.kind === 'keg') continue;
        if (dist(e.x, e.z, u.x, u.z) <= p.radius + u.radius) {
          applyCc(u, { kind: 'slow', duration: p.duration, strength: p.slow });
        }
      }
      w.fx('grukk.entrance', e.x, e.z, { source: e.id });
      break;
    }
    case 'fresh_cuttings': {
      const pp = c.def.passive.params;
      const max = augParam(e, 'sylva.flowerCap', pp.max);
      const life = augParam(e, 'sylva.flowerLife', pp.life);
      plantFlower(w, e, e.x - 0.5, e.z - 0.3, max, life);
      plantFlower(w, e, e.x + 0.5, e.z + 0.3, max, life);
      break;
    }
    case 'eva_hop': {
      // Jetpack micro-hop forward (ignores unit collision — it's a leap).
      const [hx, hz] = norm(e.fx, e.fz);
      const [tx, tz] = w.nav.nearestOpen(e.x + hx * (p.dist ?? 1), e.z + hz * (p.dist ?? 1));
      c.leap = {
        tLeft: p.dur ?? 0.4,
        tTotal: p.dur ?? 0.4,
        fromX: e.x,
        fromZ: e.z,
        toX: tx,
        toZ: tz,
        onLand: [],
        ability: c.def.abilities.q,
      };
      w.fx('boltz.entrance', e.x, e.z, { source: e.id });
      break;
    }
    case 'treat_time': {
      // Chomp yips at whoever looks like they need it most.
      let sore: Entity | undefined;
      let soreFrac = Number.POSITIVE_INFINITY;
      for (const u of w.champions()) {
        if (u.team !== e.team || u.id === e.id) continue;
        if (dist(e.x, e.z, u.x, u.z) > (p.radius ?? 5)) continue;
        const f = u.hp / u.hpMax;
        if (f < soreFrac) {
          soreFrac = f;
          sore = u;
        }
      }
      applyBuffById(sore ?? e, 'piper_treat');
      w.fx('piper.entrance', e.x, e.z, { source: e.id });
      break;
    }
    case 'fashionably_late': {
      applyBuffById(e, 'vex_entrance_ms');
      applyBuff(e, { id: 'entrance_free_q', name: 'Fashionably Late', duration: p.window ?? 2 });
      w.fx('vex.entrance', e.x, e.z, { source: e.id });
      break;
    }
    case 'cold_spot': {
      for (const u of [...w.enemiesOf(e.team)]) {
        if (u.kind === 'keg') continue;
        if (dist(e.x, e.z, u.x, u.z) <= (p.radius ?? 1.5) + u.radius) {
          applyCc(u, { kind: 'slow', duration: p.slowDur ?? 1, strength: p.slow ?? 0.1 });
          applyBuffById(u, 'wisp_chilled');
        }
      }
      applyBuffById(e, 'wisp_untargetable');
      w.fx('wisp.entrance', e.x, e.z, { source: e.id });
      break;
    }
  }
  w.fx('generic.spawn', e.x, e.z, { source: e.id });
}

/** Powder-blast splash resolution (called from projectile impact). */
/** Tag Swap (GAME_DESIGN §7.2): exchange the active kit with the bench.
 * Shared on the entity: HP, position, items, level, gold, buffs, shields.
 * Exchanged: def, Energy, cooldowns, passive scratch. Movement continues;
 * attacks/casts wait out the 0.35 s morph. */
export function trySwap(w: World, e: Entity): DenyReason | null {
  const c = e.champ;
  if (!c || !c.duo) return null; // solo champion — Space does nothing
  if (e.dead) return 'dead';
  const duo = c.duo;
  if (duo.swapCd > 0.001) return 'cooldown';
  if (duo.morphT > 0) return 'casting';
  // Blocked while channeling/winding up an ability or leaping; a basic-attack
  // windup just cancels (swap is an identity action, not a channel).
  if (c.cast && c.cast.kind !== 'aa') return 'casting';
  if (c.leap) return 'casting';
  if (c.feared) return 'casting';
  // Hard CC only: stuns and knock-ups. Roots leave your hands free.
  if (e.airborne > 0 || e.buffs.some((b) => b.id === 'cc_stun')) return 'casting';

  c.cast = null;
  c.recast = null;
  c.aaTarget = null;
  c.dancing = false;
  // Double Feature: the half walking off stage stays on it as a ghost for a
  // beat, still swinging — the swap becomes an attack, not just a pivot.
  const df = c.augments.length > 0 ? special(e, 'double_feature') : null;
  if (df) spawnGhost(w, e, df);
  [c.def, duo.def] = [duo.def, c.def];
  [c.energy, duo.energy] = [duo.energy, c.energy];
  [c.cds, duo.cds] = [duo.cds, c.cds];
  [c.aaCd, duo.aaCd] = [duo.aaCd, c.aaCd];
  [c.passive, duo.passive] = [duo.passive, c.passive];
  const mods = c.augments.length > 0 ? duoMods(e) : null;
  duo.swapCd = Math.max(1, (mods?.swapCd ?? TAG_SWAP.cooldown) + (mods?.swapCdDelta ?? 0));
  duo.morphT = TAG_SWAP.morphS;
  c.lastActionAt = w.time; // swapping reveals in brush like any action

  applyBuff(e, {
    id: 'tag_swap_momentum',
    name: 'Tag Momentum',
    duration: mods?.swapMsDuration ?? TAG_SWAP.hasteDuration,
    decayingMsBonus: mods?.swapMs ?? TAG_SWAP.haste,
  });
  if (mods) {
    // Bulwark Bond: the arriving champion lands behind a shield.
    if (mods.shieldOnSwap) {
      applyBuff(e, {
        id: 'aug_bulwark',
        name: 'Bulwark Bond',
        duration: 2,
        shield: resolveScaling(
          mods.shieldOnSwap,
          c.level,
          championStats(e).ad,
          championStats(e).ap,
        ),
      });
    }
    // Tag Combo: the next ability inside the window costs nothing.
    if (mods.freeCastWindow > 0) {
      applyBuff(e, { id: 'aug_tag_combo', name: 'Tag Combo', duration: mods.freeCastWindow });
    }
    // Understudy: banked Resolve arrives as grey health on the incoming half.
    const resolve = c.passive.resolve ?? 0;
    if (resolve > 1) {
      applyBuff(e, { id: 'aug_resolve', name: 'Resolve', duration: 12, shield: resolve });
      c.passive.resolve = 0;
    }
  }
  applyEntrance(w, e);
  w.fx('duo.swap', e.x, e.z, { source: e.id });
  return null;
}

/**
 * Double Feature's afterimage: the outgoing champion keeps swinging where it
 * stood. Implemented with the scheduler rather than a real entity — a ghost
 * that could be targeted, body-blocked or killed would change far more about a
 * fight than the card promises.
 */
function spawnGhost(w: World, e: Entity, p: Record<string, number>): void {
  const c = e.champ;
  if (!c) return;
  const ownerId = e.id;
  const gx = e.x;
  const gz = e.z;
  const ad = championStats(e).ad * (p.power ?? 1);
  const range = c.def.stats.range + 1;
  const secs = p.seconds ?? 2;
  const interval = Math.max(0.25, p.interval ?? 1);
  const swings = Math.max(1, Math.floor(secs / interval));
  w.fx('augment.ghost', gx, gz, { source: e.id });
  for (let i = 0; i < swings; i++) {
    w.schedule(interval * i, (world) => {
      const owner = world.get(ownerId);
      if (!owner) return;
      let best: Entity | undefined;
      let bestD = range;
      for (const u of world.enemiesOf(owner.team)) {
        if (u.kind === 'keg' || u.dead || isUntargetable(u)) continue;
        const d = dist(gx, gz, u.x, u.z);
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }
      if (!best) return;
      dealDamage(world, { source: owner, tag: 'item', label: 'augment' }, best, ad, 'physical');
      world.fx('augment.ghost.swing', gx, gz, { source: owner.id, target: best.id });
    });
  }
}

export function powderBlast(w: World, owner: Entity, target: Entity): void {
  const c = owner.champ;
  if (!c) return;
  const stats = championStats(owner);
  const p = c.def.passive.params;
  const bonus = resolveScaling(
    { base: p.bonusBase, adRatio: p.bonusAdRatio },
    c.level,
    stats.ad,
    0,
  );
  for (const u of w.enemiesOf(owner.team)) {
    if (u.kind === 'keg') continue;
    if (dist(target.x, target.z, u.x, u.z) <= p.splashRadius + u.radius) {
      dealDamage(w, { source: owner, label: 'passive' }, u, bonus, 'physical');
    }
  }
  w.fx('fathom.passive.blast', target.x, target.z, { source: owner.id, target: target.id });
}

/**
 * Augment riders on a basic attack that just landed (Heavy Rounds, Hex Tip,
 * Chain Lightning). Tagged `item` so they never re-enter the on-hit hooks that
 * spawned them.
 */
export function applyBasicRiders(w: World, owner: Entity, target: Entity): void {
  const c = owner.champ;
  if (!c || c.augments.length === 0) return;
  const riders = basicRiders(owner, c.passive.basicCount ?? 0);
  if (riders.length === 0) return;
  const stats = championStats(owner);
  for (const r of riders) {
    const amount = r.bonus ? resolveScaling(r.bonus, c.level, stats.ad, stats.ap) : 0;
    if (amount > 0) {
      if (r.burnSeconds > 0) {
        // Spread it over time — the burn is the visible tell, not a bigger number.
        const ticks = 4;
        for (let i = 1; i <= ticks; i++) {
          w.schedule((r.burnSeconds / ticks) * i, (world) => {
            const src = world.get(owner.id);
            const tgt = world.get(target.id);
            if (!src || !tgt || tgt.dead) return;
            dealDamage(
              world,
              { source: src, tag: 'burn', label: 'augment' },
              tgt,
              amount / ticks,
              r.dtype,
            );
          });
        }
      } else {
        dealDamage(w, { source: owner, tag: 'item', label: 'augment' }, target, amount, r.dtype);
      }
    }
    if (r.push > 0) {
      const [px, pz] = norm(target.x - owner.x, target.z - owner.z);
      displace(w, target, px, pz, r.push);
    }
    if (r.chain) {
      // Arc to the nearest OTHER enemy — the filament is the visibility tell.
      let best: Entity | undefined;
      let bestD = r.chain.radius;
      for (const u of w.enemiesOf(owner.team)) {
        if (u.kind === 'keg' || u.id === target.id || isUntargetable(u)) continue;
        const d = dist(target.x, target.z, u.x, u.z);
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }
      if (best) {
        dealDamage(
          w,
          { source: owner, tag: 'item', label: 'augment' },
          best,
          stats.ad * r.chain.mul,
          r.dtype,
        );
        w.fx('augment.chain', best.x, best.z, { source: owner.id, target: best.id });
      }
    }
  }
}

/** Capacitor charged basic (Boltz): bonus arcane on the target, arcing to one more. */
export function capacitorArc(w: World, owner: Entity, primary: Entity): void {
  const c = owner.champ;
  if (!c) return;
  const p = c.def.passive.params;
  const bonus = (p.bonusBase ?? 0) + (p.bonusAdRatio ?? 0) * championStats(owner).ad;
  dealDamage(w, { source: owner, label: 'passive' }, primary, bonus, 'arcane');
  // Arc to the nearest other enemy within the chain radius.
  let best: Entity | undefined;
  let bestD = p.chainRadius ?? 4.5;
  for (const u of w.enemiesOf(owner.team)) {
    if (u.kind === 'keg' || u.id === primary.id || isUntargetable(u)) continue;
    const d = dist(primary.x, primary.z, u.x, u.z);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  if (best) {
    dealDamage(w, { source: owner, label: 'passive' }, best, bonus, 'arcane');
    w.fx('boltz.passive.charge', best.x, best.z, { source: owner.id, target: best.id });
  }
  w.fx('boltz.passive.charge', primary.x, primary.z, { source: owner.id, target: primary.id });
}

/** Per-tick champion passive upkeep: Capacitor telegraph, Wisp chill, pet presence. */
export function updateChampionPassive(w: World, e: Entity, _dt: number): void {
  const c = e.champ;
  if (!c || e.dead) return;
  // Companions follow the *fielded* champion: swapping to Piper whistles Chomp
  // back onto the deck, swapping away sends him off it (updatePet retires him).
  if (c.def.passive.id === 'best_friend') {
    // Two Good Boys puts a second animal on the roster; they alternate errands.
    const wanted = special(e, 'two_good_boys') ? 2 : 1;
    for (let i = petsOf(w, e).length; i < wanted; i++) spawnPet(w, e, 'chomp');
  }
  if (c.def.passive.id === 'capacitor') {
    const p = c.def.passive.params;
    c.passive.charged = w.time - (c.passive.lastAtk ?? -100) >= p.idle ? 1 : 0;
  }
  if (c.def.passive.id === 'ectoplasm') {
    const p = c.def.passive.params;
    for (const u of w.enemiesOf(e.team)) {
      if (u.kind === 'keg') continue;
      if (dist(e.x, e.z, u.x, u.z) <= e.radius + u.radius) {
        applyCc(u, { kind: 'slow', duration: p.slowDur, strength: p.slow });
        applyBuffById(u, 'wisp_chilled');
        w.fx('wisp.passive.chill', u.x, u.z, { source: e.id, target: u.id });
      }
    }
  }
}

/**
 * Per-tick augment upkeep: things that accrue rather than react.
 *
 * Kept out of `updateChampionPassive` so a champion's own passive code never
 * has to know augments exist — and skipped entirely for a seat holding no
 * cards, which is most of the field for the first three minutes.
 */
export function updateAugments(w: World, e: Entity, dt: number): void {
  const c = e.champ;
  if (!c || c.augments.length === 0 || e.dead) return;

  // Guardian Constellation: one star banks every N seconds, spent on an ability.
  const star = special(e, 'constellation');
  if (star) {
    if ((c.augState.star ?? 0) >= 1) {
      c.augState.starT = 0;
    } else {
      const t = (c.augState.starT ?? 0) + dt;
      if (t >= (star.every ?? 20)) {
        c.augState.star = 1;
        c.augState.starT = 0;
        w.fx('augment.star.bank', e.x, e.z, { source: e.id });
      } else {
        c.augState.starT = t;
      }
    }
  }

  // Kinetic Battery: distance run banks charge, spent by the next hit that
  // reads it (augmentDamageMul), so standing still is a real cost.
  const kin = special(e, 'kinetic');
  if (kin) {
    const moved = c.speed * dt;
    const capUnits = (kin.cap ?? 0.15) / (kin.perUnit ?? 0.01);
    c.augState.kinetic = Math.min(capUnits, (c.augState.kinetic ?? 0) + moved);
  }

  // Warlord's Banner: allied Minis in the aura hit harder and march faster.
  const wl = special(e, 'warlord');
  if (wl) {
    for (const u of w.entities) {
      if (u.kind !== 'mini' || u.team !== e.team || u.dead) continue;
      if (dist(e.x, e.z, u.x, u.z) > (wl.radius ?? 7)) continue;
      applyBuff(u, {
        id: 'aug_warlord',
        name: "Warlord's Banner",
        duration: 0.5,
        mul: { moveSpeed: wl.msMul ?? 1.2 },
        damageAmp: (wl.damageMul ?? 1.3) - 1,
      });
    }
  }
}
