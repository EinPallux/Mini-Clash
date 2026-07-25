/** Core content types. All gameplay content is data conforming to these shapes. */

export type Team = 0 | 1;
export type DamageType = 'physical' | 'arcane';
export type Slot = 'q' | 'w' | 'r';
export type Role =
  | 'vanguard'
  | 'bruiser'
  | 'slayer'
  | 'gunner'
  | 'caster'
  | 'support'
  | 'specialist';

/** `base + perLevel*(level-1) + adRatio*AD + apRatio*AP` — resolved by the sim. */
export interface ScalingValue {
  base: number;
  perLevel?: number;
  adRatio?: number;
  apRatio?: number;
}

export type CcKind = 'slow' | 'root' | 'stun' | 'knockup' | 'knockback' | 'fear';

export interface CcSpec {
  kind: CcKind;
  /** seconds */
  duration: number;
  /** slow: fraction (0.25 = 25%). knockback: distance in units. */
  strength?: number;
}

/** Shapes for area effects, relative to an origin + facing. */
export type AreaShape =
  | { kind: 'circle'; radius: number }
  | { kind: 'cone'; radius: number; angleDeg: number }
  | { kind: 'rect'; length: number; width: number };

export interface BuffDef {
  id: string;
  name: string;
  duration: number;
  /** Additive stat deltas. */
  add?: Partial<Record<StatKey, number>>;
  /** Multiplicative stat factors (1.15 = +15%). */
  mul?: Partial<Record<StatKey, number>>;
  /** Fraction of incoming damage ignored (0.25 = 25% DR). */
  damageReduction?: number;
  /** Movement-speed burst that decays linearly to 0 over the duration. */
  decayingMsBonus?: number;
  /** Absorb pool granted on application (Horn of Rally, Nullwave). */
  shield?: number;
  /** Additive damage-dealt fraction per stack (+0.04 = +4%; negative = dampen). */
  damageAmp?: number;
  maxStacks?: number;
}

export type StatKey =
  | 'hpMax'
  | 'ad'
  | 'ap'
  | 'attackSpeed'
  | 'moveSpeed'
  | 'armor'
  | 'ward'
  | 'haste'
  | 'range';

export interface ProjectileDef {
  id: string;
  speed: number;
  radius: number;
  maxRange: number;
  /** What stops it. Units always block unless listed; walls always block. */
  pierces?: 'none' | 'all';
  /** Carries through targets it kills (Mortis Q overkill rewards wave-timing). */
  pierceOnKill?: boolean;
  /** Damage multiplier vs targets carrying a buff (Wisp Boo +25% vs Chilled). */
  bonusVsBuff?: { buff: string; mul: number };
  /** Pulse damage at fixed travel distances (skipshot); each unit hit once per projectile. */
  pulses?: { atDistance: number; radius: number; damageMul: number }[];
  /** FX timeline fired at each pulse position. */
  pulseFx?: string;
  damage?: { amount: ScalingValue; type: DamageType };
  cc?: CcSpec;
  onHit?: Action[];
  visual: ProjectileVisual;
}

export interface ProjectileVisual {
  /** 'orb' = glowing sphere; 'model' = asset mesh. */
  kind: 'orb' | 'model';
  model?: string;
  size: number;
  color: number;
  trail?: { color: number; width: number; life: number };
  spin?: number;
  arcHeight?: number;
}

