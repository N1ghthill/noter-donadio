#!/usr/bin/env bash
set -euo pipefail

backup_path="${1:?uso: scripts/verify-postgres-backup.sh ARQUIVO.dump}"
test -f "${backup_path}"

if test -f "${backup_path}.sha256"; then
  sha256sum --check "${backup_path}.sha256"
fi

container_name="noter-restore-check-$$"
temporary_password="restore-check-only-$$"

cleanup() {
  docker rm --force "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach --rm --name "${container_name}" \
  --env POSTGRES_PASSWORD="${temporary_password}" \
  --env POSTGRES_DB=noter_restore_check \
  postgres:16-alpine >/dev/null

for _attempt in $(seq 1 30); do
  if docker exec "${container_name}" pg_isready --username=postgres --dbname=noter_restore_check >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "${container_name}" pg_isready --username=postgres --dbname=noter_restore_check >/dev/null
docker cp "${backup_path}" "${container_name}:/tmp/noter.dump" >/dev/null
docker exec "${container_name}" pg_restore \
  --exit-on-error --no-owner --no-privileges \
  --username=postgres --dbname=noter_restore_check /tmp/noter.dump
docker exec "${container_name}" psql \
  --username=postgres --dbname=noter_restore_check \
  --tuples-only --command="SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" >/dev/null

printf '%s\n' "Backup restaurado e verificado em PostgreSQL 16 isolado."
