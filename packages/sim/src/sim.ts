import {
  BRIDGE,
  CHAMPIONS,
  type MapDef,
  SHATTERBRIDGE_MAP,
  TICK_DT,
  TRAINING_MAP,
  UNITS,
} from '@mini-clash/data';
import type {
  ChampionSnap,
  EntitySnap,
  IntentMsg,
  MatchConfig,
  MatchStateSnap,
  PlayerId,
  Snapshot,
  TrainerCmd,
} from '@mini-clash/protocol';
import { applySpawnEffects, canAttack, tryCast, updateAutoAttack, updateCasts } from './abilities';
import { healEntity, plantFlower } from './actions';
import { type BotBrain, makeBrain, thinkBots } from './bots';
import { isHiddenFrom, updateBrushState } from './brush';
import { applyBuff, applyBuffById, applyCc, shieldTotal, tickBuffs } from './buffs';
import { dealDamage } from './combat';
import { levelUpChamp, updateIncome, updateOrbs } from './economy';
import { tryBuy, tryBuyRelic, trySell, tryUseRelic, updateItemPassives } from './items';
import { spawnWave, updateMini } from './minis';
import { applySeparation, updateMovement } from './movement';
import { NavGrid } from './navgrid';
import { updateProjectile } from './projectiles';
import { Pcg32 } from './rng';
import { championStats, hastedCooldown, resolveScaling } from './stats';
import { spawnStructures, updateCore, updateTower } from './structures';
import { dist } from './vec';
import { type Entity, World } from './world';

interface TrainerFlags {
  noCooldowns: boolean;
  infiniteEnergy: boolean;
}

const MAPS: Record<string, MapDef> = {
  [TRAINING_MAP.id]: TRAINING_MAP,
  [SHATTERBRIDGE_MAP.id]: SHATTERBRIDGE_MAP,
};

export class Sim {
  readonly world: World;
  private map: MapDef;
  private trainer = new Map<PlayerId, TrainerFlags>();
  private playerEnts = new Map<PlayerId, number>();
  private brains = new Map<PlayerId, BotBrain>();
  /** Concealment viewpoint for snapshots: the human player's team. */
  private viewerTeam: 0 | 1 = 0;

