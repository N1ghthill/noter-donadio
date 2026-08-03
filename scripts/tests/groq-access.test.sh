#!/usr/bin/env bash
set -euo pipefail

project_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/lib/groq-access.sh
source "${project_directory}/scripts/lib/groq-access.sh"

fake_curl_success() {
  local configuration
  configuration="$(cat)"
  [[ "${configuration}" == *'Authorization: Bearer gsk_test_key_with_adequate_length'* ]]
  [[ "$*" == *'https://api.groq.com/openai/v1/models'* ]]
  printf '{"data":[{"id":"openai/gpt-oss-20b"}]}\n200'
}

fake_curl_unauthorized() {
  cat >/dev/null
  printf '{}\n401'
}

GROQ_CURL_BIN=fake_curl_success \
  validate_groq_model_access 'gsk_test_key_with_adequate_length' 'openai/gpt-oss-20b'

if GROQ_CURL_BIN=fake_curl_unauthorized \
  validate_groq_model_access 'gsk_test_key_with_adequate_length' 'openai/gpt-oss-20b' 2>/dev/null; then
  printf '%s\n' "A validação deveria recusar HTTP 401." >&2
  exit 1
fi

if GROQ_CURL_BIN=fake_curl_success \
  validate_groq_model_access 'curta' 'openai/gpt-oss-20b' 2>/dev/null; then
  printf '%s\n' "A validação deveria recusar chave curta." >&2
  exit 1
fi

if GROQ_CURL_BIN=fake_curl_success \
  validate_groq_model_access 'gsk_test_key_with_adequate_length' '../modelo' 2>/dev/null; then
  printf '%s\n' "A validação deveria recusar modelo inseguro." >&2
  exit 1
fi

printf '%s\n' "Validação segura de acesso Groq aprovada."
