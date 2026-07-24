import { BRIDGE, type MapDef, type Team, UNITS } from '@mini-clash/data';
import { isHiddenFrom } from './brush';
import { dealDamage, structureInvulnerable } from './combat';
import { dist, norm } from './vec';
import type { Entity, MiniState, World } from './world';

/**
 * Mini waves (GAME_DESIGN §13.1): 3 Bruisers + 2 Zappers per gate every 25 s,
 * every 3rd wave adds a Ram. March the lane, brawl what they meet, siege what falls.
 */

type Battle = NonNullable<MapDef['battle']>;

export function spawnWave(w: World, battle: Battle, waveIndex: number): void {
  const withRam = waveIndex % BRIDGE.wave.ramEvery === 0;
  for (const gate of battle.gates) {
    const dir = gate.team === 0 ? 1 : -1;
    // All slots sit lane-side of the gate — the Core's nav stamp is right behind it.
    let slots: { unit: string; dx: number; dz: number }[];
    if (w.match?.overtime) {
      // Corebreaker: every wave is all-Rams (GAME_DESIGN §5).
      slots = Array.from({ length: BRIDGE.overtime.waveRams }, (_, i) => ({
        unit: 'mini_ram',
        dx: 1.2 + (i % 2) * 1.4,
        dz: i < 2 ? -0.9 : 0.9,
      }));
    } else {
      slots = [
        { unit: 'mini_bruiser', dx: 2.2, dz: -1.2 },
        { unit: 'mini_bruiser', dx: 2.4, dz: 0 },
        { unit: 'mini_bruiser', dx: 2.2, dz: 1.2 },
        { unit: 'mini_zapper', dx: 1.0, dz: -0.7 },
        { unit: 'mini_zapper', dx: 1.0, dz: 0.7 },
      ];
      if (withRam) slots.push({ unit: 'mini_ram', dx: 3.6, dz: 0 });
    }
    for (const s of slots) spawnMini(w, s.unit, gate.team, gate.x + dir * s.dx, gate.z + s.dz);
  }
  w.fx('wave.spawn', 0, 0, {});
}

function spawnMini(w: World, unitId: string, team: Team, x: number, z: number): void {
  const def = UNITS[unitId];
  const mini = def?.mini;
  if (!def || !mini) throw new Error(`unknown mini '${unitId}'`);
  [x, z] = w.nav.nearestOpen(x, z);
  const scale = 1 + mini.scalePerMin * (w.time / 60);
  const hp = Math.round(def.hp * scale);
  w.add({
    kind: 'mini',
    team,
    x,
    z,
    fx: team === 0 ? 1 : -1,
    fz: 0,
    radius: def.radius,
    hp,
    hpMax: hp,
    dead: false,
    airborne: 0,
    airborneTotal: 0,
    buffs: [],
    mini: {
      def,
      waypoint: 1,
      targetId: null,
      atkCd: 0.4,
      attacking: false,
      damage: mini.damage * scale,
      path: [],
      pathVersion: 0,
      goalX: x,
      goalZ: z,
    },
  });
}

function lanePoint(battle: Battle, team: Team, step: number): [number, number] {
  const lane = battle.lane;
  const idx = team === 0 ? step : lane.length - 1 - step;
  return lane[Math.max(0, Math.min(lane.length - 1, idx))];
}

export function updateMini(w: World, e: Entity, battle: Battle, dt: number): void {
  const m = e.mini;
  if (!m) return;
  if (e.dead) {
    w.remove(e.id);
    return;
  }
  if (e.airborne > 0) {
    m.attacking = false;
    return;
  }
  m.atkCd = Math.max(0, m.atkCd - dt);
  const spec = m.def.mini;
  if (!spec) return;

  // Feared (Grukk's Bellow): scatter away from the nearest enemy champion.
  if (e.buffs.some((b) => b.id === 'cc_fear')) {
    m.attacking = false;
    m.targetId = null;
    let scary: Entity | undefined;
    let scaryD = Number.POSITIVE_INFINITY;
    for (const u of w.champions()) {
      if (u.team === e.team) continue;
      const d = dist(e.x, e.z, u.x, u.z);
      if (d < scaryD) {
        scaryD = d;
        scary = u;
      }
    }
    if (scary) {
      const [dx, dz] = norm(e.x - scary.x, e.z - scary.z);
      moveToward(w, e, m, e.x + dx * 4, e.z + dz * 4, spec.moveSpeed * speedMul(e), dt);
    }
    return;
  }

  // Re-acquire on a staggered cadence (or when the target is gone).
  const targetEnt = m.targetId !== null ? w.get(m.targetId) : undefined;
  const targetGone =
    !targetEnt || targetEnt.dead || dist(e.x, e.z, targetEnt.x, targetEnt.z) > spec.aggroRange + 3;
  if (targetGone || (w.tick + e.id) % 8 === 0) {
    m.targetId = acquire(w, e, spec)?.id ?? null;
  }

  const target = m.targetId !== null ? w.get(m.targetId) : undefined;
  if (target && !target.dead) {
    const gap = dist(e.x, e.z, target.x, target.z) - target.radius;
    if (gap <= spec.range) {
      const [fx, fz] = norm(target.x - e.x, target.z - e.z);
      e.fx = fx;
      e.fz = fz;
      m.attacking = true;
      m.path = [];
      if (m.atkCd <= 0) {
        commitAttack(w, e, target);
        m.atkCd = spec.attackInterval;
      }
      return;
    }
    m.attacking = false;
    moveToward(w, e, m, target.x, target.z, spec.moveSpeed * speedMul(e), dt);
    return;
  }

  // March: next lane waypoint, then the enemy Core. The reach radius must exceed
  // any nearestOpen clamp around stamped structures or minis wedge at waypoints.
  m.attacking = false;
  let [gx, gz] = lanePoint(battle, e.team, m.waypoint);
  const lastStep = battle.lane.length - 1;
  if (m.waypoint >= lastStep) {
    const core = battle.cores.find((c) => c.team !== e.team);
    if (core) {
      gx = core.x;
      gz = core.z;
    }
  } else if (dist(e.x, e.z, gx, gz) <= 2.4) {
    m.waypoint++;
    [gx, gz] = lanePoint(battle, e.team, m.waypoint);
  }
  moveToward(w, e, m, gx, gz, spec.moveSpeed * speedMul(e), dt);
}

