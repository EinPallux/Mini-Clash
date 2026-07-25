import { z } from 'zod';

/** zod validation for content definitions. Content tests parse every def through these. */

const scaling = z.object({
  base: z.number(),
  perLevel: z.number().optional(),
  adRatio: z.number().optional(),
  apRatio: z.number().optional(),
});

const cc = z.object({
  kind: z.enum(['slow', 'root', 'stun', 'knockup', 'knockback', 'fear']),
  duration: z.number().positive(),
  strength: z.number().optional(),
});

const shape = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('circle'), radius: z.number().positive() }),
  z.object({
    kind: z.literal('cone'),
    radius: z.number().positive(),
    angleDeg: z.number().positive().max(360),
  }),
  z.object({
    kind: z.literal('rect'),
    length: z.number().positive(),
    width: z.number().positive(),
  }),
]);

const statKey = z.enum([
  'hpMax',
  'ad',
  'ap',
  'attackSpeed',
  'moveSpeed',
  'armor',
  'ward',
  'haste',
  'range',
]);

export const buffSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  duration: z.number().positive(),
  add: z.record(statKey, z.number()).optional(),
  mul: z.record(statKey, z.number()).optional(),
  damageReduction: z.number().min(0).max(1).optional(),
  decayingMsBonus: z.number().optional(),
  shield: z.number().positive().optional(),
  damageAmp: z.number().min(-0.9).optional(),
  maxStacks: z.number().int().positive().optional(),
});

const targetPoint = z.enum(['aim', 'self']);

