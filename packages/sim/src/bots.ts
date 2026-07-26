import {
  AUGMENTS,
  BRIDGE,
  type ChampionDef,
  DRAFT,
  EVENTS,
  ITEMS,
  type MapDef,
  RELICS,
  type Slot,
} from '@mini-clash/data';
import type { BotTier, Intent, IntentMsg, PlayerId } from '@mini-clash/protocol';
import { isHiddenFrom } from './brush';
import { structureInvulnerable } from './combat';
import { scoreOffer } from './draft';
import { buyCost } from './items';
import { Pcg32 } from './rng';
import { championStats } from './stats';
import { dist, norm } from './vec';
import type { Entity, World } from './world';

/**
 * Bot brains (TECH §8): run inside the sim, seeded per bot, and issue the same
 * intents a player would — no stat cheats, no fog peeking (honesty rule).
 * Tier = competence: reaction cadence, aim error, focus discipline, relic usage.
 */

type Personality = 'aggro' | 'guardian' | 'objective' | 'chaotic';

interface TierParams {
  /** Ticks between decision passes (reaction time: 0.4 s → 0.2 s). */
  microTicks: number;
  /** Skillshot aim noise, in units. */
  aimSigma: number;
  /** Fraction of full velocity lead applied to skillshots. */
  lead: number;
  engageRange: number;
  retreatAt: number;
  smartUlt: boolean;
  dodges: boolean;
  /** Veteran+: focus the softest reachable target instead of the nearest. */
  focusFire: boolean;
  /** Veteran+: commit to closing on ranged harassers instead of eating poke. */
  punishKiters: boolean;
  /**
   * Tag Swap competence (GAME_DESIGN §7.2). 'none' = never swaps (recruits play
   * one half, which is exactly how a beginner plays); 'basic' = cycles the bench
   * for Energy and cooldowns and burns the swap-in haste to escape; 'smart' adds
   * range counter-pivots and entrance weaving, and refuses to trade away a ready
   * ultimate mid-fight.
   */
  swaps: 'none' | 'basic' | 'smart';
}

const TIERS: Record<BotTier, TierParams> = {
  recruit: {
    microTicks: 12,
    aimSigma: 1.4,
    lead: 0,
    engageRange: 7,
    retreatAt: 0.25,
    smartUlt: false,
    dodges: false,
    focusFire: false,
    punishKiters: false,
    swaps: 'none',
  },
  veteran: {
    microTicks: 8,
    aimSigma: 0.7,
    lead: 0.5,
    engageRange: 9,
    retreatAt: 0.3,
    smartUlt: false,
    dodges: false,
    focusFire: true,
    punishKiters: true,
    swaps: 'basic',
  },
  elite: {
    microTicks: 6,
    aimSigma: 0.28,
    lead: 1,
    engageRange: 10,
    retreatAt: 0.32,
    smartUlt: true,
    dodges: true,
    focusFire: true,
    punishKiters: true,
    swaps: 'smart',
  },
};

export interface BotBrain {
  player: PlayerId;
  tier: BotTier;
  personality: Personality;
  rng: Pcg32;
  offset: number;
  buildIdx: number;
  relicBought: boolean;
  goal: 'push' | 'fight' | 'retreat' | 'orb' | 'event';
  /** Ally-ping reaction window (world.time) + the honored ping. */
  pingUntil: number;
  pingKind: 'danger' | 'omw' | 'attack' | 'help' | null;
  pingX: number;
  pingZ: number;
  lastPingTick: number;
  /** Balance A/B knob: false pins this bot to one half of its duo. */
  maySwap: boolean;
}

export function makeBrain(seed: number, player: PlayerId, tier: BotTier, maySwap = true): BotBrain {
  const rng = new Pcg32(seed, 0x8000 + player);
  const personality = (['aggro', 'guardian', 'objective', 'chaotic'] as const)[rng.int(4)];
  return {
    player,
    tier,
    personality,
    rng,
    offset: rng.int(TIERS[tier].microTicks),
    buildIdx: 0,
    relicBought: false,
    goal: 'push',
    pingUntil: 0,
    pingKind: null,
    pingX: 0,
    pingZ: 0,
    lastPingTick: -1,
    maySwap,
  };
}

