/**
 * Client ⇄ simulation contract: intents in, snapshots + events out.
 * Pure types (no logic). Binary codecs join in v0.3 when the wire is a real network;
 * v0.1 transports these structures over Worker structured clone.
 */
import type { Slot, Team } from '@mini-clash/data';

export { PROTOCOL_VERSION } from '@mini-clash/data';

export type EntityId = number;
export type PlayerId = number;

/* --------------------------------- Intents -------------------------------- */

export type Intent =
  | { t: 'move'; x: number; z: number }
  | { t: 'attackMove'; x: number; z: number }
  | { t: 'attackTarget'; target: EntityId }
  | { t: 'stop' }
  | { t: 'cast'; slot: Slot; x: number; z: number }
  | { t: 'dance' }
  | { t: 'trainer'; cmd: TrainerCmd };

export type TrainerCmd =
  | { k: 'noCooldowns'; on: boolean }
  | { k: 'infiniteEnergy'; on: boolean }
  | { k: 'levelUp' }
  | { k: 'resetDummies' }
  | { k: 'switchChampion'; championId: string };

export interface IntentMsg {
  seq: number;
  player: PlayerId;
  intent: Intent;
}

/* ------------------------------ Match config ------------------------------ */

export interface MatchPlayerConfig {
  id: PlayerId;
  championId: string;
  team: Team;
}

export interface MatchConfig {
  mode: 'training';
  seed: number;
  mapId: string;
  players: MatchPlayerConfig[];
}

/* -------------------------------- Snapshots ------------------------------- */

export interface BuffSnap {
  id: string;
  tLeft: number;
  stacks: number;
}

export interface CastSnap {
  /** 'aa' = basic attack windup; 'recast' = Rook-style second stage. */
  kind: Slot | 'aa' | 'recast';
  /** 0..1 through the windup. */
  progress: number;
  aimX: number;
  aimZ: number;
}

interface EntityBase {
  id: EntityId;
  x: number;
  z: number;
  /** Facing unit vector (no angles in the sim — see TECH determinism notes). */
  fx: number;
  fz: number;
  hp: number;
  hpMax: number;
  radius: number;
  team: Team;
}

export interface ChampionSnap extends EntityBase {
  kind: 'champion';
  player: PlayerId;
  championId: string;
  dead: boolean;
  respawnIn: number;
  energy: number;
  level: number;
  /** Seconds of cooldown remaining per slot. */
  cooldowns: Record<Slot, number>;
  /** Max cooldown per slot after haste (for radial display). */
  cooldownMax: Record<Slot, number>;
  recast?: { slot: Slot; tLeft: number };
  casting?: CastSnap;
  /** Airborne during Rook R leap / knockups: 0..1 phase. */
  airborne?: number;
  /** Current speed (u/s) for locomotion blending. */
  speed: number;
  buffs: BuffSnap[];
  /** Champion-specific passive readouts (stonewall charge, powder counter). */
  passive: Record<string, number>;
  dancing: boolean;
  stats: { ad: number; attackSpeed: number; moveSpeed: number; armor: number; ward: number };
}

export interface DummySnap extends EntityBase {
  kind: 'dummy';
  unitId: string;
  /** Live DPS window readout. */
  dps: number;
  windowActive: boolean;
  /** Set briefly when hit (client shudder). */
  hitPulse: number;
  ccKind?: 'knockup' | 'slow';
}

export interface KegSnap extends EntityBase {
  kind: 'keg';
  fuseLeft: number;
  /** Toss arc phase 0..1 (client renders the lob). */
  tossPhase?: number;
}

export interface WallSnap extends EntityBase {
  kind: 'wall';
  length: number;
  tLeft: number;
  duration: number;
}

export interface ProjectileSnap extends EntityBase {
  kind: 'projectile';
  projId: string;
  /** For homing missiles: the visual style key 'aa'. */
  style: 'def' | 'aa';
  color: number;
  size: number;
  /** 0..1 of max range travelled (arc height rendering). */
  travelFrac: number;
}

export type EntitySnap = ChampionSnap | DummySnap | KegSnap | WallSnap | ProjectileSnap;

/* --------------------------------- Events --------------------------------- */

export type SimEvent =
  | {
      t: 'fx';
      key: string;
      x: number;
      z: number;
      fx?: number;
      fz?: number;
      ax?: number;
      az?: number;
      source?: EntityId;
      target?: EntityId;
    }
  | {
      t: 'damage';
      target: EntityId;
      amount: number;
      dtype: 'physical' | 'arcane';
      x: number;
      z: number;
    }
  | { t: 'death'; id: EntityId; x: number; z: number }
  | { t: 'respawn'; id: EntityId }
  | { t: 'levelup'; id: EntityId; level: number }
  | { t: 'castDenied'; player: PlayerId; reason: 'cooldown' | 'energy' | 'dead' | 'casting' }
  | { t: 'dummyReset'; id: EntityId };

export interface Snapshot {
  tick: number;
  time: number;
  entities: EntitySnap[];
  events: SimEvent[];
}

/* ------------------------------- Worker link ------------------------------ */

export type ClientToWorker =
  | { t: 'init'; config: MatchConfig }
  | { t: 'intents'; msgs: IntentMsg[] }
  | { t: 'stop' };

export type WorkerToClient =
  | { t: 'ready' }
  | { t: 'snapshot'; snap: Snapshot }
  | { t: 'fatal'; message: string };
