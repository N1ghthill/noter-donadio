import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import type { ContactDeletionService } from '../domain/contact-deletion.js';

export function registerContactDeletionRoute(
  app: FastifyInstance,
  options: { service: ContactDeletionService; sessionAuthenticator: SessionAuthenticator },
): void {
  app.delete('/api/contacts/:id', async (request, reply) => {
    const user = await authenticatedUser(request, options.sessionAuthenticator);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({ confirmation: z.uuid() }).strict().safeParse(request.body);
    if (!params.success || !body.success || body.data.confirmation !== params.data.id) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    const result = await options.service.deleteContact({
      workspaceId: user.workspaceId,
      userId: user.userId,
      contactId: params.data.id,
    });
    if (result.pendingMedia > 0) {
      request.log.warn({ pendingMediaCount: result.pendingMedia }, 'Remoção física de mídia ficou pendente');
    }
    return reply.code(204).send();
  });
}

function authenticatedUser(request: FastifyRequest, authenticator: SessionAuthenticator) {
  return authenticator.authenticate(request.cookies[SESSION_COOKIE_NAME]);
}
