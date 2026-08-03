#!/usr/bin/env bash
set -euo pipefail

project_directory="${PROJECT_DIRECTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
compose_file="${COMPOSE_FILE:-compose.vps-demo.yaml}"
cd "${project_directory}"

# shellcheck source=scripts/lib/groq-access.sh
source "${project_directory}/scripts/lib/groq-access.sh"

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
  if test -n "${current}"; then printf '%s,%s' "${current}" "${profile}"; else printf '%s' "${profile}"; fi
}

if ! test -r /dev/tty; then
  printf '%s\n' "Execute este comando em um terminal SSH interativo." >&2
  exit 1
fi

printf '%s' "Cole a GROQ_API_KEY (a entrada ficará oculta): " >/dev/tty
IFS= read -r -s groq_api_key </dev/tty
printf '\n' >/dev/tty
if ! [[ "${groq_api_key}" =~ ^gsk_[A-Za-z0-9_-]{20,}$ ]]; then
  unset groq_api_key
  printf '%s\n' "Chave inválida; nenhuma configuração foi alterada." >&2
  exit 1
fi

transcription_model="${GROQ_TRANSCRIPTION_MODEL:-whisper-large-v3-turbo}"
analysis_model="${GROQ_ANALYSIS_MODEL:-openai/gpt-oss-20b}"
if ! validate_groq_model_access "${groq_api_key}" "${transcription_model}" \
  || ! validate_groq_model_access "${groq_api_key}" "${analysis_model}"; then
  unset groq_api_key
  printf '%s\n' "A configuração anterior foi preservada sem alterações." >&2
  exit 1
fi

cutoff="$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')"
set_env_value GROQ_API_KEY "${groq_api_key}"
unset groq_api_key
set_env_value ASSISTIVE_PROCESSING_NOT_BEFORE "${cutoff}"
set_env_value GROQ_TRANSCRIPTION_MODEL "${transcription_model}"
set_env_value GROQ_ANALYSIS_MODEL "${analysis_model}"
set_env_value TRANSCRIPTION_ADAPTER groq
set_env_value AI_ADAPTER groq
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
      psql --username="${DB_USER:?defina DB_USER}" --dbname="${DB_NAME:-noter_donadio}" \
        --set=ON_ERROR_STOP=1 --set=cutoff="${cutoff}" >/dev/null

printf 'Groq configurado sem expor a chave. Corte autorizado: %s\n' "${cutoff}"
printf '%s\n' "Execute o deploy para iniciar os workers assistivos."