/** Declarative ability actions, interpreted by the sim at cast commit (and nested triggers). */
export type Action =
  | {
      t: 'areaDamage';
      at: TargetPoint;
      shape: AreaShape;
      amount: ScalingValue;
      type: DamageType;
      cc?: CcSpec;
      /** Applied to Minis instead of `cc` (Grukk's Bellow fears Minis, slows champions). */
      ccMinis?: CcSpec;
      /** Extra cc duration when the target carries this buff (Mortis vs inscribed). */
      ccBonusBuff?: { buff: string; extra: number };
      /** Resolve after this many seconds (telegraphed eruptions). Position locks at cast. */
      delay?: number;
      /** FX timeline fired at the aim point when the delay starts. */
      telegraphFx?: string;
      alsoStructures?: boolean;
    }
  | { t: 'projectile'; proj: string; angleOffsetDeg?: number }
  | {
      t: 'buff';
      buff: string;
      who: 'self' | 'alliesInShape' | 'enemiesInShape';
      at?: TargetPoint;
      shape?: AreaShape;
    }
  | { t: 'leap'; toAim: true; duration: number; onLand: Action[] }
  | { t: 'wall'; length: number; thickness: number; duration: number; allyBuff?: string }
  | { t: 'summon'; unit: string; at: TargetPoint; arcToss?: boolean }
  | {
      t: 'volley';
      length: number;
      width: number;
      count: number;
      interval: number;
      startDelay?: number;
      pulseRadius: number;
      amount: ScalingValue;
      type: DamageType;
      maxHitsPerTarget: number;
    }
  | { t: 'heal'; who: 'self'; amount: ScalingValue }
  /** Caster-centred channel: damage ticks follow the caster (Mortis R). */
  | {
      t: 'channel';
      duration: number;
      tickEvery: number;
      radius: number;
      amount: ScalingValue;
      type: DamageType;
      /** Move-speed multiplier while channelling. */
      moveSpeedMul: number;
      /** Applied to each tick's victims (approximates the leave-slow). */
      ccPerTick?: CcSpec;
      tickFx?: string;
    }
  /** Line dash toward aim with a sweep hit; champions in the far `zone` are pulled back. */
  | {
      t: 'dash';
      distance: number;
      duration: number;
      width: number;
      amount?: ScalingValue;
      type?: DamageType;
      tipPull?: { zone: number; pull: number };
      /** Untargetable for the duration (Vex dissolves into bats). */
      untargetable?: boolean;
      /** Heal on landing; `missingHpFrac` scales off HP already lost. */
      healOnLand?: { base: number; perLevel?: number; missingHpFrac?: number };
    }
  /** Spawn a destructible marker (Rattle's skull) and remember it in passive scratch. */
  | { t: 'placeMarker'; marker: string; unit: string; duration: number }
  /** Blink to the remembered marker if it still stands, consuming it. */
  | { t: 'blinkToMarker'; marker: string }
  /** Blink behind the nearest enemy champion at the aim point and strike (Rattle R). */
  | {
      t: 'blinkStrike';
      amount: ScalingValue;
      type: DamageType;
      behind: number;
      /** Kill within this window refunds the slot's cooldown fraction + grants MS. */
      harvest?: { window: number; refund: number; msBonus: number; msDuration: number };
    }
  /** Self shield (absorb pool) — Grukk's Bellow. */
  | { t: 'shieldSelf'; buffId: string; amount: ScalingValue; duration: number }
  /** Bloom the caster's flowers inside a shape (Sylva). */
  | { t: 'bloom'; at: TargetPoint; shape: AreaShape }
  /** Garden zone at aim: ally heal-over-time, slow-cleanse, enemy damage dampen (Sylva W). */
  | {
      t: 'zone';
      radius: number;
      duration: number;
      healPerSec: ScalingValue;
      cleanseSlows: boolean;
      enemyDamageAmp: number;
    }
  /** Vine cone: damage + root extended per bloomed flower in the cone (Sylva R). */
  | {
      t: 'vineGrasp';
      shape: AreaShape;
      amount: ScalingValue;
      type: DamageType;
      baseRoot: number;
      rootPerFlower: number;
      rootMax: number;
      flowerHealRadius: number;
    }
  /** Instant hitscan line from the caster along facing (Boltz Q Arc Zapper). */
  | {
      t: 'beam';
      length: number;
      width: number;
      amount: ScalingValue;
      type: DamageType;
      /** Extra multiplier vs targets that currently hold a shield. */
      vsShieldMul?: number;
      /** Energy refunded once when the beam strikes an enemy champion. */
      energyRefundOnChamp?: number;
      /** Self-buff applied when the beam catches a champion (Vex's lunge primer). */
      onChampBuffSelf?: string;
      fx?: string;
    }
  /** Deployable circular field: an energy dome or a droppod bunker (Boltz W/R). */
  | {
      t: 'field';
      at: TargetPoint;
      variant: 'dome' | 'pod';
      radius: number;
      duration: number;
      /** Pops enemy projectiles crossing the shell (dome + pod). */
      blocksProjectiles?: boolean;
      /** Stamps a nav obstacle for the lifetime (pod bunker). */
      blocksMovement?: boolean;
      /** Buff refreshed on allies inside each tick (dome attack-speed aura). */
      allyBuff?: string;
      /** Telegraphed drop: warning now, resolve after `delay` at the locked point. */
      delay?: number;
      telegraphFx?: string;
      /** Impact burst when the field lands (pod slam). */
      impact?: {
        amount: ScalingValue;
        type: DamageType;
        radius: number;
        cc?: CcSpec;
        fx?: string;
      };
    }
  /** Cursed ground: enemy damage-over-time + debuff, Minis disabled, expiry fear (Wisp R). */
  | {
      t: 'curse';
      at: TargetPoint;
      radius: number;
      duration: number;
      dmgPerSec: ScalingValue;
      type: DamageType;
      /** Debuff refreshed on enemies inside each tick (Chill). */
      enemyBuff?: string;
      /** Minis inside stop fighting for anyone. */
      disableMinis?: boolean;
      /** Enemy champions still inside at expiry are Feared away from center this long. */
      expireFear?: number;
      tickFx?: string;
    }
  /** Blink to the aim point, optionally dropping a decoy and cloaking (Wisp W). */
  | {
      t: 'blink';
      /** Destructible decoy unit dropped at the pre-blink position. */
      decoy?: string;
      decoyDuration?: number;
      /** Self buff applied on arrival (invisibility). */
      selfBuff?: string;
    }
  /** Send the caster's pet down a line as a skillshot (Piper Q). */
  | {
      t: 'petDash';
      distance: number;
      width: number;
      amount: ScalingValue;
      type: DamageType;
      /** Flat Move Speed stolen from the first champion hit. */
      stealMs?: { amount: number; duration: number };
    }
  /** Droppable pickup that heals the first ally to touch it (Piper W). */
  | {
      t: 'pickup';
      unit: string;
      heal: ScalingValue;
      duration: number;
      /** Unclaimed: the pet eats it and the owner heals this fraction instead. */
      ownerFallbackFrac?: number;
      /** The owner's pet's next fetch is empowered. */
      empowersPet?: boolean;
    }
  /** Repeated area pulses in one shape; a victim caught by every wave takes `ccOnAllWaves`. */
  | {
      t: 'waves';
      shape: AreaShape;
      count: number;
      interval: number;
      startDelay?: number;
      amount: ScalingValue;
      type: DamageType;
      cc?: CcSpec;
      ccOnAllWaves?: CcSpec;
      waveFx?: string;
    }
  /** Mark enemies in a shape as "guests": the caster hits and heals harder against them. */
  | {
      t: 'invite';
      at: TargetPoint;
      shape: AreaShape;
      buff: string;
      damageAmp: number;
      healPct: number;
      /** A guest dying refunds this ability slot entirely. */
      resetSlotOnGuestDeath?: Slot;
    };

