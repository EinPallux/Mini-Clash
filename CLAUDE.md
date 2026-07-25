# CLAUDE.md — Working agreement for AI-assisted development

This file governs how Claude (and any AI agent) works in this repository. Read it fully before making changes. `AGENTS.md` contains the same rules in tool-agnostic form; if they ever disagree, **this file wins**.

## What this project is

**Mini Clash** — a browser-native 4v4 tag-team ARAM MOBA. TypeScript monorepo: Three.js client, deterministic shared simulation, authoritative Colyseus/Node server, React UI overlay, Fastify + Postgres platform backend. Chunky CC0 low-poly art (Kenney / KayKit) with a mo.co / Brawl Stars-style presentation.

**Current status:** v0.1–v0.4 implemented. The game plays end-to-end: Training Grounds, a full 4v4 Bridge Brawl vs bots, authoritative online play with custom lobbies and reconnect, and the Tag Team duo system (deal, swap, entrances) across every surface. Roster: 8 champions. The next milestone is `v0.5 "Power Surge"` (the augment draft) in [ROADMAP.md](ROADMAP.md) — check the phase's acceptance checklist there for what's still open in earlier phases (a few items are parked on the nightly sweep or need real hardware/humans).

## Source-of-truth map

Never invent design or architecture that contradicts these documents. If a change requires deviating, **update the document in the same PR** and say so in the description.

| Question | Authority |
|---|---|
| What do we build next? In what order? | [ROADMAP.md](ROADMAP.md) |
| How does the game play? Rules, numbers, map, items | [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) |
| Champion kits, stats, animations | [docs/CHAMPIONS.md](docs/CHAMPIONS.md) |
| Augment system & catalog | [docs/AUGMENTS.md](docs/AUGMENTS.md) |
| Screens, HUD, flows | [docs/UI_UX.md](docs/UI_UX.md) |
| Look, camera, VFX, audio | [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) |
| Which asset/file/license to use | [docs/ASSET_CATALOG.md](docs/ASSET_CATALOG.md) |
| Stack, packages, netcode, data schemas, deployment | [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) |

## The quality bar (non-negotiable)

Every roadmap phase ships **at least one fully working, polished feature** — never an MVP, skeleton, or prototype. Concretely, a feature is "done" only when:

1. **Complete:** all states handled (loading, empty, error, disconnect/reconnect, edge cases), not just the happy path.
2. **Polished:** final-quality visuals per ART_DIRECTION (real VFX, animations, transitions — no programmer art, no `TODO: juice`), plus sound effects for every player-facing interaction that exists at that phase.
3. **Performant:** meets the budgets in TECHNICAL_ARCHITECTURE §Performance (60 fps on a 2019 iGPU laptop, load-time budgets).
4. **Tested:** simulation logic has unit tests; determinism-sensitive code has replay/golden tests; the phase's acceptance checklist in ROADMAP.md passes.
5. **Documented:** CHANGELOG.md entry written; any design deltas back-ported into the docs above.

If a phase can't hit the bar in full, cut *scope* (fewer champions, fewer augments), never *quality*. Content quantity is negotiable; feature completeness is not.

## Engineering rules

- **Language:** TypeScript, `strict: true`, no `any` (use `unknown` + narrowing). Node 22+, pnpm workspaces. Lint/format with Biome; CI must pass lint + typecheck + tests.
- **Simulation purity:** `packages/sim` is deterministic and dependency-free. It must never import Three.js, DOM, Node APIs, `Date.now`, `Math.random`, or `performance.*`. All randomness flows from the match seed through the provided PRNG; all time is tick counts. The same sim runs in a Web Worker (offline vs bots) and on the server (online) — breaking determinism breaks replays, reconnects and bot parity.
- **Server authority:** clients send *intents* (move, cast, swap, buy, draft). The server validates everything (cooldowns, range, resources, timers). Never trust client-reported positions or outcomes.
- **Data-driven content:** champions, abilities, items, augments, and map events are data definitions in `packages/data` + generic systems in `packages/sim`/client. Never hard-code a champion's numbers inside engine code.
- **Rendering/UI split:** gameplay world renders in Three.js (including in-world health bars); menus/HUD are a React DOM overlay. No game logic in React components; UI reads state via the client store.
- **Assets:** only files listed in docs/ASSET_CATALOG.md (or newly added there, license verified CC0/commercial-safe, with source URL). Raw packs in `assets/` are *source*; the game loads only pipeline-optimized output. Never commit assets with unclear licensing. Keep `CREDITS.md` current when adding sourced packs.

## Git & workflow

- Work on the designated feature branch for your session; never push to `main` directly.
- Commits: imperative, scoped, e.g. `sim: add projectile collision sweep`, `docs: rebalance Fathom R`. Push with `git push -u origin <branch>`.
- One phase = one release. Finish the phase's acceptance checklist before starting the next phase. Within a phase, keep the branch shippable — features land complete, not half-wired.
- Balance tweaks are data changes: adjust `packages/data`, note them in CHANGELOG under "Balance", and mirror the new numbers into docs/CHAMPIONS.md (champion numbers live in both; the data package is authoritative once it exists).

## Things AI agents get wrong here — checklist

- ❌ Adding a "temporary" placeholder cube/beep and moving on → violates the quality bar. Source or build the real asset first (ASSET_CATALOG lists approved sources).
- ❌ Putting game rules in the client or in React → rules live in `packages/sim`, driven by `packages/data`.
- ❌ Using wall-clock time or unseeded RNG anywhere inside simulation or bot decision code.
- ❌ Designing new champions/augments ad-hoc in code → design in docs first, then implement from the doc.
- ❌ Starting the next roadmap phase early "because it's small" → phases are sequential; finish the checklist.
- ❌ Shipping a UI screen without its empty/error/loading states, keyboard focus handling, and settings-menu reachability.
