# Changelog

All notable changes to Mini Clash are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the release plan in [ROADMAP.md](ROADMAP.md) (pre-1.0: `0.MINOR.PATCH`, one MINOR per roadmap phase).

Entry categories: `Added` · `Changed` · `Fixed` · `Balance` · `Content` · `Assets` · `Docs`

## [Unreleased] — v0.1.0 "Training Grounds" (in progress)

### Changed
- **UI direction locked (binding for all future screens):** hero-shooter menu language — sharp corners, skewX(−10°) parallelogram tabs/ribbons, italic-skewed Oswald display type + Barlow Semi Condensed UI text, flat panels with hairline borders and gold top edges, dark chrome nav bar, light diamond-pattern and dark streaked backdrops, gold selection accent, keycap hints, CSS-mask iconography (no emoji). Hub rebuilt as nav-bar + hero cards + mode tiles; HUD, settings, boot/name, Esc menu and death veil restyled to match. Spec lives in ART_DIRECTION §8.

### Added
- **Monorepo & tooling:** pnpm workspaces (data/sim/protocol/client/tools), TypeScript strict, Biome, Vitest, package-boundary checker, GitHub Actions CI (check · test · build + headless visual smoke with screenshot artifacts).
- **`@mini-clash/data`:** typed content definitions with zod validation — Rook & Fathom kits, dummy units, Training Grounds map, FX timelines, procedural SFX recipes, UI strings.
- **`@mini-clash/sim`:** deterministic 30 Hz simulation — PCG32 seeded RNG, navgrid A* with string-pulling and dynamic wall stamping, declarative ability-action interpreter, auto-attacks with homing missiles, champion passives, powder kegs, volleys, leaps/knock-ups, target dummies with DPS windows, trainer commands, state hashing for replay tests.
- **`@mini-clash/protocol`:** intent/snapshot/event contract shared by the worker link (and the v0.3 server later).
- **Asset pipeline:** manifest-driven gltf-transform optimization of the CC0 packs (23 shipped assets, 1.4 MiB total incl. skybox), per-asset metadata (bounds, clips, skeletons), budget enforcement.
- **Client:** boot → guest name → hub flow, settings (video/audio/controls/accessibility with live remapping), Three.js toon-ramp renderer with follow camera, shake and hit-stop, worker-hosted offline sim, snapshot interpolation, animated champion actors with prop sockets, instanced particle system, data-driven FX runner, WebAudio synth engine, in-world health bars/damage numbers/aim telegraphs, Training Grounds HUD (ability cooldown wipes, trainer panel, dummy DPS readouts, champion switcher, death/respawn flow, Esc menu).

### Fixed (during headless visual verification)
- zustand object-selector infinite re-render on the HUD; instanced floor vanishing to frustum culling; clicks using a frame-stale cursor; UnrealBloom NaN blackout (bloom removed, glow via additive sprites); black characters from missing normals on unlit exports; software-GL context loss (SwiftShader now clamps to the low quality profile); arena wall scale; shadow acne.

## [0.0.2] — 2026-07-23

### Docs
- Complete planning suite authored: README, ROADMAP (v0.1 → v1.0 phase plan with acceptance criteria), TECHNICAL_ARCHITECTURE, GAME_DESIGN (Bridge Brawl ARAM ruleset, Shatterbridge map spec, combat math, item shop, Tag Team / Power Surge / Living Bridge systems), CHAMPIONS (12-champion launch roster with full kits, stats and animation specs), AUGMENTS (system + 48-augment generic catalog), UI_UX (all screens & HUD), ART_DIRECTION (visual/audio style guide), ASSET_CATALOG (inventory, licenses, sourcing plan), CLAUDE/AGENTS working agreements.
- Core decisions locked: 4v4 team size · Tag-Team duos + Power Surge drafting + Living Bridge events as signature systems · TypeScript + Three.js + authoritative Node stack · earn-only F2P economy for v1.

## [0.0.1] — 2026-07-23

### Assets
- Imported the base CC0 3D asset library (23 packs): Kenney (Mini Arena, Minidungeon, Mini Forest, Nature, Castle, Graveyard, Pirate, Space, Factory, Tower Defense, Survival, Holiday, Watercraft, Platform, Cute Characters, Blocky Characters, Cube Pets, Skyboxes) and KayKit (Dungeon, Medieval Hexagon, Skeletons + animation library, Spooktober, Fantasy Weapon Bits, RPG Tool Bits).
