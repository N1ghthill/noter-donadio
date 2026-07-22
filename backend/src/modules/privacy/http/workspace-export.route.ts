import type { FastifyInstance } from 'fastify';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import type { WorkspaceExportRepository } from '../domain/workspace-export.js';

export function registerWorkspaceExportRoute(
  app: FastifyInstance,
  options: {
    readonly repository: WorkspaceExportRepository;
    readonly sessionAuthenticator: SessionAuthenticator;
  },
): void {
  app.get('/api/privacy/workspace-export', {
    config: { rateLimit: { max: 1, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await options.sessionAuthenticator.authenticate(request.cookies.noter_session);
    if (!user || user.role !== 'admin') {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const document = await options.repository.exportWorkspace({
      workspaceId: user.workspaceId,
      userId: user.userId,
      exportedAt: new Date(),
    });
    if (!document) return reply.code(404).send({ error: 'not_found' });

    const safeSlug = document.workspace.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const exportDate = document.exportedAt.slice(0, 10);
    reply.header('cache-control', 'no-store');
    reply.header('content-type', 'application/json; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="noter-${safeSlug}-${exportDate}.json"`);
    reply.header('x-content-type-options', 'nosniff');
    return document;
  });
}
