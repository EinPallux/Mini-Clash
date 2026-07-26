import {
  BRIDGE,
  EVENT_ANNOUNCE_LEAD,
  EVENT_SCHEDULE,
  EVENTS,
  type EventKind,
  type Team,
} from '@mini-clash/data';
import { isMovableUnit } from './eventKinds';
import type { Pcg32 } from './rng';
import type { EventState, ScheduledEvent, World } from './world';

/**
 * The Living Bridge (GAME_DESIGN §9) — the event timetable and its lifecycle.
 *
 * This module owns *when* things happen; each event's actual behaviour lives
 * next to the systems it touches (isles and collapse in the navgrid, the golem
 * in its own unit code). Everything here is driven by tick counts and the match
 * PRNG, so the same seed always produces the same schedule — which is what lets
 * bots plan against it and replays reproduce it.
 */

/** Roll this match's timetable from the seed. Called once, at construction. */
export function rollSchedule(rng: Pcg32): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  for (const slot of EVENT_SCHEDULE) {
    // A single-entry pool still burns a roll, so adding a choice to one slot
    // never reshuffles the ones after it.
    const kind = slot.pool[rng.int(slot.pool.length)] as EventKind;
    out.push({ at: slot.at, kind, elder: slot.elder ?? false });
  }
  return out;
}

/** Is an event of this kind announced or running right now? */
export function eventActive(w: World, kind: EventKind): EventState | null {
  for (const e of w.match?.events ?? []) {
    if (e.kind === kind && e.phase === 'active') return e;
  }
  return null;
}

/** The next scheduled event, for the ticker and for bot planning. */
export function nextEvent(w: World): { at: number; kind: EventKind; elder: boolean } | null {
  const m = w.match;
  if (!m) return null;
  const slot = m.schedule[m.scheduleIdx];
  return slot ? { at: slot.at, kind: slot.kind, elder: slot.elder } : null;
}

/** Record a line for the Tab log / summary. Trimmed — this is a highlight reel. */
export function logEvent(
  w: World,
  kind: EventState['kind'] | 'collapse',
  team: Team | null,
  text: string,
): void {
  const m = w.match;
  if (!m) return;
  m.eventLog.push({ at: w.time, kind, team, text });
  if (m.eventLog.length > 24) m.eventLog.shift();
}

/**
 * Advance the timetable: announce, start, run and retire events.
 *
 * Hooks are passed in rather than imported so this file never grows a
 * dependency on every system an event can touch — `sim.ts` owns the wiring.
 */
export interface EventHooks {
  start: (w: World, ev: EventState) => void;
  tick: (w: World, ev: EventState, dt: number) => void;
  end: (w: World, ev: EventState) => void;
}

export function updateEvents(w: World, dt: number, hooks: EventHooks): void {
  const m = w.match;
  if (!m || m.mode !== 'bridge' || m.over) return;

  // 1. Announce anything whose lead-in has arrived. Overtime stops the
  //    timetable — the bridge falling apart is the only event left.
  const slot = m.schedule[m.scheduleIdx];
  if (slot && !m.overtime && w.time >= slot.at - EVENT_ANNOUNCE_LEAD) {
    m.scheduleIdx++;
    const def = EVENTS[slot.kind];
    const ev: EventState = {
      kind: slot.kind,
      elder: slot.elder,
      phase: 'announced',
      tLeft: EVENT_ANNOUNCE_LEAD,
      tTotal: EVENT_ANNOUNCE_LEAD,
      owned: [],
      patches: [],
      data: {},
    };
    m.events.push(ev);
    w.emit({
      t: 'eventAnnounced',
      kind: slot.kind,
      elder: slot.elder,
      inSeconds: EVENT_ANNOUNCE_LEAD,
    });
    w.fx(`event.${slot.kind}.announce`, 0, 0, {});
    void def;
  }

  // 2. Advance every live event.
  for (const ev of [...m.events]) {
    ev.tLeft -= dt;
    if (ev.phase === 'announced') {
      if (ev.tLeft > 0) continue;
      ev.phase = 'active';
      ev.tLeft = EVENTS[ev.kind].duration;
      ev.tTotal = ev.tLeft;
      hooks.start(w, ev);
      w.emit({ t: 'eventStarted', kind: ev.kind, elder: ev.elder });
      continue;
    }
    hooks.tick(w, ev, dt);
    // An event can retire itself early by zeroing its own timer (the golem
    // does this the moment somebody lands the killing blow).
    if (ev.tLeft <= 0) retireEvent(w, ev, hooks);
  }
}

