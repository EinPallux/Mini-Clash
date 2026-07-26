#!/usr/bin/env bash
#
# Build and roll out Mini Clash.
#
#   ./deploy/deploy.sh                  build from the current working tree
#   ./deploy/deploy.sh --pull           git pull first, then build
#   ./deploy/deploy.sh --no-build       restart with the images already built
#   ./deploy/deploy.sh --behind-proxy   listen on 127.0.0.1:8090, not :80/:443
#   ./deploy/deploy.sh --skip-preflight skip the shared-box conflict check
#
# Everything runs under the `mini-clash` compose project, so no command here can
# reach another stack's containers, volumes, images or networks. Run
# ./deploy/preflight.sh first on a box that hosts anything else.
#
# The database is the one thing here that cannot be rebuilt, so this takes a
# dump before it touches anything and tells you where it put it. Migrations run
# themselves when the api boots — there is no separate step to forget.
#
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

readonly PROJECT=mini-clash

DO_PULL=0
DO_BUILD=1
BEHIND_PROXY=0
SKIP_PREFLIGHT=0
for arg in "$@"; do
  case "${arg}" in
  --pull) DO_PULL=1 ;;
  --no-build) DO_BUILD=0 ;;
  --behind-proxy) BEHIND_PROXY=1 ;;
  --skip-preflight) SKIP_PREFLIGHT=1 ;;
  -h | --help)
    sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
    exit 0
    ;;
  *) die "Unknown option '${arg}'. Try --help." ;;
  esac
done

require_docker
load_env "${REPO_ROOT}/.env"

# Behind another proxy, Mini Clash's Caddy listens on loopback and never binds
# :80/:443 — so two stacks can share the box instead of taking turns.
if [[ "${BEHIND_PROXY}" -eq 1 ]]; then
  export COMPOSE_OVERRIDE="${REPO_ROOT}/compose.behind-proxy.yaml"
  step "Behind-proxy mode"
  ok "Caddy will listen on 127.0.0.1:${EDGE_PORT:-8090} only"
  info "Point your existing proxy there for ${DOMAIN:-your domain}."
  info "The nginx/Caddy snippet is at the top of compose.behind-proxy.yaml."
fi

# A shared box is the normal case, not the exception. Look before touching it.
#
# Preflight is told which mode it is checking for. Behind a proxy Mini Clash
# never asks for :80/:443, so a conflict there is somebody else's business and
# not a reason to stop — checking for it anyway would block the one flag that
# exists to resolve it.
if [[ "${SKIP_PREFLIGHT}" -eq 0 ]]; then
  if ! MC_BEHIND_PROXY="${BEHIND_PROXY}" "${REPO_ROOT}/deploy/preflight.sh"; then
    die "Preflight found a conflict. Read the advice above, then re-run.
     If you have already handled it: ./deploy/deploy.sh --skip-preflight"
  fi
fi

step "Configuration"
if [[ "${DOMAIN:-:80}" == ":80" ]]; then
  warn "DOMAIN is unset — serving plain HTTP on port 80, no certificate."
  warn "Set DOMAIN=your.domain in .env once its DNS record points here."
else
  ok "Domain: ${DOMAIN}"
  # Caddy will fail its ACME challenge if the record does not resolve here yet,
  # and the failure is much easier to read now than in the logs later.
  if have_cmd getent; then
    resolved="$(getent ahostsv4 "${DOMAIN}" 2>/dev/null | awk 'NR==1 {print $1}')"
    public="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
    if [[ -n "${resolved}" && -n "${public}" && "${resolved}" != "${public}" ]]; then
      warn "${DOMAIN} resolves to ${resolved}, but this box looks like ${public}."
      warn "Let's Encrypt will not be able to issue a certificate until that matches."
    elif [[ -z "${resolved}" ]]; then
      warn "${DOMAIN} does not resolve yet — the certificate will fail until it does."
    else
      ok "DNS points here (${resolved})"
    fi
  fi
fi

