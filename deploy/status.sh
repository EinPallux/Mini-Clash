#!/usr/bin/env bash
#
# What is running, and is it healthy?
#
#   ./deploy/status.sh
#
set -euo pipefail
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

require_docker
load_env "${REPO_ROOT}/.env"

step "Containers"
compose ps

step "Health"
probe() {
  local label="$1" service="$2" url="$3"
  if compose exec -T "${service}" node -e "
    fetch(process.argv[1]).then(async r => {
      if (!r.ok) process.exit(1);
      process.stdout.write(await r.text());
    }).catch(() => process.exit(1))
  " "${url}" 2>/dev/null; then
    printf '\n'
    ok "${label}"
  else
    warn "${label} is not answering"
  fi
}
probe "api" api http://127.0.0.1:3000/healthz
probe "game server" game http://127.0.0.1:2567/healthz

if compose exec -T db pg_isready -U mc -d miniclash >/dev/null 2>&1; then
  ok "database accepting connections"
else
  warn "database is not accepting connections"
fi

step "Accounts and economy"
# Read-only; safe to run against a live box. The ledger check is the same
# invariant the api's tests assert — the cached balance must equal the sum of
# the transactions behind it.
compose exec -T db psql -U mc -d miniclash -tAF' ' -c "
  select
    (select count(*) from users),
    (select count(*) from users where kind = 'registered'),
    (select count(*) from matches),
    (select coalesce(sum(coins), 0) from profiles)
" 2>/dev/null | while read -r users registered matches coins; do
  info "accounts: ${users} (${registered} with an email)"
  info "matches recorded: ${matches}"
  info "coins in circulation: ${coins}"
done || warn "Could not read the database"

drift="$(compose exec -T db psql -U mc -d miniclash -tA -c "
  select count(*) from (
    select p.user_id from profiles p
    left join transactions t on t.user_id = p.user_id
    group by p.user_id, p.coins
    having p.coins <> coalesce(sum(t.delta), 0)
  ) drifted
" 2>/dev/null | tr -d '[:space:]')"
if [[ "${drift}" == "0" ]]; then
  ok "ledger reconciles — every balance equals the sum of its transactions"
elif [[ -n "${drift}" ]]; then
  warn "${drift} account(s) have a balance that disagrees with their ledger"
fi

step "Disk"
docker system df

step "Backups"
if compgen -G "${REPO_ROOT}/backups/*.sql.gz" >/dev/null; then
  ls -lh "${REPO_ROOT}"/backups/*.sql.gz | tail -5 | while read -r line; do info "${line}"; done
else
  warn "No backups yet. Run ./deploy/backup.sh, and see the README for a cron line."
fi
