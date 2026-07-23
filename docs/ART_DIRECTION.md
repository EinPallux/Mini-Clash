# Mini Clash — Art & Audio Direction

The target: a match screenshot should read as **a toybox brought violently to life** — mo.co / Brawl Stars / Squad Busters energy (chunky, saturated, friendly) carrying **legible MOBA information** (LoL-grade clarity of threat, range and state). Style reference only; all content is original + CC0.

## 1. Visual pillars

1. **Chunky & huggable:** big silhouettes, thick limbs, oversized props (weapons ~140% of "realistic" scale). Nothing thin, nothing noisy.
2. **Sunlit saturation:** bright key light, saturated mid-tones, no grim-dark. Even the graveyard champions are *charming* spooky.
3. **Information is sacred:** team color, HP, threat telegraphs and cooldown states always win over aesthetics in any conflict.
4. **Toy physics juice:** squash & stretch, pops, wobbles and bounces on everything that moves; impacts have punch (flash + shake + hit-stop), never gore (damage = sparks, stars, petals, bones popping comically).

## 2. Camera

- Perspective camera, **FOV 30°** (tele-compressed, minimal distortion — keeps the "diorama" look), pitch **52°** down, yaw fixed 0° (no rotation — spatial memory is a competitive feature), distance tuned so ~22 u of bridge width is visible; 2 zoom steps (22 u / 26 u).
- Smart-follow: camera leads 1.5 u toward cursor, eases with critically-damped spring (no wobble). Screen shake budget: S = 0.1 u 0.15 s · M = 0.2 u 0.25 s · L = 0.35 u 0.4 s (L reserved for ultimates/core death; all shakes respect the accessibility toggle).
- Death/spectate: free pan + follow-ally cycling. End of match: authored dolly move for the podium.

## 3. Rendering & lighting

- Three.js, physically-inspired-but-stylized: `MeshToonMaterial`-family ramp shading (2.5-band ramp, soft terminator) on characters; flat-lit vertex-color environment with baked-style AO darkening at contact edges.
- **One directional key** (warm 5600K, 35° elevation, from bottom-left of screen so telegraphs on ground read clearly) + sky hemisphere fill (cool). Single 2048 shadow cascade, soft PCF; champions get a blob contact-shadow booster for grounding.
- **Rim light** in team color on all champions (fresnel, subtle 0.15 intensity; 0.4 on the *selected/hovered* target — targeting feedback baked into the light rig).
- Post stack: vignette + tone-mapped output (v0.1; bloom deferred — UnrealBloomPass NaN-poisons on some drivers, so glow is carried by additive sprites/halos until a clamped bloom lands), slight saturation lift via ACES exposure. Optional (settings): outline pass (1px color-graded, off by default — the packs read cleanly without it), reduced-VFX mode.
- Skyboxes: `skybox-day` (default Shatterbridge), `skybox-morning` & `skybox-night` (map palette variants post-1.0), `skybox-space`/`skybox-alien` reserved for future biomes. Void below the bridge: layered drifting cloud cards + depth fog gradient — falling chunks (Collapse) tumble into it.

## 4. Color script

| Meaning | Color | Usage |
|---|---|---|
| **Ally** | Cyan-blue `#3BA7FF` | Rims, healthbars, telegraph outlines, Mini tabards |
| **Enemy** | Hot coral-red `#FF4D4D` | Rims, healthbars, telegraph *fills*, Mini tabards |
| **Self** | Spring green `#5DFF9E` | Own healthbar & cooldown ring only |
| **Neutral/objective** | Amber `#FFC24B` | Golem, orbs, coins, event banners |
| **Arcane damage** | Violet `#B36BFF` | VFX family |
| **Physical damage** | Warm orange `#FFA13B` | VFX family |

Environment palette stays in desaturated warm stone/grass so the six information colors always pop. Colorblind alt-palettes swap ally/enemy hues (blue/orange, magenta/teal presets) across *every* use listed above, not just UI.

## 5. Characters & materials

- Base packs untouched where possible (their charm is the point); customization via **palette textures** (the packs use tiny gradient-atlas textures — recolors are cheap and license-clean) + prop attachments. Team identification never relies on palette alone (rim + tabard + healthbar).
- Every champion needs: distinct silhouette at 60 px tall on screen, 1 signature oversized prop, 2 idle fidgets, and a palette that survives desaturation (value contrast check in the asset pipeline).
- Minis are deliberately smaller (0.75× champion scale), uniformed (same body, team tabard, role-prop) — crowd reads as texture, champions read as actors.

## 6. VFX language (the ability grammar)

Data-driven timelines (see TECHNICAL_ARCHITECTURE §VFX). Grammar rules:

- **Telegraphs:** enemy danger = red shape that *fills* over the windup (fill % = time to impact — readable dodge timing); ally/self = blue outline only. Shapes: circle (AoE), rect (line), sector (cone), ring (donut). Always ground-projected decals, always under units.
- **Anticipation → Impact → Dissipation** in every ability: windup glow/particle inhale (0.2–0.45 s), impact frame (white flash 60–80 ms on victims + 1–2 frame hit-stop on kills + shape-language burst), then quick fade (long lingering smoke is banned — next fight needs a clean stage).
- Shape language: ⚔ physical = angular shards/smears/sparks · ✦ arcane = soft ribbons/runes/orbs · heals = petals/leaves/hearts rising · shields = hex-facet domes · buffs = upward ticks · slows/chill = dripping crystals.
- Projectiles: mesh core + ribbon trail + point light (pooled); every projectile has a distinct *launch* pop and *impact* burst; travel is never silent.
- Budgets per ability cast: ≤ 400 particles (GPU-instanced), ≤ 1 dynamic light, textures from the shared 2k VFX atlas. Ultimates may triple budget + one screen effect (vignette pulse / brief ramp shift).
- Kill confirm: victim pops into team-color soul-wisp + prop-scatter (bones/hats/wrenches per champion), 300 ms — comedic, not gory.

