import {
  AUGMENTS,
  type AugmentDef,
  type AugmentRarity,
  DRAFT,
  GENERIC_AUGMENTS,
  signaturesFor,
} from '@mini-clash/data';
import type { Pcg32 } from './rng';
import { championStats } from './stats';
import type { Entity, World } from './world';

/**
 * The augment draft (docs/AUGMENTS.md §1).
 *
 * Reaching level 3 / 6 / 9 opens a draft. **The game does not pause**: the
 * overlay docks bottom-centre and the match keeps running around it, so a draft
 * that opens mid-teamfight is a real decision under fire. At 0 the utility
 * scorer picks for you, which is also how bots draft.
 */

/** Which draft index a level opens, or -1. */
export function draftIndexForLevel(level: number): number {
  return DRAFT.levels.indexOf(level as (typeof DRAFT.levels)[number]);
}

/** Both halves of the duo can be offered their signatures. */
function championIds(e: Entity): string[] {
  const c = e.champ;
  if (!c) return [];
  return c.duo ? [c.def.id, c.duo.def.id] : [c.def.id];
}

/** Does this champion's kit make the card do anything? (§1 offer filtering) */
function meetsRequirement(e: Entity, def: AugmentDef): boolean {
  if (!def.requires) return true;
  const c = e.champ;
  if (!c) return false;
  const kits = c.duo ? [c.def, c.duo.def] : [c.def];
  switch (def.requires) {
    case 'projectileQ':
      return kits.some((k) => k.abilities.q.actions.some((a) => a.t === 'projectile'));
    case 'melee':
      return kits.some((k) => k.attack.kind === 'melee');
    case 'ranged':
      return kits.some((k) => k.attack.kind === 'ranged');
    case 'pet':
      return kits.some((k) => k.passive.id === 'best_friend');
    case 'shieldAbility':
      return kits.some((k) =>
        (['q', 'w', 'r'] as const).some((s) =>
          k.abilities[s].actions.some((a) => a.t === 'shieldSelf'),
        ),
      );
  }
}

/** Everything this player could still legally be offered. */
export function eligibleAugments(e: Entity): AugmentDef[] {
  const c = e.champ;
  if (!c) return [];
  const taken = new Set(c.augments);
  const mine = championIds(e).flatMap((id) => signaturesFor(id));
  return [...GENERIC_AUGMENTS, ...mine].filter((a) => !taken.has(a.id) && meetsRequirement(e, a));
}

/** Is this team behind on kills + towers? (pity, §1) */
function behind(w: World, team: number): boolean {
  const m = w.match;
  if (!m) return false;
  const other = team === 0 ? 1 : 0;
  const mine = m.teamKills[team] + m.towersDown[team];
  const theirs = m.teamKills[other] + m.towersDown[other];
  return mine < theirs;
}

/** Roll a rarity for this draft index, with the comeback nudge folded in. */
function rollRarity(rng: Pcg32, index: number, pity: boolean): AugmentRarity {
  const row = DRAFT.odds[Math.min(index, DRAFT.odds.length - 1)];
  let silver = row.silver;
  let gold = row.gold;
  let prismatic = row.prismatic;
  if (pity) {
    // Shift weight up a tier: the team that is losing rolls richer.
    const shift = Math.min(silver, DRAFT.pityBonus);
    silver -= shift;
    gold += shift / 2;
    prismatic += shift / 2;
  }
  const r = rng.float() * (silver + gold + prismatic);
  if (r < silver) return 'silver';
  if (r < silver + gold) return 'gold';
  return 'prismatic';
}

/**
 * Build one offer set (§1 composition guarantees):
 *  - three cards, never a duplicate,
 *  - at least one champion-specific card when the duo has any left,
 *  - no category twice in the same set,
 *  - nothing already taken, nothing the kit can't use.
 */
