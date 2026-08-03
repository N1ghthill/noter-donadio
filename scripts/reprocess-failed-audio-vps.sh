#!/usr/bin/env bash
set -euo pipefail

project_directory="${PROJECT_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
compose_file="${COMPOSE_FILE:-compose.vps-demo.yaml}"
cd "${project_directory}"

exec 9>"${project_directory}/.reprocess-failed-audio.lock"
if ! flock --nonblock 9; then
  printf '%s\n' "Já existe um reprocessamento de áudio em execução." >&2
  exit 1
fi

if test "${CONFIRM_REPROCESS_FAILED_AUDIO:-0}" != "1"; then
  printf '%s\n' "Defina CONFIRM_REPROCESS_FAILED_AUDIO=1 para autorizar o envio dos áudios antigos ao provedor." >&2
  exit 1
fi

if ! test -f .env; then
  printf '%s\n' "Arquivo .env não encontrado." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if test "${TRANSCRIPTION_FEATURE_ENABLED:-false}" != "true" \
  || test "${AI_ANALYSIS_FEATURE_ENABLED:-false}" != "true"; then
  printf '%s\n' "Transcrição e análise precisam estar habilitadas." >&2
  exit 1
fi
if test "${TRANSCRIPTION_ADAPTER:-disabled}" = "disabled" \
  || test "${AI_ADAPTER:-disabled}" = "disabled"; then
  printf '%s\n' "Os adapters assistivos precisam estar selecionados." >&2
  exit 1
fi

database_user="${DB_USER:?defina DB_USER}"
database_name="${DB_NAME:-noter_donadio}"
original_cutoff="${ASSISTIVE_PROCESSING_NOT_BEFORE:?defina ASSISTIVE_PROCESSING_NOT_BEFORE}"

psql_query() {
  docker compose -f "${compose_file}" exec -T postgres \
    psql --username="${database_user}" --dbname="${database_name}" \
      --no-align --tuples-only --set=ON_ERROR_STOP=1 "$@"
}

