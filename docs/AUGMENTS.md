# Mini Clash — Power Surge (Augment System & Catalog)

Augments are Mini Clash's mid-match draft: at levels **3, 6, 9** every player picks 1 of 3 offers that *visibly* mutates their duo's power. This file owns the system rules and the **generic catalog** (available to everyone). Each champion's 3 **signature Augments** live in [CHAMPIONS.md](CHAMPIONS.md) and join this pool for that player only.

## 1. Draft rules

- **Trigger:** reaching level 3 / 6 / 9 opens your draft. The game does not pause (HotS-style): a compact overlay docks bottom-center; pick with `1/2/3` or click; **45 s** timer, then auto-pick (bots' utility scorer picks for you).
- **Offers:** 3 cards. Composition guarantees: ≥1 champion-specific card (for either duo member) per draft; no duplicate category twice in one offer set; already-taken augments and same-slot exclusives are filtered out.
- **Rarity odds** (Silver/Gold/Prismatic): draft 1 → 60/33/7 · draft 2 → 50/38/12 · draft 3 → 45/40/15. **Pity:** team behind on (kills + towers) rolls +10% next-tier odds. Prismatic offers play a special card flourish + sound — they should feel like opening a chase card.
- **Reroll:** 1 token per match (rerolls the full offer set once).
- **Stacking:** each augment is unique per player. Effects tagged `[duo]` apply to both champions; `[active-champ]` effects apply to whoever is fielded; champion-specific effects only function on their champion.
- **The visibility mandate:** every augment must alter something on-screen — projectile count/size/element, trails, character glow, prop changes. If a player can't tell an enemy's augment from watching one fight, the augment fails review. (Enemy augment icons also show on Tab and on their nameplate.)

## 2. Bot drafting

Bots score offers via the utility system: kit synergy weights (per-champion tag affinities authored in data), team-comp gaps (no frontline → defensive bias), game-state (behind → comeback picks), personality noise ±15%. Elite bots respect combo lines (e.g. take *Splitter* only with a projectile Q).

## 3. Generic catalog (48)

Tags: `[duo]` both champions · `[active]` fielded champion only · `[Q]/[W]/[R]/[AA]` modifies that slot (applies to both champions' matching slot unless noted) · ⚔ physical-leaning · ✦ arcane-leaning.

### 3.1 Offense — Silver
| # | Augment | Effect |
|---|---|---|
| 1 | Whetted Edges | `[duo]` +10% AD, basic attacks spark on hit |
| 2 | Focused Mind | `[duo]` +15% AP, hands glow in team color while casting |
| 3 | Quickdraw | `[duo]` +12% Attack Speed; holstered-weapon spin idle flourish |
| 4 | Splitter | `[Q]` your Q projectile splits into 2 at 60% damage each (V-spread). *Requires projectile Q* |
| 5 | Heavy Rounds | `[AA]` ⚔ basics deal +8 (+4/level) and push 0.1 u; muzzle smoke grows |
| 6 | Hex Tip | `[AA]` ✦ every 3rd basic burns 20 (+15% AP) over 2 s; glowing rune ammo |
| 7 | Opportunist | `[duo]` +18% damage to CC'd enemies; dagger glint sting on proc |
| 8 | Giant Slayer | `[duo]` +12% damage to enemies with more max HP than you |

### 3.2 Offense — Gold
| # | Augment | Effect |
|---|---|---|
| 9 | Echo Cast | `[W]` casting W stores an echo: repeats at 45% power 1 s later from the same spot (ghost-image VFX) |
| 10 | Executioner | `[duo]` abilities deal +20% below 30% target HP; skull marker over execute-range enemies |
| 11 | Chain Lightning | `[AA]` ✦ basics arc to 1 nearby enemy at 50%; blue filament visuals |
| 12 | Siege Rounds | `[duo]` +40% damage to structures; shots go cannonball-shaped vs towers |
| 13 | Glass Core | `[duo]` +25% total damage, −12% max HP; your body gains cracked-glass glow — enemies see your gamble |
| 14 | Overcharge | `[R]` ultimate +25% effect (damage/heal/duration where applicable); R button and character crackle when ready |

### 3.3 Offense — Prismatic
| # | Augment | Effect |
|---|---|---|
| 15 | Elemental Ascension | `[duo]` your kit takes on an element rolled from the match seed at pickup — flame, frost or storm: all abilities re-skinned to it and gaining its rider (burn 3%/2 s · slow 15% · 8% Energy refund on hit). The full-kit recolor is the flex. *(Rolled rather than chosen: the pick has to resolve identically on every client, and a mid-match sub-choice would need its own overlay. Revisit if the draft ever grows one.)* |
| 16 | Deathblossom | `[duo]` champion takedowns detonate the victim: 120 (+20% AD +20% AP) in 2.5 u petal-nova |
| 17 | Mirror Strike | `[Q]` Q casts twice: second cast auto-aims the nearest other enemy (mirror-image trail) |

### 3.4 Defense — Silver
| # | Augment | Effect |
|---|---|---|
| 18 | Stoneskin | `[duo]` +18 Armor; skin gains granite flecks |
| 19 | Spellcowl | `[duo]` +18 Ward; hooded shimmer when hit by arcane |
| 20 | Thick Hide | `[duo]` +10% max HP; model +4% scale (visibly chonkier) |
| 21 | Field Rations | `[duo]` health orbs heal +40% and grant +20% MS 1.5 s |
| 22 | Grounding Rod | `[duo]` −25% damage from Living Bridge events & Storm Front; small lightning-rod backpack prop |
| 23 | Last Stand | `[active]` below 25% HP: +20 Armor/Ward and abilities cost −30% Energy; low-HP ember aura |

### 3.5 Defense — Gold
| # | Augment | Effect |
|---|---|---|
| 24 | Bulwark Bond | `[duo]` swapping grants the incoming champion a 90 (+8/level) shield 2 s (shield dome flash on entrance) |
| 25 | Thornmail Soul | `[duo]` reflect 15% of pre-mitigation basic-attack damage as ⚔; attackers see thorn burst |
| 26 | Second Wind | `[duo]` once per life: dropping below 15% HP heals 20% max HP over 3 s (phoenix-feather swirl) |
| 27 | Juggernaut Frame | `[duo]` +14% max HP, slows on you −30%; footstep dust grows |

### 3.6 Defense — Prismatic
| # | Augment | Effect |
|---|---|---|
| 28 | Guardian Constellation | `[duo]` every 20 s, gain a star-shield that blocks one ability entirely (orbiting star shows charge state) |
| 29 | Undying Contract | `[duo]` once per match: on death, your benched champion rises at the spot with 30% HP and the swap goes on full cooldown — the half that stepped in is stuck out there (the duo refuses to file the paperwork). Cannot trigger during Overtime |

### 3.7 Mobility & Utility — Silver
| # | Augment | Effect |
|---|---|---|
| 30 | Fleetfoot | `[duo]` +0.25 MS; speed-line ankle trails |
| 31 | Energizer | `[duo]` +1.5 Energy regen/s; bar gains a pulse animation |
| 32 | Clockwork Mind | `[duo]` +10% Haste; tiny clock-hands halo while abilities are on CD |
| 33 | Scavenger | `[duo]` Coin Rain coins +100% value to you, Minis drop 1 g extra; coin-sparkle magnet radius |
| 34 | Long Reach | `[duo]` +0.4 attack range (melee +0.3); weapon grows subtly |
| 35 | Orb Sense | `[duo]` see orb/event spawn timers on your HUD 10 s early; a compass wisp points to the next event |

### 3.8 Mobility & Utility — Gold
| # | Augment | Effect |
|---|---|---|
| 36 | Slipstream | `[duo]` after casting R, gain 25% MS decaying over 2 s; afterimage trail |
| 37 | Kinetic Battery | `[duo]` moving charges your next basic/ability +1% per 1 u (cap 15%); crackling charge meter on weapon |
| 38 | Event Insurance | `[duo]` dying within 10 s of a Living Bridge event start: respawn timer −40%; ghostly rebate receipt VFX |
| 39 | Windfall | `[duo]` +25% gold from all sources; golden glint on pickups |

### 3.9 Tag Team — Silver
| # | Augment | Effect |
|---|---|---|
| 40 | Quick Change | `[duo]` Tag Swap CD −1.5 s; swap puff gains team-color fireworks |
| 41 | Warm Bench | `[duo]` benched champion's cooldowns tick +30% faster |
| 42 | Dramatic Entrance | `[duo]` Entrance effects +40% potency; entrance gets a spotlight beam |

### 3.10 Tag Team — Gold
| # | Augment | Effect |
|---|---|---|
| 43 | Momentum Swap | `[duo]` swap MS burst 20%→35% and lasts 2 s; speed ribbon |
| 44 | Tag Combo | `[duo]` after swapping, your next ability within 3 s costs 0 Energy (combo flash on the ability button and the character's hands) |
| 45 | Understudy | `[duo]` while benched, a champion regenerates 1.5% max HP/s worth of **Resolve**: a grey-HP shield granted on its next entrance (max 20% pool) |

### 3.11 Tag Team — Prismatic
| # | Augment | Effect |
|---|---|---|
| 46 | Double Feature | `[duo]` swapping in triggers a spectral cameo: your *outgoing* champion's ghost lingers 2 s and repeats its last basic attack each second (translucent double on stage) |
| 47 | Perfect Relay | `[duo]` Tag Swap gains a 2nd charge (both on 12 s CD); baton-pass glyph between portraits |

### 3.12 Siege — Prismatic
| # | Augment | Effect |
|---|---|---|
| 48 | Warlord's Banner | `[duo]` nearby allied Minis +30% damage, +20% MS and gain little team banners; Rams you escort gain a drum-corps aura (audible drums — the whole lane hears the push coming) |

## 4. Authoring rules for new augments

1. Name it like a collectible card, not a patch note ("Deathblossom", never "+20% damage below 30%").
2. One sentence of effect; numbers tunable in data without renaming.
3. Must pass the visibility mandate (§1) — spec the visual in the same line.
4. Silver = stat-plus-garnish · Gold = changes a decision · Prismatic = changes the fight story. If a Prismatic doesn't produce clips, it's a Gold.
5. Every new champion ships with 3 signatures: one per rarity, at least one touching their Entrance or ultimate.
