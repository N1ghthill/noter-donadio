import type { FastifyInstance } from 'fastify';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import type { NotificationStatusRepository } from '../domain/notification-status.js';

export function registerNotificationStatusRoutes(
  app: FastifyInstance,
  options: {
    readonly repository: NotificationStatusRepository;
    readonly sessionAuthenticator: SessionAuthenticator;
    readonly enabled: boolean;
  },
): void {
  app.get('/api/notifications/status', async (request, reply) => {
    const user = await options.sessionAuthenticator.authenticate(
      request.cookies[SESSION_COOKIE_NAME],
    );
    if (!user || user.role !== 'admin') return reply.code(401).send({ error: 'unauthorized' });
    const status = await options.repository.get(user.workspaceId);
    return reply.header('cache-control', 'no-store').send({
      enabled: options.enabled,
      channel: options.enabled ? 'bark' : null,
      automaticWhatsappRepliesEnabled: false,
      ...status,
    });
  });
}
