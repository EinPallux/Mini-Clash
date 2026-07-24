import type { Sim } from './sim';

/**
 * Deterministic state hash (djb2 over rounded observable state).
 * Same seed + same intent log ⇒ same hash, across environments (CI-policed).
 */
export function stateHash(sim: Sim): string {
  const w = sim.world;
  const parts: (string | number)[] = [w.tick];
  const m = w.match;
  if (m) {
    parts.push(
      m.mode,
      m.barrierDown ? 1 : 0,
      m.teamKills[0],
      m.teamKills[1],
      m.towersDown[0],
      m.towersDown[1],
      m.waveIndex,
      m.over ? m.over.winner : -1,
    );
  }
  const ents = [...w.entities].sort((a, b) => a.id - b.id);
  for (const e of ents) {
    parts.push(e.id, e.kind, e.team, r(e.x), r(e.z), r(e.hp), e.dead ? 1 : 0, r(e.airborne));
    if (e.champ) {
      const c = e.champ;
      parts.push(c.level, r(c.energy), r(c.cds.q), r(c.cds.w), r(c.cds.r), r(c.aaCd), c.def.id);
      parts.push(r(c.gold), c.kills, c.deaths, c.assists, c.streak, c.items.join(','));
      parts.push(c.relic ? `${c.relic.def.id}:${r(c.relic.cd)}` : '-');
      for (const b of e.buffs) parts.push(b.id, r(b.tLeft), b.stacks, r(b.shieldLeft ?? 0));
    }
    if (e.keg) parts.push(r(e.keg.fuseLeft));
    if (e.wall) parts.push(r(e.wall.tLeft));
    if (e.proj) parts.push(r(e.proj.traveled), e.proj.pulsesFired);
    if (e.dummy) parts.push(r(e.dummy.windowDmg), e.dummy.active ? 1 : 0);
    if (e.mini) parts.push(e.mini.waypoint, r(e.mini.atkCd), e.mini.targetId ?? -1);
    if (e.tower) parts.push(r(e.tower.shotCd), e.tower.ramp, e.tower.aggro ?? -1);
    if (e.core) parts.push(r(e.core.pulseCd), e.core.invulnerable ? 1 : 0);
  }
  const s = parts.join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

function r(v: number): number {
  return Math.round(v * 10000) / 10000;
}
