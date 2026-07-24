# Mini Clash — Champion Roster (Launch 12)

Complete specs for the 1.0 roster: identity, exact asset mapping, stats, kits with launch numbers, per-ability animation/VFX direction, Entrance effects, and each champion's 3 signature Augments. Combat rules (formulas, Energy, CC, DR) are in [GAME_DESIGN.md](GAME_DESIGN.md) §10; the Augment system is in [AUGMENTS.md](AUGMENTS.md).

**Reading an ability line:** `cost ⚡ / cooldown ⏱ / range·size / numbers`. Damage is `base (+ratio)`, e.g. `90 (+55% AP)`. All values are launch-tuning.

---

## 1. Roles & roster spread

| Role | Fantasy | Champions |
|---|---|---|
| **Vanguard** | Frontline, engage, peel | Rook, Snowble |
| **Bruiser** | Skirmisher, sustained brawl | Grukk, Vex |
| **Slayer** | Burst assassin | Rattle |
| **Gunner** | Sustained ranged damage | Fathom, Boltz |
| **Caster** | Burst/zone magic | Mortis, Wisp |
| **Support** | Heal, shield, enable | Sylva, Piper |
| **Specialist** | Summons, siege, zone control | Patch |

Duo randomness means any two roles can pair — every kit must be self-sufficient (some damage, some out) but *shine* when its role is complemented. Release order: v0.1 Rook+Fathom · v0.2 Mortis+Rattle+Grukk+Sylva · v0.4 Boltz+Wisp · v0.5 Piper+Vex · v0.9 Snowble+Patch.

## 2. Rig families & animation standard

| Rig family | Source | Skeleton | Clips shipped | Used by |
|---|---|---|---|---|
| **Kenney-Skinned** | Cute Characters, Minidungeon, Mini Arena | Skinned, 2 skins/file | 25–32 (idle, walk, sprint, die, attack-melee-L/R, kick-L/R, holding-L/R/both[+shoot], interact, pick-up, emote-yes/no, jump, fall, crouch…) | Rook, Fathom, Grukk, Sylva, Piper, Boltz |
| **Kenney-Nodes** | Blocky Characters, Graveyard characters | Rigid-part node animation, same clip names | 27–32 | Wisp, Vex, Patch, all Minis |
| **KayKit-Medium** | Skeletons pack + `Rig_Medium` animation library | Skinned, shared retarget rig | Library: Idle_A/B, Walking_A–C, Running_A/B, Hit_A/B, Death_A/B, Spawn_Ground/Air, Throw, Use_Item, Interact, PickUp, Jump_* | Mortis, Rattle (+ future KayKit/Quaternius champions) |
| **Custom-Procedural** | Assembled from props | Node hierarchy, hand-keyed + procedural | authored in-engine | Snowble (snowman), Clash Golem, pets |

**Every champion implements the full animation state machine:** `spawn, idle (+2 idle-fidgets), run, attack (windup/hit/recover), cast_q, cast_w, cast_r, hit-react, death, dance-emote, entrance`. Casts reuse base clips **plus** the procedural layer (aim-yaw toward cursor, squash-&-stretch pops, prop flourishes) **plus** an FX timeline (see TECHNICAL_ARCHITECTURE §VFX). "Fully animated abilities" = clip + procedural + FX + sound + camera accents, specified per ability below. Weapon props attach to hand sockets (`handSlotRight/Left` per Kenney rig convention).

## 3. Base stat overview (level 1 → level 10)

| Champion | HP | AD | AS | MS | Range | Armor/Ward |
|---|---|---|---|---|---|---|
| Rook | 1080 → 2160 | 58 → 104 | 0.72 | 3.5 | 1.8 | 32/30 → 62/58 |
| Fathom | 640 → 1310 | 62 → 128 | 0.88 | 3.6 | 6.5 | 22/20 → 44/40 |
| Mortis | 600 → 1220 | 50 → 82 | 0.70 | 3.5 | 6.8 | 20/24 → 40/48 |
| Rattle | 660 → 1350 | 64 → 132 | 0.95 | 3.8 | 1.8 | 24/20 → 47/40 |
| Grukk | 940 → 1950 | 63 → 122 | 0.78 | 3.6 | 2.2 | 30/26 → 58/52 |
| Sylva | 620 → 1260 | 52 → 88 | 0.80 | 3.6 | 6.0 | 21/25 → 42/49 |
| Boltz | 650 → 1330 | 60 → 122 | 0.92 | 3.6 | 6.0 | 22/22 → 44/44 |
| Wisp | 590 → 1200 | 48 → 78 | 0.75 | 3.7 | 6.5 | 19/26 → 38/51 |
| Piper | 640 → 1300 | 54 → 96 | 0.82 | 3.6 | 5.5 | 22/24 → 44/47 |
| Vex | 900 → 1870 | 61 → 118 | 0.85 | 3.7 | 2.0 | 29/27 → 56/53 |
| Snowble | 1120 → 2240 | 55 → 98 | 0.68 | 3.4 | 2.0 | 34/32 → 65/61 |
| Patch | 680 → 1380 | 56 → 100 | 0.85 | 3.5 | 5.5 | 24/24 → 47/47 |

