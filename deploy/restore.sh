#!/usr/bin/env bash
#
# Restore the database from a dump.
#
#   ./deploy/restore.sh backups/miniclash-20260726T041500Z.sql.gz
#
# This REPLACES everything currently in the database. It stops the api and the
# game server first so nothing writes mid-restore, takes a safety dump of what
# is about to be replaced, and only then loads the file.
#
set -euo pipefail
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

readonly DUMP="${1:-}"
[[ -n "${DUMP}" ]] || die "Usage: ./deploy/restore.sh <dump.sql.gz>"
[[ -f "${DUMP}" ]] || die "No such file: ${DUMP}"

require_docker
load_env "${REPO_ROOT}/.env"

step "About to restore ${DUMP}"
warn "Every account, coin balance and match currently in the database will be"
warn "replaced by whatever is in that file."
printf '  Type %sRESTORE%s to confirm: ' "${C_BOLD}" "${C_RESET}"
read -r answer
[[ "${answer}" == "RESTORE" ]] || die "Not confirmed — nothing was touched."

step "Stopping the writers"
compose stop api game >/dev/null
ok "api and game server stopped"

step "Taking a safety dump of the current data"
if compose ps --status running --services | grep -qx db; then
  "${REPO_ROOT}/deploy/backup.sh" "${REPO_ROOT}/backups/pre-restore" ||
    warn "Could not take a safety dump — continuing at your request."
else
  compose up -d db >/dev/null
  sleep 5
fi

step "Loading the dump"
if gzip -dc "${DUMP}" | compose exec -T db psql -U mc -d miniclash -v ON_ERROR_STOP=1 >/dev/null; then
  ok "Restored"
else
  compose start api game >/dev/null
  die "The restore failed. The safety dump in backups/pre-restore/ still has your
     previous data, and the services have been started again."
fi

step "Starting the writers"
compose start api game >/dev/null
wait_for_http "api" api http://127.0.0.1:3000/healthz 60 ||
  warn "The api has not come back yet. Check: ./deploy/logs.sh api"

ok "Restore complete."
