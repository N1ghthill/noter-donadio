#!/usr/bin/env bash
set -euo pipefail

if test "${CONFIRM_RESET_WORKSPACE_DATA:-0}" != "1"; then
  printf '%s\n' "Reset recusado: defina CONFIRM_RESET_WORKSPACE_DATA=1 após criar um snapshot." >&2
  exit 2
fi

project_directory="${PROJECT_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
compose_file="${COMPOSE_FILE:-compose.vps-demo.yaml}"
workspace_slug="${RESET_WORKSPACE_SLUG:-${ADMIN_WORKSPACE_SLUG:-demo-cliente}}"

cd "${project_directory}"

if test -f .env; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

database_name="${DB_NAME:-noter_donadio}"
database_user="${DB_USER:?defina DB_USER no ambiente ou .env}"

workspace_binding="$(
  docker compose -f "${compose_file}" exec -T postgres \
    psql --username="${database_user}" --dbname="${database_name}" -At \
      --set=workspace_slug="${workspace_slug}" <<'SQL'
SELECT id
FROM workspaces
WHERE slug = :'workspace_slug'
ORDER BY created_at
LIMIT 2;
SQL
)"
workspace_count="$(printf '%s\n' "${workspace_binding}" | sed '/^$/d' | wc -l)"
if test "${workspace_count}" -ne 1; then
  printf 'Reset recusado: esperado um workspace com o slug informado; encontrados %s.\n' \
    "${workspace_count}" >&2
  exit 1
fi
workspace_id="${workspace_binding}"
if [[ ! "${workspace_id}" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$ ]]; then
  printf '%s\n' "Reset recusado: o identificador resolvido para o workspace é inválido." >&2
  exit 1
fi

docker compose -f "${compose_file}" exec -T postgres \
  psql --set=ON_ERROR_STOP=1 --username="${database_user}" --dbname="${database_name}" \
    --set=workspace_id="${workspace_id}" <<'SQL'
BEGIN;
SELECT
  (SELECT count(*) FROM contacts WHERE workspace_id = :'workspace_id'::uuid) AS contacts,
  (SELECT count(*) FROM negotiations WHERE workspace_id = :'workspace_id'::uuid) AS negotiations,
  (SELECT count(*) FROM messages WHERE workspace_id = :'workspace_id'::uuid) AS messages,
  (SELECT count(*) FROM media_assets WHERE workspace_id = :'workspace_id'::uuid) AS media_assets;

DELETE FROM analysis_decisions WHERE workspace_id = :'workspace_id'::uuid;
DELETE FROM ai_analyses WHERE workspace_id = :'workspace_id'::uuid;
DELETE FROM negotiation_follow_up_history WHERE workspace_id = :'workspace_id'::uuid;
DELETE FROM media_assets WHERE workspace_id = :'workspace_id'::uuid;
DELETE FROM messages WHERE workspace_id = :'workspace_id'::uuid;
  DELETE FROM audit_events
   WHERE workspace_id = :'workspace_id'::uuid
     AND action NOT IN ('workspace_exported', 'whatsapp_auth_reset');
DELETE FROM negotiations WHERE workspace_id = :'workspace_id'::uuid;
DELETE FROM contacts WHERE workspace_id = :'workspace_id'::uuid;
DELETE FROM outbox_events WHERE workspace_id = :'workspace_id'::uuid;
DELETE FROM media_deletion_tasks WHERE workspace_id = :'workspace_id'::uuid;
COMMIT;
SQL

docker compose -f "${compose_file}" run --rm --no-deps \
  -e RESET_WORKSPACE_ID="${workspace_id}" --entrypoint /bin/sh retention \
  -c 'rm -rf -- "/app/backend/storage/media/${RESET_WORKSPACE_ID}"'
docker compose -f "${compose_file}" exec -T redis redis-cli FLUSHDB >/dev/null

remaining="$(
  docker compose -f "${compose_file}" exec -T postgres \
    psql --username="${database_user}" --dbname="${database_name}" -At \
      --set=workspace_id="${workspace_id}" <<'SQL'
SELECT concat_ws('|',
  (SELECT count(*) FROM contacts WHERE workspace_id = workspace.id),
  (SELECT count(*) FROM negotiations WHERE workspace_id = workspace.id),
  (SELECT count(*) FROM messages WHERE workspace_id = workspace.id),
  (SELECT count(*) FROM media_assets WHERE workspace_id = workspace.id),
  (SELECT count(*) FROM ai_analyses WHERE workspace_id = workspace.id),
  (SELECT count(*) FROM outbox_events WHERE workspace_id = workspace.id)
)
FROM workspaces AS workspace
WHERE workspace.id = :'workspace_id'::uuid;
SQL
)"

if test "${remaining}" != "0|0|0|0|0|0"; then
  printf 'Reset incompleto para o workspace solicitado: %s\n' "${remaining}" >&2
  exit 1
fi

printf '%s\n' "Dados operacionais zerados; identidade, usuários, sessões e autenticação do WhatsApp foram preservados."
