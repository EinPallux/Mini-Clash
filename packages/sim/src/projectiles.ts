import { applyBasicRiders, capacitorArc, powderBlast } from './abilities';
import { augFlag, augParam, special } from './augments';
import { applyCc } from './buffs';
import { dealDamage, displace } from './combat';
import { dist, norm } from './vec';
import type { Entity, World } from './world';

/** Boltz's dome/pod pops enemy projectiles crossing the shell. Returns true if consumed. */
function poppedByField(w: World, e: Entity): boolean {
  const p = e.proj;
  if (!p) return false;
  for (const z of w.entities) {
    if (z.dead) continue;
    if (z.kind === 'zone' && z.zone?.blocksProjectiles) {
      if (z.team === e.team) continue; // allies fire out of their own dome
      if (dist(e.x, e.z, z.x, z.z) <= z.zone.radius + e.radius) {
        w.fx('boltz.dome.block', e.x, e.z, { source: z.zone.owner });
        e.dead = true;
        w.remove(e.id);
        return true;
      }
    }
    // Ramparts of the Old Bridge: the wall itself stops enemy shots. Rectangle
    // test in the wall's own frame — along the span, across the thickness.
    if (z.kind === 'wall' && z.wall?.blocksProjectiles && z.team !== e.team) {
      const dx = e.x - z.x;
      const dz = e.z - z.z;
      const along = dx * -z.fz + dz * z.fx;
      const across = dx * z.fx + dz * z.fz;
      if (Math.abs(along) <= z.wall.length / 2 && Math.abs(across) <= 0.6 + e.radius) {
        w.fx('augment.wall.block', e.x, e.z, { source: z.wall.owner });
        e.dead = true;
        w.remove(e.id);
        return true;
      }
    }
  }
  return false;
}

/**
 * Spawn two reduced-power copies of a live projectile off its diagonals.
 * Used by Chain Shot; the copies inherit everything but their heading, so they
 * behave exactly like the parent shot at a fraction of the damage.
 */
function splitOff(w: World, e: Entity, spreadDeg: number, power: number): void {
  const p = e.proj;
  if (!p) return;
  for (const sign of [-1, 1]) {
    const a = (sign * spreadDeg * Math.PI) / 180;
    const dx = p.dirX * Math.cos(a) - p.dirZ * Math.sin(a);
    const dz = p.dirX * Math.sin(a) + p.dirZ * Math.cos(a);
    w.add({
      kind: 'projectile',
      srcLabel: e.srcLabel,
      team: e.team,
      x: e.x,
      z: e.z,
      fx: dx,
      fz: dz,
      radius: e.radius * 0.75,
      hp: 1,
      hpMax: 1,
      dead: false,
      airborne: 0,
      airborneTotal: 0,
      buffs: [],
      proj: {
        ...p,
        def: undefined, // no pulses on the shards: they hit once and stop
        dirX: dx,
        dirZ: dz,
        traveled: 0,
        maxRange: Math.max(1, p.maxRange - p.traveled),
        pulsesFired: 0,
        hitIds: new Set(),
        damage: p.damage * power,
        size: p.size * 0.75,
      },
    });
  }
  w.fx('augment.chainshot', e.x, e.z, { source: p.owner });
}

