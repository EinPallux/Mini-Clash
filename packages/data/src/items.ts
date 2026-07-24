import type { StatKey } from './types';

/** In-match item catalog (GAME_DESIGN §12). 4 item slots + 1 relic slot; sell at 70%. */

export type ItemTier = 1 | 2 | 3;

export interface ItemDef {
  id: string;
  name: string;
  tier: ItemTier;
  cost: number;
  icon: string;
  add?: Partial<Record<StatKey, number>>;
  /** Named passive hooks resolved in the sim (numbers stay here). */
  passive?: { id: string; description: string; params: Record<string, number> };
  /** Component item: owning it discounts this purchase by its cost and consumes it. */
  buildsFrom?: string;
}

export interface RelicDef {
  id: string;
  name: string;
  cost: number;
  cooldown: number;
  icon: string;
  description: string;
  params: Record<string, number>;
}

export const ITEMS: Record<string, ItemDef> = {
  // Tier 1 — single stat, 500 g
  sharpened_fang: {
    id: 'sharpened_fang',
    name: 'Sharpened Fang',
    tier: 1,
    cost: 500,
    icon: 'sword-clash',
    add: { ad: 12 },
  },
  spark_crystal: {
    id: 'spark_crystal',
    name: 'Spark Crystal',
    tier: 1,
    cost: 500,
    icon: 'tower-fall',
    add: { ap: 18 },
  },
  iron_plate: {
    id: 'iron_plate',
    name: 'Iron Plate',
    tier: 1,
    cost: 500,
    icon: 'checked-shield',
    add: { hpMax: 150 },
  },
  bulwark_scrap: {
    id: 'bulwark_scrap',
    name: 'Bulwark Scrap',
    tier: 1,
    cost: 500,
    icon: 'checked-shield',
    add: { armor: 15 },
  },
  hex_charm: {
    id: 'hex_charm',
    name: 'Hex Charm',
    tier: 1,
    cost: 500,
    icon: 'barrel',
    add: { ward: 15 },
  },
  whetstone: {
    id: 'whetstone',
    name: 'Whetstone',
    tier: 1,
    cost: 500,
    icon: 'sword-clash',
    add: { attackSpeed: 0.15 },
  },

  // Tier 2 — dual stat + minor passive, 1150 g
  windrunner_charm: {
    id: 'windrunner_charm',
    name: 'Windrunner Charm',
    tier: 2,
    cost: 1150,
    icon: 'three-friends',
    buildsFrom: 'whetstone',
    add: { moveSpeed: 0.35, attackSpeed: 0.08 },
    passive: {
      id: 'windrunner',
      description: '+12% move speed after 4s without combat',
      params: { idleAfter: 4, msMul: 0.12 },
    },
  },
  executioners_edge: {
    id: 'executioners_edge',
    name: "Executioner's Edge",
    tier: 2,
    cost: 1150,
    icon: 'sword-clash',
    buildsFrom: 'sharpened_fang',
    add: { ad: 25 },
    passive: {
      id: 'executioner',
      description: '+12% damage vs targets below 35% HP',
      params: { threshold: 0.35, bonus: 0.12 },
    },
  },
  stormweaver_focus: {
    id: 'stormweaver_focus',
    name: 'Stormweaver Focus',
    tier: 2,
    cost: 1150,
    icon: 'tower-fall',
    buildsFrom: 'spark_crystal',
    add: { ap: 35, haste: 0.1 },
    passive: {
      id: 'stormweaver',
      description: 'Ability hits restore 4 Energy',
      params: { energy: 4 },
    },
  },
  juggernaut_mail: {
    id: 'juggernaut_mail',
    name: 'Juggernaut Mail',
    tier: 2,
    cost: 1150,
    icon: 'checked-shield',
    buildsFrom: 'iron_plate',
    add: { hpMax: 280, armor: 20 },
    passive: {
      id: 'juggernaut',
      description: '−20% damage from Minis and towers',
      params: { reduction: 0.2 },
    },
  },
  nullwave_cloak: {
    id: 'nullwave_cloak',
    name: 'Nullwave Cloak',
    tier: 2,
    cost: 1150,
    icon: 'barrel',
    buildsFrom: 'hex_charm',
    add: { hpMax: 250, ward: 20 },
    passive: {
      id: 'nullwave',
      description: 'Recharging 120 shield after 8s without taking damage',
      params: { shield: 120, after: 8 },
    },
  },
  vampire_seal: {
    id: 'vampire_seal',
    name: 'Vampire Seal',
    tier: 2,
    cost: 1150,
    icon: 'cannon-ball',
    buildsFrom: 'sharpened_fang',
    add: { ad: 20 },
    passive: {
      id: 'lifesteal',
      description: '12% physical lifesteal on attacks',
      params: { pct: 0.12 },
    },
  },

  // Tier 3 — build-defining, 2300 g
  dragonfang_blade: {
    id: 'dragonfang_blade',
    name: 'Dragonfang Blade',
    tier: 3,
    cost: 2300,
    icon: 'sword-clash',
    buildsFrom: 'executioners_edge',
    add: { ad: 45, attackSpeed: 0.2 },
    passive: {
      id: 'dragonfang',
      description: 'Every 3rd attack: +8% target max HP physical (75 cap vs structures)',
      params: { every: 3, pct: 0.08, structureCap: 75 },
    },
  },
  starcore_staff: {
    id: 'starcore_staff',
    name: 'Starcore Staff',
    tier: 3,
    cost: 2300,
    icon: 'tower-fall',
    buildsFrom: 'stormweaver_focus',
    add: { ap: 75, haste: 0.15 },
    passive: {
      id: 'starcore',
      description: 'Ability damage burns 1.5% max HP arcane over 2s',
      params: { pct: 0.015, duration: 2 },
    },
  },
  titans_bastion: {
    id: 'titans_bastion',
    name: "Titan's Bastion",
    tier: 3,
    cost: 2300,
    icon: 'checked-shield',
    buildsFrom: 'juggernaut_mail',
    add: { hpMax: 450, armor: 30, ward: 30 },
    passive: {
      id: 'titan',
      description: 'When hard-CC’d: +20% damage reduction for 2s',
      params: { dr: 0.2, duration: 2 },
    },
  },
  phantom_anchor: {
    id: 'phantom_anchor',
    name: 'Phantom Anchor',
    tier: 3,
    cost: 2300,
    icon: 'galleon',
    buildsFrom: 'windrunner_charm',
    add: { ad: 35, moveSpeed: 0.3 },
    passive: {
      id: 'phantom',
      description: 'Attacks slow the target 20% for 1s',
      params: { slow: 0.2, duration: 1 },
    },
  },
  lifebloom_idol: {
    id: 'lifebloom_idol',
    name: 'Lifebloom Idol',
    tier: 3,
    cost: 2300,
    icon: 'three-friends',
    buildsFrom: 'stormweaver_focus',
    add: { ap: 60 },
    passive: {
      id: 'lifebloom',
      description: '+20% healing power; your heals grant +10% MS',
      params: { healPower: 0.2, ms: 0.1, duration: 1.5 },
    },
  },
  overclock_gauntlet: {
    id: 'overclock_gauntlet',
    name: 'Overclock Gauntlet',
    tier: 3,
    cost: 2300,
    icon: 'brick-wall',
    buildsFrom: 'vampire_seal',
    add: { ad: 20, attackSpeed: 0.25, haste: 0.1 },
    passive: {
      id: 'overclock',
      description: 'Tag synergy: Swap CD −2s, Entrance effects +50% (from v0.4)',
      params: { swapCd: 2, entrance: 0.5 },
    },
  },
};

