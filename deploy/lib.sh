#!/usr/bin/env bash
#
# Shared helpers for the deployment scripts.
#
# Sourced, never executed. Everything here is deliberately small: a deploy
# script that fails is read by somebody at 2am, so the output has to say what
# happened and what to do about it, in that order.
#

# Colours only when stdout is a terminal — a piped log or a CI transcript should
# not be full of escape codes.
if [[ -t 1 ]]; then
  readonly C_RESET=$'\033[0m'
  readonly C_BOLD=$'\033[1m'
  readonly C_DIM=$'\033[2m'
  readonly C_GREEN=$'\033[32m'
  readonly C_YELLOW=$'\033[33m'
  readonly C_RED=$'\033[31m'
  readonly C_BLUE=$'\033[34m'
else
  readonly C_RESET='' C_BOLD='' C_DIM='' C_GREEN='' C_YELLOW='' C_RED='' C_BLUE=''
fi

step() { printf '\n%s==>%s %s%s%s\n' "${C_BLUE}" "${C_RESET}" "${C_BOLD}" "$*" "${C_RESET}"; }
ok() { printf '  %s✓%s %s\n' "${C_GREEN}" "${C_RESET}" "$*"; }
warn() { printf '  %s!%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*"; }
info() { printf '  %s·%s %s\n' "${C_DIM}" "${C_RESET}" "$*"; }
die() {
  printf '\n  %s✗ %s%s\n\n' "${C_RED}" "$*" "${C_RESET}" >&2
  exit 1
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Run this with sudo: sudo $0"
}

require_ubuntu() {
  [[ -f /etc/os-release ]] || die "Cannot identify this OS — /etc/os-release is missing."
  # shellcheck disable=SC1091
  . /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]]; then
    warn "This script targets Ubuntu; found '${PRETTY_NAME:-unknown}'. Continuing anyway."
  elif [[ "${VERSION_ID:-}" != "24.04" ]]; then
    warn "Tested on Ubuntu 24.04 LTS; found ${VERSION_ID:-?}. Continuing anyway."
  fi
}

require_docker() {
  have_cmd docker || die "Docker is not installed. Run: sudo ./deploy/setup.sh"
  docker compose version >/dev/null 2>&1 ||
    die "The docker compose plugin is missing. Run: sudo ./deploy/setup.sh"
  docker info >/dev/null 2>&1 ||
    die "Cannot talk to the Docker daemon. Is it running, and are you in the docker group?
     Try:  sudo systemctl start docker
     Or:   newgrp docker   (after setup.sh added you to the group)"
}

# 24 bytes of urandom, base64url — no shell-hostile characters in a .env value.
generate_secret() {
  local bytes="${1:-32}"
  head -c "${bytes}" /dev/urandom | base64 | tr -d '\n=' | tr '+/' '-_'
}

# Load .env and fail early on the values the stack cannot start without.
load_env() {
  local env_file="$1"
  [[ -f "${env_file}" ]] || die "No .env found at ${env_file}. Run: sudo ./deploy/setup.sh"
  set -a
  # shellcheck disable=SC1090
  . "${env_file}"
  set +a
  [[ -n "${POSTGRES_PASSWORD:-}" ]] || die "POSTGRES_PASSWORD is not set in ${env_file}"
  [[ -n "${MC_INTERNAL_SECRET:-}" ]] || die "MC_INTERNAL_SECRET is not set in ${env_file}"
  if [[ "${#MC_INTERNAL_SECRET}" -lt 16 ]]; then
    die "MC_INTERNAL_SECRET must be at least 16 characters — the api refuses to
     record matches with a weaker one, so nobody would ever be paid."
  fi
}

# `docker compose` with the repo's file, from anywhere.
compose() {
  docker compose --project-directory "${REPO_ROOT}" -f "${REPO_ROOT}/compose.yaml" "$@"
}

# Poll a compose service's health endpoint until it answers, or give up loudly.
wait_for_http() {
  local label="$1" service="$2" url="$3" tries="${4:-60}"
  for ((i = 1; i <= tries; i++)); do
    if compose exec -T "${service}" node -e "
      fetch(process.argv[1]).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))
    " "${url}" >/dev/null 2>&1; then
      ok "${label} is answering"
      return 0
    fi
    sleep 2
  done
  warn "${label} did not answer after $((tries * 2))s. Recent logs:"
  compose logs --tail 40 "${service}" || true
  return 1
}
