#!/usr/bin/env bash
set -euo pipefail

project_directory="${PROJECT_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
compose_file="${COMPOSE_FILE:-compose.vps-demo.yaml}"
backup_directory="${BACKUP_DIRECTORY:-/var/backups/noter-donadio}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_directory="${backup_directory}/${timestamp}"

cd "${project_directory}"

if test -f .env; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

database_name="${DB_NAME:-noter_donadio}"
database_user="${DB_USER:?defina DB_USER no ambiente ou .env}"

install -d -m 700 "${backup_directory}"
install -d -m 700 "${snapshot_directory}"

exec 9>"${backup_directory}/.backup.lock"
if ! flock --nonblock 9; then
  printf '%s\n' "Outro backup já está em execução."
  exit 1
fi

COMPOSE_FILE="${compose_file}" \
DB_NAME="${database_name}" \
DB_USER="${database_user}" \
BACKUP_DIRECTORY="${snapshot_directory}" \
  scripts/backup-postgres.sh

retention_container="$(docker compose -f "${compose_file}" ps --quiet retention)"
test -n "${retention_container}"
media_volume="$(
  docker inspect "${retention_container}" \
    --format '{{range .Mounts}}{{if eq .Destination "/app/backend/storage/media"}}{{.Name}}{{end}}{{end}}'
)"
test -n "${media_volume}"

docker run --rm \
  --volume "${media_volume}:/source:ro" \
  --volume "${snapshot_directory}:/backup" \
  postgres:16-alpine \
  tar -C /source -czf "/backup/media-${timestamp}.tar.gz" .

chmod 600 "${snapshot_directory}/media-${timestamp}.tar.gz"
(
  cd "${snapshot_directory}"
  sha256sum -- *.dump *.tar.gz > SHA256SUMS
  chmod 600 SHA256SUMS
)

if test -n "${BACKUP_RESULT_FILE:-}"; then
  printf '%s\n' "${snapshot_directory}" > "${BACKUP_RESULT_FILE}"
  chmod 600 "${BACKUP_RESULT_FILE}"
fi

printf '%s\n' "Snapshot local criado e validável em ${snapshot_directory}"
printf '%s\n' "Copie-o para armazenamento off-host antes de considerá-lo recuperação de desastre."
