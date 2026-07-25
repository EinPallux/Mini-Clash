import { UNITS } from '@mini-clash/data';
import { applyBuffById, applyCc } from './buffs';
import { dealDamage } from './combat';
import { healEntity } from './heal';
import { championStats } from './stats';
import { dist, inRect, norm } from './vec';
import type { Entity, World } from './world';

/**
 * Companions and pickups (docs/CHAMPIONS.md §4 Piper).
 *
 * Chomp is a persistent, untargetable unit: he never takes damage and never
 * appears in `world.units()`, so nothing can attack him and he blocks nothing.
 * All of his balance lives in the fetch cooldown. He orbits Piper, runs errands
 * (an automatic nip on the passive, or a Q dash down a line), and comes home.
 */

const ORBIT_RADIUS = 1.15;
const PET_SPEED = 7.5;
const FETCH_SPEED = 9;

/** Spawn the champion's companion if their passive calls for one. */
export function spawnPet(w: World, owner: Entity, unitId: string): Entity | null {
  const def = UNITS[unitId];
  const c = owner.champ;
  if (!def || !c) return null;
  return w.add({
    kind: 'pet',
    team: owner.team,
    x: owner.x - 0.9,
    z: owner.z + 0.6,
    fx: owner.fx,
    fz: owner.fz,
    radius: def.radius,
    hp: 1,
    hpMax: 1,
    dead: false,
    airborne: 0,
    airborneTotal: 0,
    buffs: [],
    pet: {
      def,
      owner: owner.id,
      ownerPlayer: c.player,
      fetchCd: c.def.passive.params.every ?? 6,
      empowered: false,
      orbit: 0,
      errand: { kind: 'idle' },
    },
  });
}

/** Every pet belonging to this champion (Two Good Boys adds a second). */
export function petsOf(w: World, owner: Entity): Entity[] {
  const out: Entity[] = [];
  for (const e of w.entities) {
    if (e.pet && !e.dead && e.pet.owner === owner.id) out.push(e);
  }
  return out;
}

/** Send a pet down a line as a skillshot (Piper Q). */
export function launchPetDash(
  w: World,
  owner: Entity,
  dirX: number,
  dirZ: number,
  spec: {
    distance: number;
    width: number;
    damage: number;
    dtype: 'physical' | 'arcane';
    stealMs?: { amount: number; duration: number };
  },
): void {
  const pets = petsOf(w, owner);
  if (pets.length === 0) return;
  // Only the lead pet rides the dash; a second good boy keeps orbiting.
  const pet = pets[0].pet;
  if (!pet) return;
  pets[0].x = owner.x;
  pets[0].z = owner.z;
  pet.errand = {
    kind: 'dash',
    dirX,
    dirZ,
    traveled: 0,
    maxDist: spec.distance,
    width: spec.width,
    damage: spec.damage,
    dtype: spec.dtype,
    hitIds: new Set(),
    stealMs: spec.stealMs,
    returning: false,
  };
  w.fx('piper.q.dash', pets[0].x, pets[0].z, { fx: dirX, fz: dirZ, source: owner.id });
}

/** Feed every pet of this owner (an unclaimed snack empowers the next fetch). */
export function empowerPets(w: World, owner: Entity): void {
  for (const p of petsOf(w, owner)) {
    if (p.pet) p.pet.empowered = true;
  }
}

export function updatePet(w: World, e: Entity, dt: number): void {
  const p = e.pet;
  if (!p) return;
  const owner = w.get(p.owner);
  // The pet exists only as long as its champion is fielded with the right kit.
  if (!owner || !owner.champ || owner.champ.def.passive.id !== 'best_friend') {
    w.remove(e.id);
    return;
  }
  if (owner.dead) {
    // Wait politely at the fountain rather than fighting on alone.
    e.x = owner.x;
    e.z = owner.z;
    p.errand = { kind: 'idle' };
    return;
  }

  p.fetchCd = Math.max(0, p.fetchCd - dt);

  if (p.errand.kind === 'dash') {
    updateDash(w, e, owner, p.errand, dt);
    return;
  }

  if (p.errand.kind === 'fetch') {
    const target = w.get(p.errand.target);
    p.errand.tLeft -= dt;
    if (!target || target.dead || p.errand.tLeft <= 0) {
      p.errand = { kind: 'idle' };
    } else {
      const reached = moveTo(e, target.x, target.z, FETCH_SPEED, dt) <= target.radius + 0.4;
      if (reached) {
        nip(w, e, owner, target);
        p.errand = { kind: 'idle' };
      }
      return;
    }
  }

  // Idle: orbit the owner, and start a fetch when the timer is up.
  const pp = owner.champ.def.passive.params;
  if (p.fetchCd <= 0) {
    const prey = nearestEnemy(w, e, owner, pp.range ?? 4);
    if (prey) {
      p.errand = { kind: 'fetch', target: prey.id, tLeft: 2.5 };
      p.fetchCd = pp.every ?? 6;
      return;
    }
  }
  // Orbit phase advances with world time so it stays deterministic.
  p.orbit += dt * 1.6;
  const ox = owner.x + Math.cos(p.orbit) * ORBIT_RADIUS;
  const oz = owner.z + Math.sin(p.orbit) * ORBIT_RADIUS;
  moveTo(e, ox, oz, PET_SPEED, dt);
}

