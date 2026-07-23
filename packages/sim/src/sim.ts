import {
  CHAMPIONS,
  LEVELUP_HEAL_PCT,
  LEVEL_MAX,
  TICK_DT,
  TRAINING_MAP,
  UNITS,
  type MapDef,
} from '@mini-clash/data';
import type {
  ChampionSnap,
  EntitySnap,
  IntentMsg,
  MatchConfig,
  PlayerId,
  Snapshot,
  TrainerCmd,
} from '@mini-clash/protocol';
import {
  applySpawnEffects,
  canAttack,
  tryCast,
  updateAutoAttack,
  updateCasts,
} from './abilities';
import { applyBuffById, applyCc, tickBuffs } from './buffs';
import { dealDamage } from './combat';
import { championStats, resolveScaling } from './stats';
import { applySeparation, updateMovement } from './movement';
import { NavGrid } from './navgrid';
import { updateProjectile } from './projectiles';
import { Pcg32 } from './rng';
import { dist } from './vec';
import { type Entity, World } from './world';

interface TrainerFlags {
  noCooldowns: boolean;
  infiniteEnergy: boolean;
}

const MAPS: Record<string, MapDef> = { [TRAINING_MAP.id]: TRAINING_MAP };

export class Sim {
  readonly world: World;
  private map: MapDef;
  private trainer = new Map<PlayerId, TrainerFlags>();
  private playerEnts = new Map<PlayerId, number>();

  constructor(readonly config: MatchConfig) {
    const map = MAPS[config.mapId];
    if (!map) throw new Error(`unknown map '${config.mapId}'`);
    this.map = map;
    this.world = new World(new NavGrid(map), new Pcg32(config.seed, 1));

    for (const [i, p] of config.players.entries()) {
      const def = CHAMPIONS[p.championId];
      if (!def) throw new Error(`unknown champion '${p.championId}'`);
      const spawn = map.spawns.find((s) => s.team === p.team) ?? map.spawns[0];
      const e = this.world.add({
        kind: 'champion',
        team: p.team,
        x: spawn.x,
        z: spawn.z + i * 1.6,
        fx: 1,
        fz: 0,
        radius: def.stats.radius,
        hp: def.stats.hp,
        hpMax: def.stats.hp,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        champ: {
          player: p.id,
          def,
          level: 1,
          xp: 0,
          energy: 100,
          cds: { q: 0, w: 0, r: 0 },
          aaCd: 0,
          cast: null,
          recast: null,
          leap: null,
          order: null,
          pendingOrder: null,
          path: [],
          pathVersion: 0,
          aaTarget: null,
          respawnIn: 0,
          dancing: false,
          passive: def.passive.id === 'stonewall' ? { stonewallCd: 0 } : { powderCount: 0 },
          speed: 0,
        },
      });
      this.playerEnts.set(p.id, e.id);
      this.trainer.set(p.id, { noCooldowns: false, infiniteEnergy: false });
      applySpawnEffects(this.world, e);
    }

    for (const d of map.dummies) {
      const def = UNITS[d.unit];
      if (!def) throw new Error(`unknown unit '${d.unit}'`);
      this.world.add({
        kind: 'dummy',
        team: 1,
        x: d.x,
        z: d.z,
        fx: -1,
        fz: 0,
        radius: def.radius,
        hp: def.hp,
        hpMax: def.hp,
        dead: false,
        airborne: 0,
        airborneTotal: 0,
        buffs: [],
        dummy: { def, windowDmg: 0, windowT: 0, active: false, sinceHit: 0, hitPulse: 0, homeX: d.x, homeZ: d.z },
      });
    }
  }

  private champOf(player: PlayerId): Entity | undefined {
    const id = this.playerEnts.get(player);
    return id !== undefined ? this.world.get(id) : undefined;
  }

  applyIntents(msgs: IntentMsg[]): void {
    for (const m of msgs) this.applyIntent(m);
  }

