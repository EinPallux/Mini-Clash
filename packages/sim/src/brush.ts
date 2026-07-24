import { BRIDGE, type Team } from '@mini-clash/data';
import type { Entity, World } from './world';

/**
 * Brush concealment (GAME_DESIGN §6): standing in brush hides a champion from the
 * enemy team unless an enemy stands in the same patch or the champion acted recently.
 * Snapshots omit hidden enemies entirely (server-authoritative — map-hack impossible);
 * bots and tower/Mini targeting run the same query (honesty rule).
 */

export function updateBrushState(w: World, e: Entity): void {
  const c = e.champ;
  if (!c) return;
  c.brushIdx = -1;
  if (!e.dead) {
    for (let i = 0; i < w.brushRects.length; i++) {
      const r = w.brushRects[i];
      if (Math.abs(e.x - r.x) <= r.w / 2 && Math.abs(e.z - r.z) <= r.d / 2) {
        c.brushIdx = i;
        break;
      }
    }
  }
  c.inBrush = c.brushIdx >= 0;
}

export function isHiddenFrom(w: World, viewerTeam: Team, e: Entity): boolean {
  const c = e.champ;
  if (!c || e.dead || e.team === viewerTeam || !c.inBrush) return false;
  if (w.time - c.lastActionAt < BRIDGE.brushRevealAfterAction) return false;
  for (const v of w.champions()) {
    if (v.team === viewerTeam && v.champ?.brushIdx === c.brushIdx) return false;
  }
  return true;
}
