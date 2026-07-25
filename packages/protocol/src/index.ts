/**
 * Client ⇄ simulation contract: intents in, snapshots + events out.
 * Offline transports these structures over Worker structured clone; online they
 * ride the binary delta-snapshot codec in ./codec (TECH §6 — quantized, dirty-
 * masked, baseline-keyed, ≤ 12 KB/s per client, enforced by test).
 */
import type { Slot, Team } from '@mini-clash/data';

export { PROTOCOL_VERSION } from '@mini-clash/data';

export type EntityId = number;
export type PlayerId = number;

/* --------------------------------- Intents -------------------------------- */

export type PingKind = 'danger' | 'omw' | 'attack' | 'help';

export type Intent =
  | { t: 'move'; x: number; z: number }
  | { t: 'attackMove'; x: number; z: number }
  | { t: 'attackTarget'; target: EntityId }
  | { t: 'stop' }
  | { t: 'cast'; slot: Slot; x: number; z: number }
  | { t: 'useRelic'; x: number; z: number }
  | { t: 'buy'; itemId: string }
  | { t: 'buyRelic'; relicId: string }
  | { t: 'sell'; itemId: string }
  | { t: 'dance' }
  | { t: 'swap' }
  /** Take offer 0/1/2 from the open augment draft. */
  | { t: 'draftPick'; offer: 0 | 1 | 2 }
  /** Spend the match's reroll token on the current offer set. */
  | { t: 'draftReroll' }
  | { t: 'ping'; kind: PingKind; x: number; z: number }
  | { t: 'surrender' }
  | { t: 'trainer'; cmd: TrainerCmd };

export type TrainerCmd =
  | { k: 'noCooldowns'; on: boolean }
  | { k: 'infiniteEnergy'; on: boolean }
  | { k: 'levelUp' }
  | { k: 'resetDummies' }
  | { k: 'switchChampion'; championId: string }
  /** Training duo config: set (or clear, with null) the benched half. */
  | { k: 'setBench'; championId: string | null }
  /** Training: deal a fresh augment draft on demand, at any level. */
  | { k: 'openDraft' };

export interface IntentMsg {
  seq: number;
  player: PlayerId;
  intent: Intent;
}

/* ------------------------------ Match config ------------------------------ */

export type BotTier = 'recruit' | 'veteran' | 'elite';

export interface MatchPlayerConfig {
  id: PlayerId;
  championId: string;
  /** Second champion of the duo (v0.4 Tag Team). Absent = solo champion. */
  benchId?: string;
  team: Team;
  /** Present = sim-driven bot at this tier. */
  bot?: BotTier;
  name?: string;
}

export interface MatchConfig {
  mode: 'training' | 'bridge';
  seed: number;
  mapId: string;
  players: MatchPlayerConfig[];
  /** Test/dev hook (offline smokes only — the server builds configs itself and
   * never forwards a client-supplied rig). */
  rig?: {
    enemyCoreHp?: number;
    enemyTowerHp?: number;
    /** Balance A/B: bots on this team never Tag Swap (ROADMAP v0.4 acceptance). */
    noSwapTeam?: Team;
  };
}

/* -------------------------------- Snapshots ------------------------------- */

export interface BuffSnap {
  id: string;
  tLeft: number;
  stacks: number;
}

/** One aggregated damage source on the death screen (UI_UX §10, top 3). */
export interface RecapEntry {
  /** Source champion (null = minis/structures/burns without a champion). */
  championId: string | null;
  name: string;
  /** 'aa' | 'q' | 'w' | 'r' | 'passive' | 'item:<id>' | 'mini' | 'tower' | 'core' | 'burn'. */
  label: string;
  amount: number;
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
  bot: boolean;
  name: string;
  dead: boolean;
  respawnIn: number;
  energy: number;
  level: number;
  gold: number;
  kills: number;
  deaths: number;
  assists: number;
  items: string[];
  relic: { id: string; cd: number; cdMax: number } | null;
  /** True while standing in brush and hidden to enemies (client fade). */
  inBrush: boolean;
  shield: number;
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
  /** What killed you — present while dead (death-screen recap, UI_UX §10). */
  recap?: RecapEntry[];
  /** Tag Team duo state (GAME_DESIGN §7.2) — absent for solo champions. */
  duo?: {
    /** Benched champion. */
    championId: string;
    energy: number;
    cooldowns: Record<Slot, number>;
    /** Seconds until Space is available again. */
    swapCd: number;
    /** Morph transition remaining (0.35 → 0); 0 = fully swapped. */
    morphT: number;
  };
  dancing: boolean;
  /** Augments taken this match, in pick order (docs/AUGMENTS.md). */
  augments: string[];
  /** Your open draft — only ever present on your OWN champion. */
  draft?: DraftSnap;
  /** Reroll tokens left. */
  rerolls: number;
  stats: { ad: number; attackSpeed: number; moveSpeed: number; armor: number; ward: number };
}

