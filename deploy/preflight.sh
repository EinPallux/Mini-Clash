#!/usr/bin/env bash
#
# Look before you leap: what else is on this box, and what will Mini Clash
# collide with?
#
#   ./deploy/preflight.sh
#
# **Reads only.** It starts nothing, stops nothing, and changes nothing. Run it
# on a shared box before the first deploy and after any surprise.
#
# It exists because a VPS is rarely empty. Every deploy script here is scoped to
# the `mini-clash` compose project and cannot reach another stack's containers,
# volumes, images or networks — but host **ports** are genuinely shared, and
# that is the one place two stacks can fight. This tells you where, and what to
# do about it, before anything is running.
#
set -uo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

readonly PROJECT=mini-clash
conflicts=0
advice=()

# Read once, up front: the port advice quotes it.
domain_hint="${DOMAIN:-}"
[[ -z "${domain_hint}" && -f "${REPO_ROOT}/.env" ]] &&
  domain_hint="$(grep -E '^DOMAIN=' "${REPO_ROOT}/.env" | cut -d= -f2-)"
[[ -z "${domain_hint}" || "${domain_hint}" == ":80" ]] && domain_hint="your domain"

have_cmd docker || die "Docker is not installed. Run: sudo ./deploy/setup.sh"
if ! docker info >/dev/null 2>&1; then
  die "Cannot talk to the Docker daemon (are you in the docker group?).
     Everything below needs it. Try: sudo systemctl start docker"
fi

# ---------------------------------------------------------------------------

step "Other workloads on this box"

mapfile -t projects < <(
  docker ps -a --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null |
    grep -v '^$' | sort -u
)
others=()
for p in "${projects[@]}"; do
  [[ "${p}" == "${PROJECT}" ]] || others+=("${p}")
done

if [[ "${#others[@]}" -eq 0 ]]; then
  ok "No other compose projects found"
else
  for p in "${others[@]}"; do
    running="$(docker ps --filter "label=com.docker.compose.project=${p}" -q | wc -l)"
    total="$(docker ps -a --filter "label=com.docker.compose.project=${p}" -q | wc -l)"
    info "project '${p}': ${running}/${total} container(s) running"
  done
  ok "Mini Clash runs as project '${PROJECT}' — nothing here can touch those"
fi

loose="$(docker ps --filter 'label=com.docker.compose.project' --format '{{.Names}}' |
  wc -l)"
allc="$(docker ps -q | wc -l)"
if [[ "${allc}" -gt "${loose}" ]]; then
  info "$((allc - loose)) container(s) running outside any compose project"
fi

# ---------------------------------------------------------------------------

step "Host ports Mini Clash wants"

# A port check that cannot see is worse than no port check: it reports every
# port free and waves the deploy through into a collision. Refuse instead.
can_inspect_ports || die "Cannot inspect listening ports on this host — no ss, no
     netstat, and /proc/net/tcp is unreadable. Refusing to report every port
     'free' when the truth is unknown, because that is exactly how a deploy
     walks into another service. Install iproute2:  sudo apt-get install -y iproute2"

# Is it one of ours? Then it is not a conflict, it is the last deploy.
port_owner() {
  docker ps --format '{{.Label "com.docker.compose.project"}}\t{{.Ports}}' 2>/dev/null |
    awk -F'\t' -v p=":$1->" '$2 ~ p {print $1; exit}'
}

check_port() {
  local port="$1" what="$2"
  local found owner
  found="$(listeners_on "${port}")"
  if [[ -z "${found}" ]]; then
    ok "${port} free — ${what}"
    return
  fi
  owner="$(port_owner "${port}")"
  if [[ "${owner}" == "${PROJECT}" ]]; then
    ok "${port} held by Mini Clash itself (a previous deploy) — ${what}"
    return
  fi
  conflicts=$((conflicts + 1))
  printf '  %s✗%s %s is TAKEN — %s\n' "${C_RED}" "${C_RESET}" "${port}" "${what}"
  while read -r line; do [[ -n "${line}" ]] && info "    ${line}"; done <<<"${found}"
  [[ -n "${owner}" ]] && info "    (compose project '${owner}')"
}

# Which ports does this deploy actually want? Behind a proxy the answer is one
# loopback port, and :80/:443 are none of our business.
if [[ "${MC_BEHIND_PROXY:-0}" == "1" ]]; then
  info "Behind-proxy mode: :80 and :443 are left to whoever already has them"
  check_port "${EDGE_PORT:-8090}" "Caddy, behind your existing proxy"
else
  check_port 80 "Caddy, and Let's Encrypt validates over it"
  check_port 443 "Caddy's HTTPS"
fi
check_port "${STATUS_PORT:-3001}" "the status page (loopback only)"