const action: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('t', [
    z.object({
      t: z.literal('areaDamage'),
      at: targetPoint,
      shape,
      amount: scaling,
      type: z.enum(['physical', 'arcane']),
      cc: cc.optional(),
      ccMinis: cc.optional(),
      ccBonusBuff: z.object({ buff: z.string(), extra: z.number().positive() }).optional(),
      delay: z.number().positive().optional(),
      telegraphFx: z.string().optional(),
      alsoStructures: z.boolean().optional(),
    }),
    z.object({
      t: z.literal('projectile'),
      proj: z.string(),
      angleOffsetDeg: z.number().optional(),
    }),
    z.object({
      t: z.literal('buff'),
      buff: z.string(),
      who: z.enum(['self', 'alliesInShape', 'enemiesInShape']),
      at: targetPoint.optional(),
      shape: shape.optional(),
    }),
    z.object({
      t: z.literal('leap'),
      toAim: z.literal(true),
      duration: z.number().positive(),
      onLand: z.array(action),
    }),
    z.object({
      t: z.literal('wall'),
      length: z.number().positive(),
      thickness: z.number().positive(),
      duration: z.number().positive(),
      allyBuff: z.string().optional(),
    }),
    z.object({
      t: z.literal('summon'),
      unit: z.string(),
      at: targetPoint,
      arcToss: z.boolean().optional(),
    }),
    z.object({
      t: z.literal('volley'),
      length: z.number().positive(),
      width: z.number().positive(),
      count: z.number().int().positive(),
      interval: z.number().positive(),
      startDelay: z.number().min(0).optional(),
      pulseRadius: z.number().positive(),
      amount: scaling,
      type: z.enum(['physical', 'arcane']),
      maxHitsPerTarget: z.number().int().positive(),
    }),
    z.object({ t: z.literal('heal'), who: z.literal('self'), amount: scaling }),
    z.object({
      t: z.literal('channel'),
      duration: z.number().positive(),
      tickEvery: z.number().positive(),
      radius: z.number().positive(),
      amount: scaling,
      type: z.enum(['physical', 'arcane']),
      moveSpeedMul: z.number().positive().max(1),
      ccPerTick: cc.optional(),
      tickFx: z.string().optional(),
    }),
    z.object({
      t: z.literal('dash'),
      distance: z.number().positive(),
      duration: z.number().positive(),
      width: z.number().positive(),
      amount: scaling.optional(),
      type: z.enum(['physical', 'arcane']).optional(),
      tipPull: z.object({ zone: z.number().positive(), pull: z.number().positive() }).optional(),
      untargetable: z.boolean().optional(),
      healOnLand: z
        .object({
          base: z.number(),
          perLevel: z.number().optional(),
          missingHpFrac: z.number().optional(),
        })
        .optional(),
    }),
    z.object({
      t: z.literal('placeMarker'),
      marker: z.string().min(1),
      unit: z.string().min(1),
      duration: z.number().positive(),
    }),
    z.object({ t: z.literal('blinkToMarker'), marker: z.string().min(1) }),
    z.object({
      t: z.literal('blinkStrike'),
      amount: scaling,
      type: z.enum(['physical', 'arcane']),
      behind: z.number().positive(),
      harvest: z
        .object({
          window: z.number().positive(),
          refund: z.number().positive().max(1),
          msBonus: z.number().positive(),
          msDuration: z.number().positive(),
        })
        .optional(),
    }),
    z.object({
      t: z.literal('shieldSelf'),
      buffId: z.string().min(1),
      amount: scaling,
      duration: z.number().positive(),
    }),
    z.object({ t: z.literal('bloom'), at: targetPoint, shape }),
    z.object({
      t: z.literal('zone'),
      radius: z.number().positive(),
      duration: z.number().positive(),
      healPerSec: scaling,
      cleanseSlows: z.boolean(),
      enemyDamageAmp: z.number().min(-0.9).max(0),
    }),
    z.object({
      t: z.literal('vineGrasp'),
      shape,
      amount: scaling,
      type: z.enum(['physical', 'arcane']),
      baseRoot: z.number().positive(),
      rootPerFlower: z.number().positive(),
      rootMax: z.number().positive(),
      flowerHealRadius: z.number().positive(),
    }),
    z.object({
      t: z.literal('beam'),
      length: z.number().positive(),
      width: z.number().positive(),
      amount: scaling,
      type: z.enum(['physical', 'arcane']),
      vsShieldMul: z.number().positive().optional(),
      energyRefundOnChamp: z.number().min(0).optional(),
      onChampBuffSelf: z.string().optional(),
      fx: z.string().optional(),
    }),
    z.object({
      t: z.literal('field'),
      at: targetPoint,
      variant: z.enum(['dome', 'pod']),
      radius: z.number().positive(),
      duration: z.number().positive(),
      blocksProjectiles: z.boolean().optional(),
      blocksMovement: z.boolean().optional(),
      allyBuff: z.string().optional(),
      delay: z.number().positive().optional(),
      telegraphFx: z.string().optional(),
      impact: z
        .object({
          amount: scaling,
          type: z.enum(['physical', 'arcane']),
          radius: z.number().positive(),
          cc: cc.optional(),
          fx: z.string().optional(),
        })
        .optional(),
    }),
    z.object({
      t: z.literal('curse'),
      at: targetPoint,
      radius: z.number().positive(),
      duration: z.number().positive(),
      dmgPerSec: scaling,
      type: z.enum(['physical', 'arcane']),
      enemyBuff: z.string().optional(),
      disableMinis: z.boolean().optional(),
      expireFear: z.number().positive().optional(),
      tickFx: z.string().optional(),
    }),
    z.object({
      t: z.literal('blink'),
      decoy: z.string().optional(),
      decoyDuration: z.number().positive().optional(),
      selfBuff: z.string().optional(),
    }),
    z.object({
      t: z.literal('petDash'),
      distance: z.number().positive(),
      width: z.number().positive(),
      amount: scaling,
      type: z.enum(['physical', 'arcane']),
      stealMs: z
        .object({ amount: z.number().positive(), duration: z.number().positive() })
        .optional(),
    }),
    z.object({
      t: z.literal('pickup'),
      unit: z.string().min(1),
      heal: scaling,
      duration: z.number().positive(),
      ownerFallbackFrac: z.number().min(0).max(1).optional(),
      empowersPet: z.boolean().optional(),
    }),
    z.object({
      t: z.literal('waves'),
      shape,
      count: z.number().int().positive(),
      interval: z.number().positive(),
      startDelay: z.number().min(0).optional(),
      amount: scaling,
      type: z.enum(['physical', 'arcane']),
      cc: cc.optional(),
      ccOnAllWaves: cc.optional(),
      waveFx: z.string().optional(),
    }),
    z.object({
      t: z.literal('invite'),
      at: targetPoint,
      shape,
      buff: z.string().min(1),
      damageAmp: z.number(),
      healPct: z.number().min(0).max(1),
      resetSlotOnGuestDeath: z.enum(['q', 'w', 'r']).optional(),
    }),
  ]),
);