target_summary="$(psql_query --field-separator='|' --command="
  SELECT COUNT(*), to_char(MIN(messages.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')
  FROM media_assets
  INNER JOIN messages ON messages.id = media_assets.message_id
  WHERE messages.message_type = 'audio'
    AND media_assets.transcription_state IN ('pending', 'failed', 'completed')
    AND media_assets.download_state = 'completed'
    AND media_assets.storage_key IS NOT NULL
    AND messages.negotiation_id IS NOT NULL;
")"
target_count="${target_summary%%|*}"
temporary_cutoff="${target_summary#*|}"
if test "${target_count}" = "0"; then
  printf '%s\n' "Nenhuma transcrição com falha está elegível para reprocessamento."
  exit 0
fi
if ! [[ "${temporary_cutoff}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]]; then
  printf '%s\n' "Não foi possível determinar o corte temporário." >&2
  exit 1
fi

auditable_count="$(psql_query --command="
  SELECT COUNT(*)
  FROM media_assets
  INNER JOIN messages ON messages.id = media_assets.message_id
  WHERE messages.message_type = 'audio'
    AND media_assets.transcription_state IN ('pending', 'failed', 'completed')
    AND media_assets.download_state = 'completed'
    AND media_assets.storage_key IS NOT NULL
    AND messages.negotiation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.workspace_id = messages.workspace_id
        AND users.role = 'admin'
        AND users.status = 'active'
    );
")"
if test "${auditable_count}" != "${target_count}"; then
  printf '%s\n' "Reprocessamento cancelado: não há administrador ativo para auditar todos os áudios." >&2
  exit 1
fi

set_env_value() {
  local key="$1"
  local value="$2"
  local temporary
  temporary="$(mktemp "${project_directory}/.env.tmp.XXXXXX")"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { replaced = 0 }
    index($0, key "=") == 1 {
      if (!replaced) print key "=" value
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) print key "=" value }
  ' .env > "${temporary}"
  chmod 600 "${temporary}"
  mv "${temporary}" .env
}

restored=0
restore_cutoff() {
  if test "${restored}" = "1"; then return; fi
  restored=1
  set_env_value ASSISTIVE_PROCESSING_NOT_BEFORE "${original_cutoff}"
  export ASSISTIVE_PROCESSING_NOT_BEFORE="${original_cutoff}"
  docker compose -f "${compose_file}" up -d --force-recreate backend analysis transcription >/dev/null
}
trap restore_cutoff EXIT

set_env_value ASSISTIVE_PROCESSING_NOT_BEFORE "${temporary_cutoff}"
export ASSISTIVE_PROCESSING_NOT_BEFORE="${temporary_cutoff}"
docker compose -f "${compose_file}" up -d --force-recreate backend analysis transcription >/dev/null

queued_count="$(psql_query --command="
  WITH targets AS MATERIALIZED (
    SELECT media_assets.message_id,
           messages.workspace_id,
           messages.negotiation_id,
           (
             SELECT users.id
             FROM users
             WHERE users.workspace_id = messages.workspace_id
               AND users.role = 'admin'
               AND users.status = 'active'
             ORDER BY users.created_at, users.id
             LIMIT 1
           ) AS user_id
    FROM media_assets
    INNER JOIN messages ON messages.id = media_assets.message_id
    WHERE messages.message_type = 'audio'
      AND media_assets.transcription_state IN ('pending', 'failed', 'completed')
      AND media_assets.download_state = 'completed'
      AND media_assets.storage_key IS NOT NULL
      AND messages.negotiation_id IS NOT NULL
    FOR UPDATE OF media_assets
  ), reset_analyses AS (
    UPDATE ai_analyses
    SET state = 'pending',
        failure_code = NULL,
        analysis_attempt_id = NULL,
        processing_started_at = NULL
    FROM targets
    WHERE ai_analyses.message_id = targets.message_id
      AND ai_analyses.prompt_version = 'message-context-v2'
      AND ai_analyses.state IN ('processing', 'failed')
    RETURNING ai_analyses.message_id
  ), updated AS (
    UPDATE media_assets
    SET transcription_state = 'pending',
        failure_code = NULL,
        transcription_attempt_id = NULL,
        processing_started_at = NULL
    FROM targets
    WHERE media_assets.message_id = targets.message_id
    RETURNING targets.*
  ), queued AS (
    INSERT INTO outbox_events (
      id, workspace_id, aggregate_type, aggregate_id, event_type, payload,
      status, attempts, available_at, created_at, updated_at
    )
    SELECT gen_random_uuid(), workspace_id, 'message', message_id,
           'message.audio.ingested',
           jsonb_build_object(
             'workspaceId', workspace_id,
             'messageId', message_id,
             'negotiationId', negotiation_id
           ),
           'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM updated
    RETURNING aggregate_id
  ), audited AS (
    INSERT INTO audit_events (
      id, workspace_id, user_id, negotiation_id, action, changed_fields,
      details, created_at
    )
    SELECT gen_random_uuid(), workspace_id, user_id, negotiation_id,
           'processing_retry_requested', ARRAY['transcriptionProcessing'],
           jsonb_build_object(
             'kind', 'transcription',
             'scope', 'all_failed_audio',
             'source', 'authorized_vps_operation'
           ), CURRENT_TIMESTAMP
    FROM updated
    RETURNING id
  )
  SELECT COUNT(*) FROM queued;
")"
if test "${queued_count}" != "${target_count}"; then
  printf 'Esperado reenfileirar %s áudios, mas foram reenfileirados %s.\n' "${target_count}" "${queued_count}" >&2
  exit 1
fi

printf 'Reprocessamento autorizado e auditado para %s áudios.\n' "${target_count}"

deadline=$((SECONDS + 300))
while test "${SECONDS}" -lt "${deadline}"; do
  active_count="$(psql_query --command="
    SELECT COUNT(*)
    FROM media_assets
    INNER JOIN messages ON messages.id = media_assets.message_id
    WHERE messages.message_type = 'audio'
      AND messages.created_at >= '${temporary_cutoff}'::timestamptz
      AND media_assets.transcription_state IN ('pending', 'processing');
  ")"
  if test "${active_count}" = "0"; then break; fi
  sleep 2
done

result_summary="$(psql_query --field-separator='|' --command="
  SELECT
    COUNT(*) FILTER (WHERE media_assets.transcription_state = 'completed'),
    COUNT(*) FILTER (WHERE media_assets.transcription_state = 'failed'),
    COUNT(*) FILTER (WHERE media_assets.transcription_state IN ('pending', 'processing'))
  FROM media_assets
  INNER JOIN messages ON messages.id = media_assets.message_id
  WHERE messages.message_type = 'audio'
    AND messages.created_at >= '${temporary_cutoff}'::timestamptz;
")"
completed_count="${result_summary%%|*}"
remaining="${result_summary#*|}"
failed_count="${remaining%%|*}"
active_count="${remaining##*|}"

analysis_deadline=$((SECONDS + 600))
while test "${SECONDS}" -lt "${analysis_deadline}"; do
  analysis_completed_in_window="$(psql_query --command="
    SELECT COUNT(*)
    FROM ai_analyses
    INNER JOIN messages ON messages.id = ai_analyses.message_id
    WHERE messages.message_type = 'audio'
      AND messages.created_at >= '${temporary_cutoff}'::timestamptz
      AND ai_analyses.prompt_version = 'message-context-v2'
      AND ai_analyses.state = 'completed';
  ")"
  if test "${analysis_completed_in_window}" -ge "${target_count}"; then break; fi
  sleep 2
done

analysis_summary="$(psql_query --field-separator='|' --command="
  SELECT
    COUNT(*) FILTER (WHERE ai_analyses.state = 'completed'),
    COUNT(*) FILTER (WHERE ai_analyses.state = 'failed'),
    COUNT(*) FILTER (WHERE ai_analyses.state IN ('pending', 'processing'))
  FROM ai_analyses
  INNER JOIN messages ON messages.id = ai_analyses.message_id
  WHERE messages.message_type = 'audio'
    AND messages.created_at >= '${temporary_cutoff}'::timestamptz
    AND ai_analyses.prompt_version = 'message-context-v2';
")"
analysis_completed_count="${analysis_summary%%|*}"
analysis_remaining="${analysis_summary#*|}"
analysis_failed_count="${analysis_remaining%%|*}"
analysis_active_count="${analysis_remaining##*|}"

restore_cutoff
trap - EXIT

printf 'Resultado das transcrições autorizadas: completed=%s failed=%s active=%s. Corte original restaurado.\n' \
  "${completed_count}" "${failed_count}" "${active_count}"
printf 'Resultado das análises contextuais: completed=%s failed=%s active=%s.\n' \
  "${analysis_completed_count}" "${analysis_failed_count}" "${analysis_active_count}"
if test "${completed_count}" -lt "${target_count}" \
  || test "${analysis_completed_count}" -lt "${target_count}"; then
  exit 1
fi
