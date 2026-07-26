# Mini Clash — Technical Architecture

TypeScript end-to-end. One deterministic simulation package drives every mode: in a **Web Worker** for offline/vs-bots play, on the **authoritative Node server** for online play. Three.js renders; React overlays; Colyseus transports; Fastify + Postgres persist the meta game.

## 1. Stack decisions (locked)

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) everywhere | one language across sim/client/server/tools; shared types are the netcode contract |
| Runtime | Node 22 LTS server-side; evergreen browsers (last 2 versions) client-side | WebGL2 baseline, WebGPU opportunistic later |
| Rendering | Three.js (r17x, pinned) | mature, tiny relative to engines, full control, best docs/ecosystem for custom pipelines |
| Game networking | Colyseus 0.16 (WebSocket rooms) + custom binary messages for hot paths | battle-tested room lifecycle/matchmaking primitives without inventing a lobby server; we keep our own snapshot codec |
| UI | React 19 + Zustand | DOM overlay for menus/HUD; zero React in the render loop |
| Build | Vite (client), tsup (packages), pnpm workspaces | fast, boring, reliable |
| Quality | Biome (lint+format), Vitest, Playwright | single-tool DX, speed |
| Platform API | Fastify 5 + Drizzle ORM + PostgreSQL 16 | small, typed, migration-friendly |
| Cache/presence (from v0.8) | Redis 7 | queue tickets, presence, rate limits |
| Asset pipeline | gltf-transform + custom manifest tooling | see ASSET_CATALOG §5 |
| Deploy | Docker Compose on a VPS (Hetzner-class) + Caddy (TLS/wss) + Cloudflare (CDN for static client) | one box runs everything through v0.8; scaling path documented §16 |

## 2. System overview

```mermaid
flowchart LR
  subgraph Browser
    UI[React UI overlay] --- GC[Game client\nThree.js render + prediction]
    GC <-->|snapshots / intents| NET[net adapter]
    GC <-->|same interface| WK[Web Worker\nsim (offline & training)]
  end
  NET <-->|WebSocket wss| GS[Game server\nColyseus rooms hosting sim]
  UI <-->|HTTPS JSON| API[Platform API\nFastify]
  GS -->|match results| API
  API --- DB[(PostgreSQL)]
  API --- RD[(Redis v0.8+)]
  CDN[Cloudflare CDN\nstatic client + assets] --> Browser
```

The **net adapter** exposes one interface (`connect, sendIntent, onSnapshot, onEvent`) with two implementations: `WorkerLink` (structured-clone to the sim worker) and `SocketLink` (Colyseus). The game client cannot tell offline from online apart from latency — this is what guarantees the offline game and online game are the *same game*.

## 3. Monorepo layout

```
mini-clash/
├─ assets/                     # source packs (never shipped raw) + _sourced/
├─ packages/
│  ├─ data/        # content definitions (JSON5) + zod schemas + typed loaders
│  ├─ sim/         # deterministic simulation. ZERO runtime deps.
│  ├─ protocol/    # intent/snapshot/event types + binary codecs (client⇄server contract)
│  ├─ client/      # Three.js game + React UI (Vite app)
│  ├─ server/      # Colyseus app: rooms, bot hosting, result reporting
│  ├─ api/         # Fastify platform service: auth, profiles, economy, history, quests
│  └─ tools/       # asset pipeline, balance harness, replay inspector, codegen
├─ docs/ · README.md · ROADMAP.md · TECHNICAL_ARCHITECTURE.md · CLAUDE.md · AGENTS.md
└─ compose.yaml, .github/workflows/, Caddyfile (added at v0.3)
```

**Dependency rules (CI-enforced via dependency-cruiser):** `data → (nothing)` · `sim → protocol, data` · `protocol → data` · `client → sim, protocol, data` · `server → sim, protocol, data` · `api → data` · nothing imports `client`. `sim` bans imports of three/react/dom/node builtins by lint rule.

## 4. Deterministic simulation (`packages/sim`)

