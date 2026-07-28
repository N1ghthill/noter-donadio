#!/usr/bin/env bash
set -euo pipefail

project_directory="${PROJECT_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
compose_file="${COMPOSE_FILE:-compose.vps-demo.yaml}"

cd "${project_directory}"

if test -f .env; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

docker compose -f "${compose_file}" ps
docker compose -f "${compose_file}" exec -T postgres \
  pg_isready --username="${DB_USER:?defina DB_USER}" --dbname="${DB_NAME:-noter_donadio}"
docker compose -f "${compose_file}" exec -T redis redis-cli ping

public_url="http://${PUBLIC_HOST:?defina PUBLIC_HOST}"
curl --fail --silent --show-error "${public_url}/" >/dev/null
internal_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "${public_url}/api/internal/health/ready")"
test "${internal_status}" = "404"

printf '%s\n' "Aplicação pública acessível; PostgreSQL e Redis saudáveis; endpoint interno bloqueado."