/** End an event now: run its cleanup, hand back nav patches, drop its entities. */
export function retireEvent(w: World, ev: EventState, hooks: EventHooks): void {
  const m = w.match;
  if (!m) return;
  const i = m.events.indexOf(ev);
  if (i < 0) return;
  m.events.splice(i, 1);
  hooks.end(w, ev);
  for (const patch of ev.patches) w.nav.restoreRegion(patch);
  ev.patches.length = 0;
  for (const id of ev.owned) {
    const e = w.get(id);
    if (e) w.remove(id);
  }
  ev.owned.length = 0;
  w.emit({ t: 'eventEnded', kind: ev.kind });
}

/**
 * Bridge Collapse (§9): from Overtime, every 60 s the outer 3 u of both long
 * edges fall into the void — 18 → 12 → 8 u of deck. Anything standing on the
 * doomed strip is pushed inward first, because dropping a player through the
 * floor for standing still is a bug, not a spectacle.
 */
export function updateCollapse(w: World, hooks: EventHooks): void {
  const m = w.match;
  if (!m || m.mode !== 'bridge' || m.over) return;
  if (!m.overtime) return;
  if (m.nextCollapseAt === null) {
    m.nextCollapseAt = w.time + BRIDGE.collapse.every;
    // Anything holding open ground — the Flank Isles — is retired the moment
    // the deck starts falling. The two systems both own nav cells, and the one
    // that writes last wins: an isle retiring *after* a collapse would hand
    // back walkable void where the bridge used to be.
    for (const ev of [...m.events]) {
      if (ev.patches.length > 0) retireEvent(w, ev, hooks);
    }
    return;
  }
  if (w.time < m.nextCollapseAt) return;
  if (m.collapseStage >= BRIDGE.collapse.deckHalves.length - 1) {
    m.nextCollapseAt = null;
    return;
  }

  m.collapseStage++;
  m.nextCollapseAt = w.time + BRIDGE.collapse.every;
  const wasHalf = m.deckHalf;
  m.deckHalf = BRIDGE.collapse.deckHalves[m.collapseStage];
  const lost = wasHalf - m.deckHalf;
  const width = w.nav.cols * w.nav.cell;

  // Sweep everyone off the strip before it goes. Nothing survives out there,
  // so the safe thing and the fair thing are the same thing.
  for (const u of w.entities) {
    if (!isMovableUnit(u)) continue;
    if (Math.abs(u.z) <= m.deckHalf - u.radius) continue;
    const [nx, nz] = [u.x, Math.sign(u.z || 1) * (m.deckHalf - 0.9)];
    u.x = nx;
    u.z = nz;
    if (u.champ) u.champ.path = [];
    if (u.mini) u.mini.path = [];
  }

  for (const sign of [-1, 1] as const) {
    const centre = sign * (m.deckHalf + lost / 2);
    w.nav.closeRegion(0, centre, width, lost);
    w.fx('bridge.collapse', 0, centre, { fz: sign });
  }
  // Brush pockets out on the lost strip go with it (§9: cover falls away first).
  w.brushRects = w.brushRects.filter((b) => Math.abs(b.z) + b.d / 2 <= m.deckHalf);
  for (const u of w.champions()) {
    const c = u.champ;
    if (c && Math.abs(u.z) > m.deckHalf) c.inBrush = false;
  }

  w.emit({ t: 'collapse', stage: m.collapseStage, deckHalf: m.deckHalf });
  logEvent(w, 'collapse', null, `Deck narrowed to ${(m.deckHalf * 2).toFixed(0)}u`);
}