if [[ "${DO_PULL}" -eq 1 ]]; then
  step "Pulling the latest code"
  git -C "${REPO_ROOT}" pull --ff-only
  ok "Now at $(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
fi

# ---------------------------------------------------------------------------
# Back up first. Coins, unlocks and match history live in Postgres and are the
# only state on this box that a rebuild cannot recreate.
# ---------------------------------------------------------------------------
step "Backing up the database"
if compose ps --status running --services 2>/dev/null | grep -qx db; then
  "${REPO_ROOT}/deploy/backup.sh" || die "Backup failed — refusing to deploy over live data."
else
  info "The database is not running yet (first deploy) — nothing to back up."
fi

if [[ "${DO_BUILD}" -eq 1 ]]; then
  step "Building images"
  # A dependency that resolves over git needs an SSH key the build image will
  # never have, and that failure surfaces minutes in as a missing binary rather
  # than as the package that wanted it. One second here instead, on any box that
  # happens to have node — the build itself does not need one.
  if have_cmd node && [[ -f "${REPO_ROOT}/scripts/check-lockfile.mjs" ]]; then
    node "${REPO_ROOT}/scripts/check-lockfile.mjs" >/dev/null ||
      die "The lockfile resolves a package over git, which this image cannot install.
     For the details: node scripts/check-lockfile.mjs"
  fi
  info "This runs the asset pipeline and three bundles; the first one takes a while."
  compose build
  ok "Images built"
fi

step "Starting the stack"
compose up -d --remove-orphans
ok "Containers up"

step "Waiting for services"
# The api applies its own migrations on boot, so a healthy /healthz means the
# schema is current — there is no second thing to run and no window in which
# the game server can post a result the database cannot store.
wait_for_http "api" api http://127.0.0.1:3000/healthz 90 ||
  die "The api never became healthy. Check: ./deploy/logs.sh api"
wait_for_http "game server" game http://127.0.0.1:2567/healthz 60 ||
  die "The game server never became healthy. Check: ./deploy/logs.sh game"

step "Checking the edge"
if [[ "${BEHIND_PROXY}" -eq 1 ]]; then
  edge_url="http://127.0.0.1:${EDGE_PORT:-8090}/api/healthz"
else
  edge_url="http://127.0.0.1:${HTTP_PORT:-80}/api/healthz"
fi
if curl -fsS --max-time 10 "${edge_url}" >/dev/null 2>&1; then
  ok "Caddy is routing /api to the api (${edge_url})"
elif [[ "${BEHIND_PROXY}" -eq 1 ]]; then
  warn "Caddy did not answer on ${edge_url}. Check: ./deploy/logs.sh web"
else
  warn "Caddy did not answer on ${edge_url} yet."
  warn "On a fresh domain it is still getting a certificate; give it a minute."
fi

step "Reclaiming space"
# Scoped with a filter, NOT `docker image prune -f`. That prunes every dangling
# image on the daemon, which on a shared box means somebody else's build layers
# — and if their build is mid-flight, the layers it is standing on. Compose
# labels every image it builds with the project, so we can be precise.
reclaimed="$(docker image prune -f --filter "label=com.docker.compose.project=${PROJECT}" 2>/dev/null |
  tail -1)"
ok "${reclaimed:-nothing to reclaim} (Mini Clash images only)"
info "Other projects' images, volumes and build cache are untouched."

echo
ok "Deployed $(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'working tree')"
echo
if [[ "${BEHIND_PROXY}" -eq 1 ]]; then
  echo "  Serving:   http://127.0.0.1:${EDGE_PORT:-8090}  ← point your proxy here"
  echo "  Play at:   https://${DOMAIN:-your-domain}/  (once the proxy is routing)"
elif [[ "${DOMAIN:-:80}" == ":80" ]]; then
  echo "  Play at:   http://$(hostname -I | awk '{print $1}')/"
else
  echo "  Play at:   https://${DOMAIN}/"
fi
echo "  Status:    ./deploy/status.sh"
echo "  Logs:      ./deploy/logs.sh [api|game|web|db]"
