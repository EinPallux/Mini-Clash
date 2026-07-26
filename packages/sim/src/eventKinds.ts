import { BRIDGE, EVENTS, type Team } from '@mini-clash/data';
import { economyMods } from './augments';
import { applyBuff, applyCc } from './buffs';
import { dealDamage } from './combat';
import { type EventHooks, logEvent } from './events';
import { dist } from './vec';
import type { Entity, EventState, World } from './world';

/**
 * What each Living Bridge event actually *does* (GAME_DESIGN §9).
 *
 * `events.ts` owns the timetable; this file owns behaviour, one branch per
 * event kind. Everything is deterministic: positions come from the event
 * params, randomness from `w.rng`, timing from tick counts.
 */

/* ------------------------------ Flank Isles ------------------------------ */

/**
 * Two platforms rise N and S of mid for a minute, each carrying an orb.
 *
 * They are carved out of the void with `openRegion`, which hands back a receipt
 * the framework restores on retirement — so the isles cannot leak walkable
 * cells into a match that has moved on. Anything still standing on one when it
 * falls is placed back on the deck rather than stranded over the drop.
 */
function startIsles(w: World, ev: EventState): void {
  const p = EVENTS.flankIsles.params;
  for (const sign of [-1, 1] as const) {
    const cz = sign * p.offsetZ;
    ev.patches.push(w.nav.openRegion(0, cz, p.width, p.depth));
    // Light-bridge connectors: without them the isle is decorative, because
    // the void between deck and platform is still closed.
    const gapCentre = sign * ((BRIDGE.collapse.deckHalves[0] + (p.offsetZ - p.depth / 2)) / 2);
    const gapDepth = p.offsetZ - p.depth / 2 - BRIDGE.collapse.deckHalves[0] + 1.4;
    ev.patches.push(w.nav.openRegion(0, gapCentre, p.bridgeWidth, Math.max(1, gapDepth)));

    const orb = w.add({
      kind: 'orb',
      team: 0,
      x: 0,
      z: cz,
      fx: 1,
      fz: 0,
      radius: BRIDGE.orb.radius,
      hp: 1,
      hpMax: 1,
      dead: false,
      airborne: 0,
      airborneTotal: 0,
      buffs: [],
    });
    ev.owned.push(orb.id);
    w.fx('event.isles.rise', 0, cz, { fz: sign });
  }
  logEvent(w, 'flankIsles', null, 'Flank Isles rose');
}

/** Put anyone still out there back on the deck before the platform goes. */
function endIsles(w: World, _ev: EventState): void {
  const p = EVENTS.flankIsles.params;
  const deckHalf = w.match?.deckHalf ?? BRIDGE.collapse.deckHalves[0];
  for (const u of w.entities) {
    if (!isMovableUnit(u)) continue;
    if (Math.abs(u.z) <= deckHalf) continue;
    const [nx, nz] = w.nav.nearestOpen(u.x, Math.sign(u.z) * (deckHalf - 1));
    u.x = nx;
    u.z = nz;
    if (u.champ) u.champ.path = [];
    if (u.mini) u.mini.path = [];
  }
  for (const sign of [-1, 1] as const) w.fx('event.isles.fall', 0, sign * p.offsetZ, { fz: sign });
}

/**
 * Can this entity be picked up and put down somewhere else?
 *
 * Only things that walk. Anything that owns *stamped nav cells* — a Rook wall,
 * a Boltz bunker — must never be teleported: the stamp stays where the geometry
 * was, and the entity walks away from it, leaving a phantom obstacle that never
 * lifts and quietly poisons pathing for the rest of the match.
 */
export function isMovableUnit(u: Entity): boolean {
  if (u.dead) return false;
  return u.kind === 'champion' || u.kind === 'mini' || u.kind === 'pet' || u.kind === 'golem';
}

/* ------------------------------- Coin Rain ------------------------------- */

/**
 * A marked zone showers coins for 20 s. Coins are `pickup` entities with no
 * heal — they pay gold on touch, to whoever touches them first.
 */
