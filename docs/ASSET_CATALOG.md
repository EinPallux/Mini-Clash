# Mini Clash — Asset Catalog & Sourcing Plan

Authoritative inventory of `assets/`, what each pack is *for*, rig/animation notes, licensing, the gap list, and the sourcing rules for anything new. **Rule zero: nothing ships unless it is listed here with a verified license.**

## 1. Licensing status

Everything currently in `assets/` is **CC0 1.0** (public domain):
- **Kenney packs** — CC0, kenney.nl (18 packs).
- **KayKit packs** — CC0 per included `License.txt` (Kay Lousberg, kaylousberg.com) (5 packs).

Attribution is not required but we do it anyway: maintain `CREDITS.md` (create alongside the first game build) listing every pack + author + source URL. New assets must be CC0, CC-BY (with attribution recorded), or an explicitly commercial-safe license (OFL for fonts). **Never**: CC-BY-NC, CC-BY-ND, unlicensed rips, AI-generated assets of uncertain provenance, or anything imitating Riot/Supercell IP.

## 2. Inventory → game mapping

### Characters & creatures (rigged)
| Pack | Files | Rig | Game use |
|---|---|---|---|
| `Kenney_CuteCharacters` | 12 characters + accessibility props | Skinned, 32 clips | Champions: Fathom, Sylva, Piper (+ hub NPCs from spares) |
| `Kenney_BlockyCharacters` | 18 characters | Node-rig, 27 clips | **All Minis** (team-palette uniforms) + Patch; hub crowd |
| `Kenney_MiniArena` `character-soldier` | 1 | Skinned, 25 clips | Rook |
| `Kenney_Minidungeon` `character-human/orc` | 2 | Skinned, 32 clips | Grukk (orc); human = hub shopkeeper |
| `Kenney_GraveyardKit` characters (ghost, vampire, zombie, skeleton, keeper) | 5 | Node-rig, 32 clips | Wisp, Vex; zombie/skeleton/keeper = future champions & Haunting-Hour summons |
| `KayKit_Skeletons_1.1` (Mage, Rogue, Warrior, Minion) + `Rig_Medium` animation library | 4 + 26 clips | Skinned, retarget library | Mortis, Rattle; Warrior/Minion = future champion + summons |
| `Kenney_SpaceKit` `astronautA/B` | 2 | Static (unrigged — **not shipped**) | Superseded: Boltz is a Kenney-Skinned body in an astronaut dress (see §4) |
| `Kenney_CubePets` | 24 animals | Own rigs, 8 clips each | Chomp + Piper's STAMPEDE + hub companion cosmetics (post-1.0) |

### Environment & structures
| Pack | Game use |
|---|---|
| `Kenney_CastleKit` (76) | Shatterbridge deck, walls, Watchtower bodies, Core housing, fountains |
| `Kenney_MiniArena` (22) | Bridge floor/border set, banners, statues, columns |
| `Kenney_NatureKit` (329) | Brush, trees, Sylva VFX meshes, Flank Isles greenery |
| `Kenney_MiniForest` / `Kenney_Minidungeon` | Prop dressing (rocks, crates, coins — Coin Rain uses `coin.glb`) |
| `Kenney_TDKit` (160) | **Watchtower weapons + Patch's turrets/Bertha** (tower parts, `weapon-turret`, ammo props), UFO enemies reserved for a future event |
| `Kenney_PirateKit` (72) | Fathom kit (cannon, barrel, cannon-ball, bottle), **`ship-ghost` for Broadside**, dock props for hub harbor |
| `Kenney_WatercraftKit` (46) | Hub harbor dressing; future naval event |
| `Kenney_FactoryKit` (143) | Core machinery greebles, Patch's backpack/scrap, future factory biome |
| `Kenney_GraveyardKit` (86 props) | Mortis W grave marker, Wisp R props, spooky palette variant of the bridge (post-1.0) |
| `KayKit_Dungeon` (192 glb) | Underdeck details, Mortis W props (shelves/bones), dungeon biome (post-1.0) |
| `KayKit_Medieval_Hexagon` (221) | **Hub island terrain** (hex build style for the meta scene) |
| `KayKit_Spooktober` (46) | Halloween seasonal event dressing (post-1.0), candles/pumpkins for Wisp palette |
| `Kenney_HolidayKit` (99) | Snowble (`snowman`, `snowman-hat`), winter seasonal dressing |
| `Kenney_SurvivalKit` (80) | Health-orb pad props, campfire hub corner, future champion kit |
| `Kenney_SpaceKit` (153) | Boltz kit (droppod/rocket, beacon), space biome (post-1.0) |
| `Kenney_PlatformKit` (153 OBJ) | Blockout/greybox library only (OBJ; not shipped) |
| `Kenney_Skyboxes` (5) | `skybox-day` v1; morning/night variants; space/alien reserved |
| `KayKit_FantasyWeaponsBits` (31) / `KayKit_RPGToolsBits` (49) | Champion weapon/prop library (staffs, daggers, rapier, wrench, hammers) |

## 3. Known gaps → sourcing plan