/** How many of this kit's abilities are castable right now (off cooldown + affordable)? */
function readyAbilities(
  def: ChampionDef,
  cds: Record<Slot, number>,
  energy: number,
  level: number,
): number {
  let n = 0;
  for (const slot of ['q', 'w', 'r'] as const) {
    const ab = def.abilities[slot];
    if (slot === 'r' && level < BRIDGE.rUnlockLevel) continue;
    if (cds[slot] <= 0.001 && energy >= ab.cost) n++;
  }
  return n;
}

/** Entrances worth swapping *into* when a fight is already touching us. */
const COMBAT_ENTRANCES = new Set([
  'shieldwall', // eats the next hit outright
  'reshelved', // dust nova damage
  'booth_rules', // slow aura
  'cold_spot', // chill nova + untargetable morph
  'lucky_doubloon', // +40% on the next shot
  'ossuary_flourish', // free Q
]);

/**
 * Tag Swap decision (GAME_DESIGN §7.2). The bench keeps recovering while it sits,
 * so the swap is fundamentally a resource play: spend a depleted half, bring in a
 * loaded one. Higher tiers additionally pivot on range and weave entrances.
 */
function wantsSwap(
  e: Entity,
  brain: BotBrain,
  tp: TierParams,
  ctx: { hpFrac: number; nearest: Entity | undefined; nearestD: number; activeRange: number },
): boolean {
  const c = e.champ;
  const duo = c?.duo;
  if (!c || !duo || tp.swaps === 'none' || !brain.maySwap) return false;
  // The sim would reject these anyway; checking here keeps the intent stream clean.
  if (duo.swapCd > 0.001 || duo.morphT > 0 || c.feared) return false;
  if ((c.cast && c.cast.kind !== 'aa') || c.leap) return false;
  if (e.airborne > 0 || e.buffs.some((b) => b.id === 'cc_stun')) return false;

  const mineReady = readyAbilities(c.def, c.cds, c.energy, c.level);
  const benchReady = readyAbilities(duo.def, duo.cds, duo.energy, c.level);
  const engaged = ctx.nearest !== undefined && ctx.nearestD < ctx.activeRange + 4;

  // Never trade away a ready ultimate in a live fight (smart tiers only — this is
  // exactly the discipline that separates Elite from Veteran).
  if (tp.swaps === 'smart' && engaged && c.level >= BRIDGE.rUnlockLevel) {
    const rUp = c.cds.r <= 0.001 && c.energy >= c.def.abilities.r.cost;
    if (rUp && !(c.energy < 20 && duo.energy > 70)) return false;
  }

  // 1. Energy cycling: our half is spent, the bench is loaded.
  if (c.energy < 25 && duo.energy > 60) return true;

  // 2. Cooldown access: nothing to press, the bench has options.
  if (mineReady === 0 && benchReady >= 2) return true;

  // 3. Escape tempo: the swap-in haste is a free disengage (basic tiers included).
  if (brain.goal === 'retreat' && ctx.hpFrac < 0.45 && benchReady >= 1) return true;

  if (tp.swaps !== 'smart') return false;

  // 4. Range counter-pivot: bring in the half that fits the engagement distance.
  const benchRange = duo.def.stats.range;
  if (engaged && ctx.nearest) {
    const wantLong = ctx.nearestD > ctx.activeRange + 1.5 && benchRange > ctx.activeRange + 1.5;
    const wantShort =
      ctx.nearestD < 2.5 && ctx.activeRange > 4.5 && benchRange < ctx.activeRange - 1.5;
    if ((wantLong || wantShort) && benchReady >= 1) return true;
  }

  // 5. Entrance weaving: the arriving half's entrance is itself a combat play.
  if (
    engaged &&
    ctx.nearestD < 4 &&
    COMBAT_ENTRANCES.has(duo.def.entrance.id) &&
    benchReady >= mineReady
  ) {
    return true;
  }
  return false;
}

function personalityMul(
  p: Personality,
  rng: Pcg32,
): { engage: number; retreat: number; orb: number } {
  switch (p) {
    case 'aggro':
      return { engage: 1.3, retreat: 0.7, orb: 0.8 };
    case 'guardian':
      return { engage: 0.9, retreat: 1.25, orb: 1 };
    case 'objective':
      return { engage: 0.85, retreat: 1, orb: 1.6 };
    case 'chaotic': {
      const j = (): number => 0.75 + rng.float() * 0.5;
      return { engage: 1.3 * j(), retreat: j(), orb: 1.2 * j() };
    }
  }
}

