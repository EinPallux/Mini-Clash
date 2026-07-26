import {
  BRIDGE,
  CHAMPIONS,
  type ChampionDef,
  DRAFT,
  EVENT_ANNOUNCE_LEAD,
  EVENT_REVEAL_SECONDS,
  EVENTS,
  type MapDef,
  ORB_SENSE_BONUS_SECONDS,
  SHATTERBRIDGE_MAP,
  TICK_DT,
  TICK_RATE,
  TRAINING_MAP,
  UNITS,
} from '@mini-clash/data';
import {
  type BotTier,
  type ChampionSnap,
  type DraftSnap,
  type EntitySnap,
  type IntentMsg,
  type MatchConfig,
  type MatchStateSnap,
  type PlayerId,
  type Snapshot,
  type TrainerCmd,
  UNKNOWN_AUGMENT,
} from '@mini-clash/protocol';
import {
  applySpawnEffects,
  canAttack,
  tryCast,
  trySwap,
  updateAugments,
  updateAutoAttack,
  updateCasts,
  updateChampionPassive,
} from './abilities';
import { healEntity, plantFlower } from './actions';
import { augParam, economyMods } from './augments';
import { type BotBrain, makeBrain, thinkBots } from './bots';
import { isHiddenFrom, updateBrushState, updateDiscovery } from './brush';
import { applyBuff, applyBuffById, applyCc, applyFear, shieldTotal, tickBuffs } from './buffs';
import { dealDamage } from './combat';
import { openDraft, pickAugment, rerollDraft, updateDrafts } from './draft';
import { levelUpChamp, updateIncome, updateOrbs } from './economy';
import { EVENT_HOOKS, updateCoins } from './eventKinds';
import { nextEvent, rollSchedule, updateCollapse, updateEvents } from './events';
import { updateGolem } from './golem';
import { tryBuy, tryBuyRelic, trySell, tryUseRelic, updateItemPassives } from './items';
import { spawnWave, updateMini } from './minis';
import { applySeparation, updateMovement } from './movement';
import { NavGrid } from './navgrid';
import { spawnPet, updatePet, updatePickup } from './pets';
import { updateProjectile } from './projectiles';
import { Pcg32 } from './rng';
import { championStats, hastedCooldown, resolveScaling } from './stats';
import { spawnStructures, updateCore, updateTower } from './structures';
import { dist } from './vec';
import { type Entity, type MatchState, World } from './world';

interface TrainerFlags {
  noCooldowns: boolean;
  infiniteEnergy: boolean;
}

const MAPS: Record<string, MapDef> = {
  [TRAINING_MAP.id]: TRAINING_MAP,
  [SHATTERBRIDGE_MAP.id]: SHATTERBRIDGE_MAP,
};

