#!/usr/bin/env bash
set -euo pipefail

project_directory="${PROJECT_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
compose_file="${COMPOSE_FILE:-compose.vps-demo.yaml}"
cd "${project_directory}"

# shellcheck source=scripts/lib/openai-access.sh
source "${project_directory}/scripts/lib/openai-access.sh"

if ! test -f .env; then
  printf '%s\n' "Arquivo .env não encontrado." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

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

add_compose_profile() {
  local profile="$1"
  local current="${COMPOSE_PROFILES:-}"
  local item
  IFS=',' read -r -a configured <<< "${current}"
  for item in "${configured[@]}"; do
    if test "${item}" = "${profile}"; then
      printf '%s' "${current}"
      return
    fi
  done
  if test -n "${current}"; then
    printf '%s,%s' "${current}" "${profile}"
  else
    printf '%s' "${profile}"
  fi
}

if ! test -r /dev/tty; then
  printf '%s\n' "Execute este comando em um terminal SSH interativo." >&2
  exit 1
fi

printf '%s' "Cole a OPENAI_API_KEY (a entrada ficará oculta): " >/dev/tty
IFS= read -r -s openai_api_key </dev/tty
printf '\n' >/dev/tty
if ! [[ "${openai_api_key}" =~ ^[A-Za-z0-9_-]{20,}$ ]]; then
  unset openai_api_key
  printf '%s\n' "Chave inválida; nenhuma configuração foi alterada." >&2
  exit 1
fi

transcription_model="${OPENAI_TRANSCRIPTION_MODEL:-gpt-4o-mini-transcribe}"
analysis_model="${OPENAI_ANALYSIS_MODEL:-gpt-5.6-sol}"
if ! validate_openai_model_access "${openai_api_key}" "${transcription_model}" \
  || ! validate_openai_model_access "${openai_api_key}" "${analysis_model}"; then
  unset openai_api_key
  printf '%s\n' "A configuração anterior foi preservada sem alterações." >&2
  exit 1
fi

cutoff="$(
  docker compose -f "${compose_file}" exec -T postgres \
    psql --username="${DB_USER:?defina DB_USER}" --dbname="${DB_NAME:-noter_donadio}" \
      --no-align --tuples-only \
      --command="
        SELECT to_char(
          COALESCE((
            SELECT messages.created_at
            FROM messages
            INNER JOIN media_assets ON media_assets.message_id = messages.id
            WHERE media_assets.encrypted_provider_reference IS NOT NULL
            ORDER BY messages.created_at DESC
            LIMIT 1
          ), CURRENT_TIMESTAMP) AT TIME ZONE 'UTC',
          'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'
        );
      "
)"
cutoff="$(printf '%s' "${cutoff}" | tr -d '\r\n')"
if ! [[ "${cutoff}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]]; then
  unset openai_api_key
  printf '%s\n' "Não foi possível determinar o corte de autorização." >&2
  exit 1
fi

set_env_value OPENAI_API_KEY "${openai_api_key}"
unset openai_api_key
set_env_value ASSISTIVE_PROCESSING_NOT_BEFORE "${cutoff}"
set_env_value OPENAI_TRANSCRIPTION_MODEL "${transcription_model}"
set_env_value OPENAI_ANALYSIS_MODEL "${analysis_model}"
set_env_value TRANSCRIPTION_ADAPTER openai
set_env_value AI_ADAPTER openai
set_env_value TRANSCRIPTION_FEATURE_ENABLED true
set_env_value AI_ANALYSIS_FEATURE_ENABLED true
set_env_value COMPOSE_PROFILES "$(add_compose_profile assistive)"

printf '%s\n' "
      UPDATE media_assets
      SET transcription_state = 'failed',
          failure_code = 'OUTSIDE_AUTHORIZED_PROCESSING_WINDOW'
      FROM messages
      WHERE messages.id = media_assets.message_id
        AND messages.created_at < :'cutoff'::timestamptz
        AND media_assets.transcription_state IN ('pending', 'failed');
    " | docker compose -f "${compose_file}" exec -T postgres \
      psql --username="${DB_USER}" --dbname="${DB_NAME:-noter_donadio}" \
        --set=ON_ERROR_STOP=1 --set=cutoff="${cutoff}" >/dev/null

printf 'OpenAI configurada sem expor a chave. Corte autorizado: %s\n' "${cutoff}"
printf '%s\n' "Execute o deploy para iniciar os workers assistivos."