  private applyIntent(m: IntentMsg): void {
    const e = this.champOf(m.player);
    if (!e) return;
    const c = e.champ;
    if (!c) return;
    const w = this.world;
    const flags = this.trainer.get(m.player) ?? { noCooldowns: false, infiniteEnergy: false };
    const it = m.intent;

    if (it.t === 'trainer') {
      this.applyTrainer(m.player, e, it.cmd);
      return;
    }
    if (e.dead) return;

    switch (it.t) {
      case 'move': {
        const order = { kind: 'move' as const, x: it.x, z: it.z };
        c.dancing = false;
        c.aaTarget = null;
        if (c.cast?.kind === 'aa') c.cast = null; // orb-walk cancel
        if (c.cast) {
          c.pendingOrder = order;
        } else {
          c.order = order;
          c.path = [];
        }
        break;
      }
      case 'attackMove': {
        const order = { kind: 'attackMove' as const, x: it.x, z: it.z };
        c.dancing = false;
        if (c.cast && c.cast.kind !== 'aa') c.pendingOrder = order;
        else {
          c.order = order;
          c.path = [];
        }
        break;
      }
      case 'attackTarget': {
        const t = w.get(it.target);
        if (t && canAttack(e, t)) {
          c.dancing = false;
          const order = { kind: 'attackTarget' as const, target: it.target };
          if (c.cast && c.cast.kind !== 'aa') c.pendingOrder = order;
          else {
            c.order = order;
            c.path = [];
          }
        }
        break;
      }
      case 'stop': {
        c.order = null;
        c.pendingOrder = null;
        c.path = [];
        c.aaTarget = null;
        if (c.cast?.kind === 'aa') c.cast = null;
        c.dancing = false;
        break;
      }
      case 'cast': {
        const deny = tryCast(w, e, it.slot, it.x, it.z, flags.noCooldowns, flags.infiniteEnergy);
        if (deny) w.emit({ t: 'castDenied', player: m.player, reason: deny });
        break;
      }
      case 'dance': {
        if (!c.cast && !c.leap) {
          c.order = null;
          c.path = [];
          c.aaTarget = null;
          c.dancing = true;
        }
        break;
      }
    }
  }

  private applyTrainer(player: PlayerId, e: Entity, cmd: TrainerCmd): void {
    const w = this.world;
    const c = e.champ;
    if (!c) return;
    const flags = this.trainer.get(player);
    if (!flags) return;

    switch (cmd.k) {
      case 'noCooldowns':
        flags.noCooldowns = cmd.on;
        if (cmd.on) c.cds = { q: 0, w: 0, r: 0 };
        break;
      case 'infiniteEnergy':
        flags.infiniteEnergy = cmd.on;
        if (cmd.on) c.energy = 100;
        break;
      case 'levelUp': {
        if (c.level >= LEVEL_MAX) break;
        c.level++;
        const grow = c.def.stats.hpPerLevel;
        e.hpMax += grow;
        e.hp = Math.min(e.hpMax, e.hp + grow + e.hpMax * LEVELUP_HEAL_PCT);
        w.emit({ t: 'levelup', id: e.id, level: c.level });
        w.fx('generic.levelup', e.x, e.z, { source: e.id });
        break;
      }
      case 'resetDummies':
        for (const d of this.world.entities) {
          if (d.dummy) this.resetDummy(d);
        }
        break;
      case 'switchChampion': {
        const def = CHAMPIONS[cmd.championId];
        if (!def || def.id === c.def.id) break;
        c.def = def;
        c.cds = { q: 0, w: 0, r: 0 };
        c.aaCd = 0;
        c.cast = null;
        c.recast = null;
        c.leap = null;
        c.order = null;
        c.pendingOrder = null;
        c.path = [];
        c.aaTarget = null;
        c.dancing = false;
        c.passive = def.passive.id === 'stonewall' ? { stonewallCd: 0 } : { powderCount: 0 };
        e.radius = def.stats.radius;
        e.buffs = [];
        const stats = championStats(e);
        e.hpMax = stats.hpMax;
        e.hp = stats.hpMax;
        c.energy = 100;
        applySpawnEffects(w, e);
        break;
      }
    }
  }

  private resetDummy(d: Entity): void {
    if (!d.dummy) return;
    d.hp = d.hpMax;
    d.dummy.windowDmg = 0;
    d.dummy.windowT = 0;
    d.dummy.active = false;
    d.dummy.sinceHit = 0;
    d.airborne = 0;
    d.buffs = [];
    this.world.emit({ t: 'dummyReset', id: d.id });
    this.world.fx('generic.dummyreset', d.x, d.z, { target: d.id });
  }

