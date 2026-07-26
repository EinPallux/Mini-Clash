# Mini Clash — UI/UX Specification

Every screen and flow in the product. Visual style per [ART_DIRECTION.md](ART_DIRECTION.md) §8 — the hero-shooter menu language (sharp, skewed, flat; Overwatch/Marvel-Rivals DNA) is BINDING for every screen listed here. All UI is the React DOM overlay except in-world bars/telegraphs (Three.js). Every screen defined here includes hover/press states, loading, empty, error and disconnected variants — those states are part of the spec, not extras.

## 1. UX principles

1. **60 seconds to clash:** first-time visitor → in a bot match in ≤ 60 s (guest identity, no forms, one big button).
2. **One primary action per screen**, bottom-right, huge, springy.
3. **Never block on the network:** every hub screen renders from cache instantly, refreshes live (stale-while-revalidate presentation).
4. **The party is ambient:** your party dock persists across all hub screens — never a separate "room" you're trapped in.
5. **Esc always goes back; nothing important is hover-only** (touch-proofing for post-1.0 mobile).

## 2. Sitemap

```
Boot ─ Identity (guest name pick / login) ─ HUB
  HUB ├─ PLAY panel (mode select → Lobby → Champion Select → Loading → MATCH)
      ├─ Champions (grid → Champion Detail)
      ├─ Shop (champions & cosmetics tabs)
      ├─ History (list → Match Detail)
      ├─ Quests (daily/weekly + mastery)
      ├─ Profile (stats, banner, showcase)
      └─ Settings (video/audio/controls/accessibility/account)
  MATCH ├─ HUD (+ Draft overlay, Death screen, Tab scoreboard, Esc menu)
        └─ End of Match (podium → rewards → back to HUB/lobby-requeue)
```

## 3. Boot & identity

- **Boot:** logo pop + animated bridge-chunk loader bar; loads hub bundle (< 2.5 s TTI target). Version + status-page link footer.
- **First visit:** single card — "Choose your name" (generator prefilled, dice reroll button) → big **ENTER THE CLASH**. Creates a guest account (device-bound). Age/legal footer links.
- **Returning:** straight to Hub. Guest → registered upgrade prompt appears only after match 3 ("Save your progress") and in Settings→Account (email+password; OAuth post-1.0). Registered users can log in from any device.

## 4. Hub — Home

Backdrop: the 3D hub island (Medieval-Hexagon terrain, harbor with Pirate/Watercraft dressing, your favorite champion idling with its palette + pet; time-of-day matches local clock). UI floats over it.

```
┌──────────────────────────────────────────────────────────────┐
│ [☰Profile chip: avatar·name·level]        [🪙 2,450] [⚙] [🔔] │
│                                                              │
│   left rail:                      (3D hub island scene)      │
│   ▸ Champions                                                │
│   ▸ Shop                        featured card carousel:      │
│   ▸ History                     rotation · quest · news      │
│   ▸ Quests                                                   │
│                                                              │
│ [party dock: You +3 empty slots · invite]     [ ▶ PLAY ]     │
└──────────────────────────────────────────────────────────────┘
```

- **PLAY** opens the mode panel (slide-up): **Quick Match** (matchmade) · **Vs Bots** (difficulty picker, works offline — badge shows "offline ready") · **Custom Lobby** (create/join by code) · **Training**. Remembers last choice; Enter = repeat it.
- Notification bell: quest completions, friend requests (v0.8), patch notes.

## 5. Party & Custom Lobby