export function rollOffers(w: World, e: Entity, index: number): string[] {
  const c = e.champ;
  if (!c) return [];
  const pool = eligibleAugments(e);
  if (pool.length === 0) return [];
  const pity = behind(w, e.team);
  const picked: AugmentDef[] = [];
  const usedCategories = new Set<string>();

  const take = (candidates: AugmentDef[]): boolean => {
    const fresh = candidates.filter(
      (a) => !picked.some((p) => p.id === a.id) && !usedCategories.has(a.category),
    );
    if (fresh.length === 0) return false;
    const chosen = fresh[w.rng.int(fresh.length)];
    picked.push(chosen);
    usedCategories.add(chosen.category);
    return true;
  };

  // 1. Guarantee a champion-specific card while any remain.
  const signatures = pool.filter((a) => a.category === 'signature');
  if (signatures.length > 0) {
    const wanted = rollRarity(w.rng, index, pity);
    take(signatures.filter((a) => a.rarity === wanted)) || take(signatures);
  }

  // 2. Fill the rest by rolled rarity, relaxing when a tier is exhausted.
  while (picked.length < DRAFT.offers) {
    const wanted = rollRarity(w.rng, index, pity);
    const byRarity = pool.filter((a) => a.rarity === wanted);
    if (take(byRarity)) continue;
    // That rarity (or every remaining category) is spent — relax the category
    // rule last, so a thin pool still fills three slots rather than showing two.
    if (take(pool)) continue;
    const anyLeft = pool.filter((a) => !picked.some((p) => p.id === a.id));
    if (anyLeft.length === 0) break;
    picked.push(anyLeft[w.rng.int(anyLeft.length)]);
  }
  return picked.map((a) => a.id);
}

/** Open a draft for this champion (called on the level-up that crosses 3/6/9). */
export function openDraft(w: World, e: Entity, index: number): void {
  const c = e.champ;
  if (!c) return;
  const offers = rollOffers(w, e, index);
  if (offers.length === 0) return; // catalog exhausted — nothing to offer
  c.draft = { index, offers, tLeft: DRAFT.seconds, rerolled: false };
  w.emit({ t: 'draftOpen', player: c.player, team: e.team, index, offers });
}

/**
 * Take an augment (by offer index). Returns true if it stuck.
 * `auto` marks the timer-expiry pick so the HUD can say the coach chose.
 */
export function pickAugment(w: World, e: Entity, offerIndex: number, auto = false): boolean {
  const c = e.champ;
  const d = c?.draft;
  if (!c || !d) return false;
  const id = d.offers[offerIndex];
  if (!id || !AUGMENTS[id] || c.augments.includes(id)) return false;
  const oldMax = championStats(e).hpMax;
  c.augments.push(id);
  c.draft = null;
  c.draftsDone++;
  // Elemental Ascension picks its flavour at pickup, off the match seed, so the
  // re-skin is fixed for the rest of the game (and identical on every client).
  if (AUGMENTS[id].effects.some((eff) => eff.k === 'special' && eff.id === 'elemental')) {
    c.augState.element = w.rng.int(3);
  }
  // A max-HP card resized the pool underneath us: grant the delta rather than
  // silently shaving a slice off the bar mid-fight (same rule as a level-up).
  const newMax = championStats(e).hpMax;
  e.hpMax = newMax;
  if (newMax > oldMax) e.hp = Math.min(newMax, e.hp + (newMax - oldMax));
  else e.hp = Math.min(newMax, e.hp);
  w.emit({
    t: 'augmentPicked',
    player: c.player,
    team: e.team,
    augmentId: id,
    index: d.index,
    auto,
  });
  w.fx(`augment.${AUGMENTS[id].rarity}`, e.x, e.z, { source: e.id });
  return true;
}

/** Spend the match's reroll token on the current offer set. */
export function rerollDraft(w: World, e: Entity): boolean {
  const c = e.champ;
  const d = c?.draft;
  if (!c || !d || d.rerolled || c.rerolls <= 0) return false;
  const offers = rollOffers(w, e, d.index);
  if (offers.length === 0) return false;
  c.rerolls--;
  d.rerolled = true;
  d.offers = offers;
  w.emit({ t: 'draftReroll', player: c.player, team: e.team, offers });
  return true;
}

