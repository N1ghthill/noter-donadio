#!/usr/bin/env bash

validate_groq_model_access() {
  if test "$#" -ne 2; then
    printf '%s\n' "Validação Groq exige chave e modelo." >&2
    return 2
  fi

  local api_key="$1"
  local model="$2"
  local curl_command="${GROQ_CURL_BIN:-curl}"
  local response
  local response_body
  local http_status

  if ! [[ "${api_key}" =~ ^gsk_[A-Za-z0-9_-]{20,}$ ]]; then
    printf '%s\n' "Chave Groq fora do formato aceito." >&2
    return 1
  fi
  if ! [[ "${model}" =~ ^[A-Za-z0-9._/-]{1,100}$ ]] || [[ "${model}" == *..* ]]; then
    printf '%s\n' "Identificador de modelo Groq inválido." >&2
    return 1
  fi

  if ! response="$(
    {
      printf 'header = "Authorization: Bearer %s"\n' "${api_key}"
    } | "${curl_command}" \
      --silent \
      --show-error \
      --config - \
      --write-out $'\n%{http_code}' \
      --connect-timeout 10 \
      --max-time 20 \
      "https://api.groq.com/openai/v1/models"
  )"; then
    printf 'Não foi possível validar acesso ao modelo Groq %s.\n' "${model}" >&2
    return 1
  fi

  http_status="${response##*$'\n'}"
  response_body="${response%$'\n'*}"

  if test "${http_status}" != "200"; then
    printf 'Acesso ao modelo Groq %s recusado (HTTP %s).\n' "${model}" "${http_status}" >&2
    return 1
  fi
  if ! printf '%s' "${response_body}" | tr -d '[:space:]' \
    | grep --fixed-strings --quiet "\"id\":\"${model}\""; then
    printf 'Modelo Groq %s não está disponível para esta chave.\n' "${model}" >&2
    return 1
  fi
}