export type TargetPoint = 'aim' | 'self';

export interface AbilityDef {
  id: string;
  slot: Slot;
  name: string;
  description: string;
  cost: number;
  cooldown: number;
  /** Seconds of wind-up before commit. Movement locked, turn allowed. */
  castTime: number;
  range: number;
  aim: 'skillshot' | 'point' | 'self' | 'direction';
  /** Aim indicator for the client. */
  indicator:
    | AreaShape
    | { kind: 'line'; length: number; width: number }
    | { kind: 'point'; radius: number };
  actions: Action[];
  /** Optional recast stage (Rook Q backswing; Grukk R chains slams via `charges`). */
  recast?: {
    window: number;
    actions: Action[];
    name: string;
    /** How many recasts fit in the window (default 1). */
    charges?: number;
    /** Actions for the final recast, if different (Grukk's knock-up slam). */
    finalActions?: Action[];
  };
  /** Recovery fraction of castTime tail that can be move-cancelled (feel rule; client-side). */
  unlocksAt?: number;
}

export interface AttackDef {
  kind: 'melee' | 'ranged';
  /** Fraction of the attack interval spent winding up before the hit lands / projectile spawns. */
  windupFrac: number;
  /** Melee arc reach beyond range is implicit; ranged spawns a homing missile. */
  missile?: { speed: number; size: number; color: number };
}