| Need | Plan | License target |
|---|---|---|
| ~~**Clash Golem** (event boss)~~ | **Shipped in v0.6 as a kitbash, not a sourced mesh.** Quaternius "Ultimate Monsters" was the plan; it needs a network fetch this repo's build environment cannot make, and a golem was not worth blocking the phase on. Built instead from vendored CC0 Kenney stone — `arena/block` legs + torso, `castle/rocks-large` fists, `castle/rocks-small` shoulders and head, `castle/wall-corner-half` chest plate — on the hand-keyed in-engine rig §4 already specifies for it, with an amber objective core that re-tints to the captor's colour. Revisit only if the kitbash stops reading at match camera distance. | CC0 |
| VFX sprite atlas (smoke, sparks, rings, ribbons) | Kenney *Particle Pack* (CC0) + authored procedural shaders | CC0 |
| UI icons (abilities, stats, items) | Kenney *Game Icons* + game-icons.net (CC-BY 3.0, attribution in CREDITS) | CC0 / CC-BY |
| Fonts | Google Fonts: Lilita One, Nunito | OFL |
| SFX (impacts, UI, whooshes, barks) | Kenney *Audio* packs (CC0), Sonniss GDC bundles (royalty-free), freesound CC0-filtered | CC0 / RF |
| Music (hub, match stems, stingers) | FreePD / Kevin MacLeod (CC-BY) / OpenGameArt CC0 orchestral-pop; original score post-1.0 | CC0 / CC-BY |
| Additional champion bases (post-1.0 cadence) | KayKit Adventurers & Enemies free packs (CC0), Quaternius animated packs (CC0) | CC0 |
| Snowball/frost props (Snowble, Snowglobe relic) | Holiday Kit + authored meshes | CC0 / original |
| Marketing/store art | Rendered in-engine (podium scene) — no external art dependency | original |

Sourcing checklist (every new asset): license verified at source → URL + author + license recorded here and in `CREDITS.md` → file dropped under `assets/_sourced/<pack>/` with its license file → pipeline manifest entry.

## 4. Rig & animation notes (implementation-critical)

- **Kenney rigs share clip vocabulary** (`idle, walk, sprint, die, attack-melee-right/left, holding-*-shoot, interact-*, pick-up, emote-*`…): one animation-graph template covers all Kenney-based champions and Minis; per-champion config only remaps/retimes.
- **Skinned vs node rigs:** Cute/Minidungeon/MiniArena = skinned (2 skins per file — body + accessory); Blocky/Graveyard = rigid node hierarchies (animate node TRS — cheap, perfect for Mini crowds). The animation system must support both transparently (see TECHNICAL_ARCHITECTURE §Animation).
- **KayKit Rig_Medium:** characters ship without embedded clips; the `Animations/gltf/Rig_Medium/*.glb` library retargets by bone-name match (same rig). Combat clips beyond the free library (Throw, Use_Item, Hit, Death, Spawn cover our needs) — verify coverage per kit during v0.2; fall back to procedural cast poses if a clip is missing.
- **astronautA/B are unrigged** (0 skins, 0 clips) — and stay that way. The planned Blender headless weight-transfer was dropped in v0.4: it adds a binary art-tool dependency to a pipeline that is otherwise pure gltf-transform, for one champion. **Boltz instead wears the astronaut rather than being it**: `chars/character-male-c` (Kenney-Skinned, full 17-clip vocabulary) + visor palette + a procedural bubble-helmet dome (`ChampionVisual.helmet`) + the SpaceKit raygun at `handRight`. He reads as an astronaut, animates like every other Kenney champion, and costs the pipeline nothing. The droppod (`space/rocket-pod` = `rocket_baseA`) is a static prop, which is all it needs to be.
- **Snowble & Golem & pets:** procedural/hand-keyed rigs authored in-engine (three-bone stacks, boids for bats, etc.) — no external animation dependency.

## 5. Asset pipeline (tooling contract)

`pnpm assets:build` (tool in `packages/tools`) transforms `assets/` → `packages/client/public/game-assets/`:

1. **Select** only manifest-listed files (`assets.manifest.json5` — the shippable subset; raw packs never ship wholesale).
2. **Optimize** via gltf-transform: dedupe, prune, weld, quantize, meshopt compression; strip unused clips per manifest; merge palette textures to atlases where safe.
3. **Recolor** — generate team/palette variants by gradient-atlas swap (ally/enemy Mini uniforms, champion palettes).
4. **Validate** — poly/texture budgets (champion ≤ 8k tris incl. props, Mini ≤ 3k, structure ≤ 12k), naming, license presence, animation-clip completeness per champion config. Build fails on violation (quality bar is mechanical, not aspirational).
5. **Emit manifest** with hashed URLs, byte sizes, preload groups (boot / hub / match-core / per-champion) — the loader streams champion bundles for the 8 champions actually in the match.

Budgets: initial match download (first ever match, cold cache) ≤ 25 MB; per-champion bundle ≤ 400 KB; hub scene ≤ 8 MB. These packs are tiny (whole library ~150 MB raw, shippable subset far less) — the budget exists to keep it that way.
