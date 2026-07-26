#!/usr/bin/env bash
#
# Follow the logs.
#
#   ./deploy/logs.sh              everything, following
#   ./deploy/logs.sh api          just the api
#   ./deploy/logs.sh game 200     the game server's last 200 lines
#
# The api and game server write pino JSON. Pipe through `jq` if you have it:
#   ./deploy/logs.sh api | jq -r '"\(.time) \(.level) \(.msg)"'
#
set -euo pipefail
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

require_docker
service="${1:-}"
tail_lines="${2:-100}"

if [[ -n "${service}" ]]; then
  case "${service}" in
  api | game | web | db | status) ;;
  *) die "Unknown service '${service}'. One of: api game web db status" ;;
  esac
  exec docker compose --project-directory "${REPO_ROOT}" -f "${REPO_ROOT}/compose.yaml" \
    logs -f --tail "${tail_lines}" "${service}"
fi
exec docker compose --project-directory "${REPO_ROOT}" -f "${REPO_ROOT}/compose.yaml" \
  logs -f --tail "${tail_lines}"