export const projectileSchema = z.object({
  id: z.string().min(1),
  speed: z.number().positive(),
  radius: z.number().positive(),
  maxRange: z.number().positive(),
  pierces: z.enum(['none', 'all']).optional(),
  pierceOnKill: z.boolean().optional(),
  bonusVsBuff: z.object({ buff: z.string().min(1), mul: z.number().positive() }).optional(),
  pulses: z
    .array(
      z.object({
        atDistance: z.number().positive(),
        radius: z.number().positive(),
        damageMul: z.number().positive(),
      }),
    )
    .optional(),
  pulseFx: z.string().optional(),
  damage: z.object({ amount: scaling, type: z.enum(['physical', 'arcane']) }).optional(),
  cc: cc.optional(),
  onHit: z.array(action).optional(),
  visual: z.object({
    kind: z.enum(['orb', 'model']),
    model: z.string().optional(),
    size: z.number().positive(),
    color: z.number(),
    trail: z.object({ color: z.number(), width: z.number(), life: z.number() }).optional(),
    spin: z.number().optional(),
    arcHeight: z.number().optional(),
  }),
});

const indicator = z.union([
  shape,
  z.object({
    kind: z.literal('line'),
    length: z.number().positive(),
    width: z.number().positive(),
  }),
  z.object({ kind: z.literal('point'), radius: z.number().positive() }),
]);

export const abilitySchema = z.object({
  id: z.string().min(1),
  slot: z.enum(['q', 'w', 'r']),
  name: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().min(0),
  cooldown: z.number().positive(),
  castTime: z.number().min(0),
  range: z.number().min(0),
  aim: z.enum(['skillshot', 'point', 'self', 'direction']),
  indicator,
  actions: z.array(action).min(1),
  recast: z
    .object({
      window: z.number().positive(),
      actions: z.array(action).min(1),
      name: z.string(),
      charges: z.number().int().positive().optional(),
      finalActions: z.array(action).min(1).optional(),
    })
    .optional(),
  unlocksAt: z.number().optional(),
});

export const championSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  title: z.string().min(1),
  role: z.enum(['vanguard', 'bruiser', 'slayer', 'gunner', 'caster', 'support', 'specialist']),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  stats: z.object({
    hp: z.number().positive(),
    hpPerLevel: z.number().min(0),
    regenPctPerSec: z.number().min(0),
    ad: z.number().positive(),
    adPerLevel: z.number().min(0),
    attackSpeed: z.number().positive(),
    attackSpeedPerLevel: z.number().min(0),
    moveSpeed: z.number().positive(),
    range: z.number().positive(),
    armor: z.number().min(0),
    armorPerLevel: z.number().min(0),
    ward: z.number().min(0),
    wardPerLevel: z.number().min(0),
    radius: z.number().positive(),
  }),
  attack: z.object({
    kind: z.enum(['melee', 'ranged']),
    windupFrac: z.number().min(0).max(1),
    missile: z
      .object({ speed: z.number().positive(), size: z.number().positive(), color: z.number() })
      .optional(),
  }),
  passive: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    params: z.record(z.string(), z.number()),
  }),
  abilities: z.object({ q: abilitySchema, w: abilitySchema, r: abilitySchema }),
  entrance: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    params: z.record(z.string(), z.number()),
  }),
  botBuild: z.object({ relic: z.string().min(1), items: z.array(z.string()).min(4) }),
  visual: z.object({
    model: z.string(),
    scale: z.number().positive(),
    props: z.array(
      z.object({
        model: z.string(),
        socket: z.enum(['handRight', 'handLeft', 'back', 'root']),
        scale: z.number().optional(),
        position: z.tuple([z.number(), z.number(), z.number()]).optional(),
        rotationDeg: z.tuple([z.number(), z.number(), z.number()]).optional(),
      }),
    ),
    tints: z.record(z.string(), z.number()).optional(),
    helmet: z
      .object({ color: z.number(), radius: z.number().positive(), y: z.number() })
      .optional(),
    anim: z.record(
      z.string(),
      z.object({ clip: z.string(), speed: z.number().optional(), loop: z.boolean().optional() }),
    ),
    portraitColor: z.number(),
  }),
});