  tick(): Snapshot {
    const w = this.world;
    const dt = TICK_DT;
    w.tick++;
    w.time = w.tick * dt;

    // 1. Casts, cooldowns, resources, leaps.
    for (const e of [...w.entities]) {
      if (e.champ && !e.dead) {
        const flags = this.trainer.get(e.champ.player) ?? { noCooldowns: false, infiniteEnergy: false };
        updateCasts(w, e, dt, flags.noCooldowns);
        if (flags.infiniteEnergy) e.champ.energy = 100;
        if (flags.noCooldowns) e.champ.cds = { q: 0, w: 0, r: 0 };
      }
    }

    // 2. Scheduled pulses (volleys).
    w.runDueTasks();

    // 3. Projectiles.
    for (const e of [...w.entities]) {
      if (e.proj) updateProjectile(w, e, dt);
    }

    // 4. Auto-attacks, then movement.
    for (const e of [...w.entities]) {
      if (e.champ) updateAutoAttack(w, e, dt);
    }
    for (const e of [...w.entities]) {
      if (e.champ) updateMovement(w, e, dt);
    }
    applySeparation(w, dt);

    // 5. Walls, kegs, dummies.
    for (const e of [...w.entities]) {
      if (e.wall) this.updateWall(e, dt);
      else if (e.keg) this.updateKeg(e, dt);
      else if (e.dummy) this.updateDummy(e, dt);
    }

    // 6. Buffs, regen, respawns.
    for (const e of [...w.entities]) {
      tickBuffs(e, dt);
      if (e.champ && !e.dead) {
        const stats = championStats(e);
        e.hpMax = stats.hpMax;
        e.hp = Math.min(e.hpMax, e.hp + e.hpMax * e.champ.def.stats.regenPctPerSec * dt);
      }
      if (e.champ && e.dead) {
        e.champ.respawnIn -= dt;
        if (e.champ.respawnIn <= 0) this.respawn(e);
      }
    }

    return this.snapshot();
  }

  private respawn(e: Entity): void {
    const c = e.champ;
    if (!c) return;
    const spawn = this.map.spawns.find((s) => s.team === e.team) ?? this.map.spawns[0];
    e.dead = false;
    e.x = spawn.x;
    e.z = spawn.z;
    e.fx = 1;
    e.fz = 0;
    const stats = championStats(e);
    e.hpMax = stats.hpMax;
    e.hp = e.hpMax;
    c.energy = 100;
    c.respawnIn = 0;
    this.world.emit({ t: 'respawn', id: e.id });
    applySpawnEffects(this.world, e);
  }

  private updateWall(e: Entity, dt: number): void {
    const wall = e.wall;
    if (!wall) return;
    wall.tLeft -= dt;
    if (wall.tLeft <= 0) {
      this.world.nav.unstampWall(wall.cells);
      this.world.remove(e.id);
      return;
    }
    // Ally slipstream aura: allies within the wall strip get the speed buff (refreshes while inside).
    if (wall.allyBuff) {
      for (const u of this.world.units()) {
        if (u.team !== e.team || u.kind !== 'champion') continue;
        const dx = u.x - e.x;
        const dz = u.z - e.z;
        const alongWall = dx * -e.fz + dz * e.fx;
        const acrossWall = dx * e.fx + dz * e.fz;
        if (Math.abs(alongWall) <= wall.length / 2 + 0.6 && Math.abs(acrossWall) <= 1.4) {
          applyBuffById(u, wall.allyBuff);
        }
      }
    }
  }

  private updateKeg(e: Entity, dt: number): void {
    const keg = e.keg;
    if (!keg) return;
    const w = this.world;

    if (e.dead) {
      // Destroyed by an attack: owner team detonates it, enemy denies it.
      if (keg.killedByTeam === undefined || keg.killedByTeam === e.team) this.detonateKeg(e);
      else {
        w.fx('generic.death', e.x, e.z, { target: e.id });
        w.remove(e.id);
      }
      return;
    }

    if (keg.tossPhase < 1) {
      keg.tossPhase = Math.min(1, keg.tossPhase + dt / 0.35);
      return; // fuse starts after landing
    }
    keg.fuseLeft -= dt;
    if (keg.fuseLeft <= 0) this.detonateKeg(e);
  }

