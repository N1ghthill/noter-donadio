import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  INTERNAL_INGESTION_TOKEN: z.string().min(32),
  WHATSAPP_ADAPTER: z.enum(['disabled', 'fake']).default('disabled'),
  TRANSCRIPTION_ADAPTER: z.enum(['disabled', 'fake']).default('disabled'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(source);
}
