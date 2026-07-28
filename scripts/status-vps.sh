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

compose_arguments=(-f "${compose_file}")
if test "${ENABLE_OBSERVABILITY:-0}" = "1"; then
  compose_arguments+=(-f "${OBSERVABILITY_COMPOSE_FILE:-compose.observability.yaml}")
fi

docker compose "${compose_arguments[@]}" ps
docker compose -f "${compose_file}" exec -T postgres \
  pg_isready --username="${DB_USER:?defina DB_USER}" --dbname="${DB_NAME:-noter_donadio}"
docker compose -f "${compose_file}" exec -T redis redis-cli ping

public_url="${PUBLIC_ORIGIN:?defina PUBLIC_ORIGIN}"
curl --fail --silent --show-error "${public_url%/}/" >/dev/null
internal_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "${public_url%/}/api/internal/health/ready")"
test "${internal_status}" = "404"

if test "${ENABLE_OBSERVABILITY:-0}" = "1"; then
  curl --fail --silent --show-error http://127.0.0.1:9090/-/ready >/dev/null
  curl --fail --silent --show-error http://127.0.0.1:9093/-/ready >/dev/null
  curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null
fi

systemctl is-active --quiet nftables
nft list table inet noter_host >/dev/null
ssh_configuration="$(sshd -T)"
grep --quiet '^permitrootlogin no$' <<<"${ssh_configuration}"
grep --quiet '^allowusers noterops$' <<<"${ssh_configuration}"

printf '%s\n' "Aplicação e dependências saudáveis; endpoint interno bloqueado; firewall e SSH endurecidos."
