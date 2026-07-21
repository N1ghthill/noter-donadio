import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { internalTokensMatch } from '../../../shared/http/internal-auth.js';
import type { MessageIngestionService } from '../domain/message-ingestion.js';
import { isDirectChatJid } from '../domain/message-ingestion.js';

const requestSchema = z.object({
  workspaceId: z.uuid(),
  whatsappAccountId: z.uuid(),
  externalMessageId: z.string().trim().min(1).max(255),
  remoteJid: z.string().trim().min(1).max(255).refine(isDirectChatJid),
  phoneNumber: z.string().regex(/^\d{8,20}$/),
  displayName: z.string().trim().min(1).max(255).optional(),
  direction: z.enum(['inbound', 'outbound']),
  messageType: z.enum(['text', 'audio']),
  content: z.string().max(100_000).optional(),
  occurredAt: z.iso.datetime({ offset: true }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface RouteOptions {
  readonly ingestionService: MessageIngestionService;
  readonly internalToken: string;
}

export function registerMessageIngestionRoute(
  app: FastifyInstance,
  options: RouteOptions,
): void {
  app.post('/api/internal/messages/ingest', async (request, reply) => {
    const suppliedToken = request.headers['x-internal-token'];

    if (
      typeof suppliedToken !== 'string' ||
      !internalTokensMatch(suppliedToken, options.internalToken)
    ) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path,
        })),
      });
    }

    const result = await options.ingestionService.execute({
      ...parsed.data,
      occurredAt: new Date(parsed.data.occurredAt),
    });

    return reply.code(result.duplicate ? 200 : 201).send(result);
  });
}