- **Party dock (ambient):** avatar chips; + opens invite sheet — 6-char code + copy-link (`?join=ABC123` query link — works on any static host); joining puts you in the leader's dock. Party persists through matches; leader crown transfers on leave. *(v0.3 form: the dock shows your connected lobby — code + member chips — and rides the hub while you browse; the lobby connection survives matches for Play Again.)*
- **Custom Lobby screen:** two team columns of 4 seats; each seat = player chip / **bot chip** (per-bot difficulty: Recruit/Veteran/Elite) / empty. Seat management is tap-first per principle #5: tap an empty seat to sit there; leaders tap bot tiers directly on the chip (drag lands with the spectator row post-1.0). Right panel: lobby code (huge), mode summary, bot-fill toggle ("fill empty seats on start"). Leader's **START** requires ≥1 human and every seated human readied. Non-leaders see a readiness toggle.
- Edge states: leader disconnect → crown migrates + toast; joining a full/dead code → friendly error with "make your own lobby" CTA; leaving mid-select turns your seat into a Veteran bot that keeps your pick.
- *(v0.3)* START runs the champion-select deal **server-side** — per-human deal + 2 rerolls, shared team bench with atomic swaps, auto-lock on the timer — then every human receives a private seat reservation into the match room. Enemy picks never cross the wire before load. *(v0.4: the server deals **duos** — two champions per seat, rerolls and bench swaps addressed per slot.)*

## 6. Champion Select (the Deal)

60→0 s timer ring around the START slot. Flow: dramatic card-flip **deal of your duo** (two cards land as a pair, chained) → reroll/bench decisions → lock. *(Shipped in v0.4; v0.2–v0.3 dealt a single champion with a 45 s ring.)*

```
┌──────────────────────────────────────────────┐
│  YOUR TEAM (4 duo cards, allies' picks live) │
│        [YOUR DUO: ROOK ♦ FATHOM]             │
│   [🎲 per-card reroll ×2] [bench row: swaps] │
│  enemy side: hidden silhouettes until load   │
│  bottom: duo tips ("Rook walls make Fathom   │
│  kegs unavoidable"), palette picker, [LOCK]  │
└──────────────────────────────────────────────┘
```

- Reroll animates the specific card exploding into the new champion; rerolled champions slide to the team bench; tapping a bench card swaps it into a chosen slot of your duo (per-slot, LoL-bench-style — tap a duo card to choose the slot the bench feeds). A reroll always changes the card, and a duo never holds the same champion twice. *(A 4-duo team wants 8 distinct champions; with a smaller roster the deal exhausts it before repeating.)*
- Everyone locks or timer ends → team splash: all 8 ally champions line up and do their `spawn` pose (this render *is* the loading screen backdrop).

## 7. Loading

Team lineup render + per-player progress rings + rotating tips (kit tips for the champions actually in this match). All-loaded → gate horn. Slow loader gets a 20 s cap, then match starts with their bot standing in until arrival (never hold 7 players hostage).

## 8. In-match HUD

```
┌──────────────────────────────────────────────────────────────┐
│ [team frames: 4 duo-portrait pairs+HP]  4 ⚔ 7   11:32  [events⏱]│
│                                                     [killfeed] │
│                                                                │
│                       (game world)                             │
│                                            [lane-strip minimap]│
│ [duo panel]  [Q][W][R][E-relic]  [⚡energy bar]   [gold 1,845] │
│  active+bench   cooldown radials    [item slots ▪▪▪▪|relic]    │
│  portraits w/   + keybind labels                               │
│  SWAP ring (Space)                                             │
└──────────────────────────────────────────────────────────────┘
```