/** One decision pass for every bot whose cadence fires this tick. Returns intents to apply. */
export function thinkBots(w: World, map: MapDef, brains: Map<PlayerId, BotBrain>): IntentMsg[] {
  const out: IntentMsg[] = [];
  const battle = map.battle;
  if (!battle || !w.match || w.match.over) return out;
  for (const brain of brains.values()) {
    const tp = TIERS[brain.tier];
    if ((w.tick + brain.offset) % tp.microTicks !== 0) continue;
    const e = findChamp(w, brain.player);
    if (!e?.champ) continue;
    const intents = e.dead ? shop(e, brain) : act(w, e, brain, tp, map);
    for (const intent of intents) out.push({ seq: 0, player: brain.player, intent });
  }
  // Bridge Collapse (§9): once the deck starts falling, no bot walks onto a
  // strip that is about to be void. Applied here rather than inside `act` so it
  // catches every destination on every path out of the brain — the sim's
  // sweep-inward is a safety net, and a bot should never need it.
  if (w.match.overtime) {
    const half = Math.max(1, w.match.deckHalf - 1);
    for (const msg of out) {
      const i = msg.intent;
      if ((i.t === 'move' || i.t === 'attackMove') && Math.abs(i.z) > half) {
        i.z = Math.sign(i.z) * half;
      }
    }
  }
  return out;
}

/**
 * The Clash Golem, if this bot should be hitting it right now (§9).
 *
 * The killing blow converts it, so the read that matters is *its health*, not
 * the fight around it: a low golem is worth diving for, a full one is worth
 * committing to only when we are healthy and it is on our way. Recruits skip
 * the whole objective — they do not know the timetable exists.
 */
function eventGolem(
  w: World,
  e: Entity,
  brain: BotBrain,
  tp: TierParams,
  hpFrac: number,
): Entity | undefined {
  if (brain.tier === 'recruit') return undefined;
  for (const g of w.entities) {
    const gs = g.golem;
    if (!gs || g.dead || gs.owner === e.team) continue;
    const d = dist(e.x, e.z, g.x, g.z) - g.radius;
    const stealable = gs.owner === null && g.hp / g.hpMax < 0.25;
    // Steal range is generous: a converted golem is a lost objective, and a
    // bot that only ever fights it at melee range never lands a killing blow.
    const reach = stealable ? tp.engageRange + 6 : tp.engageRange;
    if (d > reach) continue;
    if (stealable) return g;
    if (hpFrac < 0.55) continue; // do not feed the altar
    // A converted enemy golem is a siege engine — kill it or lose the tower.
    if (gs.owner !== null) return g;
    if (brain.personality === 'objective' || brain.tier === 'elite') return g;
  }
  return undefined;
}

/**
 * Where to run when the Storm Front is on top of us, or null.
 *
 * The wall is 4 u deep and crosses at ~5.3 u/s — faster than any champion — so
 * "run away" is the trap: it keeps you inside for 2.4 s instead of 0.45 s.
 * Walking into the oncoming edge is the play, and it is the sort of thing a
 * good player learns and a bot should already know (§9).
 */
function stormEscape(w: World, e: Entity): { x: number; z: number } | null {
  const ev = w.match?.events.find((x) => x.kind === 'stormFront' && x.phase === 'active');
  if (!ev) return null;
  const centre = ev.data.centre ?? 0;
  const half = EVENTS.stormFront.params.depth / 2;
  const inside = Math.abs(e.x - centre) <= half + e.radius + 1.5;
  if (!inside) return null;
  // `dir` is the sweep direction; move against it, and keep our z so we do not
  // wander off the lane while crossing.
  const dir = ev.data.dir ?? 1;
  return { x: e.x - dir * 8, z: e.z };
}

function findChamp(w: World, player: PlayerId): Entity | undefined {
  for (const ent of w.entities) {
    if (ent.kind === 'champion' && ent.champ?.player === player) return ent;
  }
  return undefined;
}