function tickCoinRain(w: World, ev: EventState, dt: number): void {
  const p = EVENTS.coinRain.params;
  const zx = ev.data.x ?? 0;
  const zz = ev.data.z ?? 0;
  // Drop coins on a steady cadence rather than all at once — the scramble is
  // the point, and a single pile would resolve in one step.
  const per = EVENTS.coinRain.duration / p.coins;
  ev.data.acc = (ev.data.acc ?? 0) + dt;
  while (ev.data.acc >= per && (ev.data.dropped ?? 0) < p.coins) {
    ev.data.acc -= per;
    ev.data.dropped = (ev.data.dropped ?? 0) + 1;
    const ang = w.rng.float() * Math.PI * 2;
    const rad = Math.sqrt(w.rng.float()) * p.radius;
    const [cx, cz] = w.nav.nearestOpen(zx + Math.cos(ang) * rad, zz + Math.sin(ang) * rad);
    const coin = w.add({
      kind: 'pickup',
      team: 0,
      x: cx,
      z: cz,
      fx: 1,
      fz: 0,
      radius: p.pickupRadius,
      hp: 1,
      hpMax: 1,
      dead: false,
      airborne: 0,
      airborneTotal: 0,
      buffs: [],
      coin: {
        gold: p.goldMin + w.rng.int(Math.max(1, p.goldMax - p.goldMin + 1)),
        tLeft: p.coinLife,
      },
    });
    w.fx('event.coin.drop', cx, cz, { source: coin.id });
  }
}

/** Coins live outside the event's `owned` list so they outlast the shower. */
export function updateCoins(w: World, dt: number): void {
  for (const e of [...w.entities]) {
    const coin = e.coin;
    if (!coin || e.dead) continue;
    coin.tLeft -= dt;
    if (coin.tLeft <= 0) {
      w.remove(e.id);
      continue;
    }
    for (const u of w.champions()) {
      if (u.dead) continue;
      if (dist(u.x, u.z, e.x, e.z) > e.radius + u.radius) continue;
      const c = u.champ;
      if (!c) continue;
      const econ = c.augments.length > 0 ? economyMods(u) : null;
      c.gold += coin.gold * (econ?.goldMul ?? 1);
      w.fx('event.coin.pickup', e.x, e.z, { source: u.id });
      w.remove(e.id);
      break;
    }
  }
}

/* ------------------------------ Storm Front ------------------------------ */

/**
 * A wall of lightning crosses the whole bridge over 25 s. It is a moving band
 * rather than an entity: the sweep position is a pure function of how far
 * through the event we are, which keeps it exact under any tick rate.
 */
function tickStorm(w: World, ev: EventState, dt: number): void {
  const p = EVENTS.stormFront.params;
  const span = w.nav.cols * w.nav.cell;
  const t = 1 - ev.tLeft / Math.max(0.001, ev.tTotal);
  // Direction is rolled at start so it does not always favour the same side.
  const dir = ev.data.dir ?? 1;
  const centre = dir > 0 ? -span / 2 + t * span : span / 2 - t * span;
  ev.data.centre = centre;

  for (const u of w.champions()) {
    if (u.dead) continue;
    if (Math.abs(u.x - centre) > p.depth / 2 + u.radius) continue;
    const c = u.champ;
    // Grounding Rod: the little lightning-rod backpack is not decorative.
    const econ = c && c.augments.length > 0 ? economyMods(u) : null;
    const mul = econ?.eventDamageMul ?? 1;
    dealDamage(
      w,
      { source: u, tag: 'burn', label: 'storm' },
      u,
      u.hpMax * p.dpsPctMaxHp * mul * dt,
      'arcane',
    );
    applyCc(u, { kind: 'slow', duration: p.slowSeconds, strength: p.slow });
  }
  if (w.tick % 6 === 0) w.fx('event.storm.tick', centre, 0, {});
}

/* ------------------------------ Clash Golem ------------------------------ */

/** Scale the golem to when it woke — a 10:30 golem is not a 6:00 golem. */
function golemStats(w: World, elder: boolean): { hp: number; damage: number } {
  const p = EVENTS.clashGolem.params;
  const mins = w.time / 60;
  const mul = elder ? p.elderMul : 1;
  return {
    hp: (p.hp + p.hpPerMin * mins) * mul,
    damage: (p.damage + p.damagePerMin * mins) * mul,
  };
}

function startGolem(w: World, ev: EventState): void {
  const p = EVENTS.clashGolem.params;
  const s = golemStats(w, ev.elder);
  const g = w.add({
    kind: 'golem',
    // Team 0 by convention while neutral; `golem.owner === null` is what
    // actually decides who it fights, so nothing reads this until conversion.
    team: 0,
    x: 0,
    z: 0,
    fx: 1,
    fz: 0,
    radius: p.radius,
    hp: s.hp,
    hpMax: s.hp,
    dead: false,
    airborne: 0,
    airborneTotal: 0,
    buffs: [],
    golem: {
      elder: ev.elder,
      owner: null,
      damage: s.damage,
      atkCd: p.attackEvery,
      targetId: null,
      lane: 0,
      auraCd: 0,
      siegeLeft: p.siegeSeconds,
    },
  });
  ev.owned.push(g.id);
  ev.data.golemId = g.id;
  w.fx('event.golem.wake', 0, 0, { source: g.id });
  logEvent(w, 'clashGolem', null, ev.elder ? 'Elder Golem woke' : 'Clash Golem woke');
}

