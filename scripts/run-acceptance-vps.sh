#!/usr/bin/env bash
set -euo pipefail

project_directory="${PROJECT_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
acceptance_script="${project_directory}/scripts/acceptance-vps.mjs"

: "${ACCEPTANCE_WORKSPACE:?defina ACCEPTANCE_WORKSPACE}"
: "${ACCEPTANCE_EMAIL:?defina ACCEPTANCE_EMAIL}"
: "${ACCEPTANCE_PASSWORD:?defina ACCEPTANCE_PASSWORD}"

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
