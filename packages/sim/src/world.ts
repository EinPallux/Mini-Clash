import type {
  AbilityDef,
  BuffDef,
  ChampionDef,
  ProjectileDef,
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
  level: number;
  xp: number;
  energy: number;
  cds: Record<Slot, number>;
  aaCd: number;
  cast: CastState | null;
  recast: { slot: Slot; tLeft: number; ability: AbilityDef } | null;
  leap: LeapState | null;
  /** Move / attack-move orders */
  order: { kind: 'move' | 'attackMove'; x: number; z: number } | { kind: 'attackTarget'; target: EntityId } | null;
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

export interface Entity {
  id: EntityId;
  kind: 'champion' | 'dummy' | 'keg' | 'wall' | 'projectile';
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

  fx(key: string, x: number, z: number, extra?: { fx?: number; fz?: number; source?: EntityId; target?: EntityId }): void {
    this.emit({ t: 'fx', key, x, z, ...extra });
  }

  schedule(delaySec: number, run: (w: World) => void): void {
    const atTick = this.tick + Math.max(1, Math.round(delaySec * 30));
    this.tasks.push({ atTick, seq: this.taskSeq++, run });
  }

  runDueTasks(): void {
    if (this.tasks.length === 0) return;
    const due = this.tasks.filter((t) => t.atTick <= this.tick).sort((a, b) => a.atTick - b.atTick || a.seq - b.seq);
    if (due.length === 0) return;
    this.tasks = this.tasks.filter((t) => t.atTick > this.tick);
    for (const t of due) t.run(this);
  }

  /** Alive, damageable units (champions + dummies + kegs). */
  *units(): IterableIterator<Entity> {
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e.kind === 'champion' || e.kind === 'dummy' || e.kind === 'keg') yield e;
    }
  }

  *enemiesOf(team: Team): IterableIterator<Entity> {
    for (const e of this.units()) {
      if (e.team !== team) yield e;
    }
  }
}
