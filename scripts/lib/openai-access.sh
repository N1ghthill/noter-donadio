#!/usr/bin/env bash

validate_openai_model_access() {
  if test "$#" -ne 2; then
    printf '%s\n' "Validação OpenAI exige chave e modelo." >&2
    return 2
  fi

  local api_key="$1"
  local model="$2"
  local curl_command="${OPENAI_CURL_BIN:-curl}"
  local http_status

  if ! [[ "${api_key}" =~ ^[A-Za-z0-9_-]{20,}$ ]]; then
    printf '%s\n' "Chave OpenAI fora do formato aceito." >&2
    return 1
  fi
  if ! [[ "${model}" =~ ^[A-Za-z0-9._-]{1,100}$ ]]; then
    printf '%s\n' "Identificador de modelo OpenAI inválido." >&2
    return 1
  fi

  if ! http_status="$(
    {
      printf 'header = "Authorization: Bearer %s"\n' "${api_key}"
    } | "${curl_command}" \
      --silent \
      --show-error \
      --config - \
      --output /dev/null \
      --write-out '%{http_code}' \
      --connect-timeout 10 \
      --max-time 20 \
      "https://api.openai.com/v1/models/${model}"
  )"; then
    printf 'Não foi possível validar acesso ao modelo OpenAI %s.\n' "${model}" >&2
    return 1
  fi

  if test "${http_status}" != "200"; then
    printf 'Acesso ao modelo OpenAI %s recusado (HTTP %s).\n' "${model}" "${http_status}" >&2
    return 1
  fi
}
