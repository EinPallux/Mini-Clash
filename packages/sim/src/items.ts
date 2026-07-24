import { BRIDGE, ITEM_SLOTS, ITEMS, type ItemDef, RELICS, SELL_RATIO } from '@mini-clash/data';
import { applyBuff } from './buffs';
import { dealDamage } from './combat';
import { championStats, hasItemPassive, resolveScaling } from './stats';
import { dist, inCone, norm } from './vec';
import type { Entity, World } from './world';

/** Item shop + relic actives + per-tick item passives (GAME_DESIGN §12). */

export function inShopZone(w: World, e: Entity): boolean {
  if (e.dead) return true;
  const spawn = w.spawnPoints?.[e.team];
  if (!spawn) return true; // training: shop always open
  return w.time < BRIDGE.shopUntil && dist(e.x, e.z, spawn.x, spawn.z) <= BRIDGE.shopRadius;
}

/** Effective purchase price after the component discount (mirrors tryBuy; bots budget with it). */
export function buyCost(c: { items: string[] }, def: ItemDef): number {
  const comp =
    def.buildsFrom && c.items.includes(def.buildsFrom) ? ITEMS[def.buildsFrom] : undefined;
  return def.cost - (comp?.cost ?? 0);
}

export function tryBuy(w: World, e: Entity, itemId: string): void {
  const c = e.champ;
  const def = ITEMS[itemId];
  if (!c || !def) return;
  const deny = (reason: 'gold' | 'slots' | 'zone' | 'owned'): void =>
    w.emit({ t: 'purchase', player: c.player, itemId, ok: false, reason });
  if (!inShopZone(w, e)) {
    deny('zone');
    return;
  }

  // Component upgrade: owning the base item discounts by its cost and consumes it.
  const compIdx = def.buildsFrom ? c.items.indexOf(def.buildsFrom) : -1;
  const comp = compIdx >= 0 && def.buildsFrom ? ITEMS[def.buildsFrom] : undefined;
  const cost = def.cost - (comp?.cost ?? 0);

  if (c.items.length - (comp ? 1 : 0) >= ITEM_SLOTS) {
    deny('slots');
    return;
  }
  if (c.gold < cost) {
    deny('gold');
    return;
  }
  c.gold -= cost;
  if (comp) {
    c.items.splice(compIdx, 1);
    if (comp.add?.hpMax) e.hp = Math.max(1, e.hp - comp.add.hpMax);
  }
  c.items.push(itemId);
  // hpMax adds heal the added amount (buying HP never drops your fraction).
  if (def.add?.hpMax) e.hp += def.add.hpMax;
  w.emit({ t: 'purchase', player: c.player, itemId, ok: true });
}

export function tryBuyRelic(w: World, e: Entity, relicId: string): void {
  const c = e.champ;
  const def = RELICS[relicId];
  if (!c || !def) return;
  const deny = (reason: 'gold' | 'slots' | 'zone' | 'owned'): void =>
    w.emit({ t: 'purchase', player: c.player, itemId: relicId, ok: false, reason });
  if (!inShopZone(w, e)) {
    deny('zone');
    return;
  }
  if (c.relic) {
    deny('owned');
    return;
  }
  if (c.gold < def.cost) {
    deny('gold');
    return;
  }
  c.gold -= def.cost;
  c.relic = { def, cd: 0 };
  w.emit({ t: 'purchase', player: c.player, itemId: relicId, ok: true });
}

export function trySell(w: World, e: Entity, itemId: string): void {
  const c = e.champ;
  if (!c || !inShopZone(w, e)) return;
  const idx = c.items.indexOf(itemId);
  if (idx < 0) return;
  const def = ITEMS[itemId];
  c.items.splice(idx, 1);
  c.gold += Math.round(def.cost * SELL_RATIO);
  if (def.add?.hpMax) e.hp = Math.min(e.hp, Math.max(1, e.hp - def.add.hpMax));
}