- **Duo panel (bottom-left):** big active portrait, small benched portrait beside it ringed by the 9 s swap radial (the ring reads as a filling arc, the label flips to **SPACE** when ready); Space flips them with a squash-and-pop morph — puff, ring flash, arrival chime — and the bench portrait glints when it brings a castable ability *and* the Energy to pay for it. A thin bar on the bench portrait shows its own Energy, because swapping into an empty bar is a real cost. *(Shipped v0.4; the morph is client-predicted so it starts on the keypress — measured at 1 ms input→morph over a 544 ms round trip.)*
- **In-world (WebGL, not DOM):** unit healthbars (chunked per 100 HP, damage-lag ghost), cast bars, floating damage numbers, telegraphs, off-screen event/danger arrows at screen edge.
- **Event ticker + announce banner (shipped v0.6):** the ticker stacks under the **minimap** rather than top-right, because that is where the map already is and the two are read together. It carries one chip per live window (glyph, name, seconds left, a fuse that empties) and, inside the 30 s reveal, a dimmer "up next" line — Orb Sense extends that to 40 s (GAME_DESIGN §9.1), which is the whole point of the card. In Overtime the ticker instead shows the deck's current width, counting down 18 → 12 → 8 u.
  The T-8 s announce is a **banner under the match strip**, not full-width: name, one line of what it does to you, a countdown and a fuse. It deliberately clears the clock, the score and the AFK-takeover warning, because the match does not stop for it — you have to be able to keep fighting while you read it. The horn plays under it, and the minimap glows where it is about to happen. Everything except the horn survives sound-off and reduced-VFX, which is asserted rather than assumed (`scripts/shot-events.mjs` runs a window with every volume at 0 and reduced VFX on).
