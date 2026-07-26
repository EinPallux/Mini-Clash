#!/usr/bin/env bash
#
# Start the stack with the images already built.
#
#   ./deploy/start.sh
#
# For a code change you want live, use deploy.sh — this only brings up what is
# already there, which is what you want after a reboot or a stop.
#
set -euo pipefail
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

require_docker
load_env "${REPO_ROOT}/.env"

step "Starting Mini Clash"
compose up -d
ok "Containers up"

step "Waiting for services"
wait_for_http "api" api http://127.0.0.1:3000/healthz 60 ||
  die "The api never became healthy. Check: ./deploy/logs.sh api"
wait_for_http "game server" game http://127.0.0.1:2567/healthz 60 ||
  die "The game server never became healthy. Check: ./deploy/logs.sh game"

echo
ok "Running. ./deploy/status.sh for detail."
