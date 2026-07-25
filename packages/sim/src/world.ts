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

/** The benched half of a Tag Team duo (GAME_DESIGN §7.2): its own kit,
 * cooldowns, Energy and passive scratch — everything else is shared. */
export interface DuoBank {
  def: ChampionDef;
  energy: number;
  cds: Record<Slot, number>;
  aaCd: number;
  passive: Record<string, number>;
  /** Seconds until the next swap (starts at 9 on swap). */
  swapCd: number;
  /** Morph transition remaining; > 0 blocks attacks/casts, not movement. */
  morphT: number;
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
  /** Rolling damage-taken log for the death recap (12 s window, UI_UX §10). */
  dmgLog: {
    at: number;
    src: number;
    championId: string | null;
    name: string;
    label: string;
    amount: number;
  }[];
  /** Aggregated top-3 killers, frozen at death, cleared on respawn. */
  recap: import('@mini-clash/protocol').RecapEntry[] | null;
  /** Tag Team bench (null = solo champion, pre-v0.4 configs). */
  duo: DuoBank | null;
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
  /** Feared (Wisp R): fleeing away from a point, controls locked, until tLeft ≤ 0. */
  feared: { tLeft: number; fromX: number; fromZ: number } | null;
  /** Augments taken this match, in pick order (docs/AUGMENTS.md). */
  augments: string[];
  /** Open draft, or null. The match never pauses for it. */
  draft: DraftState | null;
  /** Which draft levels have already been served (3/6/9). */
  draftsDone: number;
  /** Reroll tokens left this match. */
  rerolls: number;
  /**
   * Augment scratch (Undying spent, Second Wind armed, star-shield charge, the
   * rolled element…). Unlike `passive` this is NOT exchanged on a Tag Swap: a
   * `[duo]` card belongs to the seat, not to whichever half is on stage.
   */
  augState: Record<string, number>;
  /** Champion-specific passive scratch (stonewallCd, powderCount, luckyT…). */
  passive: Record<string, number>;
  speed: number;
}

/** An open augment draft for one player (AUGMENTS.md §1). */
export interface DraftState {
  /** Which draft this is: 0, 1, 2 — drives the rarity odds row. */
  index: number;
  /** The three offered augment ids. */
  offers: string[];
  /** Seconds until the utility scorer picks for you. */
  tLeft: number;
  /** True once this player has spent their reroll on this draft set. */
  rerolled: boolean;
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
  /** Wisp's sheet decoy: taunts Minis, dies after this many hits (regardless of damage). */
  decoy?: { hitsLeft: number };
  /** Skeleton Key: the skull pulls Mini aggro inside this radius. */
  tauntRadius?: number;
}

export interface WallState {
  tLeft: number;
  duration: number;
  length: number;
  cells: number[];
  allyBuff?: string;
  owner: EntityId;
  /** Ramparts of the Old Bridge: enemy projectiles die on the stonework. */
  blocksProjectiles?: boolean;
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
  /** Charged Capacitor basic (Boltz passive): bonus arcane + arc to one more target. */
  capacitor?: boolean;
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

/**
 * A persistent companion (Chomp). Untargetable and undamageable by design — the
 * balance lever is his fetch cooldown, not his health (docs/CHAMPIONS.md §4).
 */
export interface PetState {
  def: UnitDef;
  owner: EntityId;
  ownerPlayer: PlayerId;
  /** Seconds until the next automatic fetch. */
  fetchCd: number;
  /** Next fetch deals double and slows (fed by an unclaimed Snack Toss). */
  empowered: boolean;
  /** Orbit phase around the owner, advanced deterministically by tick. */
  orbit: number;
  /** Current errand: nip a target, or ride a Q dash down a line. */
  errand:
    | { kind: 'idle' }
    | { kind: 'fetch'; target: EntityId; tLeft: number }
    | {
        kind: 'dash';
        dirX: number;
        dirZ: number;
        traveled: number;
        maxDist: number;
        width: number;
        damage: number;
        dtype: 'physical' | 'arcane';
        hitIds: Set<EntityId>;
        stealMs?: { amount: number; duration: number };
        returning: boolean;
      };
}

/** A dropped snack: the first ally to touch it eats it (Piper W). */
export interface PickupState {
  def: UnitDef;
  owner: EntityId;
  ownerPlayer: PlayerId;
  tLeft: number;
  /** Resolved heal at cast time. */
  heal: number;
  /** Unclaimed: the pet eats it and the owner heals this fraction instead. */
  ownerFallbackFrac: number;
  empowersPet: boolean;
  /** Toss arc phase 0..1. */
  tossPhase: number;
}

/** Ground area effect: Sylva's ward (garden), Boltz's dome/pod, Wisp's curse. */
export interface ZoneState {
  owner: EntityId;
  variant: 'garden' | 'dome' | 'pod' | 'curse' | 'trail';
  tLeft: number;
  duration: number;
  radius: number;
  /* Sylva garden (resolved at cast). */
  healPerSec?: number;
  enemyDamageAmp?: number;
  cleanseSlows?: boolean;
  cleansed?: Set<EntityId>;
  /* Boltz dome/pod. */
  blocksProjectiles?: boolean;
  /** Buff refreshed on allies inside each tick (dome attack-speed aura). */
  allyBuff?: string;
  /** Nav cells stamped as a movement obstacle (pod bunker); unstamped on expiry. */
  navCells?: number[];
  /** Habitat Module: fraction of max HP restored per second to allies inside. */
  regenPct?: number;
  /* Restricted Section (Mortis R). */
  /** Units per second the curse hauls victims toward its centre. */
  pullPerSec?: number;
  /** Seconds of silence applied to everyone still inside when it ends. */
  expireSilence?: number;
  /* Blood Waltz (Vex W) trail, and Heartwood's walking ward. */
  allyMs?: number;
  enemySlow?: number;
  /** Heartwood: the zone tracks its owner instead of standing still. */
  follows?: boolean;
  /** Fx emitted when the field launches away at expiry (pod). */
  expireFx?: string;
  /* Wisp curse. */
  enemyDmgPerSec?: number;
  /** Debuff refreshed on enemies inside each tick (Chill). */
  enemyBuff?: string;
  disableMinis?: boolean;
  /** Enemy champions still inside at expiry are Feared away from center this long. */
  expireFear?: number;
  tickFx?: string;
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
    | 'zone'
    | 'pet'
    | 'pickup';
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
  pet?: PetState;
  pickup?: PickupState;
  /** Recap attribution for spawned damage-dealers (projectiles, kegs): the
   * casting ability's slot, threaded to dealDamage when this entity hits. */
  srcLabel?: string;
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
  /**
   * Augment discovery (AUGMENTS §1, UI_UX §11): `player:augmentId` pairs each
   * team has actually seen on the field. Scouting is the price of information —
   * an undiscovered enemy card shows as `?` on the scoreboard and nameplate.
   */
  discovered: [Set<string>, Set<string>] = [new Set(), new Set()];

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
