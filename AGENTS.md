# AGENTS.md

Instructions for any AI coding agent working in this repository. The extended version with rationale is [CLAUDE.md](CLAUDE.md); if the two disagree, CLAUDE.md wins.

## Project

Mini Clash — browser 4v4 tag-team ARAM MOBA. TypeScript monorepo (pnpm): Three.js client + React UI, deterministic shared sim package, authoritative Colyseus/Node game server, Fastify + Postgres platform API. Status: **planning done, no code yet**; next milestone is `v0.1` in [ROADMAP.md](ROADMAP.md).

## Read before you build

Design and architecture are already decided. Implement from these documents; do not improvise against them. If implementation forces a change, update the doc in the same change set.

- Build order & per-phase acceptance criteria → `ROADMAP.md`
- Game rules, map, combat math, items → `docs/GAME_DESIGN.md`
- Champion kits & animation specs → `docs/CHAMPIONS.md`
- Augment catalog → `docs/AUGMENTS.md`
- Screens & HUD → `docs/UI_UX.md`
- Visual/audio style, VFX language → `docs/ART_DIRECTION.md`
- Asset files & licenses (what you may use) → `docs/ASSET_CATALOG.md`
- Stack, package boundaries, netcode, schemas, budgets → `TECHNICAL_ARCHITECTURE.md`

## Hard rules

1. **No placeholders.** Every phase ships finished, polished, tested features — complete states, real VFX/SFX, performance budgets met. Cut content scope, never quality.
2. **Deterministic sim.** `packages/sim` has zero deps; no DOM/Three/Node imports, no `Date.now`, no `Math.random` — seeded PRNG and tick counts only. Same code runs in Web Worker (offline) and server (online).
3. **Server is authoritative.** Clients send intents; the server validates cooldowns, range, resources, movement speed.
4. **Content is data.** Champions/items/augments/events are definitions in `packages/data`; engine code stays generic. No hard-coded champion numbers.
5. **Licensing.** Use only assets recorded in `docs/ASSET_CATALOG.md` (CC0 or verified commercial-safe, source URL noted). Update the catalog and `CREDITS.md` when sourcing anything new.
6. **TypeScript strict**, no `any`; Biome for lint/format; unit tests for sim logic; CI green before push.
7. **Docs stay true.** Balance/design changes land in the docs and CHANGELOG.md alongside the code.

## Commands

- `pnpm install` — install workspace deps (Node 22+, pnpm 10)
- `pnpm assets:build` — run the asset pipeline (required before first dev/build; output is gitignored)
- `pnpm dev` — Vite dev server for the client
- `pnpm build` — asset pipeline + production client build
- `pnpm test` — Vitest (sim units, content validation, determinism)
- `pnpm lint` / `pnpm lint:fix` — Biome
- `pnpm typecheck` — per-package `tsc --noEmit`
- `pnpm boundaries` — package dependency-rule check
- `node scripts/smoke.mjs` — headless-Chromium visual smoke (builds must exist; screenshots to `test-results/smoke/`)

## Git

Feature branches only; imperative scoped commit messages (`sim: …`, `client: …`, `docs: …`); `git push -u origin <branch>`; never push `main`. One roadmap phase at a time — finish its acceptance checklist before starting the next.
