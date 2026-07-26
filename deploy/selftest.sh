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