/** Slow/haste multipliers from buffs (Minis can be slowed like anyone). */
function speedMul(e: Entity): number {
  let mul = 1;
  for (const b of e.buffs) {
    if (b.def.mul?.moveSpeed !== undefined) mul *= b.def.mul.moveSpeed ** b.stacks;
  }
  return mul;
}

/** Target priority: enemy Minis > champions > vulnerable structures; Rams siege first. */
function acquire(
  w: World,
  e: Entity,
  spec: NonNullable<MiniState['def']['mini']>,
): Entity | undefined {
  const ram = spec.kind === 'ram';
  let bestMini: Entity | undefined;
  let bestChamp: Entity | undefined;
  let dMini = Number.POSITIVE_INFINITY;
  let dChamp = Number.POSITIVE_INFINITY;
  for (const u of w.units()) {
    if (u.team === e.team || u.kind === 'keg' || u.kind === 'dummy') continue;
    const d = dist(e.x, e.z, u.x, u.z);
    if (d > spec.aggroRange + u.radius) continue;
    if (u.kind === 'mini' && d < dMini) {
      dMini = d;
      bestMini = u;
    } else if (u.kind === 'champion' && d < dChamp && !isHiddenFrom(w, e.team, u)) {
      dChamp = d;
      bestChamp = u;
    }
  }
  let bestStruct: Entity | undefined;
  let dStruct = Number.POSITIVE_INFINITY;
  for (const s of w.structures()) {
    if (s.team === e.team || structureInvulnerable(w, s)) continue;
    const d = dist(e.x, e.z, s.x, s.z) - s.radius;
    if (d <= spec.aggroRange && d < dStruct) {
      dStruct = d;
      bestStruct = s;
    }
  }
  if (ram) {
    // Rams ignore units unless point-blank; the battering log is for gates.
    if (bestStruct) return bestStruct;
    if (bestMini && dMini <= 2.2) return bestMini;
    if (bestChamp && dChamp <= 2.2) return bestChamp;
    return undefined;
  }
  return bestMini ?? bestChamp ?? bestStruct;
}

function commitAttack(w: World, e: Entity, target: Entity): void {
  const m = e.mini;
  const spec = m?.def.mini;
  if (!m || !spec) return;
  if (spec.kind === 'zapper') {
    const [dx, dz] = norm(target.x - e.x, target.z - e.z);
    w.fx('mini.zap.fire', e.x, e.z, { source: e.id });
    w.add({
      kind: 'projectile',
      team: e.team,
      x: e.x + dx * (e.radius + 0.15),
      z: e.z + dz * (e.radius + 0.15),
      fx: dx,
      fz: dz,
      radius: 0.12,
      hp: 1,
      hpMax: 1,
      dead: false,
      airborne: 0,
      airborneTotal: 0,
      buffs: [],
      proj: {
        style: 'aa',
        owner: e.id,
        ownerPlayer: -1,
        dirX: dx,
        dirZ: dz,
        speed: 11,
        traveled: 0,
        maxRange: spec.range + 5,
        pulsesFired: 0,
        hitIds: new Set(),
        target: target.id,
        damage: m.damage,
        dtype: 'arcane',
        color: 0x9fd8ff,
        size: 0.12,
      },
    });
    return;
  }
  w.fx('mini.melee.hit', target.x, target.z, { source: e.id, target: target.id });
  dealDamage(w, { source: e, tag: 'unit' }, target, m.damage, 'physical');
}

function moveToward(
  w: World,
  e: Entity,
  m: MiniState,
  gx: number,
  gz: number,
  speed: number,
  dt: number,
): void {
  if (
    m.path.length === 0 ||
    m.pathVersion !== w.nav.version ||
    dist(m.goalX, m.goalZ, gx, gz) > 1.2
  ) {
    m.path = w.nav.findPath(e.x, e.z, gx, gz);
    m.pathVersion = w.nav.version;
    m.goalX = gx;
    m.goalZ = gz;
    if (m.path.length === 0) {
      // Wedged in a blocked pocket (knocked into a stamp): step to open ground.
      if (w.nav.isBlockedAt(e.x, e.z)) {
        [e.x, e.z] = w.nav.nearestOpen(e.x, e.z);
      }
      return;
    }
  }
  let remaining = speed * dt;
  while (remaining > 0.0001 && m.path.length > 0) {
    const [wx, wz] = m.path[0];
    const d = dist(e.x, e.z, wx, wz);
    if (d <= remaining) {
      e.x = wx;
      e.z = wz;
      remaining -= d;
      m.path.shift();
    } else {
      const [dx, dz] = norm(wx - e.x, wz - e.z);
      e.x += dx * remaining;
      e.z += dz * remaining;
      e.fx = dx;
      e.fz = dz;
      remaining = 0;
    }
  }
}
