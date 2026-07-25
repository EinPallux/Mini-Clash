# Mini Clash — Game Design Document

**Mode (v1):** Bridge Brawl — 4v4 ARAM on the Shatterbridge.
**Match length target:** 12–16 min, hard-capped by overtime.
**Session promise:** browser tab → in a match in under 60 seconds.

All numbers in this document are launch-tuning values: they are the authoritative starting point, expected to be adjusted through the balance harness (see TECHNICAL_ARCHITECTURE §Testing). Distances are in units (u); 1 u ≈ 1 m; the camera and all speeds are tuned around champions moving ~3.6 u/s.

---

## 1. Vision & pillars

**Vision:** the teamfight heart of a MOBA — skillshots, cooldown trades, tower sieges, clutch ultimates — with none of the homework, delivered at toy-box scale in the browser, where every match is structurally different from the last.

**Pillars** (every feature must serve at least one; conflicts resolve top-down):

1. **A real MOBA.** Server-authoritative, cooldown- and resource-honest combat with minions, towers, XP, gold and items. It must *feel* like LoL, not like an .io game.
2. **No two matches alike.** Random duos × Augment drafts × seeded map events = structural variance. Replayability comes from systems, not grind.
3. **Readable chaos.** 8 champions + minions must stay legible: chunky silhouettes, strict color language, telegraphs for everything that hurts.
4. **Respect the clock.** 12–16 minutes, guaranteed ending, no stalling, no 40-minute hostage games. Fast queue → fast fun.
5. **Every interaction is juiced.** Nothing happens silently or without animation. Polish is a feature, not a phase.

**Audience:** MOBA players who love ARAM; lapsed MOBA players without time for the full ritual; friend groups (4-stack + bots is a first-class mode, not a fallback).

## 2. Glossary

| Term | Meaning |
|---|---|
| **Bridge Brawl** | The game mode: 4v4 ARAM |
| **Shatterbridge** | The map — a fractured sky-bridge over the void |
| **Duo / Tag Team** | The two champions dealt to each player; hot-swappable |
| **Tag Swap** | Swapping your active champion (Space) |
| **Entrance** | Per-champion micro-effect triggered on swap-in |
| **Augment / Power Surge** | Ability-mutating pick drafted at levels 3/6/9 |
| **Living Bridge** | The timed map-event system |
| **Minis** | Minions (the brand name for them) |
| **Watchtower** | Defensive tower (2 per side) |
| **Clash Core** | The nexus; destroy the enemy's to win |
| **Gold** | In-match currency (items) |
| **Clash Coins** | Meta currency (Hub: champions, cosmetics) |

## 3. Core loops

**Match loop (seconds→minutes):** move & poke → hit Q/W → swap for the right tool → collect gold/XP → shop while dead → draft Augments → fight over Living Bridge events → break towers → destroy the Core.

**Meta loop (days→weeks):** play matches → earn Clash Coins & mastery → unlock champions (bigger duo pool = more variety) → complete quests → climb match history/leaderboards → try new duo/augment combinations.

The meta loop feeds the match loop: unlocking champions directly increases the randomness space of your deals — progression *increases* variety instead of power (no pay/grind-to-win; all combat power is match-local).

## 4. Modes at 1.0

| Mode | Players | Notes |
|---|---|---|
| **Bridge Brawl (Matchmade)** | 8 humans (parties of 1–4) | MMR-lite matchmaking, backfill with bots on dodge |
| **Bridge Brawl (Custom Lobby)** | 1–8 humans + bots | Lobby code invites; host picks bot difficulty; any seat can be a bot |
| **Bridge Brawl (vs Bots)** | 1–4 humans vs bot team | Instant start, offline-capable (sim runs locally) |
| **Training Grounds** | 1 | Sandbox: target dummies, cooldown/gold cheats, any champion |

The **vs Bots** and **Training** modes run the full simulation in a Web Worker with zero server dependency — the game is fully playable offline from v0.2 onward.

## 5. Match timeline

| Time | Event |
|---|---|
| 0:00 | Spawn on fountain plates; shop open; barriers up; warm-up emotes |
| 0:20 | Barriers drop; movement free |
| 0:35 | First Mini waves spawn (then every 25 s) |
| 1:00 | Fountain shop closes (reopens only while dead) |
| ~1:30 | Typical level 3 → **Augment draft 1** |
| 2:00 | First **Living Bridge** event (Flank Isles) |
| ~5:00 | Typical level 6 → **Augment draft 2** |
| 6:00 | **Clash Golem** #1 |
| 8:00 | Surrender voting unlocked (3 of 4 required) |
| ~9:30 | Typical level 9 → **Augment draft 3** |
| 10:30 | **Clash Golem** #2 (Elder: larger, stronger siege) |
| 15:00 | **Overtime — Bridge Collapse** (see §8.4) |
| 17:30 | **Sudden Death** — both Cores decay 1.5%/s; higher-HP core survives |