- **Model:** ECS-lite — typed component arrays (SoA) over entity ids, plain function systems in a fixed order. No frameworks: the schema is small (≈20 component types: Transform2, Velocity, Stats, HealthPool, Energy, DuoState, AbilityBook, Buffs, Projectile, Structure, MiniBrain, BotBrain, EventState…). Gameplay space is **2D top-down** (x,z + facing); the third dimension is render-only (jumps/knock-ups are cosmetic curves driven by state timers).
- **Tick:** fixed **30 Hz**. Pipeline per tick: `intents → cooldowns/resources → casts → projectiles & sweeps → movement (pathing+avoidance) → combat resolution → buffs/auras → structures & Minis → events (Living Bridge) → bots → deaths/respawns → snapshot emit`.
- **Determinism contract:** all randomness via `Pcg32` seeded from match seed (streams per subsystem); no wall-clock, no float-hazard functions beyond +−×÷/sqrt (trig via lookup tables to dodge cross-engine libm drift); iteration order always entity-id sorted. Same seed + same intent log ⇒ identical state hash. CI runs cross-environment replay hashes (Node linux vs headless Chrome) to police drift.
- **Movement:** grid navgrid (0.5 u cells) baked from the map def; A* with string-pulling for click-moves; steering + soft RVO-lite separation for Mini clumps. Collapse events edit the navgrid live (pre-baked variants per collapse stage — no runtime rebaking).
- **Combat:** circle colliders; swept-circle projectile tests; ability effects are interpreted **effect graphs** from `packages/data` (damage, heal, shield, cc, dash, spawn, zone, modifyStat nodes…) — champions are data, the interpreter is engine. Augments are effect-graph *patches* (add node / multiply param / swap projectile def), which is what makes 48+36 augments sustainable.
- **Replay:** the intent log + seed **is** the replay format (tiny). Golden-replay tests pin balance-critical scenarios; the balance harness (§14) and the reconnect fast-forward both reuse the replay machinery.

## 5. Content data (`packages/data`)

Typed TS data modules (pure object literals — v0.1 revision: same data-driven intent as the originally planned JSON5 files, minus a parser dependency, plus HMR and compile-time checks; externalize to JSON5 later if live modding/hot-tuning demands it) validated by zod schemas in CI: `champions/*.json5` (stats, growth, abilities as effect graphs, animation map, augment hooks), `items.json5`, `augments.json5`, `minis.json5`, `structures.json5`, `map.shatterbridge.json5` (geometry refs, navgrid source polygons, spawn/orb/event markers, collapse stages), `events.json5` (Living Bridge schedule pools), `bots/*.json5` (tier reaction curves, personality weights, augment affinities). Typed accessors generated (`pnpm codegen`). Balance changes = data PRs; the client hot-reloads data in dev for live tuning.

## 6. Netcode

- **Session flow:** api issues a signed room ticket → client joins Colyseus room (`bridge_brawl`) → room seats 8 (humans + bots), runs champ select, then instantiates the sim.
- **Upstream (client→server):** `Intent` messages at input-time, ≤ 30/s, sequence-numbered: `move(x,z)`, `attackMove`, `cast(slot, aim)`, `swap`, `buy(itemId)`, `draftPick(i)`, `ping(type,pos)`. Server validates *everything* (cooldown, Energy, range, gold, alive, draft-open) — invalid intents are dropped with a code (client shows the red flash/"not ready" feedback locally anyway).
- **Downstream:** binary **delta snapshots at 20 Hz** (protocol package: quantized positions 0.01 u, per-entity dirty masks, baseline every 2 s; events channel for reliable one-shots: kills, drafts, event triggers, chat/pings). Budget: ≤ 12 KB/s per client at teamfight peak.
- **Client prediction:** own champion's movement + swap + cast *presentation* (windup starts instantly; damage/CC outcomes are server-authoritative — MOBA-standard "cast-commit" model, no rollback of world state needed). Reconciliation: server echoes last-applied intent seq; the client compares the authoritative position against its *recent predicted trajectory* (a snapshot is one trip old, so mid-walk the prediction legitimately leads it by speed × RTT — riding behind on the walked path is on-track, not an error). Genuine divergence becomes visible only past 0.25 u and then drains rate-capped (~10 u/s, ≤0.8 u per snapshot, each step glide-smoothed over 100 ms) so the champion catch-up-slides instead of jumping; while an order is still unacked, divergence up to 2.5 u is expected and left alone. A hard snap happens only when the server *itself* jumped between consecutive snapshots (dash/hook/knockback/respawn — movement faster than 3× walking allows) or as an 8 u runaway safety net.
- **Interpolation:** remote entities render 100 ms behind newest snapshot with cubic hermite; extrapolation cap 100 ms with dead-reckoned velocity, then freeze-with-fade (no rubber-band teleports).
- **Lag handling:** no server-side rewind at 1.0 (projectiles are simulated and dodge-able; homing autos need none). Fairness lever: cast aim positions accept client timestamps within a 150 ms window, clamped.
- **Reconnect:** 90 s seat reservation (GAME_DESIGN §17). Rejoin: server streams a state baseline + intent tail; the worker-capable client fast-forwards locally. Bot brain drives the champion meanwhile.
- **Offline mode:** identical sim in a Web Worker; `WorkerLink` fabricates the same snapshot/event stream (with 0 ms RTT and the local player exempt from interpolation delay). Training/vs-bots therefore exercise the *entire* netcode-facing client.

