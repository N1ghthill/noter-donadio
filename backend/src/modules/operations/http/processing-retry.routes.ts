import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import {
  PROCESSING_KINDS,
  type ProcessingFailureRepository,
} from '../domain/processing-retry.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const paramsSchema = z.object({
  kind: z.enum(PROCESSING_KINDS),
  messageId: z.uuid(),
}).strict();
const bodySchema = z.object({ confirmation: z.uuid() }).strict();

export function registerProcessingRetryRoutes(
  app: FastifyInstance,
  options: {
    readonly repository: ProcessingFailureRepository;
    readonly sessionAuthenticator: SessionAuthenticator;
    readonly notBefore: Date;
  },
): void {
  app.get('/api/processing-failures', async (request, reply) => {
    const user = await options.sessionAuthenticator.authenticate(request.cookies.noter_session);
    if (!user || user.role !== 'admin') return reply.code(401).send({ error: 'unauthorized' });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_query' });
    const data = await options.repository.list(user.workspaceId, query.data.limit, options.notBefore);
    reply.header('cache-control', 'no-store');
    return { data };
  });

  app.post('/api/processing-failures/:kind/:messageId/retry', async (request, reply) => {
    const user = await options.sessionAuthenticator.authenticate(request.cookies.noter_session);
    if (!user || user.role !== 'admin') return reply.code(401).send({ error: 'unauthorized' });
    const params = paramsSchema.safeParse(request.params);
    const body = bodySchema.safeParse(request.body);
    if (!params.success || !body.success || body.data.confirmation !== params.data.messageId) {
      return reply.code(400).send({ error: 'invalid_confirmation' });
    }
    const result = await options.repository.requestRetry({
      workspaceId: user.workspaceId,
      userId: user.userId,
      kind: params.data.kind,
      messageId: params.data.messageId,
      notBefore: options.notBefore,
    });
    if (result === 'missing') return reply.code(404).send({ error: 'processing_failure_not_found' });
    if (result !== 'queued') return reply.code(409).send({ error: `processing_retry_${result}` });
    return reply.code(202).send({ status: 'queued' });
  });
}