/** Relic actives. Aim is already range-validated by the caller where relevant. */
export function tryUseRelic(w: World, e: Entity, aimX: number, aimZ: number): void {
  const c = e.champ;
  if (!c || e.dead || !c.relic || c.relic.cd > 0.001) return;
  if (c.cast && c.cast.kind !== 'aa') return;
  const relic = c.relic.def;
  const stats = championStats(e);
  c.lastActionAt = w.time;

  switch (relic.id) {
    case 'blink_prism': {
      const d = dist(e.x, e.z, aimX, aimZ);
      const max = relic.params.distance;
      const [nx, nz] = norm(aimX - e.x, aimZ - e.z);
      const len = Math.min(d, max);
      const [tx, tz] = w.nav.nearestOpen(e.x + nx * len, e.z + nz * len);
      w.fx('relic.blink.out', e.x, e.z, { source: e.id });
      e.x = tx;
      e.z = tz;
      c.path = [];
      w.fx('relic.blink.in', e.x, e.z, { source: e.id });
      break;
    }
    case 'purge_bell': {
      e.airborne = 0;
      e.buffs = e.buffs.filter((b) => !b.id.startsWith('cc_'));
      w.fx('relic.purge', e.x, e.z, { source: e.id });
      break;
    }
    case 'ember_flask': {
      const [fx, fz] = norm(aimX - e.x, aimZ - e.z);
      e.fx = fx;
      e.fz = fz;
      const amount = resolveScaling(
        { base: relic.params.damage, apRatio: relic.params.apRatio },
        c.level,
        stats.ad,
        stats.ap,
      );
      const cosHalf = Math.cos(((relic.params.angleDeg / 2) * Math.PI) / 180);
      for (const u of [...w.enemiesOf(e.team)]) {
        if (u.kind === 'keg') continue;
        if (inCone(e.x, e.z, fx, fz, cosHalf, relic.params.radius, u.x, u.z, u.radius)) {
          dealDamage(w, { source: e, tag: 'item' }, u, amount, 'arcane');
          applyBuff(u, {
            id: 'cc_slow_ember',
            name: 'Scorched',
            duration: relic.params.slowDuration,
            mul: { moveSpeed: 1 - relic.params.slow },
          });
        }
      }
      w.fx('relic.ember', e.x, e.z, { fx, fz, source: e.id });
      break;
    }
    case 'horn_of_rally': {
      for (const u of w.champions()) {
        if (u.team !== e.team) continue;
        if (dist(e.x, e.z, u.x, u.z) <= relic.params.radius) {
          applyBuff(u, {
            id: 'horn_shield',
            name: 'Rallied',
            duration: relic.params.duration,
            shield: relic.params.shield,
          });
        }
      }
      w.fx('relic.horn', e.x, e.z, { source: e.id });
      break;
    }
  }
  c.relic.cd = relic.cooldown;
}

/** Per-tick item passives that watch combat timers (nullwave, windrunner). */
export function updateItemPassives(w: World, e: Entity): void {
  const c = e.champ;
  if (!c || e.dead) return;

  const nw = hasItemPassive(e, 'nullwave');
  if (nw && w.time - c.lastDamagedAt >= nw.after) {
    if (!e.buffs.some((b) => b.id === 'item_nullwave')) {
      applyBuff(e, {
        id: 'item_nullwave',
        name: 'Nullwave Shield',
        duration: 9999,
        shield: nw.shield,
      });
      w.fx('item.nullwave', e.x, e.z, { source: e.id });
    }
  }

  const wr = hasItemPassive(e, 'windrunner');
  if (wr && w.time - c.lastCombatAt >= wr.idleAfter) {
    applyBuff(e, {
      id: 'item_windrunner',
      name: 'Windrunner',
      duration: 0.3,
      mul: { moveSpeed: 1 + wr.msMul },
    });
  }
}