## 7. Client architecture (`packages/client`)

- **Boot:** capability check (WebGL2, wasm) → quality preset autodetect → hub bundle. Match load streams preload group `match-core` + the 8 champion bundles (ASSET_CATALOG §5).
- **Scene organization:** `WorldRoot` (static map chunks, instanced vegetation), `UnitLayer` (champions/Minis/structures — pooled actors), `FxLayer` (pooled particles/ribbons/decals), `OverlayLayer` (in-world bars/telegraphs — instanced quads, camera-facing), `SkyRig`. Renderer: WebGL2, SRGB, shadow map 2048, post chain per ART_DIRECTION §3.
- **Actor system:** binds a sim entity id to a visual rig: `ModelHost` (GLB instance or shared-skeleton clone), `AnimGraph`, `FxSockets`, `NameplateProxy`. Actors are pooled per champion/Mini type; visibility culled by camera frustum + fog rules from snapshots (server never sends fogged enemy positions — anti-wallhack, §13).
- **Animation system (`AnimGraph`):** unified over skinned and node rigs (three.js `AnimationMixer` handles both — node-TRS tracks for Blocky/Graveyard rigs). Layers: base locomotion (idle/run blend by speed) ▸ action layer (casts/attacks, crossfade 0.08–0.12 s, clip retime by attack-speed/cast-time) ▸ additive layer (aim-yaw spine twist, squash-stretch scale, hit shudder). Per-champion `animation map` in data remaps logical states → clip names + retimes (rig-family templates per ASSET_CATALOG §4). KayKit retarget: bind-pose bone-name remap done once in the asset pipeline, not at runtime.
- **VFX system:** data-driven **FxTimeline** assets (`packages/data/fx/*.json5`): tracks of typed ops (`emitBurst`, `ribbonStart/End`, `decalProject`, `meshFlash`, `lightPulse`, `shake`, `hitstop`, `soundCue`, `spawnProp`) with normalized-time keys, driven by ability state events from snapshots (cast started/impact/expired). Backed by pooled GPU-instanced quad particles (one 2k atlas), ribbon meshes, projected decals. The same timeline runs in the champion-detail viewer (hub) — ability previews for free.
- **Audio:** WebAudio graph (no dependency): bus tree (master/music/sfx/ui), stem-crossfade music player keyed by match-state, positional pan from world-x, cue pooling with voice caps per category, ducking sidechain per ART_DIRECTION §9.
- **Input:** raycast ground plane for aim; command layer translating to Intents; local echo (click marker, range indicators); full remapping via data-driven binding table (Settings).
- **UI state:** Zustand stores (`session`, `hubData`, `matchHud`, `settings`); snapshot-derived HUD selectors throttled to 10 Hz except bars (per-frame from interpolated state via a ref bridge — no React re-render per frame).
- **Performance techniques:** instanced Minis (per team-palette batch), shared geometries/materials via asset manifest dedupe, texture atlas for VFX/UI-in-world, object pooling everywhere (zero steady-state GC in match: verified by perf test), draw-call budget ≤ 300, tri budget ≤ 500k, main-thread sim absent (worker owns it offline; online sim is remote).

## 8. Bot AI (`packages/sim/bots`)

Runs *inside the sim* (deterministic, seeded — replays include bots). Two layers:
1. **Utility scorer** (1 Hz decisions): evaluates goals — lane-push, poke, all-in, retreat, orb, event-rotate, siege, defend, shop-on-death, draft-pick — from weighted features (HP diff, Energy, wave state, event timer, threat map). Personality/tier multiply weights.
2. **Micro controller** (every tick): executes the active goal — pathing offsets by role range, target selection (focus-fire score), skillshot aiming with **modeled error** (aim noise σ and reaction latency per tier: Recruit 400 ms/high σ → Elite 180 ms/low σ), dodge rolls vs telegraphs (probability per tier), swap logic (Energy floor, counter-matchup table, Entrance value), ability sequencing from per-champion combo scripts in bot data.

