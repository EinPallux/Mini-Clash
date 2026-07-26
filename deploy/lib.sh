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

# ---------------------------------------------------------------------------
# Swap
#
# The image build — asset pipeline plus three bundles — is the memory-hungry
# step of a deploy, and it is the one that gets OOM-killed on a small box. The
# threshold lives here so setup.sh and preflight.sh cannot disagree about it: a
# box that preflight calls at risk must not be a box setup.sh called fine.
# ---------------------------------------------------------------------------
readonly SWAP_ADVISED_BELOW_MB=4096

# The fix, spelled out. `sudo` is added only when the caller needs it — setup.sh
# already runs as root, preflight does not, and a command that fails on a
# missing `sudo` (or a redundant one) is not advice.
swap_commands() {
  local s=""
  [[ "${EUID}" -eq 0 ]] || s="sudo "
  echo "${s}fallocate -l 2G /swapfile && ${s}chmod 600 /swapfile && ${s}mkswap /swapfile"
  echo "${s}swapon /swapfile"
  echo "echo '/swapfile none swap sw 0 0' | ${s}tee -a /etc/fstab"
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
#
# The project name is pinned in compose.yaml, so every command here is confined
# to Mini Clash's own containers, volumes and network — there is no invocation
# in deploy/ that can reach another stack on the same box. `COMPOSE_OVERRIDE`
# layers on compose.behind-proxy.yaml when deploy.sh is asked for it.
compose() {
  local files=(-f "${REPO_ROOT}/compose.yaml")
  [[ -n "${COMPOSE_OVERRIDE:-}" ]] && files+=(-f "${COMPOSE_OVERRIDE}")
  docker compose --project-directory "${REPO_ROOT}" "${files[@]}" "$@"
}

# ---------------------------------------------------------------------------
# Who is listening on a port?
#
# Three methods, because getting this wrong is dangerous in one direction only:
# a check that cannot see a listener reports the port FREE, and then a deploy
# walks into a collision it was supposed to prevent. `ss` is normally there on
# Ubuntu, but "normally" is not good enough for the one guard protecting
# somebody else's running service — so there is a fallback that needs no
# binaries at all, and a hard failure if even that is unavailable.
# ---------------------------------------------------------------------------

# /proc stores the address little-endian hex; render the common cases so the
# output reads like an address rather than like a memory dump.
decode_addr() {
  local hex="$1"
  case "${hex}" in
  00000000 | 00000000000000000000000000000000) echo "0.0.0.0" ;;
  0100007F) echo "127.0.0.1" ;;
  *0000000000000000FFFF0000*) echo "v4-mapped" ;;
  *) if [[ "${#hex}" -eq 8 ]]; then
    printf '%d.%d.%d.%d' 0x"${hex:6:2}" 0x"${hex:4:2}" 0x"${hex:2:2}" 0x"${hex:0:2}" 2>/dev/null ||
      echo "${hex}"
  else
    echo "[ipv6]"
  fi ;;
  esac
}

# Parse /proc/net/tcp{,6}: hex local address, state 0A = LISTEN. Always present
# on Linux, needs nothing installed.
proc_listeners() {
  local port="$1" hex
  hex="$(printf '%04X' "${port}")"
  local found=""
  for f in /proc/net/tcp /proc/net/tcp6; do
    [[ -r "${f}" ]] || continue
    while read -r _ local_addr _ state _; do
      [[ "${state}" == "0A" ]] || continue
      [[ "${local_addr##*:}" == "${hex}" ]] || continue
      found="${found}$(decode_addr "${local_addr%%:*}"):${port} (pid unknown)"$'\n'
    done < <(tail -n +2 "${f}")
  done
  printf '%s' "${found}"
}

# True when we have *some* way to see listeners. Callers must check this.
can_inspect_ports() {
  have_cmd ss || have_cmd netstat || [[ -r /proc/net/tcp ]]
}

# Print one line per listener on `port`, or nothing when it is free.
listeners_on() {
  local port="$1"
  if have_cmd ss; then
    ss -lntpH "sport = :${port}" 2>/dev/null | awk '{print $4, $6}'
  elif have_cmd netstat; then
    netstat -lntp 2>/dev/null | awk -v p=":${port}\$" '$4 ~ p {print $4, $7}'
  else
    proc_listeners "${port}"
  fi
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
