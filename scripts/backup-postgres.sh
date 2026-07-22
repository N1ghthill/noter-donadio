#!/usr/bin/env bash
set -euo pipefail

compose_file="${COMPOSE_FILE:-compose.production.yaml}"
database_name="${DB_NAME:-noter_donadio}"
database_user="${DB_USER:?defina DB_USER no ambiente}"
backup_directory="${BACKUP_DIRECTORY:-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="${backup_directory}/noter-${timestamp}.dump"
temporary_path="${backup_path}.partial"

mkdir -p "${backup_directory}"
chmod 700 "${backup_directory}"
umask 077

cleanup() {
  rm -f -- "${temporary_path}"
}
trap cleanup EXIT

docker compose -f "${compose_file}" exec -T postgres \
  pg_dump --format=custom --no-owner --no-privileges \
  --username="${database_user}" --dbname="${database_name}" > "${temporary_path}"

test -s "${temporary_path}"
mv -- "${temporary_path}" "${backup_path}"
trap - EXIT

sha256sum "${backup_path}" > "${backup_path}.sha256"
chmod 600 "${backup_path}" "${backup_path}.sha256"

printf '%s\n' "Backup criado: ${backup_path}"
printf '%s\n' "Próximo passo: scripts/verify-postgres-backup.sh ${backup_path}"