/** Automatic nip: the passive's little bite, doubled when he's been fed. */
function nip(w: World, pet: Entity, owner: Entity, target: Entity): void {
  const c = owner.champ;
  const p = pet.pet;
  if (!c || !p) return;
  const pp = c.def.passive.params;
  const stats = championStats(owner);
  let amount = (pp.base ?? 20) + (pp.adRatio ?? 0.25) * stats.ad;
  if (p.empowered) {
    amount *= 2;
    p.empowered = false;
    applyCc(target, { kind: 'slow', duration: 1.5, strength: 0.25 });
    w.fx('piper.pet.empowered', target.x, target.z, { source: owner.id, target: target.id });
  }
  dealDamage(w, { source: owner, label: 'passive' }, target, amount, 'physical');
  w.fx('piper.pet.nip', target.x, target.z, { source: owner.id, target: target.id });
}

function updateDash(
  w: World,
  e: Entity,
  owner: Entity,
  errand: Extract<NonNullable<Entity['pet']>['errand'], { kind: 'dash' }>,
  dt: number,
): void {
  const p = e.pet;
  if (!p) return;
  if (errand.returning) {
    // Trot home; the errand ends when he's back at heel.
    const d = moveTo(e, owner.x, owner.z, FETCH_SPEED, dt);
    if (d <= 1.2) p.errand = { kind: 'idle' };
    return;
  }
  const fromX = e.x;
  const fromZ = e.z;
  const step = FETCH_SPEED * 1.7 * dt;
  e.x += errand.dirX * step;
  e.z += errand.dirZ * step;
  e.fx = errand.dirX;
  e.fz = errand.dirZ;
  errand.traveled += step;

  for (const u of [...w.enemiesOf(e.team)]) {
    if (u.kind === 'keg' || errand.hitIds.has(u.id)) continue;
    if (
      !inRect(fromX, fromZ, errand.dirX, errand.dirZ, step + 0.5, errand.width, u.x, u.z, u.radius)
    )
      continue;
    errand.hitIds.add(u.id);
    dealDamage(w, { source: owner, label: 'q' }, u, errand.damage, errand.dtype);
    // The snack: he steals speed off the FIRST champion he reaches, once per dash.
    if (errand.stealMs && u.kind === 'champion' && !u.dead) {
      applyBuffById(u, 'piper_snack_stolen');
      applyBuffById(owner, 'piper_snack_ms');
      errand.stealMs = undefined;
      w.fx('piper.q.steal', u.x, u.z, { source: owner.id, target: u.id });
    }
    w.fx('piper.pet.nip', u.x, u.z, { source: owner.id, target: u.id });
  }

  if (errand.traveled >= errand.maxDist) errand.returning = true;
}

function nearestEnemy(w: World, pet: Entity, owner: Entity, range: number): Entity | undefined {
  let best: Entity | undefined;
  let bestD = range;
  for (const u of w.enemiesOf(owner.team)) {
    if (u.kind === 'keg') continue;
    const d = dist(pet.x, pet.z, u.x, u.z) - u.radius;
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

/** Step toward a point; returns the remaining distance after moving. */
function moveTo(e: Entity, tx: number, tz: number, speed: number, dt: number): number {
  const d = dist(e.x, e.z, tx, tz);
  if (d < 0.001) return 0;
  const step = Math.min(d, speed * dt);
  const [dx, dz] = norm(tx - e.x, tz - e.z);
  e.x += dx * step;
  e.z += dz * step;
  if (step > 0.01) {
    e.fx = dx;
    e.fz = dz;
  }
  return d - step;
}

/* --------------------------------- Pickups -------------------------------- */

/** Piper's Snack Toss: first ally to touch it eats it; otherwise Chomp does. */
export function updatePickup(w: World, e: Entity, dt: number): void {
  const p = e.pickup;
  if (!p) return;
  if (p.tossPhase < 1) {
    p.tossPhase = Math.min(1, p.tossPhase + dt / 0.35);
    return; // still in the air
  }
  const owner = w.get(p.owner);
  for (const u of w.champions()) {
    if (u.team !== e.team || u.dead) continue;
    if (dist(e.x, e.z, u.x, u.z) > e.radius + u.radius) continue;
    healEntity(owner ?? u, u, p.heal);
    if (p.empowersPet && owner) empowerPets(w, owner);
    w.fx('piper.w.eaten', e.x, e.z, { source: p.owner, target: u.id });
    w.remove(e.id);
    return;
  }
  p.tLeft -= dt;
  if (p.tLeft <= 0) {
    // The fox tax: nobody claimed it, so Chomp does — Piper gets half.
    if (owner && !owner.dead) {
      healEntity(owner, owner, p.heal * p.ownerFallbackFrac);
      if (p.empowersPet) empowerPets(w, owner);
    }
    w.fx('piper.w.foxtax', e.x, e.z, { source: p.owner });
    w.remove(e.id);
  }
}
