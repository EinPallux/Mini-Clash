import type { Sim } from './sim';

/**
 * Deterministic state hash (djb2 over rounded observable state).
 * Same seed + same intent log ⇒ same hash, across environments (CI-policed).
 */
export function stateHash(sim: Sim): string {
  const w = sim.world;
  const parts: (string | number)[] = [w.tick];
  const ents = [...w.entities].sort((a, b) => a.id - b.id);
  for (const e of ents) {
    parts.push(e.id, e.kind, e.team, r(e.x), r(e.z), r(e.hp), e.dead ? 1 : 0, r(e.airborne));
    if (e.champ) {
      const c = e.champ;
      parts.push(c.level, r(c.energy), r(c.cds.q), r(c.cds.w), r(c.cds.r), r(c.aaCd), c.def.id);
      for (const b of e.buffs) parts.push(b.id, r(b.tLeft), b.stacks);
    }
    if (e.keg) parts.push(r(e.keg.fuseLeft));
    if (e.wall) parts.push(r(e.wall.tLeft));
    if (e.proj) parts.push(r(e.proj.traveled), e.proj.pulsesFired);
    if (e.dummy) parts.push(r(e.dummy.windowDmg), e.dummy.active ? 1 : 0);
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
