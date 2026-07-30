#!/usr/bin/env bash
set -euo pipefail

project_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/lib/openai-access.sh
source "${project_directory}/scripts/lib/openai-access.sh"

fake_curl_success() {
  local configuration
  configuration="$(cat)"
  [[ "${configuration}" == *'Authorization: Bearer test_key_with_adequate_length'* ]]
  [[ "$*" == *'https://api.openai.com/v1/models/gpt-5.6-sol'* ]]
  printf '200'
}

fake_curl_unauthorized() {
  cat >/dev/null
  printf '401'
}

OPENAI_CURL_BIN=fake_curl_success \
  validate_openai_model_access 'test_key_with_adequate_length' 'gpt-5.6-sol'

if OPENAI_CURL_BIN=fake_curl_unauthorized \
  validate_openai_model_access 'test_key_with_adequate_length' 'gpt-5.6-sol' 2>/dev/null; then
  printf '%s\n' "A validação deveria recusar HTTP 401." >&2
  exit 1
fi

if OPENAI_CURL_BIN=fake_curl_success \
  validate_openai_model_access 'curta' 'gpt-5.6-sol' 2>/dev/null; then
  printf '%s\n' "A validação deveria recusar chave curta." >&2
  exit 1
fi

if OPENAI_CURL_BIN=fake_curl_success \
  validate_openai_model_access 'test_key_with_adequate_length' $'modelo\ninjetado' 2>/dev/null; then
  printf '%s\n' "A validação deveria recusar modelo inseguro." >&2
  exit 1
fi

printf '%s\n' "Validação segura de acesso OpenAI aprovada."
