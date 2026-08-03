import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  INTERNAL_INGESTION_TOKEN: z.string().min(32),
  WHATSAPP_ADAPTER: z.enum(['disabled', 'fake', 'baileys']).default('disabled'),
  MEDIA_DOWNLOAD_ADAPTER: z.enum(['disabled', 'fake', 'baileys']).default('disabled'),
  TRANSCRIPTION_ADAPTER: z.enum(['disabled', 'fake', 'openai', 'groq']).default('disabled'),
  AI_ADAPTER: z.enum(['disabled', 'fake', 'openai', 'groq']).default('disabled'),
  TRANSCRIPTION_FEATURE_ENABLED: z.enum(['true', 'false']).default('false')
    .transform((value) => value === 'true'),
  AI_ANALYSIS_FEATURE_ENABLED: z.enum(['true', 'false']).default('false')
    .transform((value) => value === 'true'),
  ASSISTIVE_PROCESSING_NOT_BEFORE: z.iso.datetime({ offset: true }).optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_TRANSCRIPTION_MODEL: z.string().trim().min(1).max(100).default('gpt-4o-mini-transcribe'),
  OPENAI_ANALYSIS_MODEL: z.string().trim().min(1).max(100).default('gpt-5.6-sol'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  OPENAI_TRANSCRIPTION_MAX_DURATION_SECONDS: z.coerce.number().int().min(1).max(1_800).default(300),
  OPENAI_ANALYSIS_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(10_000).default(1_000),
  GROQ_API_KEY: z.string().min(20).optional(),
  GROQ_TRANSCRIPTION_MODEL: z.string().trim().min(1).max(100).default('whisper-large-v3-turbo'),
  GROQ_ANALYSIS_MODEL: z.string().trim().min(1).max(100).default('openai/gpt-oss-20b'),
  GROQ_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  GROQ_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  GROQ_TRANSCRIPTION_MAX_DURATION_SECONDS: z.coerce.number().int().min(1).max(1_800).default(300),
  GROQ_ANALYSIS_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(10_000).default(1_000),
  MEDIA_STORAGE_PATH: z.string().trim().min(1).default('storage/media'),
  MEDIA_SIGNING_SECRET: z.string().min(32),
  MEDIA_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  OUTBOX_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  MEDIA_ORPHAN_GRACE_HOURS: z.coerce.number().int().min(1).max(168).default(24),
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
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(source);
}
