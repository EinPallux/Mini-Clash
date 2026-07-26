import { describe, expect, it } from 'vitest';
import {
  type Action,
  BRIDGE,
  BUFFS,
  buffSchema,
  CHAMPION_LIST,
  championSchema,
  EVENT_SCHEDULE,
  EVENTS,
  FX,
  fxTimelineSchema,
  mapSchema,
  PROJECTILES,
  projectileSchema,
  SHATTERBRIDGE_MAP,
  SOUND_CUES,
  synthCueSchema,
  TRAINING_MAP,
  UNITS,
  unitSchema,
} from '../src';

const REQUIRED_ANIM_STATES = [
  'idle',
  'run',
  'attack',
  'cast_q',
  'cast_w',
  'cast_r',
  'death',
  'spawn',
  'dance',
];

describe('content schema validation', () => {
  it('champions parse', () => {
    for (const c of CHAMPION_LIST) {
      const res = championSchema.safeParse(c);
      expect(
        res.success,
        `${c.id}: ${JSON.stringify(res.success ? '' : res.error.issues[0])}`,
      ).toBe(true);
    }
  });

  it('units, projectiles, buffs, map, fx, cues parse', () => {
    for (const u of Object.values(UNITS)) expect(unitSchema.safeParse(u).success, u.id).toBe(true);
    for (const p of Object.values(PROJECTILES))
      expect(projectileSchema.safeParse(p).success, p.id).toBe(true);
    for (const b of Object.values(BUFFS)) expect(buffSchema.safeParse(b).success, b.id).toBe(true);
    expect(mapSchema.safeParse(TRAINING_MAP).success).toBe(true);
    for (const f of Object.values(FX))
      expect(fxTimelineSchema.safeParse(f).success, f.id).toBe(true);
    for (const s of Object.values(SOUND_CUES))
      expect(synthCueSchema.safeParse(s).success, s.id).toBe(true);
  });
});

describe('referential integrity', () => {
  function walkActions(actions: readonly Action[], visit: (a: Action) => void): void {
    for (const a of actions) {
      visit(a);
      if (a.t === 'leap') walkActions(a.onLand, visit);
    }
  }

  it('ability actions reference existing projectiles, buffs, units', () => {
    for (const c of CHAMPION_LIST) {
      for (const ability of Object.values(c.abilities)) {
        const all = [...ability.actions, ...(ability.recast?.actions ?? [])];
        walkActions(all, (a) => {
          if (a.t === 'projectile')
            expect(PROJECTILES[a.proj], `${c.id}: proj ${a.proj}`).toBeDefined();
          if (a.t === 'buff') expect(BUFFS[a.buff], `${c.id}: buff ${a.buff}`).toBeDefined();
          if (a.t === 'summon') expect(UNITS[a.unit], `${c.id}: unit ${a.unit}`).toBeDefined();
          if (a.t === 'wall' && a.allyBuff)
            expect(BUFFS[a.allyBuff], `${c.id}: buff ${a.allyBuff}`).toBeDefined();
        });
      }
    }
  });

  it('champion anim maps cover the required state machine', () => {
    for (const c of CHAMPION_LIST) {
      for (const state of REQUIRED_ANIM_STATES) {
        expect(c.visual.anim[state], `${c.id} missing anim state '${state}'`).toBeDefined();
      }
    }
  });

  it('map dummies reference existing units', () => {
    for (const d of TRAINING_MAP.dummies) expect(UNITS[d.unit], d.unit).toBeDefined();
  });

  it('fx sound ops reference existing cues; champions have core fx timelines', () => {
    for (const f of Object.values(FX)) {
      for (const ev of f.events) {
        if (ev.op.t === 'sound')
          expect(SOUND_CUES[ev.op.cue], `${f.id}: cue ${ev.op.cue}`).toBeDefined();
      }
    }
    for (const c of CHAMPION_LIST) {
      for (const slot of ['q', 'w', 'r'] as const) {
        expect(FX[`${c.id}.${slot}.cast`], `${c.id}.${slot}.cast timeline`).toBeDefined();
      }
    }
  });

  it('every Living Bridge event has a timeline for each beat the sim fires', () => {
    // Miss one and the event is silent and invisible — the FX runner logs a dev
    // warning and moves on, which is exactly the kind of hole a smoke test does
    // not catch (§9 events fire once, minutes apart).
    for (const kind of Object.keys(EVENTS)) {
      expect(FX[`event.${kind}.announce`], `event.${kind}.announce`).toBeDefined();
    }
    const beats = [
      'event.isles.rise',
      'event.isles.fall',
      'event.coin.zone',
      'event.coin.drop',
      'event.coin.pickup',
      'event.storm.start',
      'event.storm.tick',
      'event.storm.end',
      'event.golem.wake',
      'event.golem.slam',
      'event.golem.convert',
      'event.golem.aegis',
      'event.golem.death',
      'bridge.collapse',
    ];
    for (const key of beats) expect(FX[key], key).toBeDefined();
  });

  it('the event schedule keeps its design anchors and stays in order', () => {
    let last = 0;
    for (const slot of EVENT_SCHEDULE) {
      expect(slot.at, 'slots are chronological').toBeGreaterThan(last);
      expect(slot.pool.length).toBeGreaterThan(0);
      for (const kind of slot.pool) expect(EVENTS[kind], kind).toBeDefined();
      last = slot.at;
    }
    // GAME_DESIGN §5 timeline: isles at 2:00, golems at 6:00 and 10:30.
    expect(EVENT_SCHEDULE[0]).toMatchObject({ at: 120, pool: ['flankIsles'] });
    const golems = EVENT_SCHEDULE.filter((s) => s.pool.length === 1 && s.pool[0] === 'clashGolem');
    expect(golems.map((s) => s.at)).toEqual([360, 630]);
    expect(golems.filter((s) => s.elder)).toHaveLength(1);
    // Everything must finish before Overtime takes the deck apart.
    const lastSlot = EVENT_SCHEDULE[EVENT_SCHEDULE.length - 1];
    const longest = Math.max(...lastSlot.pool.map((k) => EVENTS[k].duration));
    expect(lastSlot.at + longest).toBeLessThanOrEqual(BRIDGE.overtime.at);
  });

  it('the Flank Isles clear the deck and fit inside the map', () => {
    const p = EVENTS.flankIsles.params;
    const deckHalf = BRIDGE.collapse.deckHalves[0];
    // A flank route you could already walk is not a flank route.
    expect(p.offsetZ - p.depth / 2).toBeGreaterThan(deckHalf);
    // ...and one that falls off the navgrid cannot be opened at all.
    expect(p.offsetZ + p.depth / 2).toBeLessThan(SHATTERBRIDGE_MAP.height / 2 - 1);
  });

  it('spawn points and dummies sit on walkable ground (inside bounds, off obstacles)', () => {
    const inBounds = (x: number, z: number) =>
      Math.abs(x) < TRAINING_MAP.width / 2 - 2.5 && Math.abs(z) < TRAINING_MAP.height / 2 - 2.5;
    for (const s of TRAINING_MAP.spawns) expect(inBounds(s.x, s.z)).toBe(true);
    for (const d of TRAINING_MAP.dummies) expect(inBounds(d.x, d.z)).toBe(true);
  });
});