## 7. Animation principles

- 60 fps blended skeletal animation but **posed like stop-motion**: strong keys, fast transitions (0.08–0.12 s blends), held extremes. Squash/stretch via procedural scale layer (cap 1.3×/0.8×).
- Locomotion: run cycles retimed per champion MS; procedural lean into turns (8°), foot-plant slide correction not required at this stylization level.
- Casts: base clip (per CHAMPIONS.md) + **aim-yaw additive** (upper body tracks cast direction ±60°) + FX timeline events (`fx`, `sfx`, `shake`, `hitstop`, `projectile_spawn` keyed to normalized clip time). Cancellable recovery: last 30% of any cast is move-cancellable (game-feel standard).
- Every champion: `spawn` (fountain teleport-in = beam + pose), `entrance` (swap-in flourish ≤ 0.5 s), `dance` (emote), death (per-rig clip + prop scatter), plus the state machine in CHAMPIONS.md §2.
- The **UI animates too**: cooldown radial wipes with end-flash, HP bar damage-chunk lag (white ghost segment), gold counter odometer, draft cards deal/flip physically. Menus use spring transitions (250–350 ms), never linear fades.

## 8. UI art — the hero-shooter menu language (BINDING for every screen)

Reference DNA: Overwatch menus + Marvel Rivals hero gallery. Flat, angular, esport. Explicitly banned: large border radii (>3 px), soft "bubble" drop shadows, cream/pastel rounded cards, emoji-as-iconography.

- **Geometry:** sharp corners (0–2 px). Diagonals everywhere: nav tabs and ribbons are skewX(−10°) parallelograms, hero headings italic-skewed, bars get clipped angled ends. Cards are straight rectangles that sit on skewed backdrop shapes — never rounded blobs.
- **Type:** display = **Oswald** 500/600, UPPERCASE, italic-skewed for hero headings ("PLAY", mode titles) and numbers (damage floaters, cooldowns). UI text = **Barlow Semi Condensed** 500–700; buttons and labels uppercase with 0.04–0.07 em tracking. (Both OFL.)
- **Surfaces:** dark chrome nav bar (#12161f) with light text; content sits on either the light diamond-pattern backdrop (hero-gallery style) or the dark streaked backdrop (play-menu style). Panels are flat fills with 1 px hairline borders + a 3 px gold top edge; shadows are short and hard, used for depth only.
- **Cards:** image/color area on top, flat plate below — dark plate + white condensed name for hero cards (thin champion-color underline at the base), light plate + dark condensed title for mode tiles. Corner state = skewed ribbon tag ("AVAILABLE NOW", "NEW!", version locks). Hover = 2 px white outline + 2–3 px lift; selected = gold outline. No glow blobs.
- **Accent:** gold #FFC72E owns selection/active/ready states (active tab underline wedge, selected card, ready ultimate). Team/threat colors stay per §4. Each mode tile may own one flat saturated hero color.
- **Chrome furniture:** bottom-right keycap hints ("ESC — MENU"), bottom-left status/hint line, top-right currency chips + profile tile. These live on every full-screen view.
- **Iconography:** game-icons.net glyphs recolored via CSS masks (white on dark, ink on light, gold for ultimates). Never emoji.
- HUD philosophy unchanged: bottom-center personal (abilities/energy/swap), top-center match state, corners minimal. Full layouts in UI_UX.md.

## 9. Audio direction

- **Music:** bouncy orchestral-pop hybrid (tuba+pizzicato+glockenspiel over driving drums — "Saturday-morning siege"). Layers: Hub (calm loop), match-loop with intensity stems (base / skirmish / event / Overtime) crossfaded by game state, victory/defeat stingers. Sourced CC0/royalty-free per ASSET_CATALOG §Sourcing until an original score pass post-1.0.
- **SFX:** cartoon-forward foley (boings, thwacks, pops) with *weighty* low-end on impacts — cute but never weak. Every interactive UI element has a click/hover pair; every ability has launch/travel/impact; every champion has 4–6 effort barks (nonverbal — huhs, laughs, gasps — sourced/edited CC0; no voice acting dependency at 1.0).
- **Announcer:** v1 uses musical stingers + big banner text (FIRST BLOOD horn-hit, etc.) — no VO dependency; VO pass post-1.0.
- Mix rules: enemy ability audio slightly louder than ally (information > symmetry); sidechain duck music −4 dB during ultimates and event announcements; positional audio pan ±30% (subtle — camera is fixed); separate sliders (master/music/SFX/UI) + "audio ping on offscreen danger" accessibility cue.

## 10. The juice checklist (applies to every shipped feature)

A feature is visually done when: idle state has motion (nothing is a statue) · every interaction has hover/press/success/fail feedback · every damage source has telegraph/impact/dissipate · numbers animate (no teleporting values) · transitions are springs, not cuts · it screenshots well at 1080p (the "store page test").