export const RELICS: Record<string, RelicDef> = {
  blink_prism: {
    id: 'blink_prism',
    name: 'Blink Prism',
    cost: 800,
    cooldown: 75,
    icon: 'tower-fall',
    description: 'Blink 4.5u toward your cursor.',
    params: { distance: 4.5 },
  },
  purge_bell: {
    id: 'purge_bell',
    name: 'Purge Bell',
    cost: 800,
    cooldown: 75,
    icon: 'barrel',
    description: 'Cleanse crowd control on yourself.',
    params: {},
  },
  ember_flask: {
    id: 'ember_flask',
    name: 'Ember Flask',
    cost: 800,
    cooldown: 45,
    icon: 'cannon-ball',
    description: 'Cone burn: 180 arcane damage + 25% slow for 2s.',
    params: { damage: 180, apRatio: 0.3, slow: 0.25, slowDuration: 2, radius: 4, angleDeg: 70 },
  },
  horn_of_rally: {
    id: 'horn_of_rally',
    name: 'Horn of Rally',
    cost: 800,
    cooldown: 60,
    icon: 'three-friends',
    description: 'Allies within 6u gain a 140 shield for 3s.',
    params: { shield: 140, radius: 6, duration: 3 },
  },
};

export const ITEM_SLOTS = 4;
export const SELL_RATIO = 0.7;
