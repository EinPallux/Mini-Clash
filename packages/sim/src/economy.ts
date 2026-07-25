import { BRIDGE, LEVEL_MAX, LEVELUP_HEAL_PCT, XP_CURVE } from '@mini-clash/data';
import type { PlayerId } from '@mini-clash/protocol';
import { economyMods } from './augments';
import { applyBuff } from './buffs';
import { draftIndexForLevel, openDraft } from './draft';
import { championStats } from './stats';
import { dist } from './vec';
import type { Entity, World } from './world';

/** XP, gold, levels, kill credit and health orbs (GAME_DESIGN §11–§12). */

export function levelUpChamp(w: World, e: Entity): void {
  const c = e.champ;
  if (!c || c.level >= LEVEL_MAX) return;
  const oldMax = championStats(e).hpMax;
  c.level++;
  c.xp = Math.max(c.xp, XP_CURVE[c.level - 1]);
  const newMax = championStats(e).hpMax;
  e.hpMax = newMax;
  e.hp = Math.min(newMax, e.hp + (newMax - oldMax) + newMax * LEVELUP_HEAL_PCT);
  w.emit({ t: 'levelup', id: e.id, level: c.level });
  w.fx('generic.levelup', e.x, e.z, { source: e.id });
  // Levels 3/6/9 open an augment draft — bridge only, and never twice for the
  // same level (a champion can cross several levels in one XP grant).
  if (w.match?.mode === 'bridge') {
    const idx = draftIndexForLevel(c.level);
    if (idx >= 0 && idx === c.draftsDone && !c.draft) openDraft(w, e, idx);
  }
}

export function grantXp(w: World, e: Entity, amount: number): void {
  const c = e.champ;
  if (!c) return;
  c.xp += amount;
  while (c.level < LEVEL_MAX && c.xp >= XP_CURVE[c.level]) levelUpChamp(w, e);
}

/** Ambient income drip — dead players keep half (comeback rule). */
export function updateIncome(w: World, e: Entity, dt: number): void {
  const c = e.champ;
  if (!c || w.match?.mode !== 'bridge') return;
  const factor = e.dead ? BRIDGE.deadIncomeFactor : 1;
  c.gold += BRIDGE.ambientGoldPerSec * factor * dt;
  grantXp(w, e, BRIDGE.ambientXpPerSec * factor * dt);
}

/** Mini bounty: gold splits evenly among killers' champions in range, XP is full to each. */
export function onMiniKilled(w: World, mini: Entity, byTeam: number): void {
  const def = mini.mini?.def.mini;
  if (!def) return;
  const near: Entity[] = [];
  for (const u of w.champions()) {
    if (u.team === byTeam && dist(u.x, u.z, mini.x, mini.z) <= BRIDGE.shareRadius) near.push(u);
  }
  if (near.length === 0) return;
  const goldEach = def.gold / near.length;
  for (const u of near) {
    const c = u.champ;
    if (!c) continue;
    // Windfall multiplies every source; Scavenger adds a flat Mini kicker.
    const econ = c.augments.length > 0 ? economyMods(u) : null;
    c.gold += (goldEach + (econ?.miniBonusGold ?? 0)) * (econ?.goldMul ?? 1);
    grantXp(w, u, def.xp);
  }
}

/** Champion takedown: bounty + streaks + assist pool + XP, and the kill event. */
export function creditKill(w: World, victim: Entity, by?: Entity): void {
  const vc = victim.champ;
  if (!vc) return;

  // Eligible damagers, most recent first (Map preserves insertion; re-sort by recency).
  const eligible = [...vc.recentDamagers.entries()]
    .filter(([, at]) => w.time - at <= BRIDGE.assistWindow)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);

  const byPlayer = by?.champ && by.team !== victim.team ? by.champ.player : null;
  const killerPlayer = byPlayer ?? (eligible.length > 0 ? eligible[0][0] : null);
  const killer = killerPlayer !== null ? champByPlayer(w, killerPlayer) : undefined;
  const assistPlayers = eligible.map(([p]) => p).filter((p) => p !== killerPlayer);

  const assistants = assistPlayers
    .map((p) => champByPlayer(w, p))
    .filter((e): e is Entity => e !== undefined && e.team !== victim.team);
  // Takedown XP pool splits across everyone involved (GAME_DESIGN §11.1).
  const participants = (killer ? 1 : 0) + assistants.length;
  const xpEach = (BRIDGE.takedownXpPerLevel * vc.level) / Math.max(1, participants);

  if (killer?.champ) {
    const kc = killer.champ;
    kc.kills++;
    kc.gold += BRIDGE.killGold + Math.min(BRIDGE.streakBountyCap, BRIDGE.streakBounty * vc.streak);
    kc.streak++;
    grantXp(w, killer, xpEach);
    if (w.match) w.match.teamKills[killer.team]++;
  }
  for (const a of assistants) {
    const ac = a.champ;
    if (!ac) continue;
    ac.assists++;
    ac.gold += BRIDGE.assistPool / assistants.length;
    grantXp(w, a, xpEach);
  }

  vc.deaths++;
  vc.streak = 0;
  vc.recentDamagers.clear();
  w.emit({
    t: 'kill',
    killer: killer?.champ ? killer.champ.player : null,
    victim: vc.player,
    assists: assistants.map((a) => a.champ?.player ?? -1),
    x: victim.x,
    z: victim.z,
  });
}

function champByPlayer(w: World, player: PlayerId): Entity | undefined {
  for (const e of w.entities) {
    if (e.kind === 'champion' && e.champ?.player === player) return e;
  }
  return undefined;
}

/** Health orb touch: heal + energy + XP to the toucher, splash heal to nearby allies. */
export function updateOrbs(w: World): void {
  for (const orb of [...w.entities]) {
    if (orb.kind !== 'orb' || orb.dead) continue;
    for (const u of w.champions()) {
      if (dist(u.x, u.z, orb.x, orb.z) > orb.radius + u.radius + 0.2) continue;
      const c = u.champ;
      if (!c) continue;
      // Field Rations: bigger orbs, and a short sprint out of the pickup.
      const econ = c.augments.length > 0 ? economyMods(u) : null;
      u.hp = Math.min(u.hpMax, u.hp + u.hpMax * BRIDGE.orb.heal * (econ?.orbHealMul ?? 1));
      c.energy = Math.min(100, c.energy + BRIDGE.orb.energy);
      if (econ && econ.orbMs > 0) {
        applyBuff(u, {
          id: 'aug_field_rations',
          name: 'Field Rations',
          duration: 1.5,
          mul: { moveSpeed: 1 + econ.orbMs },
        });
      }
      grantXp(w, u, BRIDGE.orb.xp);
      for (const ally of w.champions()) {
        if (ally.id === u.id || ally.team !== u.team) continue;
        if (dist(ally.x, ally.z, orb.x, orb.z) <= BRIDGE.orb.splashRadius) {
          ally.hp = Math.min(ally.hpMax, ally.hp + ally.hpMax * BRIDGE.orb.splashHeal);
        }
      }
      w.fx('orb.pickup', orb.x, orb.z, { source: u.id });
      orb.dead = true;
      w.remove(orb.id);
      break;
    }
  }
}