export function updateProjectile(w: World, e: Entity, dt: number): void {
  const p = e.proj;
  if (!p || e.dead) return;

  if (p.style === 'aa') {
    updateHoming(w, e, dt);
    return;
  }

  // Linear skillshot with pulse zones (Skipshot).
  const step = p.speed * dt;
  e.x += p.dirX * step;
  e.z += p.dirZ * step;
  p.traveled += step;

  if (poppedByField(w, e)) return;

  const def = p.def;
  if (def?.pulses) {
    while (
      p.pulsesFired < def.pulses.length &&
      p.traveled >= def.pulses[p.pulsesFired].atDistance
    ) {
      const pulse = def.pulses[p.pulsesFired];
      p.pulsesFired++;
      const lastSkip = p.pulsesFired === def.pulses.length;
      // Exact pulse position (independent of tick granularity).
      const px = e.x - p.dirX * (p.traveled - pulse.atDistance);
      const pz = e.z - p.dirZ * (p.traveled - pulse.atDistance);
      if (def.pulseFx) w.fx(def.pulseFx, px, pz, { source: p.owner });
      const owner = w.get(p.owner);
      for (const u of w.enemiesOf(e.team)) {
        if (u.kind === 'keg' || p.hitIds.has(u.id)) continue;
        if (dist(px, pz, u.x, u.z) <= pulse.radius + u.radius) {
          p.hitIds.add(u.id);
          const src = owner ?? e;
          dealDamage(w, { source: src, label: e.srcLabel }, u, p.damage * pulse.damageMul, p.dtype);
        }
      }
      // Chain Shot: the last skip throws two smaller balls off the diagonals.
      const chain = lastSkip && owner ? special(owner, 'chain_shot') : null;
      if (chain) splitOff(w, e, chain.spreadDeg ?? 26, chain.power ?? 0.55);
    }
  } else {
    // Direct-hit skillshot: first enemy touched (overkill can carry through).
    const owner = w.get(p.owner);
    for (const u of [...w.enemiesOf(e.team)]) {
      if (u.kind === 'keg' || p.hitIds.has(u.id)) continue;
      if (dist(e.x, e.z, u.x, u.z) <= e.radius + u.radius) {
        p.hitIds.add(u.id);
        // Wisp Boo bites harder into Chilled targets.
        const bvb = p.def?.bonusVsBuff;
        const mul = bvb && u.buffs.some((b) => b.id === bvb.buff) ? bvb.mul : 1;
        const inscribed = u.buffs.some((b) => b.id === 'mortis_inscribed');
        dealDamage(w, { source: owner ?? e, label: e.srcLabel }, u, p.damage * mul, p.dtype);
        if (p.def?.cc && !u.dead) applyCc(u, p.def.cc);
        // Special Collections: a bolt that strikes an inscribed debtor forks on
        // to the next one — the reason to brand before you fire.
        const coll = inscribed && owner ? special(owner, 'special_collections') : null;
        if (coll && owner) {
          let next: Entity | undefined;
          let bestD: number = coll.radius ?? 6;
          for (const v of w.enemiesOf(e.team)) {
            if (v.kind === 'keg' || v.dead || v.id === u.id || p.hitIds.has(v.id)) continue;
            const d = dist(u.x, u.z, v.x, v.z);
            if (d < bestD) {
              bestD = d;
              next = v;
            }
          }
          if (next) {
            dealDamage(
              w,
              { source: owner, tag: 'item', label: 'augment' },
              next,
              p.damage * (coll.power ?? 0.6),
              p.dtype,
            );
            w.fx('augment.chain', next.x, next.z, { source: owner.id, target: next.id });
          }
        }
        // Separation Anxiety: Boo! punches through, and every body it passes
        // banks a second onto the next Haunting Hour.
        const bank = owner ? augParam(owner, 'wisp.curseBonusPerHit', 0) : 0;
        if (bank > 0 && owner?.champ && u.kind === 'champion') {
          owner.champ.augState.cursePlus = (owner.champ.augState.cursePlus ?? 0) + bank;
        }
        const pierced = owner ? augFlag(owner, 'wisp.booPierces') : false;
        const carriedThrough = (p.def?.pierceOnKill && u.dead) || pierced;
        if (p.def?.pierces !== 'all' && !carriedThrough) {
          e.dead = true;
          w.remove(e.id);
          return;
        }
      }
    }
  }

  if (p.traveled >= p.maxRange) {
    e.dead = true;
    w.remove(e.id);
  }
}

function updateHoming(w: World, e: Entity, dt: number): void {
  const p = e.proj;
  if (!p) return;
  const target = p.target !== undefined ? w.get(p.target) : undefined;

  if (target && !target.dead) {
    const [dx, dz] = norm(target.x - e.x, target.z - e.z);
    p.dirX = dx;
    p.dirZ = dz;
    e.fx = dx;
    e.fz = dz;
  }
  const step = p.speed * dt;
  e.x += p.dirX * step;
  e.z += p.dirZ * step;
  p.traveled += step;

  if (poppedByField(w, e)) return;

  if (
    target &&
    !target.dead &&
    dist(e.x, e.z, target.x, target.z) <= p.size + target.radius + 0.15
  ) {
    const owner = w.get(p.owner);
    const src = owner ?? e;
    // Champion missiles are attacks (on-hit items); tower/Mini missiles are unit damage.
    const tag = p.ownerPlayer >= 0 ? 'aa' : 'unit';
    const dealt = dealDamage(
      w,
      { source: src, tag },
      target,
      p.damage * (p.luckyMul ?? 1),
      p.dtype,
    );
    const champId = owner?.champ?.def.id ?? 'generic';
    w.fx(dealt > 0 ? `${champId}.aa.hit` : 'generic.hit', target.x, target.z, {
      source: p.owner,
      target: target.id,
    });
    if (p.powder && owner) {
      powderBlast(w, owner, target);
      displace(w, target, p.dirX, p.dirZ, owner.champ?.def.passive.params.push ?? 0.5);
    }
    if (p.capacitor && owner) capacitorArc(w, owner, target);
    if (owner?.champ && owner.champ.augments.length > 0) applyBasicRiders(w, owner, target);
    e.dead = true;
    w.remove(e.id);
    return;
  }

  if (p.traveled >= p.maxRange || (target === undefined && p.traveled > 2)) {
    e.dead = true;
    w.remove(e.id);
  }
}