/** Death-screen (and fountain-window) shopping: follow the champion's build order. */
function shop(e: Entity, brain: BotBrain): Intent[] {
  const c = e.champ;
  if (!c) return [];
  const out: Intent[] = [];
  const build = c.def.botBuild;
  let gold = c.gold;

  // Relic once the first item is secured.
  if (!c.relic && !brain.relicBought && brain.buildIdx >= 1) {
    const relic = RELICS[build.relic];
    if (relic && gold >= relic.cost) {
      out.push({ t: 'buyRelic', relicId: build.relic });
      brain.relicBought = true;
      gold -= relic.cost;
    }
  }
  while (brain.buildIdx < build.items.length) {
    const def = ITEMS[build.items[brain.buildIdx]];
    if (!def) {
      brain.buildIdx++;
      continue;
    }
    const cost = buyCost(c, def);
    if (gold < cost) break;
    out.push({ t: 'buy', itemId: def.id });
    brain.buildIdx++;
    gold -= cost;
  }
  return out;
}

function act(w: World, e: Entity, brain: BotBrain, tp: TierParams, map: MapDef): Intent[] {
  const c = e.champ;
  const battle = map.battle;
  if (!c || !battle || !w.match) return [];

  // Drafting (AUGMENTS.md §2). Bots don't sit on an open draft for 45 s — they
  // take a beat to "read" the cards, then commit. Elites weigh combo lines
  // harder because scoreOffer's kit-affinity terms dominate their choice.
  if (c.draft) {
    const thinkFor = tp.swaps === 'smart' ? 1.5 : tp.swaps === 'basic' ? 2.5 : 4;
    if (DRAFT.seconds - c.draft.tLeft >= thinkFor) {
      let bestIdx = 0;
      let best = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < c.draft.offers.length; i++) {
        const def = AUGMENTS[c.draft.offers[i]];
        if (!def) continue;
        const s = scoreOffer(w, e, def, brain.rng);
        if (s > best) {
          best = s;
          bestIdx = i;
        }
      }
      return [{ t: 'draftPick', offer: bestIdx as 0 | 1 | 2 }];
    }
  }
  const out: Intent[] = [];
  const rng = brain.rng;
  const pm = personalityMul(brain.personality, rng);
  const hpFrac = e.hp / e.hpMax;
  const stats = championStats(e);
  const home = w.spawnPoints?.[e.team] ?? { x: 0, z: 0 };
  const enemyCore = battle.cores.find((s) => s.team !== e.team) ?? { x: -home.x, z: 0 };

  // Fountain window: finish the starting buy before the barrier drops.
  if (w.time < battle.barrierUntil) {
    const buys = shop(e, brain);
    if (buys.length > 0) return buys;
  }

  // Situational awareness (visible enemies only — brush honesty).
  const enemies: Entity[] = [];
  for (const u of w.champions()) {
    if (u.team !== e.team && !isHiddenFrom(w, e.team, u)) enemies.push(u);
  }
  let nearest: Entity | undefined;
  let nearestD = Number.POSITIVE_INFINITY;
  let focus: Entity | undefined;
  let focusHp = Number.POSITIVE_INFINITY;
  let focusScore = Number.POSITIVE_INFINITY;
  let harasser: Entity | undefined;
  let harasserD = Number.POSITIVE_INFINITY;
  for (const u of enemies) {
    const d = dist(e.x, e.z, u.x, u.z);
    if (d < nearestD) {
      nearestD = d;
      nearest = u;
    }
    // Focus fire = softest effective target already in reach — never a deep
    // chase. Squishiness matters, not just wounds: a healthy backline gunner
    // (low HP pool, paper armor) outranks a half-dead vanguard.
    const frac = u.hp / u.hpMax;
    if (d < stats.range + 3.5) {
      const armor = u.champ?.def.stats.armor ?? 0;
      const score = tp.focusFire ? u.hp * (1 + armor / 100) : frac * 10_000;
      if (score < focusScore) {
        focusScore = score;
        focusHp = frac;
        focus = u;
      }
    }
    // Kiter watch: a longer-ranged enemy shooting us from beyond our own reach.
    const uRange = u.champ?.def.stats.range ?? 0;
    if (
      tp.punishKiters &&
      uRange > stats.range &&
      d <= uRange + 1.2 &&
      d > stats.range + 1 &&
      d < 11 &&
      d < harasserD
    ) {
      harasserD = d;
      harasser = u;
    }
  }
  // Only commit to closing on a kiter with local numbers — chasing a supported
  // one is exactly the feed the punish exists to prevent.
  if (harasser) {
    let friends = 1;
    let foes = 0;
    for (const u of w.champions()) {
      if (u.dead) continue;
      if (u.team === e.team && u.id !== e.id && dist(e.x, e.z, u.x, u.z) < 9) friends++;
      if (u.team !== e.team && dist(harasser.x, harasser.z, u.x, u.z) < 9) foes++;
    }
    if (friends < foes) harasser = undefined;
  }

  // Under tower fire and hurting → break away.
  let towerOnMe = false;
  for (const s of w.structures()) {
    if (s.tower && s.team !== e.team && s.tower.aggro === e.id) towerOnMe = true;
  }

  // Siege window: a vulnerable enemy structure in reach with no defender pressing —
  // but a nearly-dead structure is worth diving while healthy (finish the kill).
  let siege: Entity | undefined;
  if (brain.tier !== 'recruit') {
    let siegeD = Number.POSITIVE_INFINITY;
    for (const s of w.structures()) {
      if (s.team === e.team || structureInvulnerable(w, s)) continue;
      const d = dist(e.x, e.z, s.x, s.z) - s.radius;
      if (d <= tp.engageRange && d < siegeD) {
        siegeD = d;
        siege = s;
      }
    }
    const commit = siege !== undefined && siege.hp < 1600 && hpFrac > 0.45;
    if (nearest && nearestD < 5 && !commit) siege = undefined; // point-blank threat → deal with them
  }

  // --- The Living Bridge (GAME_DESIGN §9) -----------------------------------
  // The events are only interesting if somebody contests them. Recruits ignore
  // the timetable entirely (a beginner does not know it exists); veterans go for
  // what is in front of them; elites read the golem's health bar.
  const golem = eventGolem(w, e, brain, tp, hpFrac);
  const storm = stormEscape(w, e);

  // --- Pings (GAME_DESIGN §comms: pings must matter even vs bots) -----------
  // Adopt the newest ally ping: Danger near us forces a disengage window; Attack /
  // Help / On-my-way set a rally point that outranks the default core march.
  for (const pg of w.pings) {
    if (pg.team !== e.team || pg.tick <= brain.lastPingTick) continue;
    brain.lastPingTick = pg.tick;
    if (pg.kind === 'danger') {
      if (dist(e.x, e.z, pg.x, pg.z) < 16) {
        brain.pingKind = 'danger';
        brain.pingUntil = w.time + 2.5;
      }
    } else {
      brain.pingKind = pg.kind;
      brain.pingX = pg.x;
      brain.pingZ = pg.z;
      brain.pingUntil = w.time + 4.5;
    }
  }
  if (brain.pingUntil <= w.time) brain.pingKind = null;

  // --- Goal selection -------------------------------------------------------
  // One relentless ARAM macro for every tier: shove the Core, break off to heal,
  // come back. Combat is an overlay whenever someone is in weapon reach — there is
  // no "stand at mid and fight" state to lose tempo in. Tiers differ in micro.
  const retreatAt = tp.retreatAt * pm.retreat;
  if (brain.pingKind === 'danger' && !(nearest && nearestD < 4)) {
    brain.goal = 'retreat'; // ally called danger — disengage even at full health
  } else if (brain.goal === 'retreat' && hpFrac < 0.72 && !(nearest && nearestD < 4)) {
    // stay committed to the retreat
  } else if (hpFrac < retreatAt || (towerOnMe && hpFrac < 0.55)) {
    brain.goal = 'retreat';
  } else if (storm) {
    // A 4 u wall crossing at 5.3 u/s cannot be outrun by a 3.6 u/s champion, so
    // running *with* it is the worst option and standing still is second worst.
    // Walking into the oncoming edge cuts the time inside it to a third.
    brain.goal = 'event';
    out.push({ t: 'move', x: storm.x, z: storm.z });
    return out;
  } else if (golem) {
    brain.goal = 'event';
    out.push({ t: 'attackTarget', target: golem.id });
    return out;
  } else if (siege) {
    brain.goal = 'push';
    out.push({ t: 'attackTarget', target: siege.id });
    return out;
  } else if ((nearest && nearestD <= stats.range + 3.5) || harasser) {
    // In weapon reach — or being poked from beyond it: close the gap, don't
    // eat free hits on the march (the v0.2 Fathom tax).
    brain.goal = 'fight';
  } else {
    brain.goal = 'push';
    if (hpFrac < 0.9 * pm.orb || brain.personality === 'objective') {
      let orb: Entity | undefined;
      let orbD = Number.POSITIVE_INFINITY;
      for (const ent of w.entities) {
        if (ent.kind !== 'orb' || ent.dead) continue;
        const d = dist(e.x, e.z, ent.x, ent.z);
        if (d < orbD) {
          orbD = d;
          orb = ent;
        }
      }
      if (orb && orbD < 25 * pm.orb) {
        brain.goal = 'orb';
        out.push({ t: 'attackMove', x: orb.x, z: orb.z });
      }
    }
    // Coin Rain: free gold lying on the floor beats another 3 s of marching, but
    // only if it is genuinely on the way — a bot that sprints across the map for
    // 4 gold is a bot that loses the lane (§9 "risk/reward scramble").
    if (brain.goal === 'push' && brain.tier !== 'recruit') {
      let coin: Entity | undefined;
      let coinD = Number.POSITIVE_INFINITY;
      for (const ent of w.entities) {
        if (!ent.coin || ent.dead) continue;
        const d = dist(e.x, e.z, ent.x, ent.z);
        if (d < coinD) {
          coinD = d;
          coin = ent;
        }
      }
      if (coin && coinD < 14 * pm.orb) {
        brain.goal = 'event';
        out.push({ t: 'attackMove', x: coin.x, z: coin.z });
      }
    }
  }

  // --- Tag Swap -------------------------------------------------------------
  // Decided after the goal is known (retreat wants the swap-in haste) but before
  // the goal executes: the 0.35 s morph would swallow a cast issued this pass.
  if (wantsSwap(e, brain, tp, { hpFrac, nearest, nearestD, activeRange: stats.range })) {
    out.push({ t: 'swap' });
    // Keep walking — movement survives the morph, and a retreating bot must not
    // stand still through it.
    if (brain.goal === 'retreat') out.push({ t: 'move', x: home.x, z: home.z });
    else if (brain.goal === 'push') {
      out.push({ t: 'attackMove', x: enemyCore.x, z: enemyCore.z });
    }
    return out;
  }

  // --- Execute --------------------------------------------------------------
  if (brain.goal === 'retreat') {
    // Blink Prism out of gap-closers; Purge Bell out of lockdown.
    if (c.relic && c.relic.cd <= 0) {
      const id = c.relic.def.id;
      if (id === 'blink_prism' && nearest && nearestD < 3.5) {
        const [dx, dz] = norm(home.x - e.x, home.z - e.z);
        out.push({ t: 'useRelic', x: e.x + dx * 5, z: e.z + dz * 5 });
      } else if (
        id === 'purge_bell' &&
        (e.airborne > 0 || e.buffs.some((b) => b.id === 'cc_stun' || b.id === 'cc_root'))
      ) {
        out.push({ t: 'useRelic', x: e.x, z: e.z });
      }
    }
    // Heal forward at a safe orb instead of walking all the way home.
    let dest = home;
    for (const ent of w.entities) {
      if (ent.kind !== 'orb' || ent.dead) continue;
      const toOrb = dist(e.x, e.z, ent.x, ent.z);
      const homeward = e.team === 0 ? ent.x <= e.x + 2 : ent.x >= e.x - 2;
      const contested = enemies.some((u) => dist(u.x, u.z, ent.x, ent.z) < 6);
      if (homeward && !contested && toOrb < dist(e.x, e.z, home.x, home.z)) {
        dest = { x: ent.x, z: ent.z };
        break;
      }
    }
    out.push({ t: 'move', x: dest.x, z: dest.z });
    return out;
  }

  if (brain.goal === 'fight' && nearest) {
    const fallback = harasser ?? nearest;
    const target = tp.focusFire ? (focus ?? fallback) : fallback;
    out.push({ t: 'attackTarget', target: target.id });

    // Elite skillshot dodging: sidestep only real threats — uptime beats dancing.
    if (tp.dodges && hpFrac < 0.75) {
      for (const ent of w.entities) {
        const p = ent.proj;
        if (!p || p.style !== 'def' || ent.team === e.team) continue;
        const toMe = dist(ent.x, ent.z, e.x, e.z);
        if (toMe < 3 && p.dirX * (e.x - ent.x) + p.dirZ * (e.z - ent.z) > 0 && rng.float() < 0.5) {
          const side = rng.float() < 0.5 ? 1 : -1;
          out.push({ t: 'move', x: e.x + -p.dirZ * side * 2.2, z: e.z + p.dirX * side * 2.2 });
          return out; // dodge overrides this pass
        }
      }
    }

    // Ability usage with tier-modelled aim.
    const aimAt = (u: Entity, castTime: number): [number, number] => {
      const uc = u.champ;
      const lead = tp.lead * (uc ? uc.speed : 0) * (castTime + 0.15);
      const noise = (): number => (rng.float() + rng.float() - 1) * tp.aimSigma;
      return [u.x + u.fx * lead + noise(), u.z + u.fz * lead + noise()];
    };
    for (const slot of ['q', 'w', 'r'] as const) {
      const ab = c.def.abilities[slot];
      if (c.cds[slot] > 0.001 || c.energy < ab.cost) continue;
      if (slot === 'r') {
        if (c.level < 4) continue;
        if (tp.smartUlt) {
          const packed = enemies.filter((u) => dist(target.x, target.z, u.x, u.z) < 6).length;
          if (focusHp > 0.5 && packed < 2) continue; // hold R for kills or clumps
        }
      }
      // Support micro (veteran+): drop heal-bearing casts on the sorest ally
      // in range (self included) — never on the enemy's feet. Data-driven: any
      // ability whose actions heal (Sylva's ward today) qualifies.
      const healing = tp.focusFire
        ? ab.actions.some((a) => a.t === 'heal' || (a.t === 'zone' && 'healPerSec' in a))
        : false;
      if (healing) {
        let sore: Entity | undefined;
        let soreFrac = 0.85;
        for (const u of w.champions()) {
          if (u.team !== e.team || u.dead) continue;
          if (dist(e.x, e.z, u.x, u.z) > ab.range + 1) continue;
          const f = u.hp / u.hpMax;
          if (f < soreFrac) {
            soreFrac = f;
            sore = u;
          }
        }
        if (!sore) continue; // nobody hurt — don't burn the heal
        out.push({ t: 'cast', slot, x: sore.x, z: sore.z });
        break;
      }
      const d = dist(e.x, e.z, target.x, target.z);
      if (d > ab.range * 0.95 + 1) continue;
      const [ax, az] = aimAt(target, ab.castTime);
      out.push({ t: 'cast', slot, x: ax, z: az });
      break; // one cast per decision pass
    }
    // Ember Flask burn / Horn of Rally shield in real fights.
    if (c.relic && c.relic.cd <= 0) {
      const id = c.relic.def.id;
      if (id === 'ember_flask' && nearestD < 3.5) {
        out.push({ t: 'useRelic', x: nearest.x, z: nearest.z });
      } else if (id === 'horn_of_rally') {
        let allies = 0;
        for (const u of w.champions()) {
          if (u.team === e.team && u.id !== e.id && dist(e.x, e.z, u.x, u.z) < 6) allies++;
        }
        if (allies >= 1 && enemies.length >= 2 && hpFrac < 0.75) {
          out.push({ t: 'useRelic', x: e.x, z: e.z });
        }
      }
    }
    // Ranged kiting: step back from divers only when actually threatened.
    if (
      tp.smartUlt &&
      c.def.attack.kind === 'ranged' &&
      hpFrac < 0.6 &&
      nearestD < stats.range * 0.45
    ) {
      const [dx, dz] = norm(e.x - nearest.x, e.z - nearest.z);
      out.push({ t: 'attackMove', x: e.x + dx * 3, z: e.z + dz * 3 });
    }
    return out;
  }

  if (brain.goal === 'push') {
    // ARAM macro is simple and honest: march on the Core as a team. Tier skill
    // lives in micro (aim, dodging, focus, siege clicks, retreat discipline).
    // An active rally ping outranks the default march.
    if (brain.pingKind && brain.pingKind !== 'danger') {
      out.push({ t: 'attackMove', x: brain.pingX, z: brain.pingZ });
    } else {
      out.push({ t: 'attackMove', x: enemyCore.x, z: enemyCore.z });
    }
  }
  return out;
}
