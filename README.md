# ⚔️ Mini Clash

**A browser-native 4v4 tag-team MOBA.** Classic ARAM combat — minions, towers, skillshots, teamfights — reimagined with chunky, toy-like 3D visuals and three signature systems that make every match play out differently:

1. **Tag Team** — every player is dealt a random *duo* of champions and hot-swaps between them mid-fight.
2. **Power Surge** — at levels 3, 6 and 9, every player drafts an Augment that visibly mutates their abilities.
3. **The Living Bridge** — the map itself is an actor: flank platforms rise, storms roll in, a war golem spawns, and in overtime the bridge collapses toward the center.

No install, no launcher. Open a link, invite three friends (bots fill the rest), and clash.

> **Status: 📐 Planning phase.** This repository currently contains the complete design & technical documentation plus the CC0 3D asset library. No game code exists yet — implementation begins with Roadmap Phase v0.1.

---

## Build & deploy

The playable game is a static site, but it is **not** just `vite build`: the asset
pipeline must run first to generate `packages/client/public/game-assets/`
(optimized models + `manifest.json`, gitignored). The client build fails fast with
a clear error if that step was skipped.

```bash
pnpm install
pnpm build        # asset pipeline + production client build → packages/client/dist
```

**Vercel** (or any host): a `vercel.json` exists at the repo root *and* in
`packages/client`, so both Root Directory configurations work — install
`pnpm install --frozen-lockfile`, build `pnpm build`, output the client `dist`.
The client's own `build` script runs the asset pipeline first (`pnpm -w
assets:build`), so there is no host configuration that can skip it. The
pipeline launches through esbuild (`run.mjs`), making it independent of the
host's Node TypeScript support; any Node ≥20 works. Static hosting covers
offline/vs-bots play only — online needs the game server below.

### Online stack (one VPS, Docker Compose)

```bash
DOMAIN=play.example.com docker compose up -d --build
```

Three services (see `compose.yaml`): **game** — the Colyseus server as a single
self-contained bundle (`packages/server/build.mjs`); **web** — Caddy with
automatic HTTPS serving the built client and reverse-proxying everything under
`/ws` (websockets, Colyseus matchmake calls, lobby-code lookups) to the game;
**status** — an uptime-kuma status page on `:3001` (point a monitor at
`http://game:2567/healthz`). Leave `DOMAIN` unset for a plain-HTTP local run
on `:80`. Staging is the same file on a second box with its own `DOMAIN`.

Observability (TECH §14): the game server writes pino JSON logs to stdout
(`docker compose logs game`) and exposes Prometheus metrics at
`game:2567/metrics` inside the compose network — rooms, clients, tick-duration
histogram, snapshot bytes, join/leave churn. The 200-socket soak
(`MC_SOAK=1 pnpm exec vitest run packages/server/test/soak.test.ts`) asserts
the TECH §11 budgets against those same series.

Dev server without containers: `node packages/server/run.mjs` (port 2567), then
open the client with `?online=1`.

## Documentation index

| Document | What it covers |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Release phases v0.1 → v1.0, each shipping complete features, with acceptance criteria |
| [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) | Stack, monorepo layout, deterministic simulation, netcode, backend, deployment |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | The GDD: core loop, match rules, map spec, combat math, items, signature systems |
| [docs/CHAMPIONS.md](docs/CHAMPIONS.md) | Full launch roster (12 champions): kits, numbers, asset & animation specs |
| [docs/AUGMENTS.md](docs/AUGMENTS.md) | Power Surge system rules + the generic Augment catalog |
| [docs/UI_UX.md](docs/UI_UX.md) | Every screen: Hub, lobby, champion select, HUD, death screen, end-of-match |
| [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) | Visual style guide, camera, lighting, VFX language, audio direction |
| [docs/ASSET_CATALOG.md](docs/ASSET_CATALOG.md) | Inventory of the `assets/` library, licenses, gaps, and sourcing plan |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) | Working agreements for AI-assisted development |

## The pitch

League of Legends' ARAM mode is the most replayed casual MOBA format ever — but it lives inside a 30GB client and a 15-year-old meta. Mini Clash keeps the part everyone loves (one lane, constant teamfights, random champions, no macro homework) and rebuilds it as a **60-second-to-first-match browser game** with the visual charm of mo.co / Brawl Stars / Squad Busters, then layers on tag-team duos, mid-match ability drafting, and a dynamic map so that no two matches — even with the same champions — ever feel the same.

- **Mode (v1):** Bridge Brawl — 4v4 ARAM on the Shatterbridge
- **Match length:** 12–16 minutes, hard-capped by the Bridge Collapse overtime
- **Play with:** friends via lobby code, bots (3 difficulty tiers), or public matchmaking
- **Meta game:** Hub with champion unlocks (earn-only economy), shop, quests, mastery, match history
- **Tech:** TypeScript everywhere — Three.js client, shared deterministic simulation, authoritative Node.js server, React UI

## Assets & licensing

All bundled 3D assets are **CC0** (Kenney.nl, KayKit / Kay Lousberg). Additional assets are sourced exclusively under CC0 or commercially-safe licenses per the rules in [docs/ASSET_CATALOG.md](docs/ASSET_CATALOG.md). Mini Clash is an original work and is not affiliated with Riot Games or Supercell.
