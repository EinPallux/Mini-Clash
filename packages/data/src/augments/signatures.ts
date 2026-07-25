import type { AugmentDef } from './types';

/**
 * Champion signature augments (3 each, one per rarity) — authored in
 * docs/CHAMPIONS.md alongside the kits they bend. A signature only enters the
 * offer pool for the champion that owns it (either half of the duo counts), and
 * only functions while that champion is fielded.
 *
 * Most reshape their kit through named `param` knobs the ability reads at its
 * own resolve site (`rook.wallLength`, `sylva.flowerCap`, …), which keeps the
 * engine free of champion names. The few that add genuinely new behaviour use
 * `special`, exactly like a champion passive does.
 */
const sig = (
  championId: string,
  def: Omit<AugmentDef, 'category' | 'championId' | 'scope'>,
): AugmentDef => ({ ...def, category: 'signature', championId, scope: 'active' });

export const SIGNATURE_AUGMENTS: AugmentDef[] = [
  /* --------------------------------- Rook --------------------------------- */
  sig('rook', {
    id: 'counterweight',
    name: 'Counterweight',
    rarity: 'silver',
    description: 'Stonewall also reflects 60% of what it blocks back at the attacker.',
    visual: 'Blocked hits ricochet off the shield in a shower of stone chips.',
    tags: ['tank'],
    effects: [{ k: 'special', id: 'counterweight', params: { pct: 0.6 } }],
  }),
  sig('rook', {
    id: 'ramparts_old_bridge',
    name: 'Ramparts of the Old Bridge',
    rarity: 'gold',
    description: 'Rampart is 60% longer and stops enemy projectiles dead.',
    visual: 'The wall rises taller with crenellations that visibly eat shots.',
    tags: ['tank', 'utility'],
    effects: [
      { k: 'param', key: 'rook.wallLength', value: 1.6, mode: 'mul' },
      { k: 'param', key: 'rook.wallBlocksProjectiles', value: 1, mode: 'set' },
    ],
  }),
  sig('rook', {
    id: 'castle_drop',
    name: 'Castle Drop',
    rarity: 'prismatic',
    description: "Keep's Wrath leaves the ring of its impact standing as real terrain for 4s.",
    visual: 'A ring of bridge-chunks erupts and stays up, splitting the fight.',
    tags: ['tank', 'utility'],
    effects: [{ k: 'special', id: 'castle_drop', params: { seconds: 4, radius: 2.6 } }],
  }),

  /* -------------------------------- Fathom -------------------------------- */
  sig('fathom', {
    id: 'chain_shot',
    name: 'Chain-Shot',
    rarity: 'silver',
    description: "Skipshot's last skip splits into two diagonal mini-balls.",
    visual: 'The final bounce cracks the cannonball into a pair of tracers.',
    tags: ['ad', 'burst'],
    effects: [{ k: 'special', id: 'chain_shot', params: { power: 0.55, spreadDeg: 26 } }],
  }),
  sig('fathom', {
    id: 'long_nine',
    name: 'Long Nine',
    rarity: 'gold',
    description: '+0.75 attack range, and Powder Rounds fire every 3rd shot.',
    visual: 'The hand-cannon gains a visibly longer barrel.',
    tags: ['ad', 'utility'],
    effects: [
      { k: 'stat', add: { range: 0.75 } },
      { k: 'param', key: 'fathom.powderEvery', value: 3, mode: 'set' },
    ],
  }),
  sig('fathom', {
    id: 'fleet_admiral',
    name: 'Fleet Admiral',
    rarity: 'prismatic',
    description: 'Broadside! brings a second ghost ship up the opposite flank.',
    visual: 'Two spectral ships surface and fire mirrored volleys down the lane.',
    tags: ['burst', 'siege'],
    effects: [{ k: 'special', id: 'fleet_admiral', params: { power: 1 } }],
  }),

  /* -------------------------------- Mortis -------------------------------- */
  sig('mortis', {
    id: 'marginalia',
    name: 'Marginalia',
    rarity: 'silver',
    description: 'Soul Ledger refunds double Energy, and the inscription lasts 6s.',
    visual: 'Margin scribbles crawl across every inscribed enemy.',
    tags: ['ap', 'utility'],
    effects: [
      { k: 'param', key: 'mortis.refundMul', value: 2, mode: 'mul' },
      { k: 'param', key: 'mortis.inscribeDuration', value: 6, mode: 'set' },
    ],
  }),
  sig('mortis', {
    id: 'special_collections',
    name: 'Special Collections',
    rarity: 'gold',
    description: 'Soulbolt forks off inscribed targets toward a second enemy at 60%.',
    visual: 'The wisp-skull splits and banks toward a new mark.',
    tags: ['ap', 'burst'],
    effects: [{ k: 'special', id: 'special_collections', params: { power: 0.6, radius: 6 } }],
  }),
  sig('mortis', {
    id: 'restricted_section',
    name: 'The Restricted Section',
    rarity: 'prismatic',
    description: 'Overdue Maelstrom drags victims inward and its finale silences them.',
    visual: 'The vortex visibly hauls everyone toward the centre before it slams.',
    tags: ['ap', 'utility'],
    effects: [{ k: 'special', id: 'restricted_section', params: { pullPerSec: 1, silence: 1 } }],
  }),

  /* -------------------------------- Rattle -------------------------------- */
  sig('rattle', {
    id: 'knife_juggler',
    name: 'Knife Juggler',
    rarity: 'silver',
    description: 'Fan of Knives daggers return to you, cutting again at 40%.',
    visual: 'The daggers boomerang back through everything they passed.',
    tags: ['ad', 'burst'],
    effects: [{ k: 'special', id: 'knife_juggler', params: { power: 0.4 } }],
  }),
  sig('rattle', {
    id: 'skeleton_key',
    name: 'Skeleton Key',
    rarity: 'gold',
    description: 'Your skull is far sturdier and taunts nearby Minis while it waits.',
    visual: 'The skull grows a brass key in its jaw and pulls a crowd.',
    tags: ['mobility', 'utility'],
    effects: [
      { k: 'param', key: 'rattle.skullHp', value: 350, mode: 'set' },
      { k: 'param', key: 'rattle.skullTaunt', value: 3, mode: 'set' },
    ],
  }),
  sig('rattle', {
    id: 'repo_man',
    name: 'Repo Man',
    rarity: 'prismatic',
    description: 'Marrow Harvest executes targets below 12% health outright.',
    visual: 'Execute-range enemies wear a visible repossession stamp.',
    tags: ['execute', 'burst'],
    effects: [{ k: 'special', id: 'repo_man', params: { threshold: 0.12 } }],
  }),

  /* --------------------------------- Grukk -------------------------------- */
  sig('grukk', {
    id: 'exact_change',
    name: 'Exact Change',
    rarity: 'silver',
    description: 'Skewer refunds 15 Energy for every champion it catches.',
    visual: 'Coins spill off the spear-tip with each toll collected.',
    tags: ['utility', 'ad'],
    effects: [{ k: 'param', key: 'grukk.skewerRefund', value: 15, mode: 'set' }],
  }),
  sig('grukk', {
    id: 'double_shift',
    name: 'Double Shift',
    rarity: 'gold',
    description: 'War Bellow shields for double below 40% health, and its cone is wider.',
    visual: 'The roar visibly widens and the shield doubles up in plates.',
    tags: ['tank', 'sustain'],
    effects: [
      { k: 'param', key: 'grukk.bellowLowHpShieldMul', value: 2, mode: 'set' },
      { k: 'param', key: 'grukk.bellowConeMul', value: 1.35, mode: 'mul' },
    ],
  }),
  sig('grukk', {
    id: 'seismic_overtime',
    name: 'Seismic Overtime',
    rarity: 'prismatic',
    description: 'Seismic Tantrum gains a fourth slam that hauls enemies inward.',
    visual: 'A fourth crack opens and drags everyone toward the booth.',
    tags: ['burst', 'utility'],
    effects: [{ k: 'special', id: 'seismic_overtime', params: { pull: 2 } }],
  }),

  /* --------------------------------- Sylva -------------------------------- */
  sig('sylva', {
    id: 'overgrowth',
    name: 'Overgrowth',
    rarity: 'silver',
    description: 'Three more flowers can bloom at once, and they last far longer.',
    visual: 'The garden spreads visibly further across the deck.',
    tags: ['sustain', 'utility'],
    effects: [
      { k: 'param', key: 'sylva.flowerCap', value: 3, mode: 'add' },
      { k: 'param', key: 'sylva.flowerLife', value: 30, mode: 'set' },
    ],
  }),
  sig('sylva', {
    id: 'nettle_garden',
    name: 'Nettle Garden',
    rarity: 'gold',
    description: 'Blooming flowers also sting nearby enemies.',
    visual: 'Each bloom throws a ring of nettles instead of petals.',
    tags: ['ap', 'utility'],
    effects: [
      {
        k: 'special',
        id: 'nettle_garden',
        params: { base: 35, apRatio: 0.2, radius: 1.5 },
      },
    ],
  }),
  sig('sylva', {
    id: 'heartwood',
    name: 'Heartwood',
    rarity: 'prismatic',
    description: 'Blooming Ward follows you, and allies inside gain Move Speed.',
    visual: 'The garden uproots and walks with her, trailing petals.',
    tags: ['sustain', 'mobility'],
    effects: [{ k: 'special', id: 'heartwood', params: { ms: 0.1 } }],
  }),

  /* --------------------------------- Boltz -------------------------------- */
  sig('boltz', {
    id: 'overvolt',
    name: 'Overvolt',
    rarity: 'silver',
    description: 'Arc Zapper chains to one more enemy at 60%.',
    visual: 'The beam forks a second, thinner bolt to the next target.',
    tags: ['ap', 'burst'],
    effects: [{ k: 'special', id: 'overvolt', params: { power: 0.6, radius: 4.5 } }],
  }),
  sig('boltz', {
    id: 'habitat_module',
    name: 'Habitat Module',
    rarity: 'gold',
    description: 'Bubble Dome is bigger and regenerates allies standing inside it.',
    visual: 'The dome swells and fills with a breathable green haze.',
    tags: ['sustain', 'tank'],
    effects: [
      { k: 'param', key: 'boltz.domeRadius', value: 1, mode: 'add' },
      { k: 'param', key: 'boltz.domeRegenPct', value: 0.03, mode: 'set' },
    ],
  }),
  sig('boltz', {
    id: 'kessler_protocol',
    name: 'Kessler Protocol',
    rarity: 'prismatic',
    description: 'Orbital Droppod drops two more, smaller pods in a line.',
    visual: 'Three impact shadows walk across the deck in sequence.',
    tags: ['burst', 'siege'],
    effects: [{ k: 'special', id: 'kessler', params: { extra: 2, power: 0.6, spacing: 2.6 } }],
  }),

  /* --------------------------------- Wisp --------------------------------- */
  sig('wisp', {
    id: 'poltergeist',
    name: 'Poltergeist',
    rarity: 'silver',
    description: 'Your sheet decoy detonates when it is destroyed.',
    visual: 'The sheet billows and bursts in a spectral shockwave.',
    tags: ['ap', 'burst'],
    effects: [
      {
        k: 'special',
        id: 'poltergeist',
        params: { base: 70, apRatio: 0.4, radius: 2.2 },
      },
    ],
  }),
  sig('wisp', {
    id: 'separation_anxiety',
    name: 'Separation Anxiety',
    rarity: 'gold',
    description: 'Boo! pierces, and every enemy it hits lengthens your next Haunting Hour.',
    visual: 'The bolt punches through in a widening wail.',
    tags: ['ap', 'utility'],
    effects: [
      { k: 'param', key: 'wisp.booPierces', value: 1, mode: 'set' },
      { k: 'param', key: 'wisp.curseBonusPerHit', value: 0.5, mode: 'set' },
    ],
  }),
  sig('wisp', {
    id: 'midnight_society',
    name: 'Midnight Society',
    rarity: 'prismatic',
    description: 'Haunting Hour raises three ghost Minis to fight for you.',
    visual: 'Spectral skeletons claw up out of the cursed ground.',
    tags: ['siege', 'utility'],
    effects: [{ k: 'special', id: 'midnight_society', params: { count: 3, seconds: 6 } }],
  }),

  /* --------------------------------- Piper -------------------------------- */
  sig('piper', {
    id: 'sharing_is_caring',
    name: 'Sharing Is Caring',
    rarity: 'silver',
    description: 'Snack Toss splits into three smaller snacks on landing.',
    visual: 'The plate breaks into a little scatter of treats.',
    tags: ['sustain'],
    effects: [{ k: 'special', id: 'sharing_is_caring', params: { count: 3, power: 0.55 } }],
  }),
  sig('piper', {
    id: 'two_good_boys',
    name: 'Two Good Boys',
    rarity: 'gold',
    description: 'A second pet joins the rotation — they fetch twice as often, alternating.',
    visual: 'A dog trots in beside the fox and they take turns.',
    tags: ['ad', 'utility'],
    effects: [{ k: 'special', id: 'two_good_boys', params: { unit: 1 } }],
  }),
  sig('piper', {
    id: 'apex_herd',
    name: 'Apex Herd',
    rarity: 'prismatic',
    description: "STAMPEDE!'s final wave is all elephants: a longer knock-up and a heavier slow.",
    visual: 'The last wave is nothing but elephants, and the deck shakes for it.',
    tags: ['burst', 'utility'],
    effects: [{ k: 'special', id: 'apex_herd', params: { knockup: 1.2, slow: 0.3 } }],
  }),

  /* ---------------------------------- Vex --------------------------------- */
  sig('vex', {
    id: 'debt_interest',
    name: 'Debt Interest',
    rarity: 'silver',
    description: 'Crimson Lash marks stack — the third lash on one champion stuns.',
    visual: 'Crimson tally marks climb the victim until they seize up.',
    tags: ['burst', 'utility'],
    effects: [{ k: 'special', id: 'debt_interest', params: { stacks: 3, window: 6, stun: 0.8 } }],
  }),
  sig('vex', {
    id: 'blood_waltz',
    name: 'Blood Waltz',
    rarity: 'gold',
    description: 'Bat Waltz leaves a blood trail: you speed up on it, enemies bog down.',
    visual: 'A crimson carpet unrolls along the dash path.',
    tags: ['mobility', 'utility'],
    effects: [
      {
        k: 'special',
        id: 'blood_waltz',
        params: { seconds: 3, allyMs: 0.15, enemySlow: 0.15, radius: 1.4 },
      },
    ],
  }),
  sig('vex', {
    id: 'eternal_host',
    name: 'Eternal Host',
    rarity: 'prismatic',
    description: 'Guests stay invited twice as long, and each one that dies refunds your ultimate.',
    visual: 'The chalice markers burn longer and flare when a guest departs.',
    tags: ['sustain', 'execute'],
    effects: [
      { k: 'param', key: 'vex.inviteDuration', value: 6, mode: 'set' },
      { k: 'param', key: 'vex.guestDeathRefund', value: 0.3, mode: 'set' },
    ],
  }),
];