/**
 * Score an offer for a bot (or for auto-pick, §1/§2): kit-tag affinity, a
 * team-composition nudge, a comeback nudge, and seeded personality noise.
 */
export function scoreOffer(w: World, e: Entity, def: AugmentDef, rng: Pcg32): number {
  const c = e.champ;
  if (!c) return 0;
  // Rarity is a *prior*, not the decision. It used to be 1/2/3, which no amount
  // of kit affinity could overcome — so bots took the shiniest card in the hand
  // and the harness's pick-rate rail was measuring this weight rather than the
  // augment. Kept small enough that two good tag matches beat a tier.
  let score = def.rarity === 'prismatic' ? 1.6 : def.rarity === 'gold' ? 1.25 : 1;

  // Signatures are built for this kit — that is the whole point of them.
  if (def.category === 'signature') score += 2;

  const kits = c.duo ? [c.def, c.duo.def] : [c.def];
  for (const tag of def.tags) {
    for (const k of kits) {
      // Crude but honest kit affinity: does this champion actually use the stat?
      if (tag === 'ad' && k.stats.ad >= 58) score += 0.8;
      if (tag === 'ap' && k.role === 'caster') score += 1;
      if (tag === 'attackSpeed' && k.stats.attackSpeed >= 0.85) score += 0.7;
      if (tag === 'tank' && (k.role === 'vanguard' || k.role === 'bruiser')) score += 0.9;
      if (tag === 'sustain' && k.role === 'support') score += 0.8;
      if (tag === 'mobility' && k.stats.moveSpeed >= 3.6) score += 0.4;
      if (tag === 'antiTank' && k.stats.range > 4) score += 0.4;
      if (tag === 'execute' && k.role === 'slayer') score += 0.9;
      if (tag === 'siege' && k.role === 'specialist') score += 0.6;
    }
    // Every duo swaps, so swap cards are broadly good — but only if we have a duo.
    if (tag === 'swap') score += c.duo ? 1 : -5;
  }

  // Team-comp gap: no frontline on the team → bias defensive.
  let frontline = 0;
  for (const u of w.champions()) {
    if (u.team !== e.team) continue;
    const r = u.champ?.def.role;
    if (r === 'vanguard' || r === 'bruiser') frontline++;
  }
  if (frontline === 0 && def.category === 'defense') score += 1;

  // Behind → comeback picks (defense and sustain keep you in the game).
  if (behind(w, e.team) && (def.category === 'defense' || def.tags.includes('sustain'))) {
    score += 0.8;
  }

  // Personality noise ±15%, seeded — bot teams shouldn't draft as one organism.
  return score * (0.85 + rng.float() * 0.3);
}

/**
 * Pick the best offer by utility. `auto` is true when the 45 s timer ran out —
 * the HUD calls that "the coach chose" (UI_UX §9); a bot picking early is a
 * decision, not a timeout, so it goes through the normal `draftPick` intent.
 */
export function autoPick(w: World, e: Entity, auto = false): void {
  const c = e.champ;
  const d = c?.draft;
  if (!c || !d) return;
  let bestIdx = 0;
  let best = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < d.offers.length; i++) {
    const def = AUGMENTS[d.offers[i]];
    if (!def) continue;
    const s = scoreOffer(w, e, def, w.rng);
    if (s > best) {
      best = s;
      bestIdx = i;
    }
  }
  pickAugment(w, e, bestIdx, auto);
}

/** Tick every open draft; auto-pick at 0. */
export function updateDrafts(w: World, dt: number): void {
  for (const e of w.entities) {
    const c = e.champ;
    if (!c?.draft) continue;
    c.draft.tLeft -= dt;
    if (c.draft.tLeft <= 0) autoPick(w, e, true);
  }
}