export const unitSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  hp: z.number().positive(),
  armor: z.number().min(0),
  ward: z.number().min(0),
  radius: z.number().positive(),
  behavior: z.enum(['dummy', 'destructible', 'mini', 'pet', 'pickup']),
  resetAfter: z.number().positive().optional(),
  mini: z
    .object({
      kind: z.enum(['bruiser', 'zapper', 'ram']),
      damage: z.number().positive(),
      range: z.number().positive(),
      attackInterval: z.number().positive(),
      moveSpeed: z.number().positive(),
      aggroRange: z.number().positive(),
      gold: z.number().positive(),
      xp: z.number().positive(),
      vsStructures: z.number().positive(),
      fromStructures: z.number().positive(),
      vsMinis: z.number().positive(),
      scalePerMin: z.number().min(0),
    })
    .optional(),
  explode: z
    .object({
      delay: z.number().positive(),
      radius: z.number().positive(),
      amount: scaling,
      type: z.enum(['physical', 'arcane']),
      cc: cc.optional(),
    })
    .optional(),
  visual: z.object({
    model: z.string().optional(),
    prim: z.enum(['barrel']).optional(),
    scale: z.number().positive(),
    tint: z.number().optional(),
    anim: z
      .record(
        z.string(),
        z.object({ clip: z.string(), speed: z.number().optional(), loop: z.boolean().optional() }),
      )
      .optional(),
    props: z
      .array(
        z.object({
          model: z.string(),
          socket: z.enum(['handRight', 'handLeft', 'back', 'root']),
          scale: z.number().optional(),
          position: z.tuple([z.number(), z.number(), z.number()]).optional(),
          rotationDeg: z.tuple([z.number(), z.number(), z.number()]).optional(),
        }),
      )
      .optional(),
  }),
});

export const mapSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  navCell: z.number().positive(),
  obstacles: z.array(
    z.object({
      shape: z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('box'),
          x: z.number(),
          z: z.number(),
          w: z.number().positive(),
          d: z.number().positive(),
        }),
        z.object({
          kind: z.literal('circle'),
          x: z.number(),
          z: z.number(),
          r: z.number().positive(),
        }),
      ]),
    }),
  ),
  props: z.array(
    z.object({
      model: z.string(),
      position: z.tuple([z.number(), z.number(), z.number()]),
      rotationDeg: z.number().optional(),
      scale: z.union([z.number(), z.tuple([z.number(), z.number(), z.number()])]).optional(),
      tint: z.number().optional(),
    }),
  ),
  floor: z.object({
    tile: z.string(),
    accentTile: z.string(),
    size: z.number().positive(),
    deckHalf: z.number().positive().optional(),
    frayEnds: z.boolean().optional(),
  }),
  skybox: z.string(),
  spawns: z.array(
    z.object({
      team: z.union([z.literal(0), z.literal(1)]),
      x: z.number(),
      z: z.number(),
      facingDeg: z.number(),
    }),
  ),
  dummies: z.array(z.object({ unit: z.string(), x: z.number(), z: z.number() })),
  battle: z
    .object({
      towers: z.array(
        z.object({
          team: z.union([z.literal(0), z.literal(1)]),
          x: z.number(),
          z: z.number(),
          tier: z.enum(['outer', 'inner']),
        }),
      ),
      cores: z.array(
        z.object({ team: z.union([z.literal(0), z.literal(1)]), x: z.number(), z: z.number() }),
      ),
      gates: z.array(
        z.object({ team: z.union([z.literal(0), z.literal(1)]), x: z.number(), z: z.number() }),
      ),
      lane: z.array(z.tuple([z.number(), z.number()])).min(2),
      orbPads: z.array(z.object({ x: z.number(), z: z.number() })),
      brush: z.array(
        z.object({
          x: z.number(),
          z: z.number(),
          w: z.number().positive(),
          d: z.number().positive(),
        }),
      ),
      barrierUntil: z.number().positive(),
      firstWaveAt: z.number().positive(),
      waveEvery: z.number().positive(),
      orbEvery: z.number().positive(),
      firstOrbAt: z.number().positive(),
    })
    .optional(),
  lighting: z.object({
    sunDir: z.tuple([z.number(), z.number(), z.number()]),
    sunColor: z.number(),
    skyColor: z.number(),
    groundColor: z.number(),
    sunIntensity: z.number().positive(),
    ambientIntensity: z.number().positive(),
  }),
});

export const fxTimelineSchema = z.object({
  id: z.string().min(1),
  events: z.array(
    z.object({ time: z.number().min(0), op: z.object({ t: z.string() }).passthrough() }),
  ),
});

export const synthCueSchema = z.object({
  id: z.string().min(1),
  layers: z
    .array(
      z.object({
        wave: z.enum(['sine', 'square', 'sawtooth', 'triangle', 'noise']),
        freq: z.number().positive(),
        freqEnd: z.number().positive().optional(),
        attack: z.number().min(0),
        decay: z.number().positive(),
        volume: z.number().positive().max(1.5),
        delay: z.number().min(0).optional(),
        lowpass: z.number().positive().optional(),
        slide: z.enum(['lin', 'exp']).optional(),
      }),
    )
    .min(1),
});
