#!/usr/bin/env bash
#
# Self-test for the deployment scripts.
#
#   ./deploy/selftest.sh
#
# Checks the parts that fail at the worst possible moment: argument handling,
# the guards that stop a half-configured stack from starting, and the secret
# generator. It deliberately touches nothing — no containers, no apt, no
# firewall — so it is safe to run on a live box.
#
# What it cannot check is a real rollout. For that, run `./deploy/deploy.sh` on
# a throwaway VPS (or locally with `DOMAIN=:80`) and watch it come up green.
#
set -uo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

passed=0
failed=0
check() {
  if [[ "$1" -eq 0 ]]; then
    ok "$2"
    passed=$((passed + 1))
  else
    printf '  %s✗%s %s\n' "${C_RED}" "${C_RESET}" "$2"
    failed=$((failed + 1))
  fi
}

step "Syntax"
for script in "${REPO_ROOT}"/deploy/*.sh; do
  bash -n "${script}"
  check $? "$(basename "${script}") parses"
done

step "Entry points"
for script in setup deploy start stop status logs backup restore; do
  path="${REPO_ROOT}/deploy/${script}.sh"
  [[ -x "${path}" ]]
  check $? "${script}.sh is executable"
done

step "Argument handling"
"${REPO_ROOT}/deploy/deploy.sh" --help >/dev/null 2>&1
check $? "deploy.sh --help works without Docker"
! "${REPO_ROOT}/deploy/deploy.sh" --nonsense >/dev/null 2>&1
check $? "deploy.sh refuses an unknown flag"
! "${REPO_ROOT}/deploy/restore.sh" >/dev/null 2>&1
check $? "restore.sh requires a dump argument"
! "${REPO_ROOT}/deploy/restore.sh" /no/such/dump.sql.gz >/dev/null 2>&1
check $? "restore.sh refuses a dump that is not there"
! "${REPO_ROOT}/deploy/logs.sh" not-a-service >/dev/null 2>&1
check $? "logs.sh refuses a service the stack does not have"

step "Configuration guards"
tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT

(load_env /definitely/not/here/.env) >/dev/null 2>&1
check $((1 - $?)) "load_env stops on a missing .env"

printf 'POSTGRES_PASSWORD=pw\n' >"${tmp}"
(load_env "${tmp}") >/dev/null 2>&1
check $((1 - $?)) "load_env stops when MC_INTERNAL_SECRET is missing"

printf 'POSTGRES_PASSWORD=pw\nMC_INTERNAL_SECRET=tooshort\n' >"${tmp}"
message="$( (load_env "${tmp}") 2>&1 )"
[[ -n "${message}" ]] && ! (load_env "${tmp}") >/dev/null 2>&1
check $? "load_env stops on a secret the api would reject"
grep -q "16 characters" <<<"${message}"
check $? "…and the error explains why, not just that"

printf 'DOMAIN=x.test\nPOSTGRES_PASSWORD=pw\nMC_INTERNAL_SECRET=0123456789abcdefghij\n' >"${tmp}"
(load_env "${tmp}" && [[ "${DOMAIN}" == "x.test" ]]) >/dev/null 2>&1
check $? "load_env accepts a complete .env and exports it"

step "Secret generation"
first="$(generate_secret 24)"
second="$(generate_secret 24)"
[[ "${first}" != "${second}" ]]
check $? "two calls do not produce the same secret"
[[ "${first}" =~ ^[A-Za-z0-9_-]+$ ]]
check $? "the secret has no characters a shell or a URL would mangle"
[[ "${#first}" -ge 16 ]]
check $? "the secret is long enough for the api to accept (${#first} chars)"

step "Compose file"
if have_cmd docker; then
  DOMAIN=example.test POSTGRES_PASSWORD=pw MC_INTERNAL_SECRET=0123456789abcdef \
    docker compose -f "${REPO_ROOT}/compose.yaml" config >/dev/null 2>&1
  check $? "compose.yaml is valid and every variable resolves"

  # The variables the stack refuses to start without must be declared required.
  grep -q 'POSTGRES_PASSWORD:?' "${REPO_ROOT}/compose.yaml"
  check $? "compose.yaml fails loudly if POSTGRES_PASSWORD is unset"
  grep -q 'MC_INTERNAL_SECRET:?' "${REPO_ROOT}/compose.yaml"
  check $? "compose.yaml fails loudly if MC_INTERNAL_SECRET is unset"
else
  warn "docker is not installed — skipping the compose checks"
fi

step "Shared-box safety"
# These are the invariants that keep this stack off another one's toes. They
# are checked mechanically because every one of them is a single careless edit
# away from being untrue.

grep -qx 'name: mini-clash' "${REPO_ROOT}/compose.yaml"
check $? "compose.yaml pins the project name, so nothing here is unscoped"

# Match *invocations*, not prose: these scripts talk about pruning in their
# comments and in the text preflight prints, and a grep that cannot tell the
# difference fails on its own documentation.
prune_calls() {
  grep -rhnE '(^|[[:space:]]|\$\()docker[[:space:]]+(system|volume|image|builder)[[:space:]]+prune' \
    "${REPO_ROOT}/deploy/"*.sh 2>/dev/null |
    grep -vE '^[0-9]+:[[:space:]]*#' |
    grep -vE '(info|warn|ok|echo|printf|die)[[:space:]]+["'"'"']'
}

! prune_calls | grep -qE 'docker[[:space:]]+(system|volume)[[:space:]]+prune'
check $? "no script ever runs a system-wide or volume prune"

# Every image prune that IS invoked must carry the project filter.
unfiltered="$(prune_calls | grep 'image prune' | grep -vc 'com.docker.compose.project')"
[[ "${unfiltered}" -eq 0 ]]
check $? "every image prune is filtered to the mini-clash project"

[[ "$(prune_calls | grep -c 'image prune')" -ge 1 ]]
check $? "…and that filtered prune is actually there (the check has teeth)"

! grep -rnE 'docker (stop|rm|kill)[^|]*\$' "${REPO_ROOT}/deploy/"*.sh >/dev/null 2>&1
check $? "no script stops or removes containers by raw docker command"

grep -q 'STATUS_BIND:-127.0.0.1' "${REPO_ROOT}/compose.yaml"
check $? "the status page binds loopback, not a public port"

[[ -f "${REPO_ROOT}/compose.behind-proxy.yaml" ]]
check $? "the behind-proxy override exists for a box that already owns :80"
! grep -qE '"(80|443):' "${REPO_ROOT}/compose.behind-proxy.yaml"
check $? "…and it binds neither 80 nor 443"
grep -q '127.0.0.1:\${EDGE_PORT' "${REPO_ROOT}/compose.behind-proxy.yaml"
check $? "…binding loopback only"

if have_cmd docker; then
  DOMAIN=x POSTGRES_PASSWORD=pw MC_INTERNAL_SECRET=0123456789abcdef \
    docker compose -f "${REPO_ROOT}/compose.yaml" -f "${REPO_ROOT}/compose.behind-proxy.yaml" \
    config 2>/dev/null | grep -q 'published: "8090"'
  check $? "…and the merged config really publishes 8090 instead"
fi

step "Preflight mode awareness"
# --behind-proxy exists precisely to resolve an :80 conflict. A preflight that
# still failed on :80 in that mode would block the only flag that fixes it —
# which is exactly what happened the first time this ran on a real box.
grep -q 'MC_BEHIND_PROXY' "${REPO_ROOT}/deploy/preflight.sh"
check $? "preflight knows which mode it is checking for"
grep -q 'MC_BEHIND_PROXY="\${BEHIND_PROXY}"' "${REPO_ROOT}/deploy/deploy.sh"
check $? "deploy.sh tells it, so --behind-proxy is not blocked by :80"
grep -A2 'MC_BEHIND_PROXY:-0}" == "1"' "${REPO_ROOT}/deploy/preflight.sh" |
  grep -q 'EDGE_PORT'
check $? "…and in that mode it checks the loopback port instead"

# The advice is a list of commands, not an interactive menu. It read as one
# once, and somebody typed "A" at their shell.
! grep -qE '^\s+"  [AB]\. ' "${REPO_ROOT}/deploy/preflight.sh"
check $? "the advice does not look like a menu waiting for a keypress"
grep -q 'Run ONE of these' "${REPO_ROOT}/deploy/preflight.sh"
check $? "…it says to run one of the commands shown"

step "Swap advice"
# Preflight warning that the build may be OOM-killed while setup.sh calls the
# same box fine is worse than either message alone: it is a contradiction, and
# the reader has no way to tell which one is right until the build dies.
grep -q 'SWAP_ADVISED_BELOW_MB' "${REPO_ROOT}/deploy/setup.sh"
check $? "setup.sh uses the shared swap threshold"
grep -q 'SWAP_ADVISED_BELOW_MB' "${REPO_ROOT}/deploy/preflight.sh"
check $? "preflight.sh uses the same one, so the two cannot disagree"
# Narrow on purpose: preflight also warns about total RAM, which is a different
# question with a different number. What must not come back is a second copy of
# the *swap* threshold.
! grep -qE '\-lt 4096' "${REPO_ROOT}/deploy/setup.sh" "${REPO_ROOT}/deploy/preflight.sh"
check $? "…and neither kept a hard-coded copy of it"

swap_commands | grep -q 'fallocate -l 2G /swapfile'
check $? "the advice creates the swap file"
swap_commands | grep -q 'swapon /swapfile'
check $? "…turns it on"
swap_commands | grep -q '/etc/fstab'
check $? "…and keeps it across a reboot"
if [[ "${EUID}" -eq 0 ]]; then
  ! swap_commands | grep -q 'sudo '
  check $? "…with no redundant sudo, since this shell is root"
else
  swap_commands | grep -q '^sudo '
  check $? "…prefixed with sudo, since this shell is not root"
fi

step "Lockfile guard"
# The deploy that prompted all of this died three minutes into the image build,
# on a dependency that could never have installed there.
[[ -f "${REPO_ROOT}/scripts/check-lockfile.mjs" ]]
check $? "the lockfile check exists"
if have_cmd node; then
  node "${REPO_ROOT}/scripts/check-lockfile.mjs" >/dev/null 2>&1
  check $? "…and this tree has no git-sourced packages"
fi
grep -q 'check-lockfile.mjs' "${REPO_ROOT}/deploy/deploy.sh"
check $? "deploy.sh runs it before spending minutes on a build"

step "Port detection"
# The guard that protects another service is only worth having if it can
# actually see. A silent "everything is free" is the failure mode that matters.
can_inspect_ports
check $? "this host can be inspected for listening ports"

if have_cmd python3; then
  python3 -c "
import socket, time, sys
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('127.0.0.1', 45999)); s.listen(1)
sys.stderr.write('up\n'); sys.stderr.flush()
time.sleep(8)
" 2>/dev/null &
  probe_pid=$!
  sleep 1
  [[ -n "$(listeners_on 45999)" ]]
  check $? "a real listener on 45999 is detected"
  [[ -z "$(listeners_on 45998)" ]]
  check $? "a free port reports free"
  kill "${probe_pid}" 2>/dev/null
  wait "${probe_pid}" 2>/dev/null
else
  warn "python3 missing — skipping the live listener probe"
fi

step "Secrets stay out of git"
grep -qx '.env' "${REPO_ROOT}/.gitignore"
check $? ".env is gitignored"
grep -qx 'backups/' "${REPO_ROOT}/.gitignore"
check $? "backups/ is gitignored"
[[ -f "${REPO_ROOT}/.env.example" ]]
check $? ".env.example exists for anyone configuring by hand"

echo
if [[ "${failed}" -eq 0 ]]; then
  ok "${passed} checks passed."
  exit 0
fi
printf '\n  %s%d passed, %d failed%s\n\n' "${C_RED}" "${passed}" "${failed}" "${C_RESET}"
exit 1
