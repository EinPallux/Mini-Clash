#!/usr/bin/env bash
#
# Build and roll out Mini Clash.
#
#   ./deploy/deploy.sh              build from the current working tree
#   ./deploy/deploy.sh --pull       git pull first, then build
#   ./deploy/deploy.sh --no-build   restart with the images already built
#
# The database is the one thing here that cannot be rebuilt, so this takes a
# dump before it touches anything and tells you where it put it. Migrations run
# themselves when the api boots — there is no separate step to forget.
#
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

DO_PULL=0
DO_BUILD=1
for arg in "$@"; do
  case "${arg}" in
  --pull) DO_PULL=1 ;;
  --no-build) DO_BUILD=0 ;;
  -h | --help)
    sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
    exit 0
    ;;
  *) die "Unknown option '${arg}'. Try --help." ;;
  esac
done

require_docker
load_env "${REPO_ROOT}/.env"

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
edge_url="http://127.0.0.1/api/healthz"
if curl -fsS --max-time 10 "${edge_url}" >/dev/null 2>&1; then
  ok "Caddy is routing /api to the api"
else
  warn "Caddy did not answer on ${edge_url} yet."
  warn "On a fresh domain it is still getting a certificate; give it a minute."
fi

step "Pruning old build layers"
docker image prune -f >/dev/null
ok "Reclaimed dangling layers"

echo
ok "Deployed $(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'working tree')"
echo
if [[ "${DOMAIN:-:80}" == ":80" ]]; then
  echo "  Play at:   http://$(hostname -I | awk '{print $1}')/"
else
  echo "  Play at:   https://${DOMAIN}/"
fi
echo "  Status:    ./deploy/status.sh"
echo "  Logs:      ./deploy/logs.sh [api|game|web|db]"
