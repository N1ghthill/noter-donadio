import { z } from 'zod';

import { parseBase64EncryptionKey } from '../modules/whatsapp/infrastructure/auth-state-cipher.js';

const baileysEnvironmentSchema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  BAILEYS_WORKSPACE_ID: z.uuid(),
  BAILEYS_ACCOUNT_ID: z.uuid(),
  BAILEYS_ENCRYPTION_KEY: z.string().transform((value, context) => {
    try {
      return parseBase64EncryptionKey(value);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'BAILEYS_ENCRYPTION_KEY deve ser base64 canônico de 32 bytes',
      });
      return z.NEVER;
    }
  }),
  BAILEYS_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).max(32_767).default(1),
});

export type BaileysEnvironment = z.infer<typeof baileysEnvironmentSchema>;

export function readBaileysEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): BaileysEnvironment {
  return baileysEnvironmentSchema.parse(source);
}