export interface ChampionStats {
  hp: number;
  hpPerLevel: number;
  /** % max HP per second. */
  regenPctPerSec: number;
  ad: number;
  adPerLevel: number;
  attackSpeed: number;
  attackSpeedPerLevel: number;
  moveSpeed: number;
  range: number;
  armor: number;
  armorPerLevel: number;
  ward: number;
  wardPerLevel: number;
  /** Collision radius in units. */
  radius: number;
}

export interface PropAttachment {
  /** Path inside the asset manifest. */
  model: string;
  socket: 'handRight' | 'handLeft' | 'back' | 'root';
  scale?: number;
  position?: [number, number, number];
  rotationDeg?: [number, number, number];
}

/** Logical animation states → source clip names (per rig family) with retime factors. */
export type AnimMap = Record<string, { clip: string; speed?: number; loop?: boolean }>;

export interface ChampionVisual {
  model: string;
  scale: number;
  props: PropAttachment[];
  /** Material tint overrides by mesh-name substring (palette variant). */
  tints?: Record<string, number>;
  /** Translucent bubble helmet over the head (Boltz the astronaut). */
  helmet?: { color: number; radius: number; y: number };
  anim: AnimMap;
  portraitColor: number;
}

export interface PassiveDef {
  id: string;
  name: string;
  description: string;
  params: Record<string, number>;
}

export interface ChampionDef {
  id: string;
  name: string;
  title: string;
  role: Role;
  difficulty: 1 | 2 | 3;
  stats: ChampionStats;
  attack: AttackDef;
  passive: PassiveDef;
  abilities: Record<Slot, AbilityDef>;
  entrance: PassiveDef;
  /** Bot shopping list: relic + item purchase order (components auto-discount). */
  botBuild: { relic: string; items: string[] };
  visual: ChampionVisual;
}

export interface UnitDef {
  id: string;
  name: string;
  hp: number;
  armor: number;
  ward: number;
  radius: number;
  /** Dummies clamp at 1 HP and reset; destructibles die; pets are untargetable companions. */
  behavior: 'dummy' | 'destructible' | 'mini' | 'pet' | 'pickup';
  /** Seconds of no damage before a dummy resets to full and closes its DPS window. */
  resetAfter?: number;
  /** Destructibles that explode (powder keg): fires on death OR after `delay` seconds. Scales off owner stats. */
  explode?: { delay: number; radius: number; amount: ScalingValue; type: DamageType; cc?: CcSpec };
  /** Mini combat block (behavior 'mini'). */
  mini?: {
    kind: 'bruiser' | 'zapper' | 'ram';
    damage: number;
    range: number;
    attackInterval: number;
    moveSpeed: number;
    aggroRange: number;
    gold: number;
    xp: number;
    /** Damage multiplier vs structures / taken-from-structures multiplier. */
    vsStructures: number;
    fromStructures: number;
    /** Damage multiplier vs other Minis (waves must grind through each other). */
    vsMinis: number;
    /** Per-minute stat scaling (+3%/min). */
    scalePerMin: number;
  };
  visual: {
    model?: string;
    prim?: 'barrel';
    scale: number;
    tint?: number;
    /** Animated units (Minis) map logical states to clips like champions do. */
    anim?: AnimMap;
    props?: PropAttachment[];
  };
}

export interface MapProp {
  model: string;
  position: [number, number, number];
  rotationDeg?: number;
  /** Uniform, or per-axis [x, y, z] (rails: wide without growing tall). */
  scale?: number | [number, number, number];
  tint?: number;
}