Bots never read fogged state (same visibility query as players) and never get stat cheats at any tier — difficulty is competence, not numbers (GAME_DESIGN pillar: honest combat).

## 9. Platform services (`packages/api`)

Fastify, JSON over HTTPS, zod-validated DTOs, session cookie auth (httpOnly, SameSite=Lax; argon2id password hashing; guest accounts = deviceKey credential upgradeable in place, same user row).

**Postgres schema (Drizzle migrations):**
`users` (id, kind guest/registered, name, email?, auth, created) · `profiles` (userId, level, xp, coins, bannerId, showcase jsonb, settings jsonb) · `unlocks` (userId, kind champion/palette/sticker/pose, refId, at) · `mastery` (userId, championId, xp, level) · `quests` (userId, questId, progress, state, resetAt) · `matches` (id, mode, seed, startedAt, duration, result jsonb-summary) · `match_players` (matchId, userId?, botTier?, teamId, duo jsonb, stats jsonb, augments jsonb) · `transactions` (userId, delta, reason, refId, at — coins are ledgered, balance is derived+cached) · `friends` + `mmr` (v0.8).

**Endpoints (v0.7, shipped):** `/auth/*` (guest, register, login, logout) · `/profile` · `/champions` (catalog + ownership) · `/shop/purchase` (ledgered, idempotency-key) · `/quests/claim` · `/history` (+`/history/:matchId`) · `/play/ticket` (issues signed room ticket: userId, party, mode, entitlements snapshot — the game server trusts the ticket, not the client) · `/party/*` (create/join by code; long-poll/WS presence — **v0.8**; v0.3's lobby codes live on the game server and need no api). Also shipped in v0.7: `/auth/rename`, `/auth/logout-others`, `/auth/delete` (confirm-phrase), `/mastery/claim`, `/quests/reroll`, `/profile/{settings,showcase,banner}`.

**Storage note:** migrations are plain ordered `.sql` files applied on boot inside transactions and recorded in `_migrations` — a deploy script should be able to run them with nothing but Node, and an operator should be able to read exactly what is about to happen to their database. Drizzle is not used. Tests run against **PGlite** (Postgres compiled to WASM, in-process), so CHECK constraints, partial unique indexes and `SELECT … FOR UPDATE` behave in CI exactly as they do in production.

**Rate limits:** keyed **per session** where there is one, falling back to the client address for anonymous traffic. Keying on the address alone throttles a whole household, café or CGNAT range as if it were one player — measured at 87% 429s under the v0.7 load test before the fix. Game server → api: `POST /internal/match-result` (HMAC service auth) — single writer of match rows, quest progress, coin awards, mastery.

**Matchmaking (v0.8):** Redis-ticket queue, MMR-lite (Glicko-ish per-player, party-averaged, widening search bands 30 s → bot-backfill offer at 90 s). Until then, custom lobbies + vs-bots only (v0.3 ships lobby codes without any queue).

## 10. Security & anti-cheat

- Server-authoritative everything (§6); fog-of-war culled server-side (fogged enemies aren't in your snapshots — map-hack impossible by construction).
- Input plausibility: intent rate caps, speed/teleport validation, aim-position clamp to range+window.
- Tickets: short-lived signed (api-issued) for room join; internal HMAC between server/api; no client-writable economy path — coins/unlocks mutate only via api logic on server-reported results.
- Web basics: strict CSP, httpOnly cookies, CSRF token on mutating api routes, rate limits (Redis later, in-memory first), zod on every boundary, no PII beyond email; name profanity filter + report flow (v0.8).
- Determinism as audit: suspicious matches re-simulate from the intent log; impossible outcomes = flagged (post-1.0 automation).

## 11. Performance budgets (CI-checked where automatable)

| Surface | Budget |
|---|---|
| Client FPS | 60 fps on 2019 iGPU laptop (Iris Plus class) @1080p medium preset; 30 fps floor on low preset |
| Hub TTI | ≤ 2.5 s cold on 20 Mbps; match load ≤ 8 s cold, ≤ 3 s warm |
| Initial download | hub ≤ 8 MB; first match cold ≤ 25 MB (ASSET_CATALOG budgets) |
| Frame | render ≤ 12 ms p95 on target hw; zero per-frame allocations at steady state |
| Server | 1 room (8 players+bots) ≤ 20% of one core; 1 GB box runs 10+ concurrent matches |
| Bandwidth | ≤ 12 KB/s down per client p95; ≤ 2 KB/s up |
| Sim | full tick ≤ 4 ms p95 in worker on target hw (headroom for low-end) |

## 12. Testing strategy

- **Unit (Vitest):** sim systems (damage math, CC/DR, augment patches, pathing edge cases), data schema validation (every content file), protocol codec round-trips, api handlers (against testcontainer Postgres).
- **Determinism:** golden replays (seed+intents → state hash) across Node & headless Chromium per CI run; any hash drift fails the build.
- **Balance harness (`packages/tools/balance`):** headless bot-vs-bot batches (1000 seeded matches, parallel workers) emitting per-champion/augment/item winrates, match-length and gold-curve reports; regression gate per balance PR (GAME_DESIGN §20).
- **E2E (Playwright, pre-installed Chromium):** boot→hub→vs-bots match start smoke; lobby-code two-context join; settings persistence; reconnect flow (kill socket, assert bot takeover + rejoin).
- **Perf:** automated match-scene capture measuring fps/draw-calls/allocations against §11; bundle-size budget check in CI.
- **Load (from v0.3):** scripted 200-socket soak on staging (bot intents), assert tick stability + memory ceiling.

## 13. CI/CD & environments

GitHub Actions: `check` (Biome, tsc, dep-cruiser) → `test` (unit+determinism) → `build` (packages, client, asset pipeline) → `e2e` (Playwright) → on `main` tag: build Docker images (server, api) + upload client bundle. Environments: **dev** (local compose: postgres + api + server + vite), **staging** (VPS, auto-deploy on main, seeded bots soak), **prod** (tagged releases, manual promote, migrations via Drizzle on deploy with backup-first hook). Rollback = previous image tag + client bundle version pin (client/server exchange protocol version at join; mismatch → "update available" reload prompt).

## 14. Observability

pino structured logs (api+server) → Loki-compatible sink; metrics via prom-client (rooms, tick p95, snapshot bytes, ws churn, api latencies, queue depth) + Grafana dashboard; client error reporting via GlitchTip (Sentry-compatible, self-hosted) with breadcrumbs excluding PII; match analytics events (result summaries only) land in Postgres for the balance dashboards. Status page (simple uptime-kuma) linked from the boot screen footer.

## 15. Scaling path (documented now, executed when metrics demand)

Single VPS through beta → split game server from api/db (room ticket already carries region/host) → multiple game-server hosts behind a room-director (Colyseus presence over Redis) → regional pods (EU first — primary audience), CDN already global. Postgres vertical + read replica for history endpoints. The sharp edge to protect from day one: **rooms are stateless beyond the match** (all persistence flows through api), so game hosts are cattle.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Float nondeterminism across engines breaks replays/harness | trig LUTs, math discipline in `sim`, cross-env hash CI from v0.1 (catch drift immediately, not at v0.6) |
| Kenney/KayKit rig mismatch pains (retarget, node rigs) | rig-family templates + pipeline validation (ASSET_CATALOG §4); the one custom-rig job (astronaut) isolated to v0.4 |
| Colyseus schema/state fit for 30 Hz sim | we bypass Colyseus state sync for gameplay (own binary snapshots over its transport); Colyseus does rooms/lifecycle only — verified in v0.3 spike week 1 |
| Browser tab throttling (background tabs) breaks matches | worker-based timing + server authority online; offline worker keeps simulating; visibility-change banner + auto-pause only in solo training |
| Scope: 12 fully-animated champions is the long pole | rig-family templates + FxTimeline tooling make champion N marginal cost; roster gates per phase (2→6→8→10→12) with the quality bar enforced by pipeline validators |
| Solo-dev burnout on content (48 augments etc.) | augments are effect-graph patches (data, not code); catalog sizes are ROADMAP-phased and cuttable without touching feature completeness |

## 17. Open questions (tracked, non-blocking)

1. WebTransport/WebRTC-datachannel upgrade for lower jitter than WSS — evaluate post-v0.3 with real latency data (EU target < 60 ms RTT makes WSS likely fine).
2. WebGPU renderer flag once Three's WebGPU backend matures for our shader set (post-1.0).
3. Original music commission vs sourced score at 1.0 (budget decision, ART_DIRECTION §9 covers interim).
4. Localization pipeline (German first) — string tables are externalized from v0.1 (`packages/data/strings`), actual translation scheduled post-1.0.