Victory: enemy Clash Core destroyed → 3 s slow-motion core explosion → podium sequence (see UI_UX §End of Match).

## 6. The Shatterbridge (map spec)

A shattered stone skybridge floating in a bright sky (Skybox `skybox-day`), built from Kenney Castle/Mini Arena kits with Nature Kit vegetation and KayKit dungeon props; void below. Symmetric across the center line.

```
                       N  (event space: Flank Isle pads float here)
   ┌────────────────────────────────────────────────────────────────────┐
   │ F██ C1 ─ T1a ─────── brush ── ▲ ── brush ─────── T2a ─ C2 ██F      │
   │ F██ │   (tower)  o        (center     o        (tower)  │  ██F     │
   │ F██ gate ──────── brush ── altar) ── brush ────────── gate ██F     │
   └────────────────────────────────────────────────────────────────────┘
                       S  (event space: Flank Isle pads float here)
   F=fountain plate · C=Clash Core · T=Watchtower · o=health orb pad · ▲=golem spawn
```

- **Dimensions:** playfield 120 u end-to-end, main deck 18 u wide. Fountain plates are raised 1.5 u behind each Core.
- **Structures per team** (must be destroyed in order — Outer Watchtower → Inner Watchtower → Core):
  - **Outer Watchtower** at 38 u from own Core; **Inner Watchtower** at 20 u; **Clash Core** at 6 u, flanked by its gate (Mini spawn point).
