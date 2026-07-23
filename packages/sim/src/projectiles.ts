import { powderBlast } from './abilities';
import { dealDamage, displace } from './combat';
import { dist, norm } from './vec';
import type { Entity, World } from './world';

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

  const def = p.def;
  if (def?.pulses) {
    while (
      p.pulsesFired < def.pulses.length &&
      p.traveled >= def.pulses[p.pulsesFired].atDistance
    ) {
      const pulse = def.pulses[p.pulsesFired];
      p.pulsesFired++;
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
          dealDamage(w, { source: src }, u, p.damage * pulse.damageMul, p.dtype);
        }
      }
    }
  } else {
    // Direct-hit skillshot: first enemy touched.
    const owner = w.get(p.owner);
    for (const u of w.enemiesOf(e.team)) {
      if (u.kind === 'keg' || p.hitIds.has(u.id)) continue;
      if (dist(e.x, e.z, u.x, u.z) <= e.radius + u.radius) {
        p.hitIds.add(u.id);
        dealDamage(w, { source: owner ?? e }, u, p.damage, p.dtype);
        if (p.def?.pierces !== 'all') {
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

  if (
    target &&
    !target.dead &&
    dist(e.x, e.z, target.x, target.z) <= p.size + target.radius + 0.15
  ) {
    const owner = w.get(p.owner);
    const src = owner ?? e;
    const dealt = dealDamage(w, { source: src }, target, p.damage * (p.luckyMul ?? 1), p.dtype);
    const champId = owner?.champ?.def.id ?? 'generic';
    w.fx(dealt > 0 ? `${champId}.aa.hit` : 'generic.hit', target.x, target.z, {
      source: p.owner,
      target: target.id,
    });
    if (p.powder && owner) {
      powderBlast(w, owner, target);
      displace(w, target, p.dirX, p.dirZ, owner.champ?.def.passive.params.push ?? 0.5);
    }
    e.dead = true;
    w.remove(e.id);
    return;
  }

  if (p.traveled >= p.maxRange || (target === undefined && p.traveled > 2)) {
    e.dead = true;
    w.remove(e.id);
  }
}