/** An open augment draft (AUGMENTS.md §1). The match keeps running around it. */
export interface DraftSnap {
  /** 0/1/2 — which of the three drafts this is. */
  index: number;
  /** Three augment ids. */
  offers: string[];
  /** Seconds until auto-pick. */
  tLeft: number;
  /** True once the reroll has been spent on this set. */
  rerolled: boolean;
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
  /** Unit def id — picks the model (powder keg, Rattle's skull…). */
  unitId: string;
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

export interface MiniSnap extends EntityBase {
  kind: 'mini';
  unitId: string;
  miniKind: 'bruiser' | 'zapper' | 'ram';
  attacking: boolean;
}

export interface TowerSnap extends EntityBase {
  kind: 'tower';
  tier: 'outer' | 'inner';
  /** Current aggro target (client draws the tether). */
  aggro: EntityId | null;
  ramp: number;
  /** Inner towers are immune until the outer falls (destroy-in-order rule). */
  invulnerable: boolean;
  dead: boolean;
}

export interface CoreSnap extends EntityBase {
  kind: 'core';
  invulnerable: boolean;
}

export interface OrbSnap extends EntityBase {
  kind: 'orb';
}

/** Sylva's planted flower (client renders bud → bloom on removal fx). */
export interface FlowerSnap extends EntityBase {
  kind: 'flower';
  tLeft: number;
}

/** Ground area effect: Sylva's ward, Boltz's dome/pod, Wisp's curse. */
export interface ZoneSnap extends EntityBase {
  kind: 'zone';
  /** Picks the client look + behaviour readout. */
  variant: 'garden' | 'dome' | 'pod' | 'curse' | 'trail';
  tLeft: number;
  duration: number;
}

/** Piper's companion: untargetable, undamageable, always on stage. */
export interface PetSnap extends EntityBase {
  kind: 'pet';
  unitId: string;
  /** Running an errand (fetch or Q dash) rather than orbiting. */
  busy: boolean;
  /** Fed by an unclaimed snack — the next fetch hits twice as hard. */
  empowered: boolean;
}

/** A dropped snack waiting for an ally (Piper W). */
export interface PickupSnap extends EntityBase {
  kind: 'pickup';
  unitId: string;
  tLeft: number;
  /** Toss arc phase 0..1 while it is still in the air. */
  tossPhase?: number;
}

export type EntitySnap =
  | ChampionSnap
  | DummySnap
  | KegSnap
  | WallSnap
  | ProjectileSnap
  | MiniSnap
  | TowerSnap
  | CoreSnap
  | OrbSnap
  | FlowerSnap
  | ZoneSnap
  | PetSnap
  | PickupSnap;

/* --------------------------------- Events --------------------------------- */

export interface MatchStateSnap {
  mode: 'training' | 'bridge';
  /** Seconds since match start. */
  time: number;
  barrierDown: boolean;
  teamKills: [number, number];
  towersDown: [number, number];
  over: { winner: Team } | null;
  /** Seconds until next orb spawn (HUD ticker). */
  nextOrbIn: number | null;
  /** 16:00 Corebreaker active (cores take double damage, all-Ram waves). */
  overtime: boolean;
  /** 20:00 Core decay active. */
  suddenDeath: boolean;
}

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
  | {
      t: 'castDenied';
      player: PlayerId;
      reason: 'cooldown' | 'energy' | 'dead' | 'casting' | 'level';
    }
  | { t: 'dummyReset'; id: EntityId }
  | {
      t: 'kill';
      killer: PlayerId | null;
      victim: PlayerId;
      assists: PlayerId[];
      x: number;
      z: number;
    }
  | { t: 'towerDown'; team: Team; tier: 'outer' | 'inner'; byTeam: Team }
  | { t: 'matchOver'; winner: Team }
  | {
      t: 'purchase';
      player: PlayerId;
      itemId: string;
      ok: boolean;
      reason?: 'gold' | 'slots' | 'zone' | 'owned';
    }
  | { t: 'barrierDown' }
  | { t: 'overtime' }
  | { t: 'suddenDeath' }
  | { t: 'ping'; player: PlayerId; team: Team; kind: PingKind; x: number; z: number }
  | { t: 'surrendered'; team: Team }
  /* Draft events carry `team` so the server can scope them like pings: an
   * enemy must never see your offers (UI_UX §9) or learn a pick before the
   * card shows itself on the field (AUGMENTS §1, the visibility mandate). */
  | { t: 'draftOpen'; player: PlayerId; team: Team; index: number; offers: string[] }
  | { t: 'draftReroll'; player: PlayerId; team: Team; offers: string[] }
  | {
      t: 'augmentPicked';
      player: PlayerId;
      team: Team;
      augmentId: string;
      index: number;
      /** True when the 45 s timer ran out and the coach picked for you. */
      auto: boolean;
    };

export interface Snapshot {
  tick: number;
  time: number;
  match: MatchStateSnap;
  entities: EntitySnap[];
  events: SimEvent[];
}

/* ---------------------------------- Lobby --------------------------------- */

/** One of 8 lobby seats (two team columns × 4). */
export interface LobbySeatSnap {
  team: Team;
  /** 0..3 within the team column. */
  idx: number;
  occupant:
    | { kind: 'human'; key: string; name: string; ready: boolean; leader: boolean }
    | { kind: 'bot'; tier: BotTier }
    | null;
}

/** Broadcast to every member on any lobby mutation. */
export interface LobbySnap {
  code: string;
  phase: 'lobby' | 'select';
  seats: LobbySeatSnap[];
  botFill: boolean;
  /** Why START is unavailable right now (null = leader can start). */
  startBlocked: string | null;
}

/** Per-client champion-select view — enemy picks never cross the wire. */
export interface LobbySelectSnap {
  timeLeft: number;
  /** Your duo: [active, bench] — both are yours, either may be rerolled. */
  you: { duo: [string, string]; rerolls: number; locked: boolean };
  /** Your team's four duo cards in seat order (includes you). */
  team: {
    key: string;
    name: string;
    duo: [string, string];
    locked: boolean;
    bot: boolean;
    you: boolean;
  }[];
  /** Shared team bench (rerolled champions, first-come swaps). */
  bench: string[];
  /** Enemy cards to draw face-down. */
  enemyCount: number;
}

/** Handoff into the authoritative match room once everyone locked. */
export interface LobbyMatchMsg {
  roomId: string;
  token: string;
  seat: PlayerId;
}

export type LobbyClientMsg =
  | { t: 'seat'; team: Team; idx: number }
  | { t: 'bot'; team: Team; idx: number; tier: BotTier | null }
  | { t: 'fill'; on: boolean }
  | { t: 'ready'; on: boolean }
  | { t: 'start' }
  /** Reroll one half of your duo (slot 0 = active, 1 = bench). */
  | { t: 'reroll'; slot: 0 | 1 }
  /** Swap a team-bench champion into one of your duo slots. */
  | { t: 'swap'; championId: string; slot: 0 | 1 }
  | { t: 'lock' };

/* ------------------------------- Worker link ------------------------------ */

export type ClientToWorker =
  | { t: 'init'; config: MatchConfig }
  | { t: 'intents'; msgs: IntentMsg[] }
  | { t: 'stop' };

export type WorkerToClient =
  | { t: 'ready' }
  | { t: 'snapshot'; snap: Snapshot }
  | { t: 'fatal'; message: string };
export { BASELINE_EVERY, SnapshotDecoder, SnapshotEncoder } from './codec';
