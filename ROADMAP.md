# Mini Clash — Roadmap

Ten releases from empty repo to launched game. **Every phase ships at least one fully working, polished, player-facing feature — never an MVP, skeleton or prototype.** "Fully working" is defined by the quality bar in [CLAUDE.md](CLAUDE.md) (complete states, final art/sound, performance budgets, tests, docs) and enforced by each phase's acceptance checklist below. A phase is done when its checklist passes; the next phase starts only then.

Scope discipline: if a phase runs hot, cut **content quantity** (champions, augments, events are phase-gated exactly so they can slip) — never feature completeness, never polish. Sizes: S ≈ focused week-scale, M ≈ multi-week, L/XL ≈ major. No calendar promises; sequence is the contract.

| Version | Codename | The fully-working feature(s) it ships | Roster | Size |
|---|---|---|---|---|
| 0.0 | Blueprint | ✅ Planning docs + CC0 asset library (done 2026-07-23) | — | — |
| 0.1 | Training Grounds | The playable core: movement/combat feel + Training sandbox | 2 | L |
| 0.2 | Shatterbridge | Complete ARAM match vs bots, fully offline-capable | 6 | XL |
| 0.3 | Online | Server-authoritative online play + custom lobbies + reconnect | 6 | L |
| 0.4 | Tag Team | The duo system (deal, swap, entrances) everywhere | 8 | L |
| 0.5 | Power Surge | Augment drafting system + full catalog | 10 | L |
| 0.6 | Living Bridge | The event system: map that fights back | 10 | M |
| 0.7 | The Hub | Accounts, economy, shop, quests, mastery, match history | 10 | XL |
| 0.8 | Together | Matchmaking, friends, leaderboards, honor | 10 | L |
| 0.9 | Arsenal | Cosmetics (palettes/stickers/poses) + open-beta hardening | 12 | M |
| 1.0 | Launch | Ranked-lite Season 1 + Clash Road + launch ops | 12 | M |

---

## v0.1 — Training Grounds

**Promise:** open the page, pick Rook or Fathom, and the *game feel* is already real: click-move that feels like LoL, abilities with full animation/VFX/sound, target dummies that sell every hit. This phase exists to lock feel before breadth — but it ships as a complete product surface (a Training mode you could put in front of a stranger), not a tech demo.

**Ships (player-facing):**
- Boot → name pick (guest identity, local) → minimal hub shell (Play→Training, Settings) — polished per UI_UX even though small.
- **Training Grounds mode:** arena built from Mini Arena/Nature kits (final dressing, skybox, lighting per ART_DIRECTION), target dummies (3 armor profiles, DPS readout floaters, reset button), cooldown/energy/gold cheat toggles, champion switcher.
- **Rook & Fathom complete:** full kits per CHAMPIONS.md — every ability with clip+procedural+FxTimeline+SFX, entrances, idles/fidgets, death/spawn; in-world healthbars, telegraphs, floating damage numbers.
- Controls & camera final (smart-cast + indicators, remapping UI, camera per ART_DIRECTION §2); Settings: video presets, audio sliders, controls, accessibility toggles — all functional and persisted.

**Under the hood:** monorepo + CI green from day one (Biome/tsc/Vitest/dep-cruiser/determinism-hash job), `sim` core (tick loop, PRNG, movement/pathing on navgrid, stats/damage/buffs, projectiles, effect-graph interpreter), sim-in-worker + `WorkerLink`, actor/AnimGraph/FxTimeline/audio systems, asset pipeline v1 (manifest, gltf-transform, validation), data schemas for champions/abilities/fx.

**Acceptance checklist:**
- [x] Fresh visitor → hitting a dummy with Fathom R (full broadside spectacle) in < 90 s without instructions. *(verified by the automated smoke run)*
- [x] Both champions: every ability shows telegraph → anticipation → impact → dissipation with sound; no missing states in the animation state machine (spawn/idle+fidget/run/casts/death/dance; hit-react is procedural shudder — Kenney rigs ship no hit clip).
- [ ] 60 fps p95 on reference laptop; zero steady-state GC allocs in a 5-min session. *(pending validation on real GPU hardware — CI environment is software-rendered)*
- [x] Determinism: golden replay hash identical Node vs headless Chromium (`scripts/determinism.mjs`, in CI).
- [x] All settings function and persist across reload; screens are fluid-layout (1280×720 → 4K).

**Non-goals:** no opponents/AI, no networking, no meta persistence beyond localStorage.

