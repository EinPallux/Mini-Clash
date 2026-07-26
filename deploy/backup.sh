#!/usr/bin/env bash
#
# Dump the database.
#
#   ./deploy/backup.sh                  → backups/miniclash-<utc-stamp>.sql.gz
#   ./deploy/backup.sh /mnt/vol/dumps   → somewhere else
#
# Runs `pg_dump` inside the db container, so it needs nothing installed on the
# host and always matches the server's own version. Keeps the newest 14 and
# deletes the rest — an unbounded backup directory quietly fills the disk, and
# a full disk takes the game down with it.
#
# Cron it (as the user who owns the checkout):
#   15 4 * * * cd /srv/mini-clash && ./deploy/backup.sh >> /var/log/mc-backup.log 2>&1
#
set -euo pipefail
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

readonly KEEP=14
readonly OUT_DIR="${1:-${REPO_ROOT}/backups}"

require_docker
load_env "${REPO_ROOT}/.env"

compose ps --status running --services 2>/dev/null | grep -qx db ||
  die "The database container is not running. Start it: ./deploy/start.sh"

mkdir -p "${OUT_DIR}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${OUT_DIR}/miniclash-${stamp}.sql.gz"

step "Dumping to ${target}"
# Write to a .part first: a backup interrupted half-way must not be mistaken for
# a good one by the restore script or by a human in a hurry.
if compose exec -T db pg_dump -U mc -d miniclash --clean --if-exists |
  gzip -9 >"${target}.part"; then
  mv "${target}.part" "${target}"
else
  rm -f "${target}.part"
  die "pg_dump failed — no backup written."
fi

size="$(du -h "${target}" | cut -f1)"
# A dump with no COPY or INSERT lines means an empty (or failed) export.
if ! gzip -dc "${target}" | grep -qE '^(COPY|INSERT|CREATE TABLE)'; then
  die "The dump at ${target} has no schema or data in it. Not trusting that."
fi
ok "Wrote ${size}"

step "Pruning old backups"
mapfile -t old < <(ls -1t "${OUT_DIR}"/miniclash-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)))
if [[ "${#old[@]}" -gt 0 ]]; then
  for f in "${old[@]}"; do
    rm -f "${f}"
    info "removed $(basename "${f}")"
  done
else
  info "Nothing to prune (keeping the newest ${KEEP})"
fi

ok "Backup complete: ${target}"
