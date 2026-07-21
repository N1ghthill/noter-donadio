import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import {
  InvalidMediaSignatureError,
  MediaNotFoundError,
  type MediaAccessService,
} from '../domain/media-access.js';

export function registerMediaRoutes(
  app: FastifyInstance,
  options: { service: MediaAccessService; sessionAuthenticator: SessionAuthenticator },
): void {
  app.get('/api/media/:messageId/access', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ messageId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      return await options.service.createAccess(workspaceId, params.data.messageId);
    } catch (error: unknown) {
      if (error instanceof MediaNotFoundError) return reply.code(404).send({ error: 'not_found' });
      throw error;
    }
  });

  app.get('/api/media/:messageId/content', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ messageId: z.uuid() }).safeParse(request.params);
    const query = z.object({
      expires: z.coerce.number().int().positive(),
      signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    }).safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      const media = await options.service.read(
        workspaceId,
        params.data.messageId,
        query.data.expires,
        query.data.signature,
      );
      return reply
        .header('cache-control', 'private, no-store')
        .header('content-disposition', 'inline')
        .type(media.mimeType)
        .send(media.bytes);
    } catch (error: unknown) {
      if (error instanceof InvalidMediaSignatureError) return reply.code(403).send({ error: 'invalid_signature' });
      if (error instanceof MediaNotFoundError) return reply.code(404).send({ error: 'not_found' });
      throw error;
    }
  });
}

async function authenticatedWorkspace(
  request: FastifyRequest,
  authenticator: SessionAuthenticator,
): Promise<string | undefined> {
  const user = await authenticator.authenticate(request.cookies[SESSION_COOKIE_NAME]);
  return user?.workspaceId;
}