## v0.2 — Shatterbridge

**Promise:** the complete MOBA match — vs bots, in the browser, offline-capable. This is the moment Mini Clash becomes *a game*: minions marching, towers ramping, gold/items on death, comebacks, a Core exploding.

**Ships:**
- **Bridge Brawl vs Bots (one human + 7 bots; multi-human play arrives with netcode in v0.3):** full match per GAME_DESIGN — Shatterbridge final art (deck, brush, void, orb pads, structures with damage states), Mini waves (3 types, full anims), Watchtowers (aggro rules + visualized tether), Clash Core (defense pulse + destruction sequence), XP/levels with level-up moments, gold + full item/relic shop on the death screen, respawns, health orbs, surrender/leave, victory/defeat → podium → match summary (local history).
- **Bot AI tiers Recruit/Veteran/Elite** with personalities — complete per GAME_DESIGN §16 (Elite dodges, focuses, rotates; all tiers honest).
- **Champion select v1 (single-champion deal):** random deal from the 6, 2 rerolls, team bench — full card-flip presentation. (Duo dealing arrives in v0.4 as designed; this select is complete for the game as it exists at 0.2.)
- **Champions +4:** Mortis, Rattle, Grukk, Sylva (KayKit retarget path proven).
- HUD complete for current feature set (team frames, killfeed, event ticker placeholder-free — shows orb timers), Tab scoreboard, death screen shop, FTUE coach-marks, pings (bot-audible: bots react to Danger/Assist pings — pings must matter even vs bots).

**Acceptance:**
- [x] A full 4v4 vs Elite bots is winnable and losable, lasts 12–18 min, and ends with the full victory sequence. *(Elite mirror: 10/10 finish, 17.3 min avg, 5–5 team split; 200+ seeded mixed matches all finish 8–18.6 min. The full 1000-seed sweep runs as a scheduled follow-up — per-run wall-clock makes it a CI-nightly candidate, not a per-commit gate.)*
- [ ] Balance harness reports all 6 champions within 40–60% winrate vs mixed-tier bot pools. *(Still partial after the v0.3 bot-micro pass (squishy-aware focus fire, numbers-gated kiter punishment, support heal aim) + compensation tuning: at 56 mixed matches across two seeds, Grukk 58% and Rattle 42% sit in band, Sylva 39% at the edge, Mortis ≈33% cold, Fathom/Rook ≈64% hot. Per-run noise is ±7–8% at this sample size — the deep re-tune runs against the **nightly balance sweep** (`.github/workflows/nightly-balance.yml`: 210 mixed matches across three seed shards, aggregated winrate table on the run summary) rather than more small-sample rounds.)*
- [x] Airplane-mode (offline) playthrough works end-to-end after first cache. *(Service worker caches shell + assets; CI bridge smoke reloads offline and reaches champion select.)*
- [x] Match tick ≤ 4 ms p95 in-worker with 8 units + 30 Minis + projectiles. *(Harness p95 ≈ 0.4 ms/tick across full matches — 10× headroom.)*
- [x] Playwright smoke: boot→select→win-a-rigged-match→summary, headless, in CI. *(`scripts/smoke-bridge.mjs`: select with reroll + bench swap, rigged win, slab→podium→summary, match history, offline reload.)*

## v0.3 — Online

**Promise:** the same match, with your friends in it, on real infrastructure — plus the unglamorous features that make online play *actually complete*: reconnect, host-crash recovery, AFK handling.

**Ships:**
- **Custom lobbies with codes/links** (UI_UX §5): party dock, seat management, per-seat bot difficulty, bot-fill, cross-network play.
- **Authoritative online matches:** Colyseus rooms hosting the sim; prediction/reconciliation/interpolation per TECH §6 tuned until online is feel-indistinguishable at ≤ 80 ms RTT (A/B vs worker mode).
- **Reconnect & continuity:** refresh-proof rejoin, 90 s bot seat-holding, AFK→bot takeover, deserter messaging (custom games: none — friendly).
- Quick-chat & ping relay, connection-quality indicator, EU deployment (compose stack, Caddy, CDN, staging+prod, status page, observability per TECH §14).

