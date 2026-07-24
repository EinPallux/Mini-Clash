import type {
  AbilityDef,
  BuffDef,
  ChampionDef,
  ProjectileDef,
  RelicDef,
  Slot,
  Team,
  UnitDef,
} from '@mini-clash/data';
import type { EntityId, PlayerId, SimEvent } from '@mini-clash/protocol';
import type { NavGrid } from './navgrid';
import type { Pcg32 } from './rng';

/** Internal entity model — richer than wire snapshots. */

export interface BuffInstance {
  id: string;
  def: BuffDef;
  tLeft: number;
  stacks: number;
  /** Full block of the next hit (entrance Shieldwall). */
  blockNextHit?: boolean;
  /** Remaining absorb (shield buffs). */
  shieldLeft?: number;
}

export interface CastState {
  kind: Slot | 'aa' | 'recast';
  ability?: AbilityDef;
  tLeft: number;
  tTotal: number;
  aimX: number;
  aimZ: number;
  /** aa only */
  target?: EntityId;
}

export interface LeapState {
  tLeft: number;
  tTotal: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  onLand: AbilityDef['actions'];
  ability: AbilityDef;
}

export interface ChampState {
  player: PlayerId;
  def: ChampionDef;
  bot: import('@mini-clash/protocol').BotTier | null;
  name: string;
  level: number;
  xp: number;
  gold: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Kills since last death (bounty streak). */
  streak: number;
  items: string[];
  relic: { def: RelicDef; cd: number } | null;
  /** Recent champion damagers: player → world.time of last hit (assist credit). */
  recentDamagers: Map<PlayerId, number>;
  /** Item passive scratch (dragonfang counter, nullwave timer…). */
  itemState: Record<string, number>;
  /** world.time of last damage dealt or taken (windrunner). */
  lastCombatAt: number;
  /** world.time of last damage taken (nullwave recharge). */
  lastDamagedAt: number;
  /** world.time this champion last damaged an enemy champion (tower aggro switch). */
  lastChampHitAt: number;
  /** world.time of last attack/cast/relic commit (brush reveal). */
  lastActionAt: number;
  /** world.time of last ping (rate limit). */
  lastPingAt: number;
  inBrush: boolean;
  /** Index into World.brushRects while inBrush (reveal checks), else -1. */
  brushIdx: number;
  energy: number;
  cds: Record<Slot, number>;
  aaCd: number;
  cast: CastState | null;
  recast: { slot: Slot; tLeft: number; ability: AbilityDef; left: number } | null;
  leap: LeapState | null;
  /** Move / attack-move orders */
  order:
    | { kind: 'move' | 'attackMove'; x: number; z: number }
    | { kind: 'attackTarget'; target: EntityId }
    | null;
  pendingOrder: ChampState['order'];
  path: [number, number][];
  pathVersion: number;
  aaTarget: EntityId | null;
  respawnIn: number;
  dancing: boolean;
  /** Champion-specific passive scratch (stonewallCd, powderCount, luckyT…). */
  passive: Record<string, number>;
  speed: number;
}

export interface DummyState {
  def: UnitDef;
  windowDmg: number;
  windowT: number;
  active: boolean;
  sinceHit: number;
  hitPulse: number;
  homeX: number;
  homeZ: number;
}

export interface KegState {
  def: UnitDef;
  owner: EntityId;
  ownerPlayer: PlayerId;
  fuseLeft: number;
  tossPhase: number;
  /** Owner stats snapshot for damage scaling. */
  ad: number;
  level: number;
  /** Set when destroyed by an attack: owner-team hit detonates, enemy hit denies. */
  killedByTeam?: Team;
}

export interface WallState {
  tLeft: number;
  duration: number;
  length: number;
  cells: number[];
  allyBuff?: string;
  owner: EntityId;
}

export interface ProjState {
  def?: ProjectileDef;
  style: 'def' | 'aa';
  owner: EntityId;
  ownerPlayer: PlayerId;
  dirX: number;
  dirZ: number;
  speed: number;
  traveled: number;
  maxRange: number;
  pulsesFired: number;
  hitIds: Set<EntityId>;
  /** Homing missile target (aa). */
  target?: EntityId;
  /** Resolved damage at spawn time. */
  damage: number;
  dtype: 'physical' | 'arcane';
  /** aa powder-blast round (Fathom passive). */
  powder?: boolean;
  /** Lucky-doubloon bonus applied. */
  luckyMul?: number;
  color: number;
  size: number;
}

export interface MiniState {
  def: UnitDef;
  /** Team-relative step along the lane waypoint list. */
  waypoint: number;
  targetId: EntityId | null;
  atkCd: number;
  attacking: boolean;
  /** Damage after per-minute scaling, resolved at spawn. */
  damage: number;
  path: [number, number][];
  pathVersion: number;
  /** Current path goal (re-path when it drifts). */
  goalX: number;
  goalZ: number;
}

export interface TowerState {
  tier: 'outer' | 'inner';
  shotCd: number;
  aggro: EntityId | null;
  ramp: number;
  /** Nav cells stamped by this tower (unstamped on fall). */
  navCells: number[];
  /** Death consequences processed (rewards, nav, core exposure). */
  fallen: boolean;
}

export interface CoreState {
  invulnerable: boolean;
  pulseCd: number;
}

/** Sylva's pollen flowers: bloomed by her abilities for area heals. */
export interface FlowerState {
  owner: EntityId;
  tLeft: number;
}

