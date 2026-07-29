#!/usr/bin/env bash
set -euo pipefail

diagnose_baileys=0
diagnose_media=0
diagnose_assistive=0
for argument in "$@"; do
  case "${argument}" in
    --diagnose-baileys)
      diagnose_baileys=1
      ;;
    --diagnose-media)
      diagnose_media=1
      ;;
    --diagnose-assistive)
      diagnose_assistive=1
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

if test "${diagnose_baileys}" = "1"; then
  docker compose "${compose_arguments[@]}" logs --tail 100 --no-color baileys
fi

if test "${diagnose_media}" = "1"; then
  docker compose -f "${compose_file}" exec -T postgres \
    psql --username="${DB_USER}" --dbname="${DB_NAME:-noter_donadio}" \
      --no-align --tuples-only --field-separator='|' \
      --command="
        SELECT
          COUNT(*) FILTER (WHERE messages.message_type = 'audio') AS audio_messages,
          COUNT(*) FILTER (
            WHERE media_assets.encrypted_provider_reference IS NOT NULL
          ) AS baileys_audio,
          COUNT(*) FILTER (
            WHERE messages.message_type = 'audio'
              AND media_assets.download_state = 'completed'
          ) AS downloaded,
          COUNT(*) FILTER (
            WHERE messages.message_type = 'audio'
              AND media_assets.download_state = 'pending'
          ) AS pending,
          COUNT(*) FILTER (
            WHERE messages.message_type = 'audio'
              AND media_assets.download_state = 'failed'
          ) AS failed
        FROM messages
        LEFT JOIN media_assets ON media_assets.message_id = messages.id;
      "
  docker compose "${compose_arguments[@]}" logs --tail 100 --no-color media-download
fi

if test "${diagnose_assistive}" = "1"; then
  docker compose -f "${compose_file}" exec -T postgres \
    psql --username="${DB_USER}" --dbname="${DB_NAME:-noter_donadio}" \
      --no-align --tuples-only --field-separator='|' \
      --command="
        SELECT
          COUNT(*) FILTER (WHERE transcription_state = 'pending') AS transcription_pending,
          COUNT(*) FILTER (WHERE transcription_state = 'processing') AS transcription_processing,
          COUNT(*) FILTER (WHERE transcription_state = 'completed') AS transcription_completed,
          COUNT(*) FILTER (WHERE transcription_state = 'failed') AS transcription_failed
        FROM media_assets;
        SELECT
          COUNT(*) FILTER (WHERE state = 'pending') AS analysis_pending,
          COUNT(*) FILTER (WHERE state = 'processing') AS analysis_processing,
          COUNT(*) FILTER (WHERE state = 'completed') AS analysis_completed,
          COUNT(*) FILTER (WHERE state = 'failed') AS analysis_failed
        FROM ai_analyses;
      "
  docker compose "${compose_arguments[@]}" logs --tail 100 --no-color transcription analysis
fi
