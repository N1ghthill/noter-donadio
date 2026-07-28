#!/usr/bin/env bash
set -euo pipefail

reboot_if_required=0

for argument in "$@"; do
  case "${argument}" in
    --reboot-if-required)
      reboot_if_required=1
      ;;
    *)
      printf 'Argumento desconhecido: %s\n' "${argument}" >&2
      exit 2
      ;;
  esac
done

project_directory="${PROJECT_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
compose_file="${COMPOSE_FILE:-compose.vps-demo.yaml}"

cd "${project_directory}"

if test -f .env; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

health_url="${HEALTH_URL:-${PUBLIC_ORIGIN:-http://127.0.0.1/}}"

compose_arguments=(-f "${compose_file}")
if test "${ENABLE_OBSERVABILITY:-0}" = "1"; then
  compose_arguments+=(-f "${OBSERVABILITY_COMPOSE_FILE:-compose.observability.yaml}")
fi

git rev-parse --is-inside-work-tree >/dev/null
if test -n "$(git status --porcelain)"; then
  printf '%s\n' "O checkout da VPS possui alterações locais; deploy cancelado."
  exit 1
fi

docker compose "${compose_arguments[@]}" config --quiet

if test "${SKIP_BACKUP:-0}" != "1"; then
  COMPOSE_FILE="${compose_file}" scripts/backup-vps.sh
fi

docker compose "${compose_arguments[@]}" build backend frontend
docker compose "${compose_arguments[@]}" up -d --remove-orphans

for _attempt in $(seq 1 60); do
  if curl --fail --silent --show-error "${health_url}" >/dev/null; then
    break
  fi
  sleep 2
done

curl --fail --silent --show-error "${health_url}" >/dev/null
docker compose "${compose_arguments[@]}" ps
git rev-parse HEAD > .deployed-commit
chmod 600 .deployed-commit

printf '%s\n' "Deploy concluído no commit $(git rev-parse --short=12 HEAD)."

if test "${reboot_if_required}" = "1"; then
  if test -f /var/run/reboot-required; then
    printf '%s\n' "Reinicialização requerida pelo sistema; reiniciando a VPS."
    sync
    systemctl reboot
  else
    printf '%s\n' "O sistema não requer reinicialização."
  fi
fi