export interface MapObstacle {
  /** Axis-aligned box blocking movement, or circle. */
  shape:
    | { kind: 'box'; x: number; z: number; w: number; d: number }
    | { kind: 'circle'; x: number; z: number; r: number };
}

export interface MapDef {
  id: string;
  name: string;
  /** Playable bounds (navgrid covers this). */
  width: number;
  height: number;
  navCell: number;
  obstacles: MapObstacle[];
  props: MapProp[];
  floor: {
    tile: string;
    accentTile: string;
    size: number;
    /** Limit floor tiles to |z| ≤ deckHalf (sky-bridge over the void). */
    deckHalf?: number;
    /** Drop a deterministic scatter of edge tiles (fractured-bridge silhouette). */
    frayEnds?: boolean;
  };
  skybox: string;
  spawns: { team: Team; x: number; z: number; facingDeg: number }[];
  dummies: { unit: string; x: number; z: number }[];
  /** Bridge-mode battlefield (GAME_DESIGN §6). Absent on training maps. */
  battle?: {
    towers: { team: Team; x: number; z: number; tier: 'outer' | 'inner' }[];
    cores: { team: Team; x: number; z: number }[];
    gates: { team: Team; x: number; z: number }[];
    /** Mini marching route for team 0 (team 1 walks it reversed). */
    lane: [number, number][];
    orbPads: { x: number; z: number }[];
    brush: { x: number; z: number; w: number; d: number }[];
    /** Spawn barrier drops at this many seconds (movement gate at each team's gate line). */
    barrierUntil: number;
    firstWaveAt: number;
    waveEvery: number;
    orbEvery: number;
    firstOrbAt: number;
  };
  lighting: {
    sunDir: [number, number, number];
    sunColor: number;
    skyColor: number;
    groundColor: number;
    sunIntensity: number;
    ambientIntensity: number;
  };
}

/* ------------------------------- FX timelines ------------------------------- */

export type FxOp =
  | {
      t: 'burst';
      at: FxAnchor;
      count: number;
      color: number;
      color2?: number;
      size: number;
      speed: number;
      spread?: number;
      up?: number;
      life: number;
      gravity?: number;
      shape?: 'spark' | 'puff' | 'shard' | 'ring';
      offset?: [number, number, number];
    }
  | {
      t: 'ring';
      at: FxAnchor;
      color: number;
      radius: number;
      width?: number;
      life: number;
      offset?: [number, number, number];
    }
  | {
      t: 'decal';
      at: FxAnchor;
      kind: 'crack' | 'scorch' | 'splat';
      color: number;
      radius: number;
      life: number;
      offset?: [number, number, number];
    }
  | { t: 'flash'; at: FxAnchor; color: number; life: number }
  | { t: 'light'; at: FxAnchor; color: number; intensity: number; radius: number; life: number }
  | { t: 'shake'; power: 's' | 'm' | 'l' }
  | { t: 'hitstop'; ms: number }
  | { t: 'sound'; cue: string; volume?: number }
  | {
      t: 'ribbonSweep';
      at: FxAnchor;
      color: number;
      radius: number;
      angleDeg: number;
      life: number;
    }
  | {
      t: 'prop';
      model: string;
      at: FxAnchor;
      scale?: number;
      life: number;
      toss?: boolean;
      spinSpeed?: number;
      riseFrom?: number;
      sink?: boolean;
      offset?: [number, number, number];
    };

export type FxAnchor = 'origin' | 'aim' | 'target' | 'self';

export interface FxTimeline {
  id: string;
  events: { time: number; op: FxOp }[];
}

/* --------------------------------- Audio --------------------------------- */

/** Procedural synth recipe (sfxr-style), baked to buffers at load. */
export interface SynthCue {
  id: string;
  layers: SynthLayer[];
}

export interface SynthLayer {
  wave: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
  freq: number;
  freqEnd?: number;
  /** seconds */
  attack: number;
  decay: number;
  volume: number;
  delay?: number;
  /** Lowpass cutoff Hz (noise thumps). */
  lowpass?: number;
  slide?: 'lin' | 'exp';
}
