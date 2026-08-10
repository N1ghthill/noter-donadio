#!/usr/bin/env bash
set -euo pipefail

reboot_if_required=0
enable_baileys=0
enable_groq=0
enable_notifications=0
reset_admin_password=0
reset_workspace_data=0
reprocess_failed_audio=0

for argument in "$@"; do
  case "${argument}" in
    --reboot-if-required)
      reboot_if_required=1
      ;;
    --enable-baileys)
      enable_baileys=1
      ;;
    --enable-groq)
      enable_groq=1
      ;;
    --enable-notifications)
      enable_notifications=1
      ;;
    --reset-admin-password)
      reset_admin_password=1
      ;;
    --reset-workspace-data)
      reset_workspace_data=1
      ;;
    --reprocess-failed-audio)
      reprocess_failed_audio=1
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

health_url="${HEALTH_URL:-${PUBLIC_ORIGIN:-http://127.0.0.1/}}"

compose_arguments=(-f "${compose_file}")
if test "${ENABLE_OBSERVABILITY:-0}" = "1"; then
  compose_arguments+=(-f "${OBSERVABILITY_COMPOSE_FILE:-compose.observability.yaml}")
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

add_compose_profile() {
  local profile="$1"
  local current="${COMPOSE_PROFILES:-}"
  local configured
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

if test "${enable_groq}" = "1"; then
  "${project_directory}/scripts/configure-groq-vps.sh"
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if test "${enable_notifications}" = "1"; then
  if ! test -r /dev/tty; then
    printf '%s\n' 'A ativação Bark exige um terminal interativo.' >&2
    exit 1
  fi
  printf 'URL-base secreta do Bark: ' >/dev/tty
  IFS= read -r -s bark_webhook_url </dev/tty
  printf '\n' >/dev/tty
  if [[ ! "${bark_webhook_url}" =~ ^https://api\.day\.app/[^/?#[:space:]]+$ ]]; then
    unset bark_webhook_url
    printf '%s\n' 'Use a URL-base HTTPS do Bark, sem título, corpo, query ou fragmento.' >&2
    exit 1
  fi
  notification_not_before="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  set_env_value NOTIFICATION_ADAPTER bark
  set_env_value BARK_WEBHOOK_URL "${bark_webhook_url}"
  set_env_value BARK_NOTIFICATION_OPEN_URL "${PUBLIC_ORIGIN%/}/conversas"
  set_env_value BARK_TIMEOUT_MS 10000
  set_env_value NOTIFICATION_NOT_BEFORE "${notification_not_before}"
  set_env_value COMPOSE_PROFILES "$(add_compose_profile notifications)"
  unset bark_webhook_url notification_not_before
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if test "${enable_baileys}" = "1"; then
  binding="$(
    docker compose "${compose_arguments[@]}" exec -T postgres \
      psql -U "${DB_USER}" -d "${DB_NAME:-noter_donadio}" -At -F '|' \
      -c "SELECT account.workspace_id, account.id FROM whatsapp_accounts account WHERE account.identifier = 'primary' ORDER BY account.created_at LIMIT 2"
  )"
  binding_count="$(printf '%s\n' "${binding}" | sed '/^$/d' | wc -l)"
  if test "${binding_count}" -ne 1; then
    printf '%s\n' "A ativação Baileys exige exatamente uma conta primária existente; encontradas ${binding_count}."
    exit 1
  fi
  baileys_workspace_id="${binding%%|*}"
  baileys_account_id="${binding##*|}"
  baileys_encryption_key="${BAILEYS_ENCRYPTION_KEY:-$(openssl rand -base64 32)}"
  set_env_value WHATSAPP_ADAPTER baileys
  set_env_value COMPOSE_PROFILES "$(add_compose_profile baileys)"
  set_env_value MEDIA_DOWNLOAD_ADAPTER baileys
  set_env_value BAILEYS_WORKSPACE_ID "${baileys_workspace_id}"
  set_env_value BAILEYS_ACCOUNT_ID "${baileys_account_id}"
  set_env_value BAILEYS_ENCRYPTION_KEY "${baileys_encryption_key}"
  set_env_value BAILEYS_ENCRYPTION_KEY_VERSION "${BAILEYS_ENCRYPTION_KEY_VERSION:-1}"
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

git rev-parse --is-inside-work-tree >/dev/null
if test -n "$(git status --porcelain)"; then
  printf '%s\n' "O checkout da VPS possui alterações locais; deploy cancelado."
  exit 1
fi

if test "$(id -u)" = "0" && id noterops >/dev/null 2>&1; then
  /usr/sbin/visudo -cf deploy/sudoers/noterops >/dev/null
  install -m 440 deploy/sudoers/noterops /etc/sudoers.d/noterops
fi

docker compose "${compose_arguments[@]}" config --quiet

if test "${SKIP_BACKUP:-0}" != "1"; then
  COMPOSE_FILE="${compose_file}" scripts/backup-vps.sh
elif test "${reset_workspace_data}" = "1"; then
  printf '%s\n' "O reset de dados exige o snapshot automático; remova SKIP_BACKUP=1." >&2
  exit 1
fi

if test "${reset_workspace_data}" = "1"; then
  docker compose "${compose_arguments[@]}" --profile demo --profile assistive --profile baileys \
    stop backend outbox realtime baileys media-download retention analysis transcription
  CONFIRM_RESET_WORKSPACE_DATA=1 \
  COMPOSE_FILE="${compose_file}" \
    scripts/reset-workspace-data.sh
fi

docker compose "${compose_arguments[@]}" build backend frontend
docker compose "${compose_arguments[@]}" up -d --remove-orphans

assistive_workers_enabled=0
notification_worker_enabled=0
IFS=',' read -r -a configured_profiles <<< "${COMPOSE_PROFILES:-}"
for configured_profile in "${configured_profiles[@]}"; do
  if test "${configured_profile}" = "demo" || test "${configured_profile}" = "assistive"; then
    assistive_workers_enabled=1
  fi
  if test "${configured_profile}" = "notifications"; then
    notification_worker_enabled=1
  fi
done
if test "${assistive_workers_enabled}" = "0"; then
  docker compose "${compose_arguments[@]}" --profile demo --profile assistive stop analysis transcription
  docker compose "${compose_arguments[@]}" --profile demo --profile assistive rm -f analysis transcription
else
  for worker_service in analysis transcription; do
    worker_container="$(
      docker compose "${compose_arguments[@]}" ps --status running --quiet "${worker_service}"
    )"
    if test -z "${worker_container}"; then
      printf 'O worker %s não permaneceu em execução; deploy cancelado.\n' "${worker_service}" >&2
      docker compose "${compose_arguments[@]}" logs --tail 50 --no-color "${worker_service}" >&2
      exit 1
    fi
  done
fi

if test "${notification_worker_enabled}" = "0"; then
  docker compose "${compose_arguments[@]}" --profile notifications stop notification
  docker compose "${compose_arguments[@]}" --profile notifications rm -f notification
else
  notification_container="$(
    docker compose "${compose_arguments[@]}" ps --status running --quiet notification
  )"
  if test -z "${notification_container}"; then
    printf '%s\n' 'O worker de notificações não permaneceu em execução; deploy cancelado.' >&2
    docker compose "${compose_arguments[@]}" logs --tail 50 --no-color notification >&2
    exit 1
  fi