if [[ "${conflicts}" -gt 0 ]]; then
  if [[ "${MC_BEHIND_PROXY:-0}" == "1" ]]; then
    advice+=(
      "The loopback port Mini Clash wants is already in use."
      "Pick another and try again:"
      ""
      "    EDGE_PORT=8091 ./deploy/deploy.sh --behind-proxy"
      ""
      "(Or set EDGE_PORT in .env so it sticks.)"
    )
  else
    # Presented as commands, not as a lettered menu — nothing here is waiting
    # for you to type a letter.
    advice+=(
      "Something else already owns those ports. Run ONE of these:"
      ""
      "  Run both games at once, behind the proxy you already have:"
      ""
      "    ./deploy/deploy.sh --behind-proxy"
      ""
      "  Mini Clash then listens on 127.0.0.1:${EDGE_PORT:-8090} and never"
      "  touches :80/:443. Afterwards, point your existing proxy at it for"
      "  ${domain_hint}. The nginx and Caddy snippets are at the top of"
      "  compose.behind-proxy.yaml, and in DEPLOY.md § 3."
      ""
      "  Or take turns — stop the other stack yourself, then deploy normally:"
      ""
      "    docker compose -p <project-name-from-above> stop"
      "    ./deploy/deploy.sh"
      ""
      "  Nothing in deploy/ will ever stop another project for you."
    )
  fi
fi

# ---------------------------------------------------------------------------

step "Firewall"

if ! have_cmd ufw; then
  info "ufw is not installed — nothing to check"
elif ! ufw status 2>/dev/null | grep -q "Status: active"; then
  info "ufw is installed but inactive; setup.sh will ask before enabling it"
else
  ok "ufw is active"
  # A live listener on a port ufw does not allow is a service that is already
  # firewalled off, or one reached some other way. Either is worth knowing
  # before we touch the rules.
  info "setup.sh only ever ADDS rules — it never deletes or resets any"
  info "and it will not enable ufw while an unallowed port is listening"
fi

# ---------------------------------------------------------------------------

step "Resources"

mem_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
if [[ "${mem_mb}" -lt 2048 ]]; then
  warn "${mem_mb} MB RAM. Mini Clash caps itself at ~1.8 GB, and the image"
  warn "build is the hungry part. Check swap before building."
else
  ok "${mem_mb} MB RAM"
fi

if [[ "$(swapon --show --noheadings 2>/dev/null | wc -l)" -gt 0 ]]; then
  ok "swap present"
elif [[ "${mem_mb}" -lt "${SWAP_ADVISED_BELOW_MB}" ]]; then
  warn "no swap — the build may be OOM-killed"
  # Say how to fix it here, rather than pointing at another script: setup.sh
  # applies the same threshold, so a box that reaches this line has already been
  # told once, and being told twice without the commands is not help.
  advice+=(
    "No swap, and ${mem_mb} MB of RAM. The image build is the hungry step, and"
    "an OOM kill there looks like a build that stopped for no reason. Add 2 GB:"
    ""
  )
  while read -r line; do advice+=("    ${line}"); done < <(swap_commands)
else
  info "no swap (fine at this much RAM)"
fi

avail_gb="$(df -BG --output=avail "${REPO_ROOT}" 2>/dev/null | tail -1 | tr -dc '0-9')"
if [[ -n "${avail_gb}" && "${avail_gb}" -lt 5 ]]; then
  warn "${avail_gb} GB free on this filesystem — the build needs a few"
  advice+=("Low disk. Reclaim safely with: docker builder prune  (build cache only)")
else
  ok "${avail_gb:-?} GB free"
fi

# ---------------------------------------------------------------------------

step "DNS"

domain="${DOMAIN:-}"
[[ -z "${domain}" && -f "${REPO_ROOT}/.env" ]] &&
  domain="$(grep -E '^DOMAIN=' "${REPO_ROOT}/.env" | cut -d= -f2-)"

if [[ -z "${domain}" || "${domain}" == ":80" ]]; then
  info "DOMAIN is not set to a hostname yet — plain HTTP until it is"
else
  resolved="$(getent ahostsv4 "${domain}" 2>/dev/null | awk 'NR==1 {print $1}')"
  public="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  if [[ -z "${resolved}" ]]; then
    warn "${domain} does not resolve yet — a certificate cannot be issued"
    advice+=("Add an A record for ${domain} pointing at ${public:-this box} and wait for it.")
  elif [[ -n "${public}" && "${resolved}" != "${public}" ]]; then
    warn "${domain} → ${resolved}, but this box looks like ${public}"
    advice+=("${domain} points somewhere else. Fix the A record before deploying.")
  else
    ok "${domain} → ${resolved} (this box)"
  fi
fi

# ---------------------------------------------------------------------------

step "What Mini Clash will and will not touch"
ok "creates: containers, volumes and a network all prefixed 'mini-clash'"
ok "binds:   the host ports listed above, and nothing else"
info "never:  stops, removes or prunes anything belonging to another project"
info "never:  'docker system prune', 'docker volume prune', or a global image prune"
info "        (deploy.sh prunes only dangling images built from THIS repo)"

# ---------------------------------------------------------------------------

echo
if [[ "${#advice[@]}" -gt 0 ]]; then
  step "What to do"
  for line in "${advice[@]}"; do
    [[ -z "${line}" ]] && echo || echo "  ${line}"
  done
  echo
fi

if [[ "${conflicts}" -eq 0 ]]; then
  ok "Clear to deploy: ./deploy/deploy.sh"
  exit 0
fi
warn "${conflicts} port conflict(s) — see the commands above."
exit 1
