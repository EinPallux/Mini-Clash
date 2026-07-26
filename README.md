# ⚔️ Mini Clash

**A browser-native 4v4 tag-team MOBA.** Classic ARAM combat — minions, towers, skillshots, teamfights — reimagined with chunky, toy-like 3D visuals and three signature systems that make every match play out differently:

1. **Tag Team** — every player is dealt a random *duo* of champions and hot-swaps between them mid-fight.
2. **Power Surge** — at levels 3, 6 and 9, every player drafts an Augment that visibly mutates their abilities.
3. **The Living Bridge** — the map itself is an actor: flank platforms rise, storms roll in, a war golem spawns, and in overtime the bridge collapses toward the center.

No install, no launcher. Open a link, invite three friends (bots fill the rest), and clash.

> **Status: 🎮 v0.7 “The Hub”.** The game plays end to end: Training Grounds, 4v4
> Bridge Brawl against bots, authoritative online play with custom lobbies and
> reconnect, the Tag Team duo system, the Power Surge augment draft, the Living
> Bridge event system — and now accounts, the Clash Coin economy, unlocks,
> quests, mastery and server-side match history. Roster: 10 champions.
> Next up is `v0.8` in [ROADMAP.md](ROADMAP.md).

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
offline/vs-bots play only, with no account and no rewards — online play, coins,
unlocks, quests and match history all need the stack below.

### Online stack (one VPS, Ubuntu 24.04 LTS)

Everything runs on one box under Docker Compose. **[DEPLOY.md](DEPLOY.md) is the
runbook** — including how to share a box that already hosts something else. The
short version, from a fresh Ubuntu 24.04 server:

```bash
git clone <this repo> /srv/mini-clash && cd /srv/mini-clash
sudo ./deploy/setup.sh      # Docker, firewall, and a .env with fresh secrets
./deploy/preflight.sh       # what else is here, and what would collide
./deploy/deploy.sh          # build, migrate, roll out, verify
```

**Sharing the box.** Everything runs under the `mini-clash` compose project, so
no command in `deploy/` can reach another stack's containers, volumes, images or
networks — there is no `docker system prune`, no volume prune, and the image
prune is filtered to this project's own layers. `preflight.sh` reports port
conflicts before anything starts, `setup.sh` only ever *adds* firewall rules and
refuses to enable ufw while that would cut off a listening port, and
`deploy.sh --behind-proxy` puts Mini Clash on `127.0.0.1:8090` so it can run
**alongside** whatever already owns `:80`. `selftest.sh` checks all of that
mechanically.

| Script | What it does |
|---|---|
| `deploy/setup.sh` | One-time host prep: Docker Engine from Docker's own apt repo (and it refuses to replace a *working* Docker that would restart your other containers), additive `ufw` rules only, a swap warning on small boxes, and a `.env` with generated secrets. Idempotent; never overwrites an existing `.env`. |
| `deploy/preflight.sh` | **Reads only.** Other compose projects, port conflicts and who holds them, firewall state, RAM/swap/disk, and whether your DNS points here. `deploy.sh` will not run until it passes. |
| `deploy/deploy.sh` | Backs up the database, builds, starts, waits for both health endpoints, checks the edge. `--pull`, `--no-build`, `--behind-proxy` (listen on `127.0.0.1:8090` instead of `:80/:443`). |
| `deploy/start.sh` / `stop.sh` | Bring the stack up or down. `stop.sh --destroy` also deletes the database volume, and makes you type the word. |
| `deploy/status.sh` | Containers, health, account/match counts, **and a ledger reconciliation** — the same invariant the api's tests assert, run against live data. |
| `deploy/logs.sh [service] [lines]` | Follow the logs. The api and game server write pino JSON; pipe through `jq`. |
| `deploy/backup.sh [dir]` | `pg_dump` inside the container, gzipped, newest 14 kept. Verifies the dump is not empty before trusting it. Cron-friendly. |
| `deploy/restore.sh <dump>` | Stops the writers, takes a safety dump of what it is about to replace, then loads the file. |
| `deploy/selftest.sh` | 66 checks over the scripts themselves — argument handling, config guards, secret generation, compose validity, and the shared-box invariants (project pinned, no unscoped prune, loopback-only status page, live port-detection probe). Touches nothing; safe on a live box. |

Five services (see `compose.yaml`): **api** — accounts, the coin ledger,
unlocks, quests and match history (Fastify + Postgres, migrations applied on
boot); **db** — Postgres 17 on a named volume; **game** — the Colyseus server as
a single self-contained bundle; **web** — Caddy with automatic HTTPS serving the
built client, proxying `/ws` to the game and `/api` to the api **on the same
origin**, which is what keeps the session cookie first-party and means there is
no CORS configuration to get wrong; **status** — an uptime-kuma page on `:3001`
(firewalled; reach it over an SSH tunnel).

Two secrets live in `.env` and neither is recoverable — keep a copy:
`POSTGRES_PASSWORD`, and `MC_INTERNAL_SECRET`, which signs the link between the
game server and the api. Without a valid one the api **refuses** to record
matches rather than accepting unsigned ones, so a misconfigured deploy pays
nobody instead of letting anybody post fabricated results.

Set `DOMAIN` to `:80` for a plain-HTTP local or IP-only trial. Staging is the
same repo on a second box with its own `DOMAIN`.

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
| [DEPLOY.md](DEPLOY.md) | VPS runbook: first deploy, day-to-day operation, backups, and sharing a box with other services |
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
