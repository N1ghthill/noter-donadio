#!/usr/bin/env bash
set -euo pipefail

project_directory="${PROJECT_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
compose_file="${COMPOSE_FILE:-compose.vps-demo.yaml}"
health_url="${HEALTH_URL:-http://127.0.0.1/}"

cd "${project_directory}"

if test -f .env; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

git rev-parse --is-inside-work-tree >/dev/null
if test -n "$(git status --porcelain)"; then
  printf '%s\n' "O checkout da VPS possui alterações locais; deploy cancelado."
  exit 1
fi

docker compose -f "${compose_file}" config --quiet

if test "${SKIP_BACKUP:-0}" != "1"; then
  COMPOSE_FILE="${compose_file}" scripts/backup-vps.sh
fi

docker compose -f "${compose_file}" build backend frontend
docker compose -f "${compose_file}" up -d --remove-orphans

for _attempt in $(seq 1 60); do
  if curl --fail --silent --show-error "${health_url}" >/dev/null; then
    break
  fi
  sleep 2
done

curl --fail --silent --show-error "${health_url}" >/dev/null
docker compose -f "${compose_file}" ps
git rev-parse HEAD > .deployed-commit
chmod 600 .deployed-commit

printf '%s\n' "Deploy concluído no commit $(git rev-parse --short=12 HEAD)."
