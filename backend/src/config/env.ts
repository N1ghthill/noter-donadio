import { z } from 'zod';

const optionalSecret = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().min(32).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  INTERNAL_INGESTION_TOKEN: z.string().min(32),
  WHATSAPP_ADAPTER: z.enum(['disabled', 'fake']).default('disabled'),
  META_WEBHOOK_ENABLED: z.enum(['0', '1']).default('0').transform((value) => value === '1'),
  META_WEBHOOK_VERIFY_TOKEN: optionalSecret,
  META_APP_SECRET: optionalSecret,
  MEDIA_DOWNLOAD_ADAPTER: z.enum(['disabled', 'fake', 'meta']).default('disabled'),
  META_ACCESS_TOKEN: optionalSecret,
  META_GRAPH_API_VERSION: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().regex(/^v\d+\.\d+$/).optional(),
  ),
  TRANSCRIPTION_ADAPTER: z.enum(['disabled', 'fake']).default('disabled'),
  AI_ADAPTER: z.enum(['disabled', 'fake']).default('disabled'),
  MEDIA_STORAGE_PATH: z.string().trim().min(1).default('storage/media'),
  MEDIA_SIGNING_SECRET: z.string().min(32),
  MEDIA_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  MEDIA_MAX_BYTES: z.coerce.number().int().min(1_024).max(100 * 1024 * 1024).default(10 * 1024 * 1024),
  APP_ORIGINS: z.string()
    .default('http://localhost:5173,http://127.0.0.1:5173')
    .transform((value, context) => {
      const origins = value.split(',').map((item) => item.trim()).filter(Boolean);
      try {
        const normalized = origins.map((item) => {
          const url = new URL(item);
          if (!['http:', 'https:'].includes(url.protocol)
            || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
            throw new Error('invalid_origin');
          }
          return url.origin;
        });
        if (!normalized.length) throw new Error('empty_origins');
        return [...new Set(normalized)];
      } catch {
        context.addIssue({ code: 'custom', message: 'APP_ORIGINS deve conter origens HTTP(S) separadas por vírgula' });
        return z.NEVER;
      }
    }),
}).superRefine((environment, context) => {
  if (environment.META_WEBHOOK_ENABLED) {
    if (!environment.META_WEBHOOK_VERIFY_TOKEN) {
      context.addIssue({
        code: 'custom',
        path: ['META_WEBHOOK_VERIFY_TOKEN'],
        message: 'META_WEBHOOK_VERIFY_TOKEN é obrigatório quando o webhook está ativo',
      });
    }
    if (!environment.META_APP_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['META_APP_SECRET'],
        message: 'META_APP_SECRET é obrigatório quando o webhook está ativo',
      });
    }
  }
  if (environment.MEDIA_DOWNLOAD_ADAPTER === 'meta') {
    if (!environment.META_ACCESS_TOKEN) {
      context.addIssue({
        code: 'custom',
        path: ['META_ACCESS_TOKEN'],
        message: 'META_ACCESS_TOKEN é obrigatório para download de mídia da Meta',
      });
    }
    if (!environment.META_GRAPH_API_VERSION) {
      context.addIssue({
        code: 'custom',
        path: ['META_GRAPH_API_VERSION'],
        message: 'META_GRAPH_API_VERSION é obrigatória para download de mídia da Meta',
      });
    }
  }
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(source);
}