  constructor(readonly config: MatchConfig) {
    const map = MAPS[config.mapId];
    if (!map) throw new Error(`unknown map '${config.mapId}'`);
    this.map = map;
    this.world = new World(new NavGrid(map), new Pcg32(config.seed, 1));
    const w = this.world;
    const bridge = config.mode === 'bridge';

    if (bridge && !map.battle) throw new Error(`map '${map.id}' has no battle layout`);
    w.spawnPoints = {
      0: this.teamSpawn(0),
      1: this.teamSpawn(1),
    };
    if (map.battle) w.brushRects = map.battle.brush;

    if (bridge && map.battle) {
      const battle = map.battle;
      w.match = {
        mode: 'bridge',
        barrierDown: false,
        barrierCells: battle.gates.flatMap((g) => w.nav.stampWall(g.x, g.z, 1, 0, map.height, 0.8)),
        teamKills: [0, 0],
        towersDown: [0, 0],
        structDamage: [0, 0],
        over: null,
        nextOrbAt: battle.firstOrbAt,
        nextWaveAt: battle.firstWaveAt,
        waveIndex: 0,
        overtime: false,
        suddenDeath: false,
      };
      spawnStructures(w, battle);
    } else {
      w.match = {
        mode: 'training',
        barrierDown: true,
        barrierCells: [],
        teamKills: [0, 0],
        towersDown: [0, 0],
        structDamage: [0, 0],
        over: null,
        nextOrbAt: null,
        nextWaveAt: null,
        waveIndex: 0,
        overtime: false,
        suddenDeath: false,
      };
    }

    const teamCounts: Record<0 | 1, number> = { 0: 0, 1: 0 };
    const human = config.players.find((p) => !p.bot);
    this.viewerTeam = human?.team ?? 0;

    for (const p of config.players) {
      const def = CHAMPIONS[p.championId];
      if (!def) throw new Error(`unknown champion '${p.championId}'`);
      const spawn = w.spawnPoints[p.team];
      const idx = teamCounts[p.team]++;
      const e = w.add({
        kind: 'champion',
        team: p.team,
        x: spawn.x,
        z: spawn.z + (idx - 1.5) * 1.6,
        fx: p.team === 0 ? 1 : -1,
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
          bot: p.bot ?? null,
          name: p.name ?? def.name,
          level: 1,
          xp: 0,
          gold: bridge ? BRIDGE.startingGold : 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          streak: 0,
          items: [],
          relic: null,
          recentDamagers: new Map(),
          itemState: {},
          lastCombatAt: -100,
          lastDamagedAt: -100,
          lastChampHitAt: -100,
          lastActionAt: -100,
          inBrush: false,
          brushIdx: -1,
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
      if (p.bot) this.brains.set(p.id, makeBrain(config.seed, p.id, p.bot));
      applySpawnEffects(w, e);
    }

    for (const d of map.dummies) {
      const def = UNITS[d.unit];
      if (!def) throw new Error(`unknown unit '${d.unit}'`);
      w.add({
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
        dummy: {
          def,
          windowDmg: 0,
          windowT: 0,
          active: false,
          sinceHit: 0,
          hitPulse: 0,
          homeX: d.x,
          homeZ: d.z,
        },
      });
    }
  }

  private teamSpawn(team: 0 | 1): { x: number; z: number } {
    const s = this.map.spawns.find((sp) => sp.team === team) ?? this.map.spawns[0];
    return { x: s.x, z: s.z };
  }

  private champOf(player: PlayerId): Entity | undefined {
    const id = this.playerEnts.get(player);
    return id !== undefined ? this.world.get(id) : undefined;
  }

  applyIntents(msgs: IntentMsg[]): void {
    if (this.world.match?.over) return; // frozen: the podium owns the screen
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
      if (w.match?.mode === 'bridge') return; // trainer cheats are Training Grounds only
      this.applyTrainer(m.player, e, it.cmd);
      return;
    }
    // Shop intents work while dead (the death screen is the shop).
    switch (it.t) {
      case 'buy':
        tryBuy(w, e, it.itemId);
        return;
      case 'buyRelic':
        tryBuyRelic(w, e, it.relicId);
        return;
      case 'sell':
        trySell(w, e, it.itemId);
        return;
      default:
        break;
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
        if (t && canAttack(w, e, t)) {
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
      case 'useRelic': {
        tryUseRelic(w, e, it.x, it.z);
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
      case 'levelUp':
        levelUpChamp(w, e);
        break;
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

    if (w.match?.over) {
      // Victory freeze: the world holds its pose for the podium sequence.
      return this.snapshot();
    }

    // 0. Bot brains issue intents through the same pipe as players.
    if (this.brains.size > 0) {
      const intents = thinkBots(w, this.map, this.brains);
      for (const m of intents) this.applyIntent(m);
    }

    // 1. Casts, cooldowns, resources, leaps.
    for (const e of [...w.entities]) {
      if (e.champ && !e.dead) {
        const flags = this.trainer.get(e.champ.player) ?? {
          noCooldowns: false,
          infiniteEnergy: false,
        };
        updateCasts(w, e, dt, flags.noCooldowns);
        if (flags.infiniteEnergy) e.champ.energy = 100;
        if (flags.noCooldowns) e.champ.cds = { q: 0, w: 0, r: 0 };
      }
      if (e.champ?.relic) e.champ.relic.cd = Math.max(0, e.champ.relic.cd - dt);
    }

    // 2. Scheduled pulses (volleys, burns).
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

    // 5. Minis, structures, walls, kegs, dummies, flowers, zones.
    const battle = this.map.battle;
    for (const e of [...w.entities]) {
      if (e.mini && battle) updateMini(w, e, battle, dt);
      else if (e.tower) updateTower(w, e, dt);
      else if (e.core) updateCore(w, e, dt);
      else if (e.wall) this.updateWall(e, dt);
      else if (e.keg) this.updateKeg(e, dt);
      else if (e.dummy) this.updateDummy(e, dt);
      else if (e.flower) this.updateFlower(e, dt);
      else if (e.zone) this.updateZone(e, dt);
    }

    // 6. Buffs, item passives, regen, income, respawns, brush.
    for (const e of [...w.entities]) {
      tickBuffs(e, dt);
      if (e.champ && !e.dead) {
        updateItemPassives(w, e);
        this.updatePollenTrail(e);
        const stats = championStats(e);
        e.hpMax = stats.hpMax;
        e.hp = Math.min(e.hpMax, e.hp + e.hpMax * e.champ.def.stats.regenPctPerSec * dt);
        // Fountain plate: rapid recovery at your own spawn (bridge mode).
        if (w.match?.mode === 'bridge') {
          const spawn = w.spawnPoints?.[e.team];
          if (spawn && dist(e.x, e.z, spawn.x, spawn.z) <= BRIDGE.fountain.radius) {
            e.hp = Math.min(e.hpMax, e.hp + e.hpMax * BRIDGE.fountain.hpPctPerSec * dt);
            e.champ.energy = Math.min(100, e.champ.energy + BRIDGE.fountain.energyPerSec * dt);
          }
        }
        updateBrushState(w, e);
      }
      if (e.champ) updateIncome(w, e, dt);
      if (e.champ && e.dead) {
        e.champ.respawnIn -= dt;
        if (e.champ.respawnIn <= 0) this.respawn(e);
      }
    }

    // 7. Match orchestration: barrier, waves, orbs.
    this.updateMatchFlow();

    return this.snapshot();
  }

  private updateMatchFlow(): void {
    const w = this.world;
    const m = w.match;
    const battle = this.map.battle;
    if (!m || m.mode !== 'bridge' || !battle) return;

    if (!m.barrierDown && w.time >= battle.barrierUntil) {
      m.barrierDown = true;
      w.nav.unstampWall(m.barrierCells);
      m.barrierCells = [];
      w.emit({ t: 'barrierDown' });
      for (const g of battle.gates) w.fx('barrier.drop', g.x, g.z, {});
    }

    // 16:00 Corebreaker → 20:00 Sudden Death (GAME_DESIGN §5 match timeline).
    if (!m.overtime && w.time >= BRIDGE.overtime.at) {
      m.overtime = true;
      w.emit({ t: 'overtime' });
      for (const cc of battle.cores) w.fx('core.overtime', cc.x, cc.z, {});
    }
    if (!m.suddenDeath && w.time >= BRIDGE.suddenDeath.at) {
      m.suddenDeath = true;
      w.emit({ t: 'suddenDeath' });
    }
    if (m.suddenDeath && !m.over) {
      const cores: (Entity | undefined)[] = [undefined, undefined];
      for (const e of w.entities) {
        if (e.core && !e.dead) cores[e.team] = e;
      }
      for (const core of cores) {
        if (core) core.hp -= core.hpMax * BRIDGE.suddenDeath.decayPctPerSec * TICK_DT;
      }
      const dead0 = cores[0] !== undefined && (cores[0]?.hp ?? 1) <= 0;
      const dead1 = cores[1] !== undefined && (cores[1]?.hp ?? 1) <= 0;
      if (dead0 || dead1) {
        let winner: 0 | 1;
        if (dead0 && dead1) {
          // Exact tie → more structure damage dealt, then more kills (deterministic).
          winner =
            m.structDamage[0] !== m.structDamage[1]
              ? m.structDamage[0] > m.structDamage[1]
                ? 0
                : 1
              : m.teamKills[0] >= m.teamKills[1]
                ? 0
                : 1;
        } else {
          winner = dead0 ? 1 : 0;
        }
        for (const [team, core] of cores.entries()) {
          if (core && (team === 0 ? dead0 : dead1)) {
            core.hp = 0;
            core.dead = true;
            w.emit({ t: 'death', id: core.id, x: core.x, z: core.z });
            w.fx('core.destroyed', core.x, core.z, { source: core.id });
          }
        }
        m.over = { winner };
        w.emit({ t: 'matchOver', winner });
      }
    }

    if (m.nextWaveAt !== null && w.time >= m.nextWaveAt) {
      m.waveIndex++;
      spawnWave(w, battle, m.waveIndex);
      m.nextWaveAt += battle.waveEvery;
    }

    if (m.nextOrbAt !== null && w.time >= m.nextOrbAt) {
      for (const pad of battle.orbPads) {
        const occupied = w.entities.some(
          (e) => e.kind === 'orb' && !e.dead && dist(e.x, e.z, pad.x, pad.z) < 1,
        );
        if (occupied) continue;
        const orb = w.add({
          kind: 'orb',
          team: 0,
          x: pad.x,
          z: pad.z,
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
        w.fx('orb.spawn', pad.x, pad.z, { source: orb.id });
      }
      m.nextOrbAt += battle.orbEvery;
    }

    updateOrbs(w);
  }

  private respawn(e: Entity): void {
    const c = e.champ;
    if (!c) return;
    const spawn = this.world.spawnPoints?.[e.team] ?? this.teamSpawn(e.team);
    e.dead = false;
    e.x = spawn.x;
    e.z = spawn.z;
    e.fx = e.team === 0 ? 1 : -1;
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
      for (const u of [...w.units()]) {
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

  private updateFlower(e: Entity, dt: number): void {
    const f = e.flower;
    if (!f) return;
    f.tLeft -= dt;
    if (f.tLeft <= 0) this.world.remove(e.id);
  }

  private updateZone(e: Entity, dt: number): void {
    const z = e.zone;
    if (!z) return;
    const w = this.world;
    z.tLeft -= dt;
    if (z.tLeft <= 0) {
      w.remove(e.id);
      return;
    }
    const owner = w.get(z.owner);
    for (const u of w.champions()) {
      const inside = dist(e.x, e.z, u.x, u.z) <= z.radius + u.radius;
      if (!inside) continue;
      if (u.team === e.team) {
        healEntity(owner ?? u, u, z.healPerSec * dt);
        if (z.cleanseSlows && !z.cleansed.has(u.id)) {
          z.cleansed.add(u.id);
          u.buffs = u.buffs.filter((b) => !b.id.startsWith('cc_slow'));
        }
      } else {
        applyBuff(u, {
          id: 'zone_dampen',
          name: 'Dampened',
          duration: 0.25,
          damageAmp: z.enemyDamageAmp,
        });
      }
    }
  }

  /** Sylva's Pollen Trail: plant a flower every N units walked. */
  private updatePollenTrail(e: Entity): void {
    const c = e.champ;
    if (!c || c.def.passive.id !== 'pollen_trail') return;
    const p = c.def.passive.params;
    if (c.passive.pollenInit !== 1) {
      c.passive.pollenInit = 1;
      c.passive.pollenX = e.x;
      c.passive.pollenZ = e.z;
      c.passive.pollenAcc = 0;
      return;
    }
    const step = dist(c.passive.pollenX, c.passive.pollenZ, e.x, e.z);
    c.passive.pollenX = e.x;
    c.passive.pollenZ = e.z;
    // Blinks/knockbacks shouldn't dump a garden mid-teleport.
    if (step > 2) return;
    c.passive.pollenAcc += step;
    if (c.passive.pollenAcc >= p.spacing) {
      c.passive.pollenAcc = 0;
      plantFlower(this.world, e, e.x, e.z, p.max, p.life);
    }
  }

  snapshot(): Snapshot {
    const w = this.world;
    const entities: EntitySnap[] = [];
    for (const e of w.entities) {
      // Brush concealment: hidden enemies never leave the sim (map-hack impossible).
      if (e.kind === 'champion' && isHiddenFrom(w, this.viewerTeam, e)) continue;
      entities.push(this.snapEntity(e));
    }
    const events = w.events;
    w.events = [];
    return { tick: w.tick, time: w.time, match: this.matchSnap(), entities, events };
  }

  private matchSnap(): MatchStateSnap {
    const w = this.world;
    const m = w.match;
    if (!m) {
      return {
        mode: 'training',
        time: w.time,
        barrierDown: true,
        teamKills: [0, 0],
        towersDown: [0, 0],
        over: null,
        nextOrbIn: null,
        overtime: false,
        suddenDeath: false,
      };
    }
    return {
      mode: m.mode,
      time: w.time,
      barrierDown: m.barrierDown,
      teamKills: [m.teamKills[0], m.teamKills[1]],
      towersDown: [m.towersDown[0], m.towersDown[1]],
      over: m.over ? { winner: m.over.winner } : null,
      nextOrbIn: m.nextOrbAt !== null ? Math.max(0, m.nextOrbAt - w.time) : null,
      overtime: m.overtime,
      suddenDeath: m.suddenDeath,
    };
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
        bot: c.bot !== null,
        name: c.name,
        dead: e.dead,
        respawnIn: Math.max(0, c.respawnIn),
        energy: c.energy,
        level: c.level,
        gold: Math.floor(c.gold),
        kills: c.kills,
        deaths: c.deaths,
        assists: c.assists,
        items: [...c.items],
        relic: c.relic ? { id: c.relic.def.id, cd: c.relic.cd, cdMax: c.relic.def.cooldown } : null,
        inBrush: c.inBrush,
        shield: Math.round(shieldTotal(e)),
        cooldowns: { ...c.cds },
        cooldownMax: {
          q: hastedCooldown(c.def.abilities.q.cooldown, stats.haste),
          w: hastedCooldown(c.def.abilities.w.cooldown, stats.haste),
          r: hastedCooldown(c.def.abilities.r.cooldown, stats.haste),
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
        ccKind:
          e.airborne > 0
            ? 'knockup'
            : e.buffs.some((b) => b.id.startsWith('cc_slow'))
              ? 'slow'
              : undefined,
      };
    }
    if (e.mini) {
      return {
        ...base,
        kind: 'mini',
        unitId: e.mini.def.id,
        miniKind: e.mini.def.mini?.kind ?? 'bruiser',
        attacking: e.mini.attacking,
      };
    }
    if (e.tower) {
      return {
        ...base,
        kind: 'tower',
        tier: e.tower.tier,
        aggro: e.tower.aggro,
        ramp: e.tower.ramp,
        invulnerable: !e.dead && this.towerInvulnerable(e),
        dead: e.dead,
      };
    }
    if (e.core) {
      return { ...base, kind: 'core', invulnerable: e.core.invulnerable };
    }
    if (e.kind === 'orb') {
      return { ...base, kind: 'orb' };
    }
    if (e.keg) {
      return {
        ...base,
        kind: 'keg',
        unitId: e.keg.def.id,
        fuseLeft: Math.max(0, e.keg.fuseLeft),
        tossPhase: e.keg.tossPhase < 1 ? e.keg.tossPhase : undefined,
      };
    }
    if (e.flower) {
      return { ...base, kind: 'flower', tLeft: e.flower.tLeft };
    }
    if (e.zone) {
      return { ...base, kind: 'zone', tLeft: e.zone.tLeft, duration: e.zone.duration };
    }
    if (e.wall) {
      return {
        ...base,
        kind: 'wall',
        length: e.wall.length,
        tLeft: e.wall.tLeft,
        duration: e.wall.duration,
      };
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

  private towerInvulnerable(e: Entity): boolean {
    if (e.tower?.tier !== 'inner') return false;
    for (const s of this.world.structures()) {
      if (s.tower?.tier === 'outer' && s.team === e.team) return true;
    }
    return false;
  }
}