fi

for _attempt in $(seq 1 60); do
  if curl --fail --silent --show-error "${health_url}" >/dev/null; then
    break
  fi
  sleep 2
done

curl --fail --silent --show-error "${health_url}" >/dev/null
docker compose "${compose_arguments[@]}" ps
git rev-parse HEAD > .deployed-commit
chmod 600 .deployed-commit

printf '%s\n' "Deploy concluído no commit $(git rev-parse --short=12 HEAD)."

if test "${reset_admin_password}" = "1"; then
  RESET_ADMIN_WORKSPACE="${ADMIN_WORKSPACE_SLUG:-demo-cliente}"
  RESET_ADMIN_EMAIL="${ADMIN_EMAIL:-demo@example.com}"
  RESET_ADMIN_PASSWORD="$(openssl rand -base64 24)"
  export RESET_ADMIN_WORKSPACE RESET_ADMIN_EMAIL RESET_ADMIN_PASSWORD
  docker compose "${compose_arguments[@]}" run --rm --no-deps \
    -e RESET_ADMIN_WORKSPACE \
    -e RESET_ADMIN_EMAIL \
    -e RESET_ADMIN_PASSWORD \
    backend node dist/reset-admin-password.js
  printf 'Workspace: %s\nE-mail: %s\nSenha temporária: %s\n' \
    "${RESET_ADMIN_WORKSPACE}" "${RESET_ADMIN_EMAIL}" "${RESET_ADMIN_PASSWORD}"
  unset RESET_ADMIN_PASSWORD
fi

if test "${reprocess_failed_audio}" = "1"; then
  CONFIRM_REPROCESS_FAILED_AUDIO=1 \
  COMPOSE_FILE="${compose_file}" \
    scripts/reprocess-failed-audio-vps.sh
fi

if test "${reboot_if_required}" = "1"; then
  if test -f /var/run/reboot-required; then
    printf '%s\n' "Reinicialização requerida pelo sistema; reiniciando a VPS."
    sync
    systemctl reboot
  else
    printf '%s\n' "O sistema não requer reinicialização."
  fi
fi