- **Kill notifications:** duo-portrait vs duo-portrait cards; streak text uses restraint (no 2000s announcer cheese in text form — the horn stingers carry it). *(Shipped v0.4: the active half renders solid, the benched half tucks behind it at 55% opacity — the pair reads at a glance without doubling the card's width.)*
- **Quick-chat (v0.3):** hold **C** for a 4-phrase radial (Nice! / Thanks! / Help! / On it!) mirroring the ping wheel; lines are team-scoped, server-whitelisted and rate-limited, and land as skewed toast lines under the ally frames. Emote stickers join post-1.0 per GAME_DESIGN §17.
- Esc menu: resume · settings · surrender vote (from 8:00) · leave (vs bots).

## 9. Augment draft overlay (Power Surge)

On level 3/6/9: bottom-center dock slides up with 3 cards (game continues behind; input priority stays with the game — cards pick via 1/2/3 or click). Cards: rarity frame (silver/gold/prismatic + prismatic gets refraction shimmer), icon, name, one-line effect. [↻ reroll ×1] chip. 45 s ring; timeout auto-picks with a "coach chose" note. Enemy picks are not revealed here — discover them on the field (visibility mandate) or via Tab.

*(Shipped v0.5. The "icon" is the augment's **category glyph** — ⚔ offense · 🛡 defense · ➤ mobility · ⇄ tag-team · ⌂ siege · ★ signature — which also makes the "no two cards from the same category" offer rule readable at a glance; per-augment art arrives with the cosmetics pass. A pick collapses the dock into a confirmation slab reading ACQUIRED, or COACH CHOSE on a genuine timeout, before the card settles into a compact strip beside the ability cluster. The dock clears the health/energy bars and the ability row by construction — a headless check asserts no overlap. **The Training Grounds draft too:** levelling to 3/6/9 there opens a real draft, and the trainer panel has a "Deal augment draft" button for trying a card on any kit at any level; switching champion in the Grounds clears the loadout so a signature can never ride onto a champion it was not written for.)*

## 10. Death screen (= the shop)

Grey-out + respawn ring (timer). Left: killcam-lite damage recap (top 3 sources with ability icons — teaches counterplay; *shipped in v0.3: the sim attributes every hit through the damage funnel — ability slot, attacks, passives, items, structures — over a rolling 12 s window, frozen at death*). Center: **the shop** (tier columns T1/T2/T3 + relic row; owned/affordable states; one-click buy with hammer-clink; build-suggestion chips per champion, dismissible). Right: live team status ("Fight at Golem in 0:12!" contextual hints). Buying is only possible here + pre-1:00 fountain — the screen makes death useful, not dead time.

## 11. Tab scoreboard (hold)

8 rows (duo portraits, level, K/D/A, gold, items, augment icons, ping bars) + structures state + event log tail. Enemy augments visible here (post-discovery: icons appear once seen on the field, else "?" — scouting matters). *(v0.4: scoreboard, summary and podium all carry the duo — a brush-concealed enemy keeps a two-slot `?` so the shape still reads as a pair. Local match history stores both halves per seat; the history **viewer** arrives with the hub in v0.7.)* *(v0.5: discovery is enforced **server-side**. The sim tracks per team which `player:augment` pairs it has actually seen — owner alive, visible, out of brush — and rewrites everything else to `?` before the snapshot leaves, so a client cannot render a card it was never sent. The count still crosses, which is the useful half: "they have three, I know one." The trio also rides kill cards and three small rarity chips over each enemy's in-world nameplate, grey while unknown.)*

## 12. End of match

1. Core explodes (slow-mo, 3 s) → **VICTORY/DEFEAT** slab with team-color fireworks/rain.
2. **Podium:** MVP trio on the hub-style stage doing spawn/dance poses (MVP = performance score), title chips ("Golem Whisperer: won both golems").
3. **Rewards tally:** coins odometer (+win/+quests/+mastery progress bars filling with pops), champion mastery XP per duo member, quest ticks.
4. Buttons: **Play Again** (re-queues same mode/party — the retention button, huge) · Match details (full scoreboard) · Hub.

## 13. Hub — remaining screens

- **Champions:** grid (owned bright / locked with price chip / rotation badge ⟳). Filters by role. **Detail:** 3D viewer (rotate, palette switcher, animation buttons for each ability — *the kit is the pitch*), kit panel with numbers, signature augments, mastery track, [Unlock 🪙5,500] with coin-crack animation, [Try in Training] (free for any champion).
- **Shop:** tabs Champions / Palettes / Stickers / Poses. Weekly featured shelf (rotation discounts on coins — no FOMO pressure: everything is always also available at base price; featured = spotlight, not scarcity). Purchase modal with preview on your model.
- **History:** virtualized list of last 30 (result color-edge, duo icons, mode, K/D/A, augment trio, duration, date). **Detail:** full scoreboard snapshot + event outcomes timeline + personal graphs (gold/XP vs match average) — data from the match summary blob (see TECHNICAL_ARCHITECTURE §Persistence).
- **Quests:** 3 dailies (reroll 1/day), 1 weekly, mastery milestones; claim buttons with coin-burst; streak calendar (first-win-of-day).
- **Profile:** banner, level ring, lifetime stats (favorite duo, winrate, augment most-picked), showcase slots (3 champions posed), account panel.
- **Settings:** Video (quality preset auto-detected + manual, fps cap, reduced VFX, shake/flash toggles) · Audio (4 sliders + danger-cue toggle) · Controls (full remap, smart-cast per-slot, cursor scale) · Accessibility (colorblind presets with live preview swatch, text scale) · Account (name change 1× free, email link, log out, delete account w/ confirm phrase). All settings apply instantly, persist locally + to account.

## 14. System states (global)

- **Reconnect:** connection-lost veil in-match ("Reconnecting… your bot is holding the line") with auto-retry; hub shows offline banner + Vs-Bots stays playable. Browser refresh mid-match → boot detects active session → "Rejoin match" takeover screen.
- **Queue:** PLAY button morphs into a cancelable queue chip with elapsed time (party-wide); match-found = full-screen accept slam (10 s), decliner returns to hub, party informed.
- **Toasts:** top-right stack, 4 s, categories (reward/social/system); never over the HUD center.
- **Errors:** every failed action has a human sentence + retry ("Couldn't reach the shop — coins are safe. Retry?"). No raw error codes anywhere.

## 15. First-time experience (FTUE)

Match 1 (auto-created vs Recruit bots): contextual coach-marks only (move, Q, swap when it first readies, draft when it first opens — 4 total, never again), tips feed quiet. No forced tutorial level — the bot match *is* the tutorial. Post-match: name-save prompt + Champions screen nudge. FTUE completion tracked so it never re-triggers.