/**
 * The golem retires its own event the moment it is taken — a converted golem
 * belongs to the match, not to the window that spawned it, so it is removed
 * from `owned` and left to march.
 */
export function onGolemKilled(w: World, g: Entity, by: Entity | undefined): void {
  const gs = g.golem;
  const m = w.match;
  if (!gs || !m) return;
  const team = (by?.team ?? 0) as Team;
  gs.owner = team;
  g.team = team;
  // Start it at the lane step it is actually standing on. Starting from 0 would
  // send it home first — the altar is mid-lane, so step 0 is the *owner's own*
  // gate, and a siege engine that marches backwards is worse than no golem.
  gs.lane = laneStepNear(w, team, g.x, g.z);
  gs.siegeLeft = EVENTS.clashGolem.params.siegeSeconds;
  g.dead = false;
  const s = golemStats(w, gs.elder);
  g.hpMax = s.hp;
  g.hp = s.hp;
  gs.targetId = null;
  w.emit({ t: 'golemTaken', team, elder: gs.elder });
  w.fx('event.golem.convert', g.x, g.z, { source: g.id });
  logEvent(
    w,
    'clashGolem',
    team,
    `${gs.elder ? 'Elder Golem' : 'Clash Golem'} — ${team === 0 ? 'West' : 'East'}`,
  );
  // Hand it over: the event is done, the siege engine is not.
  for (const ev of m.events) {
    const i = ev.owned.indexOf(g.id);
    if (i >= 0) {
      ev.owned.splice(i, 1);
      ev.tLeft = 0;
    }
  }
}

/**
 * Which step along `team`'s lane is closest to this point. The lane is authored
 * for team 0; team 1 walks it reversed, so the step index has to be mirrored.
 */
function laneStepNear(w: World, team: Team, x: number, z: number): number {
  const lane = w.match?.lane;
  if (!lane || lane.length === 0) return 0;
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < lane.length; i++) {
    const d = dist(x, z, lane[i][0], lane[i][1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return team === 0 ? best : lane.length - 1 - best;
}

/* -------------------------------- Wiring -------------------------------- */

export const EVENT_HOOKS: EventHooks = {
  start(w, ev) {
    switch (ev.kind) {
      case 'flankIsles':
        startIsles(w, ev);
        break;
      case 'coinRain': {
        // Somewhere on the deck, but never inside a fountain plate.
        const p = EVENTS.coinRain.params;
        const span = (w.nav.cols * w.nav.cell) / 2 - 24;
        ev.data.x = (w.rng.float() * 2 - 1) * span;
        ev.data.z = (w.rng.float() * 2 - 1) * ((w.match?.deckHalf ?? 9) - p.radius);
        w.fx('event.coin.zone', ev.data.x, ev.data.z, {});
        logEvent(w, 'coinRain', null, 'Coin Rain');
        break;
      }
      case 'stormFront':
        ev.data.dir = w.rng.int(2) === 0 ? -1 : 1;
        w.fx('event.storm.start', 0, 0, { fx: ev.data.dir });
        logEvent(w, 'stormFront', null, 'Storm Front swept the bridge');
        break;
      case 'clashGolem':
        startGolem(w, ev);
        break;
    }
  },
  tick(w, ev, dt) {
    switch (ev.kind) {
      case 'coinRain':
        tickCoinRain(w, ev, dt);
        break;
      case 'stormFront':
        tickStorm(w, ev, dt);
        break;
      default:
        break;
    }
  },
  end(w, ev) {
    if (ev.kind === 'flankIsles') endIsles(w, ev);
    if (ev.kind === 'stormFront') w.fx('event.storm.end', 0, 0, {});
  },
};

/** Shield pulse from an Elder golem's siege aura (§9). */
export function elderShield(w: World, g: Entity, dt: number): void {
  const gs = g.golem;
  if (!gs || !gs.elder || gs.owner === null) return;
  const p = EVENTS.clashGolem.params;
  gs.auraCd -= dt;
  if (gs.auraCd > 0) return;
  gs.auraCd = p.elderShieldEvery;
  for (const u of w.champions()) {
    if (u.team !== gs.owner || u.dead) continue;
    if (dist(u.x, u.z, g.x, g.z) > p.auraRadius + u.radius) continue;
    applyBuff(u, {
      id: 'golem_aegis',
      name: 'Elder Aegis',
      duration: p.elderShieldEvery,
      shield: u.hpMax * p.elderShieldPct,
    });
  }
  w.fx('event.golem.aegis', g.x, g.z, { source: g.id });
}
