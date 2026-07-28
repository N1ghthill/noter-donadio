#!/usr/bin/env bash
set -euo pipefail

project_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
acceptance_script="${project_directory}/scripts/acceptance-vps.mjs"

case "${1:-}" in
  "")
    ;;
  --mutations)
    ACCEPTANCE_MUTATIONS=1
    ;;
  *)
    printf '%s\n' "Uso: $0 [--mutations]" >&2
    exit 2
    ;;
esac

ACCEPTANCE_WORKSPACE="${ACCEPTANCE_WORKSPACE:-demo-cliente}"
ACCEPTANCE_EMAIL="${ACCEPTANCE_EMAIL:-demo@example.com}"
if test -z "${ACCEPTANCE_PASSWORD:-}"; then
  read -r -s -p 'Senha da demonstração: ' ACCEPTANCE_PASSWORD
  printf '\n' >&2
fi
: "${ACCEPTANCE_PASSWORD:?defina ACCEPTANCE_PASSWORD}"
export ACCEPTANCE_WORKSPACE ACCEPTANCE_EMAIL ACCEPTANCE_PASSWORD
if test -n "${ACCEPTANCE_MUTATIONS:-}"; then
  export ACCEPTANCE_MUTATIONS
fi

if command -v node >/dev/null 2>&1; then
  exec node "${acceptance_script}"
fi

environment_arguments=(
  --env ACCEPTANCE_WORKSPACE
  --env ACCEPTANCE_EMAIL
  --env ACCEPTANCE_PASSWORD
)
for optional_name in ACCEPTANCE_ORIGIN ACCEPTANCE_MUTATIONS; do
  if test -n "${!optional_name:-}"; then
    environment_arguments+=(--env "${optional_name}")
  fi
done

exec docker run --rm \
  "${environment_arguments[@]}" \
  --mount "type=bind,source=${acceptance_script},target=/app/acceptance-vps.mjs,readonly" \
  node:24.15.0-bookworm-slim \
  node /app/acceptance-vps.mjs