  private detonateKeg(e: Entity): void {
    const keg = e.keg;
    if (!keg) return;
    const w = this.world;
    const ex = keg.def.explode;
    if (ex) {
      const amount = resolveScaling(ex.amount, keg.level, keg.ad, 0);
      const owner = w.get(keg.owner);
      for (const u of w.units()) {
        if (u.team === e.team || u.kind === 'keg') continue;
        if (dist(e.x, e.z, u.x, u.z) <= ex.radius + u.radius) {
          dealDamage(w, { source: owner ?? e }, u, amount, ex.type);
          if (ex.cc) applyCc(u, ex.cc);
        }
      }
    }
    w.fx('keg.explode', e.x, e.z, { source: keg.owner });
    w.remove(e.id);
  }

  private updateDummy(e: Entity, dt: number): void {
    const d = e.dummy;
    if (!d) return;
    d.hitPulse = Math.max(0, d.hitPulse - dt);
    if (d.active) {
      d.windowT += dt;
      d.sinceHit += dt;
      if (d.sinceHit >= (d.def.resetAfter ?? 4)) this.resetDummy(e);
    }
  }

  snapshot(): Snapshot {
    const w = this.world;
    const entities: EntitySnap[] = [];
    for (const e of w.entities) {
      entities.push(this.snapEntity(e));
    }
    const events = w.events;
    w.events = [];
    return { tick: w.tick, time: w.time, entities, events };
  }

  private snapEntity(e: Entity): EntitySnap {
    const base = {
      id: e.id,
      x: e.x,
      z: e.z,
      fx: e.fx,
      fz: e.fz,
      hp: e.hp,
      hpMax: e.hpMax,
      radius: e.radius,
      team: e.team,
    };
    if (e.champ) {
      const c = e.champ;
      const stats = championStats(e);
      let airborne: number | undefined;
      if (c.leap) airborne = 1 - c.leap.tLeft / c.leap.tTotal;
      else if (e.airborne > 0 && e.airborneTotal > 0) airborne = 1 - e.airborne / e.airborneTotal;
      const snap: ChampionSnap = {
        ...base,
        kind: 'champion',
        player: c.player,
        championId: c.def.id,
        dead: e.dead,
        respawnIn: Math.max(0, c.respawnIn),
        energy: c.energy,
        level: c.level,
        cooldowns: { ...c.cds },
        cooldownMax: {
          q: c.def.abilities.q.cooldown,
          w: c.def.abilities.w.cooldown,
          r: c.def.abilities.r.cooldown,
        },
        speed: c.speed,
        buffs: e.buffs.map((b) => ({ id: b.id, tLeft: b.tLeft, stacks: b.stacks })),
        passive: { ...c.passive },
        dancing: c.dancing,
        stats: {
          ad: Math.round(stats.ad),
          attackSpeed: stats.attackSpeed,
          moveSpeed: stats.moveSpeed,
          armor: Math.round(stats.armor),
          ward: Math.round(stats.ward),
        },
      };
      if (c.recast) snap.recast = { slot: c.recast.slot, tLeft: c.recast.tLeft };
      if (c.cast) {
        snap.casting = {
          kind: c.cast.kind,
          progress: 1 - c.cast.tLeft / c.cast.tTotal,
          aimX: c.cast.aimX,
          aimZ: c.cast.aimZ,
        };
      }
      if (airborne !== undefined) snap.airborne = airborne;
      return snap;
    }
    if (e.dummy) {
      const d = e.dummy;
      const dps = d.active && d.windowT > 0 ? d.windowDmg / Math.max(d.windowT, 0.5) : 0;
      return {
        ...base,
        kind: 'dummy',
        unitId: d.def.id,
        dps: Math.round(dps),
        windowActive: d.active,
        hitPulse: d.hitPulse,
        ccKind: e.airborne > 0 ? 'knockup' : e.buffs.some((b) => b.id.startsWith('cc_slow')) ? 'slow' : undefined,
      };
    }
    if (e.keg) {
      return { ...base, kind: 'keg', fuseLeft: Math.max(0, e.keg.fuseLeft), tossPhase: e.keg.tossPhase < 1 ? e.keg.tossPhase : undefined };
    }
    if (e.wall) {
      return { ...base, kind: 'wall', length: e.wall.length, tLeft: e.wall.tLeft, duration: e.wall.duration };
    }
    const p = e.proj;
    if (p) {
      return {
        ...base,
        kind: 'projectile',
        projId: p.def?.id ?? 'aa',
        style: p.style,
        color: p.color,
        size: p.size,
        travelFrac: Math.min(1, p.traveled / p.maxRange),
      };
    }
    throw new Error('unknown entity shape');
  }
}
