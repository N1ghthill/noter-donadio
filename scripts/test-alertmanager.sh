#!/usr/bin/env bash
set -euo pipefail

alertmanager_url="${ALERTMANAGER_URL:-http://127.0.0.1:9093}"
alert_name="NoterSyntheticAlert"

for dependency in curl jq date; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "Dependência ausente: $dependency" >&2
    exit 1
  fi
done

post_alert() {
  local ends_at="$1"

  jq --null-input --compact-output \
    --arg alert_name "$alert_name" \
    --arg ends_at "$ends_at" \
    '[{
      labels: {
        alertname: $alert_name,
        severity: "warning",
        component: "observability-test"
      },
      annotations: {
        summary: "Exercício sintético local de roteamento"
      },
      startsAt: (now | todate),
      endsAt: $ends_at,
      generatorURL: "http://127.0.0.1/local-observability-exercise"
    }]' |
    curl --fail --silent --show-error \
      --header 'Content-Type: application/json' \
      --data-binary @- \
      "$alertmanager_url/api/v2/alerts"
}

resolve_alert() {
  post_alert "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" >/dev/null
}

trap resolve_alert EXIT INT TERM

post_alert "$(date -u -d '+10 minutes' +'%Y-%m-%dT%H:%M:%SZ')" >/dev/null

encoded_filter="alertname%3D%22${alert_name}%22"
alerts="$(curl --fail --silent --show-error \
  "$alertmanager_url/api/v2/alerts?active=true&silenced=false&inhibited=false&filter=${encoded_filter}")"

if ! jq --exit-status --arg alert_name "$alert_name" \
  'any(.[]; .labels.alertname == $alert_name and .status.state == "active")' \
  >/dev/null <<<"$alerts"; then
  echo "O alerta sintético não ficou ativo no Alertmanager." >&2
  exit 1
fi

resolve_alert
trap - EXIT INT TERM

echo "Exercício local concluído: alerta recebido e resolvido."
