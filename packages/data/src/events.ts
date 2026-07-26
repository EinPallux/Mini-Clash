/**
 * The Living Bridge (GAME_DESIGN §9) — the map's event timetable.
 *
 * Every match runs the same *shape* of schedule (fixed anchors at 2:00, 6:00
 * and 10:30) with **seeded pools** at 4:00, 8:30 and 12:30, so the rhythm
 * varies run to run without ever losing the objective heartbeat. The schedule
 * is rolled once at match start from the match seed, which is what makes it
 * reproducible in a replay and plannable by bots.
 *
 * Bridge Collapse and Sudden Death are *not* in this table: they are match
 * phases rather than scheduled events, and live in BRIDGE.overtime /
 * BRIDGE.suddenDeath.
 */

export type EventKind = 'flankIsles' | 'coinRain' | 'stormFront' | 'clashGolem';

export interface EventDef {
  id: EventKind;
  /** Banner text — short enough to read at a glance mid-fight. */
  name: string;
  /** One line under the banner: what it does to you, not what it is. */
  blurb: string;
  /** Seconds the event runs once it starts (golem: until it is killed). */
  duration: number;
  /** Tuning knobs; every number an event system reads lives here. */
  params: Record<string, number>;
}

/** Announce lead-in (§9): horn + banner + ticker + minimap glow, 8 s ahead. */
export const EVENT_ANNOUNCE_LEAD = 8;

export const EVENTS: Record<EventKind, EventDef> = {
  flankIsles: {
    id: 'flankIsles',
    name: 'FLANK ISLES',
    blurb: 'Platforms rise — new routes, and an orb on each',
    duration: 60,
    params: {
      /** Platform footprint (GAME_DESIGN §9: 10×6 u). */
      width: 10,
      depth: 6,
      /**
       * Centre offset from mid, both directions along z. Sits clear of the
       * 18 u deck (|z| ≤ 9) with a 2.5 u gap the light-bridge spans — the isles
       * are a *flank route*, so they have to be somewhere you cannot already
       * stand.
       */
      offsetZ: 14.5,
      /** Seconds of rise/fall animation at each end of the window. */
      riseSeconds: 2,
      /** Light-bridge connectors back to the deck. */
      bridgeWidth: 3,
    },
  },
  coinRain: {
    id: 'coinRain',
    name: 'COIN RAIN',
    blurb: 'Gold is falling — go get it',
    duration: 20,
    params: {
      radius: 4,
      coins: 30,
      goldMin: 2,
      goldMax: 6,
      /** Seconds a dropped coin lies there before it dissolves. */
      coinLife: 8,
      /** Pickup radius on touch, added to the champion's own. */
      pickupRadius: 0.6,
    },
  },
  stormFront: {
    id: 'stormFront',
    name: 'STORM FRONT',
    blurb: 'A wall of lightning is crossing the bridge',
    duration: 25,
    params: {
      /** Wall thickness along the sweep axis. */
      depth: 4,
      /** Fraction of max HP per second, arcane. */
      dpsPctMaxHp: 0.025,
      slow: 0.15,
      slowSeconds: 0.5,
    },
  },
  clashGolem: {
    id: 'clashGolem',
    name: 'CLASH GOLEM',
    blurb: 'The altar is waking — last hit takes it',
    /** It stands until somebody kills it; the timer is a safety net. */
    duration: 180,
    params: {
      hp: 600,
      /** Extra HP per minute elapsed — a 10:30 golem is not a 6:00 golem. */
      hpPerMin: 90,
      damage: 55,
      damagePerMin: 6,
      attackEvery: 2.2,
      attackRange: 2.6,
      slamRadius: 2.2,
      radius: 1.1,
      armor: 30,
      ward: 30,
      /** Converted siege behaviour. */
      moveSpeed: 2.2,
      towerResist: 0.4,
      auraRadius: 6,
      miniDamageMul: 1.25,
      /** Elder (§9): +60% stats, and the aura shields champions too. */
      elderMul: 1.6,
      elderShieldPct: 0.08,
      elderShieldEvery: 4,
    },
  },
};

export interface ScheduleSlot {
  /** Match time in seconds when the event *starts* (announce is 8 s earlier). */
  at: number;
  /** One fixed event, or a pool the match seed picks from. */
  pool: EventKind[];
  /** Clash Golem #2 is the Elder (§9). */
  elder?: boolean;
}

/**
 * The timetable. Fixed anchors keep the objective tempo legible; the three
 * pools are where run-to-run variety comes from (§9 design intent).
 */
export const EVENT_SCHEDULE: readonly ScheduleSlot[] = [
  { at: 120, pool: ['flankIsles'] },
  { at: 240, pool: ['coinRain', 'stormFront'] },
  { at: 360, pool: ['clashGolem'] },
  { at: 510, pool: ['stormFront', 'flankIsles'] },
  { at: 630, pool: ['clashGolem'], elder: true },
  { at: 750, pool: ['coinRain', 'flankIsles'] },
] as const;
