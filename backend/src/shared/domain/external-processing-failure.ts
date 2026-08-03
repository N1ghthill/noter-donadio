export type ExternalProcessingFailure =
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'REQUEST_REJECTED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'OUTPUT_INVALID'
  | 'INPUT_INVALID'
  | 'PROCESSING_FAILED';

export function classifyExternalProcessingFailure(error: unknown): ExternalProcessingFailure {
  const name = error instanceof Error ? error.name : '';
  const code = property(error, 'code').toLowerCase();
  const status = numericProperty(error, 'status');

  if (status === 401 || includesAny(name, code, ['authentication', 'invalid_api_key'])) {
    return 'AUTHENTICATION_FAILED';
  }
  if (status === 403 || includesAny(name, code, ['permission', 'forbidden'])) return 'PERMISSION_DENIED';
  if (status === 429 || includesAny(name, code, ['rate_limit', 'ratelimit'])) return 'RATE_LIMITED';
  if (status === 404 || includesAny(name, code, ['model_not_found'])) return 'MODEL_NOT_FOUND';
  if (includesAny(name, code, ['timeout', 'abort'])) return 'TIMEOUT';
  if (status !== null && status >= 500) return 'PROVIDER_UNAVAILABLE';
  if (status === 400 || status === 409 || status === 422) return 'REQUEST_REJECTED';
  if (includesAny(name, code, [
    'missingstructuredoutput', 'invalidanalysisoutput', 'invalidtranscriptionoutput', 'zod',
    'invalid_analysis', 'unexpected_analysis', 'invalid_transcription',
  ])) return 'OUTPUT_INVALID';
  if (includesAny(name, code, [
    'inputlimit', 'durationlimit', 'unsupportedaudioformat', 'unsupportedpromptversion',
  ])) return 'INPUT_INVALID';
  return 'PROCESSING_FAILED';
}

function property(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || !(key in value)) return '';
  const propertyValue = Reflect.get(value, key) as unknown;
  return typeof propertyValue === 'string' || typeof propertyValue === 'number'
    ? String(propertyValue)
    : '';
}

function numericProperty(value: unknown, key: string): number | null {
  const parsed = Number(property(value, key));
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : null;
}

function includesAny(name: string, code: string, needles: readonly string[]): boolean {
  const value = `${name} ${code}`.toLowerCase();
  return needles.some((needle) => value.includes(needle));
}