(HP regen: Vanguards 0.6%/s, Bruisers 0.5%/s, others 0.35%/s. Duo shared-HP pool = average of both champions' curves, per GAME_DESIGN §7.2.)

---

## 4. The Champions

### 🛡 ROOK — the Wandering Rampart
**Vanguard · starter · difficulty ●○○**
A stoic living statue of the old bridge-keepers' order; fights like a piece of architecture that got opinions.

- **Model:** `Kenney_MiniArena/character-soldier.glb` (stone-grey + team-color tabard palette). Props: `Kenney_Minidungeon/shield-rectangle.glb` (left hand), `Kenney_MiniArena/weapon-sword.glb` (right).
- **Passive — Stonewall:** every 8 s, Rook's next incoming hit is reduced by `40 (+8×level)`. Blocked hits chip a visible stone-shard off his shield (regrows — readable timer).
- **Q — Bash & Batter:** 25⚡ / 7 s / 2.6 u arc. Shield slam: `70 (+65% AD)` physical + 25% slow 1.5 s; **recast within 3 s:** sword backswing `55 (+50% AD)`. *Anim:* `attack-melee-left` (shield arm) into `attack-melee-right`, 15% overspeed, stone-dust cone VFX + screen-nudge on hit.
- **W — Rampart:** 35⚡ / 14 s / place at 3 u. Raises a 3-u stone wall (blocks movement, not projectiles) for 2.5 s; allies passing gain 15% MS. *Anim:* `interact-right` ground-punch; wall erupts as animated Castle-kit crenellation chunks with dust burst; crumbles on expiry.
- **R — Keep's Wrath:** ⏱ 70 s / self 4 u. Rook leaps (0.6 s) and lands as a fortress: `160 (+90% AD)` physical, knock-up 1 s in 2.5 u, then gains 25% DR aura for allies within 4 u for 3 s. *Anim:* `jump` → slam frame-hold, camera shake M, radial crack decal, banner-flags sprout from his shoulders (flag props) for the aura duration.
- **Entrance (swap-in):** *Shieldwall* — 1 s, blocks the first incoming hit entirely (small "clang" flash).
- **Signature Augments:** ①**Ramparts of the Old Bridge** (Gold): W wall length +60%, wall now blocks enemy projectiles. ②**Counterweight** (Silver): Passive block also reflects 60% of blocked amount. ③**Castle Drop** (Prismatic): R leaves the wall-ring standing as terrain for 4 s (Living-Bridge chunk visuals).

---

### 🏴‍☠️ FATHOM — the Powder-Captain
**Gunner · starter · difficulty ●●○**
A swaggering pirate whose hand-cannon is technically ship's artillery; treats the bridge as her quarterdeck.

- **Model:** `Kenney_CuteCharacters/character-female-b.glb` (navy coat, gold trim palette). Prop: scaled `Kenney_PirateKit/cannon.glb` as hand-cannon (right hand); `bottle.glb` on belt.
- **Passive — Powder Rounds:** every 4th basic attack is a powder blast: +`30 (+20% AD)` splash (1.2 u) and pushes the target 0.5 u back. Barrel glows + fuse-hiss telegraph on the 3rd shot.
- **Q — Skipshot:** 30⚡ / 6 s / 7.5 u line. Cannonball skips 3 times (hits at 2.5/5/7.5 u): `75 (+70% AD)` physical, −15% per skip already spent; final skip knocks Minis aside. *Anim:* `holding-right-shoot` with recoil-lunge exaggerated ×1.5, cannonball is a real `cannon-ball.glb` with water-splash-style dust rings at each skip, tracer smoke ribbon.
- **W — Powder Keg:** 35⚡ / 11 s / toss to 5 u. Throws a keg (`barrel.glb`, 2 s fuse or shoot-triggered — hers and allies' attacks detonate it): `110 (+60% AD)` in 2.2 u + 30% slow 2 s. Enemies can walk away from the fuse; shooting it early is her skill line. *Anim:* `throw`-style underarm lob (`interact-left` retimed), keg wobbles, fuse spark particle, barrel-stave explosion with ring shockwave.
- **R — Broadside!:** ⏱ 80 s / global-length lane strip (4 u wide) along her facing. The **ghost ship** (`Kenney_PirateKit/ship-ghost.glb`, spectral shader) surfaces from the void mist alongside the bridge over 1.2 s, then fires 5 sequential cannon volleys down the strip (each `90 (+45% AD)` in 1.8 u, same target hit max twice). *Anim:* Fathom raises her hat (`emote-yes` + prop flourish); ship rises with sea-mist VFX, cannon-fire muzzle flashes, splash decals march down the lane; ship dives back into the void. This is the game's marquee "wow" ultimate.
- **Entrance:** *Lucky Doubloon* — flips a coin; next basic within 2 s deals +40% (coin-sparkle trail).
- **Signature Augments:** ①**Chain-Shot** (Silver): Q's last skip splits into 2 diagonal mini-balls (`45 +30% AD`). ②**Long Nine** (Gold): +0.75 attack range; Powder Rounds every 3rd shot. ③**Fleet Admiral** (Prismatic): Broadside brings a **second ship** on the opposite flank, mirrored volleys.

---

### 💀 MORTIS — the Bridge-Bound Scholar
**Caster · starter · difficulty ●●○**
The skeleton archivist who's been on the bridge longer than the war; casts from a very overdue library book.

- **Model:** `KayKit_Skeletons/Skeleton_Mage.glb` + staff `KayKit_FantasyWeaponsBits` (crystal staff). KayKit-Medium rig, retargeted library clips.
- **Passive — Soul Ledger:** enemies hit by abilities are "inscribed" 4 s; Mortis's basic attacks vs inscribed targets deal +`12 (+15% AP)` arcane and refund 4⚡ (glyph floats over target).
- **Q — Soulbolt:** 25⚡ / 4.5 s / 7 u skillshot. `85 (+60% AP)` arcane; passes through Minis it kills (overkill carry-through rewards wave-timing). *Anim:* `Throw` retarget with staff sweep; bolt = wisp skull with ribbon trail, impact = ledger-glyph burst.
- **W — Grasping Stacks:** 40⚡ / 10 s / 5.5 u circle (2 u). After 0.7 s telegraph, bone bookshelf-hands erupt: `95 (+65% AP)` + root 1.2 s (inscribed targets: 1.6 s). *Anim:* `Use_Item` slam; eruption uses KayKit dungeon bone/shelf props bursting through a crack decal, pages flutter.
- **R — Overdue Maelstrom:** ⏱ 75 s / self-centered 4.5 u, 3 s channel (move at 40% speed). A vortex of bones and burning pages: `70 (+35% AP)` arcane per 0.5 s tick; victims are slowed 30% (lingers 1 s, so leaving doesn't shake it instantly). *Anim:* `Idle_B` upper-hold with staff overhead, procedural spin layer; GPU-instanced bone + page meshes orbit in two counter-rings, building to a slam finale.
- **Entrance:** *Re-shelved* — erupts from the ground (`Spawn_Ground` — the clip exists and it's perfect): 0.5 s, small 1.5 u `40 (+20% AP)` dust nova.
- **Signature Augments:** ①**Marginalia** (Silver): Passive refund doubles; inscribed duration 6 s. ②**Special Collections** (Gold): Q forks backward off inscribed targets (60% damage bolt toward a second enemy). ③**The Restricted Section** (Prismatic): R pulls enemies 1 u/s inward and its finale silences 1 s.

---

### 🗡 RATTLE — the Unfinished Business
**Slayer · v0.2 · difficulty ●●●**
A skeleton rogue who died mid-heist and refuses to file it as closed; all elbows, daggers and grudges.

- **Model:** `KayKit_Skeletons/Skeleton_Rogue.glb` + twin daggers (`KayKit_FantasyWeaponsBits`). KayKit-Medium rig.
- **Passive — Loose Bones:** dashing or swapping rattles 2 bones loose (4 s, max 4 stacks). Rattle's next attack consumes them: +`18 (+20% AD)` physical each. Stacks read as bone pips orbiting him (the ground-prop shard layer joins with the v0.4 swap work).
- **Q — Fan of Knives:** 25⚡ / 6 s / 5 u cone. 3 daggers: `55 (+45% AD)` each, outer daggers converge — perfect aim overlaps 2 on one target. *Anim:* `Throw` ×1.3 speed with procedural torso whip; dagger props with motion-smear meshes, thunk-quiver on impact.
- **W — Rattle Step:** 30⚡ / 9 s / 4 u dash. Dashes through units (`35 +30% AD` on pass); leaves his **skull** behind for 3 s — **recast:** the body snaps back to the skull (return-blink). Skull is destructible (150 HP) — enemies can deny the return. *Anim:* dash smear + bone-clatter particles; skull prop sits grinning with idle bobble; return = bones vacuum-reassemble (reverse-explode shader).
- **R — Marrow Harvest:** ⏱ 70 s / 3 u blink-strike. Blink behind target, `140 (+85% AD)`; if the target dies within 2 s of any damage source, R's cooldown refunds 60% and Rattle gains 30% MS 2 s. *Anim:* vanish into bone-swirl, reappear with `Hit_A` retimed as strike, X-slash smear VFX, kill-confirm = rib-cage shatter burst + sting SFX.
- **Entrance:** *Ossuary Flourish* — 0.5 s: next Q within 3 s costs 0⚡ (daggers spin-up glint).
- **Signature Augments:** ①**Knife Juggler** (Silver): Q daggers return to Rattle (40% damage on the way back). ②**Skeleton Key** (Gold): W skull gains 200 HP and taunts Minis in 3 u. ③**Repo Man** (Prismatic): R executes below 12% HP (execute threshold visible on healthbars).

---

### 🪓 GRUKK — the Toll Collector
**Bruiser · v0.2 · difficulty ●○○**
An orc who decided the bridge needs a toll booth and that he is the toll booth.

- **Model:** `Kenney_Minidungeon/character-orc.glb` + `weapon-spear.glb`, `shield-round.glb` on back.
- **Passive — Toll Paid:** hitting a champion with any ability grants a stacking `4% (+1%/level ÷ 2)` damage-dealt buff, 3 stacks, 4 s (stack pips glow on his spear).
- **Q — Skewer:** 30⚡ / 7 s / 4.5 u thrust-dash. Lunges 2.5 u with spear extended: `80 (+70% AD)`; champions hit at max reach (tip 1 u) are **pulled 1.5 u** toward Grukk (tip marker on indicator). *Anim:* `attack-melee-right` retimed over dash root-motion; spear-tip gleam, pull = fishhook yank with dust.
- **W — War Bellow:** 25⚡ / 12 s / 4 u cone. Roar: `50 (+40% AD)` + Minis flee 1.5 s; champions dealt 20% slow and Grukk shields himself `164 (+11.2/level)` (≈ 70 + 10% max HP across the curve). *Anim:* `emote-no` head-shake converted to roar with jaw-open morphless head-tilt + camera micro-zoom, ring distortion VFX.
- **R — Seismic Tantrum:** ⏱ 75 s / 3 casts within 6 s, each 3 u slam. Three ground slams (recast to place each): `90 (+55% AD)` + 20% slow, third slam knocks up 0.8 s. *Anim:* alternating `attack-kick-right`/`attack-melee-right` slams with squash-stretch ×1.3, crack decals persist and connect — the floor *remembers* the tantrum.
- **Entrance:** *Booth Rules* — 1 s: 20% slow aura in 2.5 u (toll-sign pops over his head — pure charm frame).
- **Signature Augments:** ①**Exact Change** (Silver): Q refunds 15⚡ per champion hit. ②**Double Shift** (Gold): W shield +100% while below 40% HP, cone widened. ③**Seismic Overtime** (Prismatic): R gains a 4th slam that pulls enemies 2 u inward.

---

### 🌿 SYLVA — the Last Gardener
**Support · starter · difficulty ●●○**
Keeper of the bridge's improbable garden; kind to allies, horticulturally ruthless to trespassers.

- **Model:** `Kenney_CuteCharacters/character-female-d.glb` (leaf-green + bloom palette). Prop: gnarled staff (`KayKit_RPGToolsBits`), flower crown (color variant).
- **Passive — Pollen Trail:** Sylva plants a flower every 6 u walked (max 5, 20 s). Her abilities that touch a flower bloom it: nearby allies heal `20 (+15% AP)`. The map slowly becomes her garden — spatial-play support.
- **Q — Thorn Dart:** 25⚡ / 5 s / 6.5 u skillshot. `70 (+55% AP)` arcane + 20% slow 1 s; blooms flowers it passes. *Anim:* `holding-right-shoot` reskinned as staff flick; dart = spinning seed with petal trail; bloom = instanced flower pop with sparkle.
- **W — Blooming Ward:** 40⚡ / 11 s / 5 u circle (2.2 u). Garden zone 3 s: allies inside heal `30 (+25% AP)`/s and cleanse slows on entry; enemy hits inside it are −10% damage. *Anim:* `interact-right` staff plant; zone = animated grass/flower growth (Nature Kit meshes scale-in), fireflies, soft god-ray.
- **R — Wildwood Embrace:** ⏱ 80 s / 6 u cone, 0.5 s cast. Vines surge: `120 (+70% AP)` arcane + root 1.4 s; every bloomed flower in the cone extends the root +0.3 s (max +0.9) and heals allies in 2 u of it. *Anim:* both-arms raise (`holding-both` hold-frame + procedural tremble); vine meshes lash out in 3 waves, leaf-storm particles, rooted enemies get thorn-cage props.
- **Entrance:** *Fresh Cuttings* — instantly plants 2 flowers at her feet.
- **Signature Augments:** ①**Overgrowth** (Silver): flower cap +3, flowers last 30 s. ②**Nettle Garden** (Gold): blooms also sting enemies `35 (+20% AP)` in 1.5 u. ③**Heartwood** (Prismatic): W ward follows Sylva (attached zone) and grants 10% MS to allies inside.

---

### 🚀 BOLTZ — Salvage Unit 7
**Gunner/Specialist · v0.4 · difficulty ●●○**
A decommissioned survey astronaut who refuses to accept the mission ended; the bridge is "anomalous terrain, requires zapping."

- **Model:** `Kenney_SpaceKit/astronautA.glb` (team-visor palette). Prop: raygun assembled from `Kenney_SpaceKit` parts.
- **Passive — Capacitor:** after 3 s without attacking, next basic deals +`25 (+30% AD)` arcane and chains to 1 extra target (visor + gun charge-glow telegraph).
- **Q — Arc Zapper:** 30⚡ / 6 s / 6 u line. Instant tesla beam (0.15 s cast): `70 (+55% AD)` arcane, +30% vs shields; refunds 10⚡ on champion hit. *Anim:* `holding-right-shoot` snap-fire; jagged beam shader (animated noise), impact sparks + brief target electrify-outline.
- **W — Bubble Dome:** 35⚡ / 13 s / place 4 u. Projects a 2.5 u energy dome 2.5 s: blocks **enemy projectiles** at the shell (satisfying zap-pops); allies inside gain +10% AS firing out. *Anim:* `interact-left` wrist-tap; dome = fresnel hex-shield shader inflating with wobble, each blocked shot ripples it.
- **R — Orbital Droppod:** ⏱ 85 s / 7 u target, 1.2 s delay. Calls a droppod (`Kenney_SpaceKit` rocket/pod) from orbit: `170 (+80% AD)` in 2.5 u + knock-up 0.8 s at center. The pod **stays** 4 s as a bunker (Boltz or allies stand behind it — blocks movement & projectiles), then launches away. *Anim:* Boltz aims a beacon (`pick-up` reversed), sky-streak warning line + growing shadow decal, impact shake L, landing burn ring; pod re-ignites and exits with smoke column.
- **Entrance:** *EVA Hop* — jetpack micro-hop (0.4 s, clears 1 u, ignores unit collision — flavor mobility, not a wall-hop).
- **Signature Augments:** ①**Overvolt** (Silver): Q chains to 1 nearby enemy at 60%. ②**Habitat Module** (Gold): W dome +1 u radius, allies inside regen 3%/s. ③**Kessler Protocol** (Prismatic): R drops 2 additional smaller pods (60% damage) in sequence along a line.

---

### 👻 WISP — the Unfinished Goodbye
**Caster/Trickster · v0.4 · difficulty ●●●**
A small ghost who haunts the bridge not out of malice but because the view is nice and leaving is hard.

- **Model:** `Kenney_GraveyardKit/character-ghost.glb` (translucent shader, soft emissive rim; hover bob procedural — no walk cycle needed: locomotion is float with lean).
- **Passive — Ectoplasm:** Wisp phases through units (no unit collision, ever). Passing through an enemy chills them: 10% slow 1 s + marks them "Chilled" 3 s.
- **Q — Boo!:** 25⚡ / 5 s / 6.5 u skillshot. Spook-bolt `75 (+60% AP)` arcane; vs Chilled targets +25% and briefly **Fears Minis** 1 s. *Anim:* inflate-face lunge (scale-pop + `emote-no` head snap); bolt = wailing face sprite-sheet with ribbon tail; hit = "BOO" glyph burst.
- **W — Sheet Slip:** 35⚡ / 10 s / 3.5 u blink. Drops her sheet (decoy: stands still, taunts Minis, 1 HP-until-hit twice) and blinks invisible for 1 s (breaks on cast/attack). *Anim:* sheet prop collapses realistically (cloth-sim-lite bones); reappear = sheet whooshes back on with sparkle.
- **R — Haunting Hour:** ⏱ 80 s / 5 u circle (3 u), 0.6 s cast. Curses the ground 4 s: enemies inside are Chilled continuously, take `45 (+30% AP)`/s, and Minis inside fight for **no one** (stand confused). At expiry, all champions still inside are Feared 1.2 s away from the center. *Anim:* Wisp spins up into the air trailing spirits; zone = desaturation + floating gravestone shadows (Graveyard props as translucent ghosts), clock-tick SFX building to the midnight gong.
- **Entrance:** *Cold Spot* — 1.5 u chill nova (10% slow 1 s) + Wisp is untargetable for the 0.35 s swap morph (only Entrance that touches the swap itself — her identity).
- **Signature Augments:** ①**Poltergeist** (Silver): W decoy explodes when destroyed `70 (+40% AP)`. ②**Separation Anxiety** (Gold): Q pierces; every enemy hit extends R's next duration +0.5 s. ③**Midnight Society** (Prismatic): R also summons 3 ghost Minis (Graveyard skeletons, spectral shader) that fight for Wisp 6 s.

---

### 🦊 PIPER & CHOMP — the Snack Diplomat
**Support/Beastmaster · v0.5 · difficulty ●●●**
A ranger who negotiated peace with every animal on the bridge through the universal language of snacks. Chomp is her fox. Chomp is a good boy.

- **Model:** `Kenney_CuteCharacters/character-female-a.glb` (ranger palette) + satchel prop. **Chomp:** `Kenney_CubePets/animal-fox.glb` (8 own anim clips), a persistent pet unit (no HP bar — untargetable companion; balance lives in cooldowns).
- **Passive — Best Friend:** Chomp orbits Piper; every 6 s he **fetches**: auto-nips the nearest enemy in 4 u (`20 (+25% AD)`) and scurries back. Attack-move ping redirects the fetch.
- **Q — Fetch!:** 30⚡ / 7 s / 7 u line. Chomp dashes as a skillshot: `65 (+55% AD)` + carries back a **snack** from the first champion hit (steals 8 flat MS for 2 s — visible drumstick in mouth). *Anim:* fox `run` clip stretched with smear + dust puffs; return hop with prize; Piper cheers (`emote-yes`).
- **W — Snack Toss:** 30⚡ / 9 s / 5 u lob. Tosses a snack: allies who touch it heal `85 (+50% AP)` and Chomp's next fetch is empowered (+100%, applies 25% slow). If it lands on no one after 2 s, Chomp eats it (Piper heals 50% of it — the fox tax). *Anim:* underhand lob, snack = tiny propped food item with bounce physics; heal = heart-crunch pop.
- **R — STAMPEDE!:** ⏱ 90 s / 8 u lane cone, 0.7 s whistle. Piper whistles and **the entire Cube Pets menagerie answers**: a 3-wave stampede of random animals (drawn from all 24 `Kenney_CubePets` models, seeded) tramples the cone — each wave `80 (+45% AD)` + 20% slow, champions hit by all 3 are knocked up 0.8 s. Pure spectacle: giraffes, pandas, an elephant — the game's comedy-flagship ult. *Anim:* whistle pose (`interact-right` + note glyphs), ground rumble build-up, waves of instanced pets with per-species gait retimes, dust wall, stray feathers.
- **Entrance:** *Treat Time* — Chomp yips: nearest ally (5 u) gains 8% MS 1.5 s.
- **Signature Augments:** ①**Two Good Boys** (Gold): a second pet (`animal-dog.glb`) joins the passive rotation — fetch every 3 s alternating. ②**Sharing Is Caring** (Silver): W snack splits into 3 mini-snacks (55% each) on landing. ③**Apex Herd** (Prismatic): R's third wave is all-elephants: knock-up 1.2 s and 30% slow.

---

### 🧛 VEX — the Velvet Collector
**Bruiser/Slayer · v0.5 · difficulty ●●○**
A dandy vampire who collects "debts of vitality" with impeccable manners and zero mercy.

- **Model:** `Kenney_GraveyardKit/character-vampire.glb` (crimson-lined cape palette). Prop: cane-sword (`KayKit_FantasyWeaponsBits` rapier).
- **Passive — Red Ledger:** Vex heals `18% (+1%/level)` of ability damage dealt to champions (doubles below 35% HP — his "all-in" identity; healing numbers float in his signature crimson).
- **Q — Crimson Lash:** 28⚡ / 6 s / 4 u whip-line. Blood-whip: `75 (+65% AD)`; if it hits a champion, Vex's next basic within 3 s lunges 2 u. *Anim:* `attack-melee-right` with cape-flourish additive; whip = tapered ribbon mesh with fluid shader, hit = rose-petal burst (yes, petals — brand).
- **W — Bat Waltz:** 35⚡ / 11 s / 4.5 u dash. Dissolves into bats, untargetable 0.5 s during the dash, `60 (+45% AD)` along the path; re-forms with `50 (+8% missing HP)` self-heal. *Anim:* mesh dissolve-to-instanced-bats (shader + boids micro-swarm), reform with cape snap.
- **R — Crimson Banquet:** ⏱ 85 s / 4 u circle, 0.6 s cast. Marks all champions in the circle 3 s ("invited"); Vex's abilities against invited guests deal +25% and his Passive heal vs them is 40%. If an invited guest dies, Bat Waltz resets. *Anim:* raises a goblet (prop) — invited targets get floating crimson chalice markers + red-carpet ground glow under Vex; kill = candelabra flare-out.
- **Entrance:** *Fashionably Late* — 1 s: 15% MS and his cape trails mist (next Q costs 0⚡ if cast within 2 s).
- **Signature Augments:** ①**Debt Interest** (Silver): Q marks stack — third lash on the same champion within 6 s stuns 0.8 s. ②**Blood Waltz** (Gold): W leaves a blood trail 3 s: Vex gains 15% MS on it, enemies are slowed 15%. ③**Eternal Host** (Prismatic): R invite duration 6 s; each guest death also refunds 30% R cooldown.

---

### ⛄ SNOWBLE — the Avalanche That Learned Manners
**Vanguard · v0.9 · difficulty ●○○**
A magically animated snowman built by bored fountain-spirits; extremely polite, structurally unstoppable.

- **Model:** `Kenney_HolidayKit/snowman.glb` + `snowman-hat.glb`, assembled as a 3-segment Custom-Procedural rig (base/torso/head bones): locomotion = bounce-roll with squash; no biped clips needed — his physicality *is* the charm. Twig arms from `Kenney_NatureKit`.
- **Passive — Powder Body:** Snowble ignores slows below 30% and grows +0.5% max HP (stacking, cap 15%) per snow-ability hit on champions — he visibly *gets bigger* over a match (scale + rig accommodates).
- **Q — Snowball Volley:** 28⚡ / 6 s / 6 u, 3-shot spray. Packs and hurls 3 snowballs: `50 (+40% AD)` each, 10% slow stacking. *Anim:* torso-wind-up spin, machine-gun lobs with wobble arcs, splat decals (they persist briefly — snow accumulates visually).
- **W — Flurry Hug:** 30⚡ / 12 s / self 3 u aura, 3 s. Blizzard aura: enemies inside slowed 25% and chilled (stacks to 40%); allies inside shielded `60 (+8% Snowble max HP)` once. *Anim:* arms-wide idle hold, radial snow-spiral particles, frost-rim post effect at the edge.
- **R — AVALANCHE:** ⏱ 80 s / 8 u roll-line, 0.5 s crouch. Curls into a boulder and rolls: `140 (+10% max HP)` physical, gathering snow — +10% size and damage per champion hit (max +30%); ends in a burst that knocks back 2 u. Snowble can steer ±20°/s (drift feel). *Anim:* rig collapses into sphere (segments tuck), rotation with accumulating snow-shell mesh swap ×3 sizes, debris kick-up, cartoon "whump" finale; hat flies off and lands back on.
- **Entrance:** *Cold Front* — 2 u frost ring: enemies 15% slow 1 s, allies cleansed of slows.
- **Signature Augments:** ①**Packed Ice** (Silver): Q snowballs pierce the first Mini. ②**Warm Hugs Policy** (Gold): W also heals allies `25/s` inside. ③**Glacier** (Prismatic): R leaves an ice trail 4 s (allies +20% MS, enemies slip — 10% slow) and its finale roots 1 s.

---

### 🔧 PATCH — Chief of Unlicensed Repairs
**Specialist · v0.9 · difficulty ●●●**
A gnome engineer who declared herself responsible for bridge maintenance. Her repairs are load-bearing and heavily armed.

- **Model:** `Kenney_BlockyCharacters/character-p.glb` (overalls + goggles palette). Props: wrench (`KayKit_RPGToolsBits`), backpack rig from `Kenney_FactoryKit` bits. Turrets: assembled from `Kenney_TDKit` tower parts (`tower-round-*` + `weapon-turret`).
- **Passive — Scrap Economy:** Minis and structures dying near Patch drop **Scrap** (max 6, magnetized pickup). Her abilities consume Scrap for bonuses (Scrap gauge on her backpack fills visibly — cogs stack up).
- **Q — Rivet Gun:** 25⚡ / 5 s / 6 u skillshot. Rivet: `70 (+60% AD)`; **+1 Scrap:** rivet pins — 35% slow 1.5 s. *Anim:* `holding-right-shoot` with recoil; rivet tracer + clank-spark impact, pinned targets get a visible bolt-and-plate.
- **W — Sentry Bud:** 40⚡ / 14 s (2 charges) / place 4 u. Deploys a mini-turret (550 HP, 40 dps, 5 u range, 20 s). **+2 Scrap:** deploys the upgraded model (rocket head, +50% damage, 15% slow shots). Max 2 active. *Anim:* tosses a kit-box that **assembles itself** (TDKit parts fly together with screw-in rotations — full build animation), periscope pop + beep when acquiring.
- **R — Big Bertha:** ⏱ 90 s / place 5 u, 1 s build. Constructs a siege cannon-turret (1100 HP, 10 s): lobs mortar shells at the farthest enemy in 9 u (`110 (+50% AD)` splash 1.8 u). **+4 Scrap:** Bertha goes twin-barrel (fire rate ×1.5). Patch can channel on Bertha to repair her. *Anim:* multi-stage TDKit assembly with scaffold props, steam release, recoil rock on each mortar lob, shell arcs with whistle SFX; expires by comically falling apart into scrap (which she can collect — loop closed).
- **Entrance:** *Spot Repair* — instantly restores 80 HP to the nearest damaged ally structure/turret in 5 u, or shields herself 60 if none.
- **Signature Augments:** ①**Union Rules** (Silver): W charge +1, turrets last +8 s. ②**Overtime Pay** (Gold): Scrap cap 10; abilities can consume double Scrap for double bonus. ③**Bridge Inspector General** (Prismatic): Bertha becomes permanent until destroyed (one at a time) and gains 20% of Patch's AD.

---

## 5. Duo chemistry notes (matchup seasoning, not hard rules)

The dealing is random; these emergent pairings are the ones trailers are made of — QA should verify they *feel* as good as they read: **Rook+Rattle** (wall + skull-blink assassination lanes) · **Fathom+Wisp** (keg + fear zone artillery) · **Grukk+Snowble** (double frontline toll-booth) · **Sylva+Piper** (the garden picnic sustain fortress) · **Boltz+Patch** (the construction yard siege) · **Mortis+Vex** (inscribed banquet drain-tank).

## 6. Post-launch champion pipeline (backlog seeds)

Sourced-asset candidates (all CC0-compatible, see ASSET_CATALOG §Sourcing): a KayKit Adventurers knight/barbarian duo-natured bruiser; a Quaternius mech gunner; a Kenney Survival-kit castaway trapper; a second KayKit skeleton (Warrior) as an alternate-universe Rook rival. One new champion per post-1.0 month is the content cadence target.