- **Brush:** 4 symmetric brush patches (2 per half, offset N/S) — classic ambush pockets. Standing in brush hides you unless an enemy is inside or you attack.
- **Health orb pads** at 30 u and 90 u marks (see §13.4).
- **Center altar:** decorative ring that becomes the Clash Golem spawn and hosts Coin Rain events.
- **Terrain:** no jungle, no side lanes by default — Flank Isles events temporarily add them (§8.3). Deck edges have low broken walls (block movement, not vision or projectiles' flight over void).
- **Vision:** standard MOBA fog-of-war — you see what your team and your Minis see. The single lane means near-constant vision mid; brush and Flank Isles create the ambush space.

## 7. Signature system 1 — Tag Team

Every player controls a **duo**: two champions, one active on the field, one benched. This is Mini Clash's core identity twist.

### 7.1 Dealing (champion select)
- Each player is dealt **2 random champions** from (their unlocked pool ∪ current free rotation). No duplicates within a team; duplicates across teams allowed.
- **2 rerolls** per player. Rerolled champions go to the **team bench**; any teammate may swap one of their dealt champions with a bench champion (LoL ARAM bench rules, adapted per-slot).
- 60 s timer; the reveal presents the duo as a pair (shared card) to sell the fantasy.

### 7.2 Tag Swap rules
- **Input:** Space. **Cooldown:** 9 s (starts on swap). Blocked while hard-CC'd or channeling.
- **Transition:** 0.35 s morph (puff VFX + scale-pop). You keep moving; you are targetable throughout (swap is not a dodge — the *threat* of what you swap into is the mind-game).
- **Shared between the duo:** HP pool (computed from the average of both champions' HP curves), position, items, level, gold, shield/buff/debuff timers.
- **Per-champion:** ability kit & cooldowns (benched cooldowns tick normally), Energy pool (100 max each — swapping is also a resource play), Augments tagged to that champion.
- **Entrance:** each champion has a signature micro-effect on swap-in (~0.5 s, small numbers — e.g. Rook raises a 1 s mini-shield, Rattle's next attack is empowered). Defined per champion in CHAMPIONS.md. Swap-in also grants +20% move speed decaying over 1 s (keeps swaps feeling active, helps disengage-into-tank plays).
- Death kills the duo (one respawn timer). Kill credit displays both portraits.

### 7.3 Why it's deep (design intent)
Energy cycling (burn one champion's bar, swap to a fresh one), cooldown juggling (bench CDs still tick), matchup pivoting (tank into dive, poke into siege), Entrance weaving, and bait swaps. Bots must use swaps competently from the phase the feature ships (Elite bots: matchup- and energy-aware swapping).

## 8. Signature system 2 — Power Surge (Augments)

Summary here; full rules and the generic catalog live in [AUGMENTS.md](AUGMENTS.md).

- At **levels 3, 6, 9** each player drafts 1 Augment from 3 offers (HotS-style: the game does not pause; 45 s to pick via overlay or number keys, auto-pick after).
- Rarities **Silver / Gold / Prismatic** with per-draft odds (60/33/7 at draft 1 → 45/40/15 at draft 3). Team behind on kills+towers gets +10% next-tier odds (comeback pity).
- Every offer set contains at least one **champion-specific** Augment for one of your duo (each champion has 3 signature Augments — see CHAMPIONS.md).
- **1 reroll token** per match.
- Hard rule: **Augments must be visible.** Every Augment changes what abilities *look like* (extra projectiles, trails, size, element recolor), not just hidden numbers.

## 9. Signature system 3 — The Living Bridge

The map runs a seeded event schedule (all clients/server share the seed; bots plan around it). Events are announced 8 s ahead (horn + banner + minimap glow).

| Event | Timing | Effect |
|---|---|---|
| **Flank Isles** | 2:00 (fixed), later via pool | Two floating platforms (10×6 u) rise N and S of mid for 60 s, connected by light-bridges — opening flank/ambush routes. Each carries a health orb. Rise/fall is fully animated (rumble, dust, chunks). |
| **Coin Rain** | pool (4:00 / 12:30 windows) | A marked 8 u zone showers ~30 coins over 20 s (2–6 g each, pickup on touch). Risk/reward scramble magnet. |
| **Storm Front** | pool (4:00 / 8:30 windows) | A crackling storm wall (4 u deep, full width) sweeps the bridge end-to-end over 25 s; standing in it deals 2.5%/s max-HP arcane and slows 15%. Forces the whole map to rotate. |
| **Clash Golem** | 6:00 and 10:30 | Neutral golem (600→ scaled HP, heavy slam attacks) wakes at the center altar. The team that **lands the killing blow** converts it: it walks their lane as a siege engine (taunts towers, 40% tower-damage resist, buffs nearby Minis). #2 is the Elder Golem: +60% stats, its siege aura also shields allied champions. |
| **Bridge Collapse (Overtime)** | 15:00 | Every 60 s the outer 3 u of BOTH long edges crumble into the void (animated chunk-fall), narrowing the deck 18→12→8 u. Brush and cover fall away first; escape space vanishes; fights become unavoidable. Simultaneously **Corebreaker**: Cores take +200% damage and every wave carries 5 Rams. |
| **Sudden Death** | 17:30 | Both Cores decay 1.5%/s. Higher-HP Core wins; exact tie → team with more structure damage dealt. |

Design intent: the schedule gives ARAM the *objective heartbeat* of a full MOBA (dragon/baron tempo) without a jungle, and the seeded pools mean match rhythm varies run-to-run.

## 10. Combat system

### 10.1 Stats
| Stat | Notes |
|---|---|
| **HP / HP regen** | Regen is small (tanks ~0.6%/s); sustain comes from orbs, abilities, items |
| **Energy** | 100 max, all champions; regen 4/s; basic abilities cost 20–45; ultimates cost 0 (long CD instead) |
| **Attack (AD)** | Scales basic attacks + physical ability ratios |
| **Power (AP)** | Scales ability ratios (arcane) |
| **Attack Speed** | attacks/s; base 0.7–1.0 by champion |
| **Armor / Ward** | Mitigate physical / arcane: `taken = raw × 100 / (100 + resist)` |
| **Move Speed** | Base 3.4–3.8 u/s |
| **Haste** | Ability cooldown reduction, additive %, cap 40% |
| **Range** | Melee 1.8 u · Ranged 5.5–7.5 u |

No crit, no dodge/miss — damage variance comes from skill expression (skillshots, positioning), not RNG. RNG lives *upstream* (deals, augment offers, event pools), never inside a fight's math.

### 10.2 Abilities
Per champion: **Passive**, **Q**, **W** (basic; Energy + CD), **R** ultimate (unlocks at level 4; CD only). No manual skill-points — abilities scale automatically with level; the *draft* choices are Augments. Ability categories: skillshot projectile, cone/line sweep, area (telegraphed circle), dash/blink, zone/summon, self/aura buff. Launch kits avoid ally-click targeting entirely (keeps controls to move + 4 buttons; ally support happens via areas and cones).

### 10.3 Crowd control
Stun, Root, Slow, Knock-up, Fear, Taunt. Hard CC (everything except Slow/Root) obeys diminishing returns: a target hard-CC'd within the last 5 s takes 50% duration from subsequent hard CC. Knock-ups are cleanse-immune. Purge Bell relic and select augments grant cleanse/tenacity.

### 10.4 Projectiles, telegraphs, honesty rules
- Every avoidable effect has a telegraph: enemy = red fill-up shape, ally = blue outline (see ART_DIRECTION §VFX language).
- Projectiles are simulated entities (server-authoritative, dodgeable). No hitscan except basic attacks of ranged champions (which are homing missiles, LoL-style: dodgeable only via untargetability/blocks).
- Cast times 0.2–0.45 s with visible wind-ups; animation-locked but move-cancellable abilities are flagged per-ability.
- Hitboxes are generous-to-the-dodger: circle-vs-circle with the defender's radius counted slightly small (feel rule: "I clearly dodged that" must never lose).

### 10.5 Basic attacks
Auto-acquire on attack-move (A) targeting nearest by priority (champions in explicit click > lowest-HP Mini in range). Ranged autos are projectiles (homing); melee autos are 0.25 s swing with 1.8 u reach arc. Attack-wind-up scales with attack speed; orb-walking (move between autos) is fully supported and intended skill expression.

## 11. XP & levels (in-match)

- Levels 1→10. Cumulative XP: 0 / 80 / 200 / 360 / 560 / 800 / 1090 / 1430 / 1820 / 2260.
- Sources: ambient 2 XP/s to every living player (1/s while dead — comeback rule); Mini kill 14 XP shared in 10 u (full to each nearby ally); champion takedown 60 × victim-level, split evenly among killer + assisters; orbs 20 XP; golem 120 XP team-wide; tower 90 XP team-wide.
- Expected pace: L3 ≈ 1:30, L6 ≈ 5:00, L9 ≈ 9:30, L10 ≈ 13:00 (drafts align at 3/6/9).
- Per-level: champion stat growth per CHAMPIONS.md tables; R unlocks at 4; small heal on level-up (4% max HP, with level-up burst VFX).

## 12. Gold & items

### 12.1 Gold income
Everyone starts with **500 g** (exactly one Tier-1 item at 0:00). Ambient 2.5 g/s (1.25 while dead). Mini kills (shared evenly among allies within 10 u): Bruiser 18 g, Zapper 14 g, Ram 45 g. Champion kill 300 g (+streak bounty 50×streak, cap +300; assist pool 150 g split). Towers 150 g each, global. Golem 90 g team-wide. Coin Rain pickups 2–6 g each. No last-hitting requirement (proximity share) — lane presence, not CS drills.

### 12.2 Shop rules
Buy at fountain during 0:00–1:00, or **any time while dead** (the death screen *is* the shop — turns downtime into decisions). 4 item slots + 1 Relic slot. Tier 2/3 items build from one lower-tier component: owning it discounts the price by its full cost and consumes it. Sell for 70%. No consumables.

The fountain plate itself heals **9% max HP + 15 Energy per second** while you stand on it — resets are fast, base-camping is still losing tempo.

### 12.3 Items — Tier 1 (500 g, single stat)
| Item | Stats |
|---|---|
| Sharpened Fang | +12 AD |
| Spark Crystal | +18 AP |
| Iron Plate | +150 HP |
| Bulwark Scrap | +15 Armor |
| Hex Charm | +15 Ward |
| Whetstone | +15% Attack Speed |

### 12.4 Items — Tier 2 (1150 g, dual stat + minor passive; builds from one T1)
| Item | Stats | Passive |
|---|---|---|
| Windrunner Charm | +0.35 MS, +8% AS | +12% MS after 4 s without dealing/taking damage |
| Executioner's Edge | +25 AD | +12% damage vs targets below 35% HP |
| Stormweaver Focus | +35 AP, +10% Haste | Ability hits restore 4 Energy |
| Juggernaut Mail | +280 HP, +20 Armor | −20% damage from Minis and towers |
| Nullwave Cloak | +250 HP, +20 Ward | Recharging 120 shield after 8 s without taking damage |
| Vampire Seal | +20 AD | 12% physical lifesteal |

### 12.5 Items — Tier 3 (2300 g, build-defining; builds from one T2)
| Item | Stats | Passive |
|---|---|---|
| Dragonfang Blade | +45 AD, +20% AS | Every 3rd attack deals +8% target max-HP physical (75 cap vs structures) |
| Starcore Staff | +75 AP, +15% Haste | Ability damage burns 1.5% max-HP arcane over 2 s |
| Titan's Bastion | +450 HP, +30 Armor, +30 Ward | When hard-CC'd: +20% damage reduction for 2 s |
| Phantom Anchor | +35 AD, +0.3 MS | Attacks and dashes slow the target 20% for 1 s |
| Lifebloom Idol | +60 AP, +20% healing/shielding power | Your heals/shields grant the target +10% MS for 1.5 s |
| Overclock Gauntlet | +20 AD, +25% AS, +10% Haste | **Tag synergy:** Swap CD −2 s; Entrance effects +50% potency |

### 12.6 Relics (800 g, active items, 1 slot)
| Relic | Active (CD) |
|---|---|
| Blink Prism | Blink 4.5 u (75 s) — the "Flash" slot, but it costs an item slot: mobility is a build choice |
| Snowglobe | Throw a global-speed snowball skillshot; re-cast to dash to the struck enemy (45 s) — the ARAM snowball, earned |
| Horn of Rally | Allies in 6 u gain 140 shield + 25% MS toward enemies for 3 s (60 s) |
| Pocket Turret | Deploy a mini turret (20 s lifetime, 550 HP, 45 dps) (90 s) |
| Purge Bell | Cleanse CC on self + 30% tenacity for 2 s (75 s) |
| Ember Flask | Cone burn: 180 arcane + 25% slow 2 s (45 s) |

## 13. Units & structures

### 13.1 Minis
Waves every 25 s from each gate (first 0:35): 3 **Bruisers** (melee, 480 HP, 14 dmg) + 2 **Zappers** (ranged 5 u, 300 HP, 21 dmg); every 2nd wave adds a **Ram** (900 HP, 3× damage vs towers, takes −70% from towers). Bruisers and Zappers deal **2.5× damage to enemy Minis** (waves grind through each other instead of stockpiling; Rams ignore the wave and go for structures), and **champions deal 2× damage to Minis** — waves are speed bumps for heroes, walls for each other. All Mini stats scale +4.5%/min (v0.2 balance: waves must eventually out-muscle a settled defense). Models: Kenney Blocky Characters in team palettes (Bruiser sword, Zapper wand-bolt, Ram carries a log ram); they're characters, not blobs — full walk/attack/death animations.

### 13.2 Watchtowers
2400 HP, 40 Armor/Ward, backdoor protection (−35% damage taken when no enemy Minis within 11 u). Attack: 180 dmg shots every 1.2 s, range 8.5 u, +40% ramp per consecutive shot on the same champion. Priority: Minis > champion attacking an allied champion (instant aggro-switch) > nearest champion. Aggro is visualized (red tether + tower eye glow — honesty rule).

### 13.3 Clash Core
3600 HP, 30 resists, exposed only after both Watchtowers fall. Self-defense: slow AoE pulse (95 dmg, 8 u) every 2 s when enemies are in range. Destruction = victory. The Core is a huge crystal-heart machine (Castle + Factory kit build) with damage states (cracks, leaking light, alarm klaxon under 25%).

### 13.4 Health orbs
Pads at the 30 u / 90 u marks spawn an orb every 45 s (first 1:30). Touch: heal 18% max HP + 40 Energy + 20 XP to toucher, small splash heal (6%) to nearby allies. Contested by design (pads sit in the poke zone).

## 14. Death & comeback

- Respawn timer: `5 + 2.5 × level` s (cap 32 s; +25% during Overtime) — death windows must be long enough late-game that a won fight can become a tower. Death screen = shop + killcam-lite (damage recap).
- Comeback levers (all systemic, none feel like charity): dead players keep 50% ambient XP/gold · kill bounties · Augment pity odds (§8) · event resets (a won Golem can swing a losing game) · Collapse forces closure.
- No XP/gold theft mechanics; no deny play.

## 15. Controls & camera

| Input | Action |
|---|---|
| Right-click / hold | Move (click-to-move, pathfound); on an enemy: attack it |
| A + click / A | Attack-move |
| Q / W / R | Abilities (smart-cast with range indicator on hold — default; classic cast toggle in settings) |
| **Space** | **Tag Swap** (rebindable in Settings → Controls) |
| E | Relic active |
| S | Stop |
| Tab (hold) | Scoreboard overlay |
| G / Alt+click | Ping wheel (Danger, On-my-way, Attack, Help) |
| V | Quick-chat & sticker wheel |
| 1–3 | Pick Augment during draft |
| Y | Camera lock toggle · Edge-pan + minimap drag when unlocked |
| Esc | Menu (settings, surrender, leave-to-bot) |

Camera: smart-follow (slightly leads toward cursor), fixed zoom with 2 steps, full spec in ART_DIRECTION §Camera. Default locked; spectator/death camera pans freely.

## 16. Bots

Bots are a first-class feature (full lobbies must be fun solo). Three tiers + personality flavor; implementation in TECHNICAL_ARCHITECTURE §Bot AI.

| Tier | Behavior |
|---|---|
| **Recruit** | Honest fundamentals: laning, orb taking, retreating at low HP, simple ability use on cooldown, no swap tricks. Never dodges skillshots deliberately. |
| **Veteran** | Positions by role, aims skillshots with basic lead, uses swaps when Energy-starved or countered, drafts sensible Augments, rotates to events. |
| **Elite** | Focus-fire discipline, skillshot prediction with human-like error, Entrance weaving, energy cycling, event timing plays, peel assignments, bait-and-swap. Reaction times floor-capped (180 ms) — never aimbot-perfect. |

Personalities (Aggro / Guardian / Objective / Chaotic) bias utility weights so bot teams don't move as one organism. Bots take over disconnected/AFK players seamlessly at the player's last tier-appropriate level.

## 17. Social & session rules (in-match)

- **Comms:** pings + quick-chat phrases + emote stickers. Free text chat only within premade parties (safety-first default; full team text post-1.0 with mute tools).
- **Surrender:** vote via Esc menu from 8:00; needs 3 of 4; 90 s cooldown between votes. Vs-bots matches: leave anytime, instant.
- **AFK:** 45 s without input → bot takeover + warning; return reclaims control instantly.
- **Reconnect:** 90 s grace (bot holds your seat); the client aggressively resyncs (see TECHNICAL_ARCHITECTURE §Reconnect). Browser tab close ≠ rage quit: reopening the site within grace rejoins automatically.
- **Deserter penalty** (matchmade only): repeated abandons → queue lockout escalating 2/10/30 min.

## 18. Meta game (the Hub)

Full screen specs in UI_UX.md; economy summary:

- **Clash Coins** earned: win 120 / loss 70 · first win of day +150 · quests (3 daily 50–80 each, 1 weekly 200) · mastery milestones · match-performance bonus (±20% by score, capped so losses still pay).
- **Champions:** 4 starters owned by every account (Rook, Fathom, Mortis, Sylva — one per role family) + 4-champion weekly free rotation. Unlock prices 3500 (early roster) / 5500 (later) / 8000 (newest). Average active player unlocks a champion roughly weekly at launch cadence.
- **Cosmetics (earn-only at 1.0):** champion palettes 800 (each champion ships with 2 unlockable palettes built from its asset pack's texture variants), emote stickers 400, victory poses 600.
- **Mastery:** per-champion XP → levels 1–10; rewards at 3 (palette), 5 (coins), 7 (sticker), 10 (animated podium title).
- **Match history:** last 30 matches: result, duo played, augments drafted, K/D/A, damage, per-event outcomes; expandable full scoreboard.
- **Profile:** level (account XP), banner, favorite duo showcase, lifetime stats.

## 19. Accessibility

Colorblind-safe team palettes (3 alternates, applied to outlines/telegraphs/healthbars, not just UI) · screen-shake and hit-flash toggles · reduced-VFX mode · remappable inputs incl. click-to-move on LMB · hold-vs-toggle for scoreboard/wheels · UI text scale 100–140% · subtitle captions for announcer banners · target-frame-rate cap options (30/60/uncapped, battery-friendly).

## 20. Balance philosophy

- Champion winrate target 46–54% (per-champion, vs Elite-bot baseline pre-population; per-MMR-band after launch). Augment pickrate outliers (>65% when offered) get nerfed or reworked — *offer-time choice* is the fun.
- All balance is data-package tuning (no code changes); ship weekly balance patches from v0.7 onward.
- The headless bot-vs-bot batch harness (1000 seeded matches per candidate change) gates every balance PR: it can't prove fun, but it catches degenerate spikes (avg match length, kill rates, gold curves, augment winrate deltas) before humans ever see them.
- Design taboos: no hard revives at launch (Overtime integrity), no global execute ults, no permanent stealth, no CC chains > 2.5 s total against DR.
