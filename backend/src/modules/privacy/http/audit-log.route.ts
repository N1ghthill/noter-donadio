import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { AUDIT_ACTIONS, type AuditLogRepository } from '../domain/audit-log.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.enum(AUDIT_ACTIONS).optional(),
}).strict();

export function registerAuditLogRoute(
  app: FastifyInstance,
  options: {
    readonly repository: AuditLogRepository;
    readonly sessionAuthenticator: SessionAuthenticator;
  },
): void {
  app.get('/api/audit-events', async (request, reply) => {
    const user = await options.sessionAuthenticator.authenticate(request.cookies.noter_session);
    if (!user || user.role !== 'admin') return reply.code(401).send({ error: 'unauthorized' });

    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_query' });

    const data = await options.repository.list({
      workspaceId: user.workspaceId,
      limit: query.data.limit,
      ...(query.data.action ? { action: query.data.action } : {}),
    });
    reply.header('cache-control', 'no-store');
    return { data };
  });
}