/** Ground aura zone (Sylva's Blooming Ward). */
export interface ZoneState {
  owner: EntityId;
  tLeft: number;
  duration: number;
  radius: number;
  /** Resolved at cast. */
  healPerSec: number;
  enemyDamageAmp: number;
  cleanseSlows: boolean;
  cleansed: Set<EntityId>;
}

/** Bridge-mode match orchestration state (absent on training maps). */
export interface TeamPing {
  team: number;
  kind: 'danger' | 'omw' | 'attack' | 'help';
  x: number;
  z: number;
  tick: number;
}

export interface MatchState {
  mode: 'training' | 'bridge';
  barrierDown: boolean;
  /** Stamped barrier nav cells, unstamped when the barrier drops. */
  barrierCells: number[];
  /** Kills scored BY each team. */
  teamKills: [number, number];
  /** Towers destroyed BY each team. */
  towersDown: [number, number];
  /** Structure damage dealt BY each team (Sudden Death tiebreak). */
  structDamage: [number, number];
  over: { winner: Team } | null;
  nextOrbAt: number | null;
  nextWaveAt: number | null;
  /** 1-based counter of spawned waves (every 2nd adds a Ram; Overtime = all Rams). */
  waveIndex: number;
  /** 16:00 Corebreaker active. */
  overtime: boolean;
  /** 20:00 Core decay active. */
  suddenDeath: boolean;
}

export interface Entity {
  id: EntityId;
  kind:
    | 'champion'
    | 'dummy'
    | 'keg'
    | 'wall'
    | 'projectile'
    | 'mini'
    | 'tower'
    | 'core'
    | 'orb'
    | 'flower'
    | 'zone';
  team: Team;
  x: number;
  z: number;
  fx: number;
  fz: number;
  radius: number;
  hp: number;
  hpMax: number;
  dead: boolean;
  /** Knock-up airtime remaining (victims). */
  airborne: number;
  airborneTotal: number;
  buffs: BuffInstance[];
  champ?: ChampState;
  dummy?: DummyState;
  keg?: KegState;
  wall?: WallState;
  proj?: ProjState;
  mini?: MiniState;
  tower?: TowerState;
  core?: CoreState;
  flower?: FlowerState;
  zone?: ZoneState;
}

export interface ScheduledTask {
  atTick: number;
  seq: number;
  run: (w: World) => void;
}

export class World {
  tick = 0;
  time = 0;
  nextId: EntityId = 1;
  entities: Entity[] = [];
  byId = new Map<EntityId, Entity>();
  events: SimEvent[] = [];
  tasks: ScheduledTask[] = [];
  private taskSeq = 0;

  /** Team fountain centers (shop zone, respawns, bot retreat). */
  spawnPoints?: Record<Team, { x: number; z: number }>;
  /** Brush rectangles (axis-aligned, from MapDef.battle). */
  brushRects: { x: number; z: number; w: number; d: number }[] = [];
  /** Bridge match orchestration (null on training maps). */
  match: MatchState | null = null;
  /** Recent team pings (bots read these; trimmed to the last ~5 s each tick). */
  pings: TeamPing[] = [];

  constructor(
    public nav: NavGrid,
    public rng: Pcg32,
  ) {}

  add(e: Omit<Entity, 'id'>): Entity {
    const ent = { ...e, id: this.nextId++ } as Entity;
    this.entities.push(ent);
    this.byId.set(ent.id, ent);
    return ent;
  }

  remove(id: EntityId): void {
    const i = this.entities.findIndex((e) => e.id === id);
    if (i >= 0) this.entities.splice(i, 1);
    this.byId.delete(id);
  }

  get(id: EntityId): Entity | undefined {
    return this.byId.get(id);
  }

  emit(ev: SimEvent): void {
    this.events.push(ev);
  }

  fx(
    key: string,
    x: number,
    z: number,
    extra?: {
      fx?: number;
      fz?: number;
      ax?: number;
      az?: number;
      source?: EntityId;
      target?: EntityId;
    },
  ): void {
    this.emit({ t: 'fx', key, x, z, ...extra });
  }

  schedule(delaySec: number, run: (w: World) => void): void {
    const atTick = this.tick + Math.max(1, Math.round(delaySec * 30));
    this.tasks.push({ atTick, seq: this.taskSeq++, run });
  }

  runDueTasks(): void {
    if (this.tasks.length === 0) return;
    const due = this.tasks
      .filter((t) => t.atTick <= this.tick)
      .sort((a, b) => a.atTick - b.atTick || a.seq - b.seq);
    if (due.length === 0) return;
    this.tasks = this.tasks.filter((t) => t.atTick > this.tick);
    for (const t of due) t.run(this);
  }

  /** Alive, damageable units (champions + dummies + kegs + minis). */
  *units(): IterableIterator<Entity> {
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.kind === 'champion' || e.kind === 'dummy' || e.kind === 'keg' || e.kind === 'mini')
        yield e;
    }
  }

  /** Damageable structures. */
  *structures(): IterableIterator<Entity> {
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.kind === 'tower' || e.kind === 'core') yield e;
    }
  }

  *enemiesOf(team: Team): IterableIterator<Entity> {
    for (const e of this.units()) {
      if (e.team !== team) yield e;
    }
  }

  /** Alive champions. */
  *champions(): IterableIterator<Entity> {
    for (const e of this.entities) {
      if (e.kind === 'champion' && !e.dead) yield e;
    }
  }
}
