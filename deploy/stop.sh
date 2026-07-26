#!/usr/bin/env bash
#
# Stop the stack.
#
#   ./deploy/stop.sh            stop the containers, keep the data
#   ./deploy/stop.sh --destroy  ALSO delete the database volume
#
# The default keeps every volume, so starting again returns you to exactly the
# same accounts, coins and match history. `--destroy` is unrecoverable and asks
# you to type the word out.
#
set -euo pipefail
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

DESTROY=0
for arg in "$@"; do
  case "${arg}" in
  --destroy) DESTROY=1 ;;
  -h | --help)
    sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
    exit 0
    ;;
  *) die "Unknown option '${arg}'. Try --help." ;;
  esac
done

require_docker

if [[ "${DESTROY}" -eq 1 ]]; then
  step "Destroying the stack AND its data"
  warn "This deletes every account, coin balance, unlock and match ever played."
  warn "Take a backup first if you might want any of it: ./deploy/backup.sh"
  printf '  Type %sDESTROY%s to confirm: ' "${C_BOLD}" "${C_RESET}"
  read -r answer
  [[ "${answer}" == "DESTROY" ]] || die "Not confirmed — nothing was touched."
  compose down -v
  ok "Stack and volumes removed"
  exit 0
fi

step "Stopping Mini Clash"
compose down
ok "Stopped. Data volumes kept — ./deploy/start.sh brings it all back."
