#!/usr/bin/env bash
#
# One-time host preparation for a Mini Clash box — Ubuntu 24.04 LTS.
#
#   sudo ./deploy/setup.sh
#
# Installs Docker from Docker's own apt repository (Ubuntu's `docker.io` package
# ships an older engine without `compose` as a plugin), opens the firewall for
# HTTP/HTTPS, and writes a .env with freshly generated secrets if one does not
# exist yet. Everything it does is idempotent: running it twice is a no-op, and
# it never overwrites an existing .env — losing MC_INTERNAL_SECRET would break
# the game server's link to the api, and losing POSTGRES_PASSWORD would lock
# you out of your own database.
#
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ENV_FILE="${REPO_ROOT}/.env"

# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

require_root
require_ubuntu

step "Updating the package index"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

step "Installing prerequisites"
apt-get install -y -qq ca-certificates curl gnupg git ufw >/dev/null

if have_cmd docker && docker compose version >/dev/null 2>&1; then
  ok "Docker with the compose plugin is already installed ($(docker --version))"
else
  step "Installing Docker Engine from Docker's apt repository"
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  # shellcheck disable=SC1091
  local_codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${local_codename} stable
EOF
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin >/dev/null
  systemctl enable --now docker >/dev/null
  ok "Installed $(docker --version)"
fi

# The user who invoked sudo should be able to run docker without it afterwards.
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  if id -nG "${SUDO_USER}" | grep -qw docker; then
    ok "${SUDO_USER} is already in the docker group"
  else
    step "Adding ${SUDO_USER} to the docker group"
    usermod -aG docker "${SUDO_USER}"
    warn "Log out and back in for that to take effect in your shell."
  fi
fi

step "Configuring the firewall"
# Explicitly allow SSH first: enabling ufw with a default-deny policy and no SSH
# rule is the classic way to lock yourself out of a remote box.
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
if ufw status | grep -q "Status: active"; then
  ok "Firewall already active — SSH, 80 and 443 allowed"
else
  ufw --force enable >/dev/null
  ok "Firewall enabled — SSH, 80 and 443 allowed"
fi
warn "The status page on :3001 is NOT opened. Reach it over an SSH tunnel:"
echo "        ssh -L 3001:localhost:3001 ${SUDO_USER:-root}@$(hostname -I | awk '{print $1}')"

step "Checking swap"
if [[ "$(swapon --show --noheadings | wc -l)" -gt 0 ]]; then
  ok "Swap is configured"
else
  total_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
  if [[ "${total_mb}" -lt 2048 ]]; then
    warn "No swap and only ${total_mb} MB of RAM — the Docker build may be killed."
    warn "Add 2 GB of swap with:"
    echo "        fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile"
    echo "        swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab"
  else
    ok "No swap, but ${total_mb} MB of RAM is enough"
  fi
fi

step "Writing ${ENV_FILE}"
if [[ -f "${ENV_FILE}" ]]; then
  ok "A .env already exists — leaving it exactly as it is"
  warn "Regenerating secrets would break the api↔game link and the database."
else
  umask 077
  cat >"${ENV_FILE}" <<EOF
# Mini Clash deployment configuration — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
#
# KEEP THIS FILE. The secrets below are not recoverable:
#   POSTGRES_PASSWORD   loses you access to your own database
#   MC_INTERNAL_SECRET  breaks the signed link between the game server and the
#                       api, so finished matches stop paying out

# The domain Caddy will get a certificate for. Point its A/AAAA record at this
# box FIRST — Let's Encrypt validates over port 80 and will fail otherwise.
# Leave it as :80 to serve plain HTTP for a local or IP-only trial.
DOMAIN=:80

POSTGRES_PASSWORD=$(generate_secret 24)
MC_INTERNAL_SECRET=$(generate_secret 48)
EOF
  chown "${SUDO_USER:-root}:${SUDO_USER:-root}" "${ENV_FILE}" 2>/dev/null || true
  ok "Wrote a .env with fresh secrets (mode 600)"
fi

echo
ok "Host ready."
echo
echo "  Next:"
echo "    1. Edit ${ENV_FILE} and set DOMAIN=your.domain (after the DNS record exists)"
echo "    2. ./deploy/deploy.sh"