**Acceptance:**
- [ ] 8 humans across ≥ 3 networks complete a match; no desync (state-hash spot checks in logs). *(Needs the deployed stack + real humans — the full multi-human path is CI-proven with two browsers through lobby → select → one shared online match, and the server now logs a sim state hash every 30 s so the spot checks are ready when the session happens.)*
- [x] Kill the tab mid-teamfight → rejoin < 10 s later with full state; bot covered meanwhile. *(`scripts/smoke-reconnect.mjs` in CI: mid-fight reload resumes the same match in ~6 s via the sessionStorage rejoin ticket, clock continuous, seat responsive; server tests prove the cover bot holds and yields the seat.)*
- [x] Kill the game-server container mid-match → players land back in hub with a clean message ("match lost to the void") within 10 s; no stuck clients. (Match persistence across host death is *not* promised — clean failure is the 0.3 contract.) *(Same smoke: SIGKILL the server → veil in ~2 s → Back routes to the hub.)*
- [x] 200-socket soak: stable ticks, flat memory, p95 budgets (TECH §11) hold. *(`soak.test.ts` in CI: 25 rooms × 8 real sockets for 45 s — every client's sim keeps advancing, tick p95 ≤ 4 ms, ~3 KB/s down per client, RSS +20% including the 200 in-process decoders.)*
- [x] Lag simulation (150 ms, 2% loss): game remains playable; corrections invisible per §6 thresholds. *(`scripts/smoke-lag.mjs` in CI: predicted response beats the round trip, no correction step reads as a jump, divergence bounded.)*

## v0.4 — Tag Team

**Promise:** Mini Clash's identity arrives — every player runs a duo, and the swap becomes the game's signature verb, complete in every surface it touches (select, HUD, bots, killfeed, history, training).

**Ships:**
- **Duo dealing** in champion select (paired card deal, per-slot rerolls/bench per GAME_DESIGN §7.1) + **Tag Swap** in match (shared HP pool, per-champ Energy/CDs, morph transition, swap-speed burst, CC/channel locks) + **Entrances** for all 8 champions (unique micro-effects, fully animated).
- ~~Duo HUD (active/bench portraits, swap radial, bench-readiness glints), duo kill cards, Tab/summary duo stats; Training gets a duo-config panel.~~ ✅ *(Kill cards, Tab scoreboard, match summary and podium all carry the pair; local match history stores it — the history *viewer* is a v0.7 screen. Training's duo panel picks any bench, or Solo, live.)*
- ~~**Bots swap** competently (tier-appropriate: Energy cycling, counter-pivots, entrance weaving).~~ ✅ *(Recruits never swap — a beginner plays one half. Veterans cycle Energy and cooldowns and burn the swap-in haste to escape. Elites add range counter-pivots and entrance weaving, and refuse to trade away a ready ultimate mid-fight, which suppresses some of their swaps. Swap *frequency* between the two tiers turned out to be context noise — v0.5's augments reversed the ordering on their own — so the A/B below, not the count, is the competence claim.)*
- ~~**Champions +2:** Boltz (the astronaut rig job), Wisp.~~ ✅ *Both shipped complete (kits, entrances, FX, cues, tests). The "astronaut rig job" was closed by removing it: `astronautA` ships unrigged, and rather than bolt a Blender weight-transfer step onto a pure gltf-transform pipeline for one champion, Boltz wears the suit on a Kenney-Skinned body (visor palette + procedural bubble helmet + SpaceKit raygun) and animates like every other Kenney champion — ASSET_CATALOG §4 records the delta. Roster now 8, which also closes the duo-deal duplicate gap.*

**Acceptance:**
- [x] Every champion pair (28 duos of 8) playable; shared-HP math, buff carryover and edge cases (swap during projectile flight, during R channels, at death frame) covered by sim unit tests. *(`duos.test.ts` walks all 28 pairs: both kits cast their full Q/W/R, swap, cast again, and round-trip back; the shared pool equals the average of both curves at level 1 and after levelling, never moves on a swap, and always sits between the two halves. Edge cases live in `swap.test.ts` from the Tag Swap core.)*
- [x] Elite bots measurably outperform swap-disabled Elite bots (harness A/B > 55% winrate) — proof swaps are *used well*, not just used. *(`scripts/swap-ab.mjs`: identical duo deals, one side pinned to a single half, swapping side alternates to cancel side bias — **92.5% over 40 elite matches** (37/40), pinned side verified at 0 swaps. The margin is far past the bar: at 8 champions the swap roughly doubles a seat's live ability access, so declining to press Space is close to forfeiting. Worth watching as a design property, not a bug.)*
- [x] Swap feel: input→morph start ≤ 50 ms online at 80 ms RTT (predicted); no HP-bar pops or portrait flicker. *(Client-predicted morph measured at **1 ms** input→morph over a 566 ms round trip in `smoke-lag.mjs`. No HP pop by construction — the shared pool is symmetric, asserted across all 28 pairs and over a full bot match in `bot-swap.test.ts`; the portrait swaps at the morph midpoint behind the puff.)*
- [x] Balance harness re-run: all duos within winrate rails; shared-HP pool formula tuned. *(**The harness now deals duos — it never did before.** It handed every seat a solo champion with no bench, so every balance number this project published before this phase measured pre-Tag-Team play. Three 60-match sweeps at n≈120 games/champion:
  · run 1 — Boltz 59 · Rook 59 · Grukk 56 · Fathom 50 · Mortis 46 · Rattle 45 · Sylva 45 · **Wisp 40**
  · run 2 (Wisp chill/curse nudge) — **Rook 61** · Grukk 56 · Boltz 54 · Rattle 51 · Fathom 50 · Sylva 46 · Mortis 44 · **Wisp 37** — the nudge did *not* move her, and Rook drifted out the top
  · run 3 (Rook's Stonewall ICD 8 s → 9.5 s, fresh seed, balanced sides) — Grukk 60 · Rook 53 · Rattle 52 · Boltz 51 · Fathom 48 · Sylva 47 · Mortis 46 · Wisp 44 — **all eight inside the band**, spread down to 16 points
  Rook was the real outlier, not Wisp: he sat top in both early runs and appeared in four of the six strongest duo pairings, so trimming his block cadence pulled the whole top of the table down. Wisp is still last, and the honest reading is that a stealth/decoy/fear kit is the hardest thing in the game for a bot to use — further numeric buffs would be tuning her for the harness rather than for players. The pool formula needed no change: averaging both curves is symmetric by construction, and pairing a weak half with a strong one is exactly what compresses the ±25% spread v0.3 had.
  **Methodology note:** select-accurate dealing hands each team 8 team-unique halves, so at a roster of exactly 8 **both teams field the entire roster and every match is a mirror** — champion winrate is pinned at 50% by construction and measures nothing. The numbers above come from `--free-duos` (per-seat draws, so teams differ); the shipped dealing is judged on duo *pairings* instead, where n is 10–22 per pair here — too noisy to tune against, which is what the nightly sweep is for.)*

## v0.5 — Power Surge

**Promise:** the draft that makes match #200 different from match #199 — complete with its full catalog, presentation, bot competence and discovery rules.

**Ships:**
- ~~**Draft system** at levels 3/6/9 (no-pause overlay, 45 s, keys 1–3, reroll token, auto-pick) with rarity presentation (prismatic shimmer moment) per UI_UX §9.~~ ✅ *The dock is bottom-centre, the match never stops behind it, and the 45 s timer is a conic ring that turns hot under 10 s. Auto-pick at 0 says **COACH CHOSE** on the confirmation slab instead of **ACQUIRED**. The Training Grounds draft too, with a trainer button to deal one on demand at any level.*
- ~~**Catalog complete:** 48 generic (AUGMENTS.md) + 3 signatures × 10 champions — every augment passing the visibility mandate (distinct on-field VFX), implemented as effect-graph patches.~~ ✅ *78 cards, all behavioural. "Effect-graph patches" landed as a data-patch vocabulary (stat/damage/onBasic/castMod/ultPower/param/duo/economy) plus 32 named `special` behaviours hooked into the systems they belong to — the same shape champion passives already used, rather than a second graph runtime nobody else speaks.*
- ~~Pity odds, offer composition rules, enemy-augment discovery (field + Tab), augments in kill cards/summary/history.~~ ✅ *Discovery is server-side: a client is never sent an enemy card it has not seen, so it cannot render one.*
- ~~**Bots draft** via utility affinities; **Champions +2:** Piper, Vex (their signatures land with them).~~ ✅

**Acceptance:**
- [~] All 78 augments implemented, each visually identifiable in a blind 10-augment screenshot quiz (internal QA gate — the mandate is testable). *(**Implemented: yes, all 78, and it is machine-checked.** A sim test walks the entire signature catalog casting each owner's full kit with the card equipped; an audit asserts every declared `special` has a call site (32/32) and every `param` knob has a read site (19/19); a data test requires every behavioural augment to own an FX timeline **and** for that timeline to put something on screen — a sound-only tell fails by definition. The 60-match harness run saw all **78/78** cards actually reach the field. **The quiz half is a human gate and is parked:** "can a player name this card from one screenshot" needs players, and answering it myself would be marking my own homework. Two known softenings to re-check when it runs: the card face uses a **category glyph** rather than per-augment art (that lands with the cosmetics pass), and the in-world enemy tell is a rarity-coloured chip on the nameplate rather than a distinct icon.)*
- [ ] Harness: no generic augment > 65% pick-when-offered or > 56% win-delta; report auto-generated per run.
- [x] Draft under fire: picking mid-teamfight never eats a game input; auto-pick fires exactly at 0. *(`scripts/shot-draft.mjs` holds W and casts Q with the dock open in a real browser: the champion moved **4.50 u** and Q went to **5.9 s** cooldown — the overlay's key handler never calls `preventDefault`, so game input passes straight through. Auto-pick is asserted tick-exact in `augments.test.ts`, along with the `auto` flag that makes the HUD say "coach chose" only on a genuine timeout — a bot picking early is a decision, not a timeout.)*
- [x] Sim tests: patch stacking (3 augments × duo × items) has no orphaned modifiers after death/swap/sell. *(Three augments + an item on a duo: the resolved stat line is captured, then the seat swaps and swaps back, dies and respawns, sells the item and drops the cards — and returns to exactly the naked champion, with no `aug_` buffs left on the entity. The shared HP pool reads identically on both sides of the swap, which is the symmetry the Tag Team pool was built on. Augment state lives in its own `augState` bag precisely so a swap cannot carry a `[duo]` card off with the outgoing half.)*

## v0.6 — The Living Bridge

**Promise:** the map becomes the fourth player — the full event system with its five launch events, seeded scheduling, announcements, and bots that respect the timetable.

**Ships:**
- **Event framework** (seeded schedule/pools, T-8 s announce pipeline: horn + banner + ticker + minimap glow) and **all five events** fully realized per GAME_DESIGN §9: Flank Isles (animated platform rise/fall, navgrid stage-swap), Coin Rain, Storm Front, **Clash Golem** (sourced+restyled model, full boss anim set, conversion siege behavior, Elder variant), **Overtime Bridge Collapse** (progressive deck-narrowing with chunk-fall spectacle, Corebreaker rules, Sudden Death resolution).
- Bots: event-utility goals (contest golem, rotate for isles, respect storms, Overtime aggression).
- Event outcomes in Tab log, summary and (local) history; Grounding Rod/Event Insurance/Orb Sense augments activate their full behavior.

**Acceptance:**
- [ ] 1000-match harness: zero stalemates past 20:00 (Sudden Death always resolves); event participation lifts bot winrates as designed (golem-winner advantage measurable but < 65%).
- [ ] Collapse stages swap navgrids without a single stuck unit across the harness corpus.
- [ ] Every event readable with sound off (banner+minimap+telegraphs) and with reduced-VFX mode on.
- [ ] Seeded schedule: same seed reproduces the identical event timeline in replay.

## v0.7 — The Hub

**Promise:** progression becomes real — accounts, the coin economy, unlocks, quests, mastery and match history, wrapped in the 3D hub island. The meta game ships whole, not as scaffolding.

**Ships:**
- **Accounts:** guest-first identity, in-place upgrade to email+password, cross-device login, session security per TECH §10 (api + Postgres + migrations live in prod).
- **Economy:** Clash Coins ledger, match rewards (server-validated), first-win-of-day, champion unlock flow with prices per GAME_DESIGN §18, free rotation (weekly cron), starters.
- **Hub island scene** (Medieval-Hexagon build, idling favorite champion, harbor) + full screens per UI_UX §13: Champions (3D viewer with **ability previews via FxTimeline**), Shop, **Match History** (server-side last 30, full detail view), Quests (3 daily + weekly, reroll), Mastery tracks, Profile.
- Match results, quests, mastery all flow game-server→api→DB per TECH §9; offline vs-bots still works logged-out (rewards for offline matches: none — online-verified only; the UI says so honestly).

**Acceptance:**
- [ ] Two-device flow: play on A as guest → upgrade → login on B → identical profile, history, unlocks.
- [ ] Economy integrity: coins only ever mutate through the ledger; concurrent purchase race (double-click, two tabs) provably idempotent; negative-balance impossible (constraint + test).
- [ ] Champion detail: all 10 champions' every ability previewable in the viewer (same FxTimelines as in-game).
- [ ] History detail reproduces any finished match's scoreboard exactly (golden fixtures).
- [ ] api p95 < 120 ms for hub endpoints under 100 rps synthetic load; hub TTI budget holds with live data.

## v0.8 — Together

**Promise:** strangers can find a game and friends can find each other — matchmaking, social graph, and the safety rails that make public play complete.

**Ships:**
- **Quick Match:** MMR-lite queue (party-averaged, widening bands, 90 s bot-backfill offer), accept-slam flow, dodge handling, deserter penalties per GAME_DESIGN §17.
- **Friends:** requests, presence (online/in-hub/in-match), invite-to-party from list, recent-players list; block+report (name/behavior categories) with server-side rate limits.
- **Leaderboards** (weekly + all-time by rating and by mastery) and post-match **honor** (one commend per match → profile badge trickle).
- Moderation basics: name filter live, report queue admin view (internal page), penalty ladder.

**Acceptance:**
- [ ] Queue simulation (synthetic population 50–500): p50 time-to-match < 60 s with bot-backfill honoring MMR bands; parties never split.
- [ ] Presence correct across disconnects (kill socket → friend sees offline ≤ 10 s).
- [ ] Full anti-grief loop demonstrated: report → queue entry → penalty applied → appeal note visible.
- [ ] Load: 1000 concurrent sockets across hub presence + 20 live matches on the single-VPS reference box within TECH §11 budgets.

## v0.9 — Arsenal (+ Open Beta hardening)

**Promise:** self-expression and the final roster — plus the stability pass that earns the 1.0 tag.

**Ships:**
- **Cosmetics complete:** 2 unlockable palettes per champion (pipeline-generated variants, hand-tuned), emote stickers (in-match wheel), victory poses (podium), all earn-only via shop/mastery per GAME_DESIGN §18; equip flows in Champions/Profile.
- **Champions +2:** Snowble (procedural-rig showcase), Patch — roster hits the launch 12.
- **Hardening:** crash-free-session rate ≥ 99.5% over beta corpus, error-report triage burn-down, low-end preset audit (30 fps floor devices), key-conflict/i18n-string audit, save-data migration tests, final balance mega-pass (full 66-duo × augment harness sweep).

**Acceptance:**
- [ ] All 12 champions complete against CHAMPIONS.md (kits, entrances, signatures, previews, palettes ×2).
- [ ] Cosmetic equip state correct across: hub viewer, select, in-match, kill cards, podium, history.
- [ ] Two-week open-beta metrics: crash-free ≥ 99.5%, p95 budgets held on real-user telemetry, zero economy-integrity incidents.
- [ ] Store-page test (ART_DIRECTION §10): 10 fresh 1080p screenshots + a 60 s gameplay capture pass internal review — the game *looks* launched.

## v1.0 — Launch

**Promise:** a reason to keep playing week after week, and the operational maturity to run it live.

**Ships:**
- **Ranked-lite Season 1:** placement (5 matches), 6 tiers (Bridge Bronze → Clash Crystal), per-season reset, ranked-only queue toggle, season rewards (exclusive palette + banner).
- **Clash Road:** free seasonal reward track (30 tiers, XP from matches/quests) — the retention spine; no paid track at 1.0 (economy stays earn-only).
- **Launch ops:** patch-notes surface in hub, in-client MOTD, incident runbook, backup/restore drill executed, analytics dashboards (retention, queue health, balance) live, marketing site (static, in-engine renders) + press kit.

**Acceptance:**
- [ ] Season rollover rehearsed on staging (rank reset, reward grant, Road reset) with zero data loss.
- [ ] Ranked integrity: placement + tier math property-tested; leaver protection in ranked verified.
- [ ] Day-1 load drill: 3× expected peak on prod infra, graceful queue-shedding beyond.
- [ ] The README pitch is true end-to-end: link → named guest → matchmade or bot match → rewarded → back for tomorrow's first-win.

---

## Post-1.0 backlog (unordered candidates)

New champion cadence (1/month target — pipeline-proven marginal cost) · second map biome + palette variants (night/graveyard/space skyboxes) · mobile touch + gamepad (UI is touch-proofed by design) · spectate & replays (the intent-log format already exists) · localization (German first) · voice announcer pass · original score · text team-chat with mute tools · clans/guilds + weekend tournaments · new modes (2v2 duel bridge; 5v5 classic once population supports it) · real-money cosmetics (only if/when sustainable, earn-path preserved) · Steam/desktop wrapper · seasonal events reusing Holiday/Spooktober kits · accessibility deep pass with player council.