/** Fresh passive scratch for a champion (what the sim + snapshot start with). */
function initPassive(def: ChampionDef): Record<string, number> {
  switch (def.passive.id) {
    case 'stonewall':
      return { stonewallCd: 0 };
    case 'powder_rounds':
      return { powderCount: 0 };
    case 'capacitor':
      return { charged: 0, lastAtk: -100 };
    default:
      return {};
  }
}

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
      const m: MatchState = {
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
        // The timetable is rolled once, here, off the match seed — that is what
        // makes it reproducible in replay and plannable by bots (§9).
        schedule: rollSchedule(w.rng),
        scheduleIdx: 0,
        events: [],
        collapseStage: 0,
        nextCollapseAt: null,
        deckHalf: BRIDGE.collapse.deckHalves[0],
        eventLog: [],
        lane: battle.lane.map((pt) => [pt[0], pt[1]] as [number, number]),
      };
      w.match = m;
      spawnStructures(w, battle);
      // Offline test hook: pre-damage the enemy core so smokes can reach the win
      // sequence in seconds. The authoritative server (v0.3) never honors rig.
      if (config.rig) {
        const human = config.players.find((pl) => !pl.bot);
        const enemyTeam = human && human.team === 1 ? 0 : 1;
        for (const ent of w.entities) {
          if (ent.team !== enemyTeam) continue;
          if (ent.kind === 'core' && config.rig.enemyCoreHp !== undefined) {
            ent.hp = Math.max(1, Math.min(ent.hpMax, config.rig.enemyCoreHp));
          }
          if (ent.kind === 'tower' && config.rig.enemyTowerHp !== undefined) {
            ent.hp = Math.max(1, Math.min(ent.hpMax, config.rig.enemyTowerHp));
          }
        }
        // Fast-forward the clock past everything that already "happened". Every
        // catch-up timer here fires once per tick until it is level with the
        // clock, so without this a jump to 2:00 dumps five waves in five ticks
        // and announces every event window at once.
        if (config.rig.clock !== undefined && config.rig.clock > 0) {
          const at = config.rig.clock;
          w.tick = Math.round(at * TICK_RATE);
          w.time = w.tick * TICK_DT;
          if (m.nextWaveAt !== null) m.nextWaveAt = w.time + battle.waveEvery;
          if (m.nextOrbAt !== null) m.nextOrbAt = w.time + battle.orbEvery;
          while (
            m.scheduleIdx < m.schedule.length &&
            m.schedule[m.scheduleIdx].at - EVENT_ANNOUNCE_LEAD <= w.time
          ) {
            m.scheduleIdx++;
          }
        }
      }
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
        schedule: [],
        scheduleIdx: 0,
        events: [],
        collapseStage: 0,
        nextCollapseAt: null,
        deckHalf: BRIDGE.collapse.deckHalves[0],
        eventLog: [],
        lane: [],
      };
    }

    const teamCounts: Record<0 | 1, number> = { 0: 0, 1: 0 };
    const human = config.players.find((p) => !p.bot);
    this.viewerTeam = human?.team ?? 0;

    for (const p of config.players) {
      const def = CHAMPIONS[p.championId];
      if (!def) throw new Error(`unknown champion '${p.championId}'`);
      const benchDef = p.benchId ? CHAMPIONS[p.benchId] : undefined;
      if (p.benchId && !benchDef) throw new Error(`unknown champion '${p.benchId}'`);
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
          dmgLog: [],
          recap: null,
          itemState: {},
          lastCombatAt: -100,
          lastDamagedAt: -100,
          lastPingAt: -100,
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
          feared: null,
          augments: [],
          draft: null,
          draftsDone: 0,
          rerolls: DRAFT.rerolls,
          augState: {},
          passive: initPassive(def),
          duo: benchDef
            ? {
                def: benchDef,
                energy: 100,
                cds: { q: 0, w: 0, r: 0 },
                aaCd: 0,
                passive: initPassive(benchDef),
                swapCd: 0,
                morphT: 0,
              }
            : null,
          speed: 0,
        },
      });
      this.playerEnts.set(p.id, e.id);
      this.trainer.set(p.id, { noCooldowns: false, infiniteEnergy: false });
      if (p.bot) {
        // Balance A/B (ROADMAP v0.4): rig.noSwapTeam pins that team's bots to one
        // half of their duo so the swap's contribution can be measured directly.
        const maySwap = config.rig?.noSwapTeam !== p.team;
        this.brains.set(p.id, makeBrain(config.seed, p.id, p.bot, maySwap));
      }
      if (benchDef) {
        // Duos share one pool: the average of both HP curves (GAME_DESIGN §7.2).
        e.hpMax = championStats(e).hpMax;
        e.hp = e.hpMax;
      }
      applySpawnEffects(w, e);
      // Beastmasters arrive with their companion already at heel.
      if (def.passive.id === 'best_friend') spawnPet(w, e, 'chomp');
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
      case 'ping': {
        // Map awareness works from the death screen too. Rate-limited per player.
        const c = e.champ;
        if (!c) return;
        if (w.time - c.lastPingAt < 0.8) return;
        c.lastPingAt = w.time;
        w.pings.push({ team: e.team, kind: it.kind, x: it.x, z: it.z, tick: w.tick });
        w.emit({ t: 'ping', player: m.player, team: e.team, kind: it.kind, x: it.x, z: it.z });
        return;
      }
      case 'surrender': {
        // From 8:00 (UI_UX §8). Solo vs bots: the lone human's vote passes at once;
        // the vote UI proper arrives with multiplayer in v0.3.
        const match = w.match;
        if (!match || match.mode !== 'bridge' || match.over) return;
        if (w.time < BRIDGE.surrenderAt) return;
        const winner = e.team === 0 ? 1 : 0;
        match.over = { winner };
        w.emit({ t: 'surrendered', team: e.team });
        w.emit({ t: 'matchOver', winner });
        return;
      }
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
      case 'swap': {
        const deny = trySwap(w, e);
        if (deny) w.emit({ t: 'castDenied', player: m.player, reason: deny });
        break;
      }
      case 'draftPick': {
        pickAugment(w, e, it.offer);
        break;
      }
      case 'draftReroll': {
        rerollDraft(w, e);
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
      case 'openDraft': {
        // Grounds-only affordance: try cards on without walking a level curve.
        if (c.draft) break;
        openDraft(w, e, Math.min(c.draftsDone, DRAFT.levels.length - 1));
        break;
      }
      case 'switchChampion': {
        const def = CHAMPIONS[cmd.championId];
        if (!def || def.id === c.def.id) break;
        c.def = def;
        // A new kit is a clean slate: the old champion's signatures must not
        // ride along, and a draft rolled for them is no longer a valid offer.
        c.augments = [];
        c.draft = null;
        c.draftsDone = 0;
        c.rerolls = DRAFT.rerolls;
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
        c.feared = null;
        c.passive = initPassive(def);
        e.radius = def.stats.radius;
        e.buffs = [];
        const stats = championStats(e);
        e.hpMax = stats.hpMax;
        e.hp = stats.hpMax;
        c.energy = 100;
        applySpawnEffects(w, e);
        break;
      }
      case 'setBench': {
        // Training duo config: build/replace/clear the bench so Space can be
        // practised against any pairing without leaving the Grounds.
        const def = cmd.championId ? CHAMPIONS[cmd.championId] : null;
        if (cmd.championId && !def) break;
        if (def && def.id === c.def.id) break; // a duo is never two of the same
        c.duo = def
          ? {
              def,
              energy: 100,
              cds: { q: 0, w: 0, r: 0 },
              aaCd: 0,
              passive: initPassive(def),
              swapCd: 0,
              morphT: 0,
            }
          : null;
        // Shared pool changes shape with the pairing — refill so the panel never
        // leaves the trainer at a fraction of a brand-new bar.
        e.hpMax = championStats(e).hpMax;
        e.hp = e.hpMax;
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

  /** Advance one tick and return the viewer-team snapshot (worker path). */
  tick(): Snapshot {
    this.step();
    return this.snapshot();
  }

  /**
   * Advance the world WITHOUT building a snapshot or draining events — the
   * server steps the sim, then builds one `snapshotFor()` view per team and
   * drains events itself once all views exist.
   */
  step(): void {
    const w = this.world;
    const dt = TICK_DT;
    w.tick++;
    w.time = w.tick * dt;

    if (w.match?.over) {
      // Victory freeze: the world holds its pose for the podium sequence.
      return;
    }

    // 0. Trim stale team pings (~5 s), then bot brains issue intents through the
    // same pipe as players.
    if (w.pings.length > 0) w.pings = w.pings.filter((pg) => w.tick - pg.tick <= 150);
    // Bot brains read the world (incl. pings) and answer with ordinary intents.
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
      else if (e.pet) updatePet(w, e, dt);
      else if (e.pickup) updatePickup(w, e, dt);
    }

    // 6. Buffs, item passives, regen, income, respawns, brush.
    for (const e of [...w.entities]) {
      tickBuffs(e, dt);
      if (e.champ && !e.dead) {
        updateItemPassives(w, e);
        updateChampionPassive(w, e, dt);
        updateAugments(w, e, dt);
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
        updateDiscovery(w, e);
      }
      if (e.champ) updateIncome(w, e, dt);
      if (e.champ && e.dead) {
        e.champ.respawnIn -= dt;
        if (e.champ.respawnIn <= 0) this.respawn(e);
      }
    }

    // 7. Open augment drafts tick down (the match never pauses for them).
    updateDrafts(w, dt);

    for (const e of [...w.entities]) {
      if (e.golem && battle) updateGolem(w, e, battle, dt);
    }
    updateCoins(w, dt);

    // 8. The Living Bridge (§9): the timetable, then the deck falling away.
    updateEvents(w, dt, EVENT_HOOKS);
    updateCollapse(w, EVENT_HOOKS);

    // 9. Match orchestration: barrier, waves, orbs.
    this.updateMatchFlow();
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
    // Second Wind is once per *life*; Undying is once per match, so it stays.
    c.augState.secondWind = 0;
    c.feared = null;
    c.recap = null; // the recap lives on the death screen only
    if (c.duo) {
      c.duo.energy = 100;
      c.duo.swapCd = 0;
      c.duo.morphT = 0;
    }
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
      // Decoys and markers never explode — they just leave.
      if (!keg.decoy && (keg.killedByTeam === undefined || keg.killedByTeam === e.team)) {
        this.detonateKeg(e);
      } else {
        w.fx('generic.death', e.x, e.z, { target: e.id });
        w.remove(e.id);
      }
      return;
    }

    // The sheet decoy just times out (no fuse, no bang).
    if (keg.decoy) {
      keg.fuseLeft -= dt;
      if (keg.fuseLeft <= 0) {
        w.fx('wisp.decoy.break', e.x, e.z, { target: e.id });
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
          dealDamage(w, { source: owner ?? e, label: e.srcLabel }, u, amount, ex.type);
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
      this.expireZone(e, z);
      return;
    }
    const owner = w.get(z.owner);

    if (z.variant === 'dome' || z.variant === 'pod') {
      // The shell itself lives in projectiles.ts; here we only run the ally aura.
      if (z.allyBuff || z.regenPct) {
        for (const u of w.champions()) {
          if (u.team !== e.team) continue;
          if (dist(e.x, e.z, u.x, u.z) > z.radius + u.radius) continue;
          if (z.allyBuff) applyBuffById(u, z.allyBuff);
          // Habitat Module: the dome patches allies up while they shelter.
          if (z.regenPct) healEntity(owner ?? u, u, u.hpMax * z.regenPct * dt);
        }
      }
      return;
    }

    if (z.variant === 'curse') {
      if (z.tickFx && this.world.tick % 15 === 0) w.fx(z.tickFx, e.x, e.z, { source: z.owner });
      for (const u of [...w.enemiesOf(e.team)]) {
        if (u.kind === 'keg') continue;
        if (dist(e.x, e.z, u.x, u.z) > z.radius + u.radius) continue;
        if (z.enemyDmgPerSec) {
          dealDamage(
            w,
            { source: owner ?? e, label: e.srcLabel },
            u,
            z.enemyDmgPerSec * dt,
            'arcane',
          );
        }
        if (z.enemyBuff) applyBuffById(u, z.enemyBuff);
        // Restricted Section: the maelstrom drags its readers toward the desk.
        if (z.pullPerSec) {
          const dx = e.x - u.x;
          const dz = e.z - u.z;
          const len = Math.hypot(dx, dz) || 1;
          const step = Math.min(len, z.pullPerSec * dt);
          u.x += (dx / len) * step;
          u.z += (dz / len) * step;
        }
        // Minis inside stop fighting for anyone — the cursed ground confuses them.
        if (z.disableMinis && u.mini) {
          applyBuff(u, {
            id: 'cc_confused',
            name: 'Confused',
            duration: 0.25,
            mul: { moveSpeed: 0 },
          });
          u.mini.targetId = null;
          u.mini.attacking = false;
        }
      }
      return;
    }

    if (z.variant === 'trail') {
      // Blood Waltz: Vex's own slick. Allies get carried, enemies get stuck.
      for (const u of w.champions()) {
        if (dist(e.x, e.z, u.x, u.z) > z.radius + u.radius) continue;
        if (u.team === e.team) {
          if (z.allyMs) {
            applyBuff(u, {
              id: 'aug_waltz_ms',
              name: 'Blood Waltz',
              duration: 0.4,
              mul: { moveSpeed: 1 + z.allyMs },
            });
          }
        } else if (z.enemySlow) {
          applyCc(u, { kind: 'slow', duration: 0.4, strength: z.enemySlow });
        }
      }
      return;
    }

    // Sylva's garden. Heartwood makes it walk with her.
    if (z.follows && owner && !owner.dead) {
      e.x = owner.x;
      e.z = owner.z;
    }
    for (const u of w.champions()) {
      const inside = dist(e.x, e.z, u.x, u.z) <= z.radius + u.radius;
      if (!inside) continue;
      if (u.team === e.team) {
        healEntity(owner ?? u, u, (z.healPerSec ?? 0) * dt);
        if (z.allyMs) {
          applyBuff(u, {
            id: 'aug_heartwood_ms',
            name: 'Heartwood',
            duration: 0.4,
            mul: { moveSpeed: 1 + z.allyMs },
          });
        }
        if (z.cleanseSlows && z.cleansed && !z.cleansed.has(u.id)) {
          z.cleansed.add(u.id);
          u.buffs = u.buffs.filter((b) => !b.id.startsWith('cc_slow'));
        }
      } else {
        applyBuff(u, {
          id: 'zone_dampen',
          name: 'Dampened',
          duration: 0.25,
          damageAmp: z.enemyDamageAmp ?? 0,
        });
      }
    }
  }

  /** Zone teardown: unstamp nav, fire the exit beat, apply expiry effects. */
  private expireZone(e: Entity, z: NonNullable<Entity['zone']>): void {
    const w = this.world;
    if (z.navCells) w.nav.unstampWall(z.navCells);
    // The midnight gong: everyone still standing in the curse is Feared away.
    if (z.expireFear) {
      w.fx('wisp.r.gong', e.x, e.z, { source: z.owner });
      for (const u of w.champions()) {
        if (u.team === e.team) continue;
        if (dist(e.x, e.z, u.x, u.z) <= z.radius + u.radius) {
          applyFear(u, e.x, e.z, z.expireFear);
          w.fx('wisp.fear', u.x, u.z, { source: u.id });
        }
      }
    }
    if (z.expireSilence) {
      for (const u of w.champions()) {
        if (u.team === e.team) continue;
        if (dist(e.x, e.z, u.x, u.z) <= z.radius + u.radius) {
          applyCc(u, { kind: 'silence', duration: z.expireSilence });
          w.fx('augment.silence', u.x, u.z, { source: u.id });
        }
      }
    }
    if (z.expireFx) w.fx(z.expireFx, e.x, e.z, { source: z.owner });
    w.remove(e.id);
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
      plantFlower(
        this.world,
        e,
        e.x,
        e.z,
        augParam(e, 'sylva.flowerCap', p.max),
        augParam(e, 'sylva.flowerLife', p.life),
      );
    }
  }

  /**
   * Seat cover (TECH §6 reconnect): a bot brain drives a disconnected human's
   * champion. Deterministic per (seed, player) — the brain uses the same RNG
   * stream a from-the-start bot in that seat would.
   */
  coverSeat(player: PlayerId, tier: BotTier): void {
    if (this.brains.has(player)) return;
    this.brains.set(player, makeBrain(this.config.seed, player, tier));
  }

  /** Return a covered seat to human control. */
  releaseSeat(player: PlayerId): void {
    const wasBot = this.config.players.find((p) => p.id === player)?.bot;
    if (!wasBot) this.brains.delete(player);
  }

  /** Offline convenience: the single human seat this sim is rendered for. */
  private soleHuman(): PlayerId | undefined {
    return this.config.players.find((p) => !p.bot)?.id;
  }

  snapshot(): Snapshot {
    const snap = this.snapshotFor(this.viewerTeam, this.soleHuman());
    this.world.events = [];
    return snap;
  }

  /**
   * Team-scoped view (server: one per team per tick — brush-hidden enemies never
   * leave the sim, so neither team can wallhack). Does NOT drain the event queue;
   * the caller drains via `drainEvents()` after building every view it needs.
   */
  snapshotFor(team: 0 | 1, forPlayer?: PlayerId): Snapshot {
    const w = this.world;
    const entities: EntitySnap[] = [];
    for (const e of w.entities) {
      // Brush concealment: hidden enemies never leave the sim (map-hack impossible).
      if (e.kind === 'champion' && isHiddenFrom(w, team, e)) continue;
      const snap = this.snapEntity(e);
      // Augment discovery (UI_UX §11): an enemy's cards travel as `?` until this
      // team has actually seen them on the field. The count still crosses, so
      // "they have three and I know one" reads correctly on the scoreboard.
      if (snap.kind === 'champion' && e.team !== team && snap.augments.length > 0) {
        const seen = w.discovered[team];
        snap.augments = snap.augments.map((id) =>
          seen.has(`${snap.player}:${id}`) ? id : UNKNOWN_AUGMENT,
        );
      }
      // Your draft is yours: offers never travel to anyone else, so nobody can
      // read what their opponent is about to pick.
      if (snap.kind === 'champion' && e.champ?.draft) {
        const owner = forPlayer !== undefined ? forPlayer : this.soleHuman();
        if (e.champ.player === owner) {
          snap.draft = {
            index: e.champ.draft.index,
            offers: [...e.champ.draft.offers],
            tLeft: Math.max(0, Math.ceil(e.champ.draft.tLeft * 10) / 10),
            rerolled: e.champ.draft.rerolled,
          };
        }
      }
      entities.push(snap);
    }
    return {
      tick: w.tick,
      time: w.time,
      match: this.matchSnap(team),
      entities,
      events: w.events,
    };
  }

  /**
   * This player's open draft, or null. The server sends it per client rather
   * than inside the team-shared snapshot buffer — offers are private to the
   * drafter, not to their team (AUGMENTS §1).
   */
  draftOf(player: PlayerId): DraftSnap | null {
    for (const e of this.world.entities) {
      const c = e.champ;
      if (c?.player !== player || !c.draft) continue;
      return {
        index: c.draft.index,
        offers: [...c.draft.offers],
        tLeft: Math.max(0, Math.ceil(c.draft.tLeft * 10) / 10),
        rerolled: c.draft.rerolled,
      };
    }
    return null;
  }

  /** Clear the per-tick event queue after all per-team views are built. */
  drainEvents(): void {
    this.world.events = [];
  }

  /**
   * Orb Sense (AUGMENTS §3.7) is the reason this is per-viewer: everyone sees
   * the ticker name the next window inside 30 s, and the card buys 10 s more.
   * A card that shows you something already on everyone's HUD is not a card.
   *
   * It reveals for the whole **team**, not the one seat. Snapshots are built
   * per team (the server encodes two views, not eight), so a personal reveal
   * would work offline and quietly become team-wide online — and a compass
   * that one player can call out is a shared timer either way.
   */
  private revealWindow(team: 0 | 1): number {
    for (const e of this.world.entities) {
      const c = e.champ;
      if (!c || e.team !== team || c.augments.length === 0) continue;
      if (economyMods(e).orbSense) return EVENT_REVEAL_SECONDS + ORB_SENSE_BONUS_SECONDS;
    }
    return EVENT_REVEAL_SECONDS;
  }

  private matchSnap(team: 0 | 1 = this.viewerTeam): MatchStateSnap {
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
        events: [],
        nextEvent: null,
        deckHalf: 9,
        collapseStage: 0,
        eventLog: [],
      };
    }
    const up = nextEvent(w);
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
      events: m.events.map((ev) => ({
        kind: ev.kind,
        elder: ev.elder,
        phase: ev.phase,
        tLeft: Math.max(0, Math.ceil(ev.tLeft * 10) / 10),
        tTotal: ev.tTotal,
        // Where to point the minimap glow and draw the world band. The storm
        // writes its sweep position here every tick; everything else is fixed
        // for the window (mid for the isles, which straddle it).
        x: ev.data.centre ?? ev.data.x ?? 0,
        z: ev.data.z ?? 0,
      })),
      nextEvent:
        up && up.at - w.time <= this.revealWindow(team)
          ? { kind: up.kind, elder: up.elder, inSeconds: Math.max(0, Math.ceil(up.at - w.time)) }
          : null,
      deckHalf: m.deckHalf,
      collapseStage: m.collapseStage,
      eventLog: m.eventLog.map((l) => ({ ...l })),
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
        recap: e.dead && c.recap ? c.recap : undefined,
        duo: c.duo
          ? {
              championId: c.duo.def.id,
              energy: Math.floor(c.duo.energy),
              cooldowns: { ...c.duo.cds },
              swapCd: Math.ceil(c.duo.swapCd * 10) / 10,
              morphT: c.duo.morphT,
            }
          : undefined,
        dancing: c.dancing,
        augments: [...c.augments],
        rerolls: c.rerolls,
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
    if (e.pet) {
      return {
        ...base,
        kind: 'pet',
        unitId: e.pet.def.id,
        busy: e.pet.errand.kind !== 'idle',
        empowered: e.pet.empowered,
      };
    }
    if (e.pickup) {
      return {
        ...base,
        kind: 'pickup',
        unitId: e.pickup.def.id,
        tLeft: Math.max(0, e.pickup.tLeft),
        tossPhase: e.pickup.tossPhase < 1 ? e.pickup.tossPhase : undefined,
      };
    }
    if (e.coin) {
      // Coin Rain coins ride the pickup kind — same actor family, no heal.
      return {
        ...base,
        kind: 'pickup',
        unitId: 'coin',
        tLeft: Math.max(0, e.coin.tLeft),
        coinGold: e.coin.gold,
      };
    }
    if (e.golem) {
      return {
        ...base,
        kind: 'golem',
        elder: e.golem.elder,
        owner: e.golem.owner,
        aggro: e.golem.targetId,
        slamming: e.golem.atkCd > EVENTS.clashGolem.params.attackEvery - 0.35,
      };
    }
    if (e.zone) {
      return {
        ...base,
        kind: 'zone',
        variant: e.zone.variant,
        tLeft: e.zone.tLeft,
        duration: e.zone.duration,
      };
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
