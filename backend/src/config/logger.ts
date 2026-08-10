import pino, { type Logger } from 'pino';

const REDACTED_PATHS = [
  'authorization',
  'cookie',
  'content',
  'notes',
  'password',
  'phoneNumber',
  'qr',
  'transcription',
  'webhookUrl',
  'barkWebhookUrl',
] as const;

export function createAppLogger(service: string): Logger {
  return pino({
    name: service,
    redact: {
      paths: [...REDACTED_PATHS],
      censor: '[REDACTED]',
    },
  });
}

export function safeErrorContext(error: unknown): Readonly<{
  errorName: string;
  errorCode?: string | undefined;
}> {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const errorCode = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code).slice(0, 100)
    : undefined;
  return { errorName, ...(errorCode ? { errorCode } : {}) };
}
