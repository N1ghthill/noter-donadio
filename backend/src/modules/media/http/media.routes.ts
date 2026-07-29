import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import {
  InvalidMediaSignatureError,
  MediaNotFoundError,
  type MediaAccessService,
} from '../domain/media-access.js';
import type { ContactFileRepository } from '../domain/contact-file.repository.js';

export function registerMediaRoutes(
  app: FastifyInstance,
  options: {
    service: MediaAccessService;
    sessionAuthenticator: SessionAuthenticator;
    contactFileRepository?: ContactFileRepository | undefined;
  },
): void {
  const contactFileRepository = options.contactFileRepository;
  if (contactFileRepository) {
    app.get('/api/files', async (request, reply) => {
      const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
      if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
      const query = z.object({
        contactId: z.uuid().optional(),
        search: z.string().trim().min(1).max(255).optional(),
        fileType: z.enum(['audio', 'image', 'document']).optional(),
        direction: z.enum(['inbound', 'outbound']).optional(),
        occurredFrom: z.coerce.date().optional(),
        occurredTo: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
      }).strict().refine(
        (value) => !value.occurredFrom || !value.occurredTo || value.occurredFrom < value.occurredTo,
        { message: 'invalid_date_range' },
      ).safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
      reply.header('cache-control', 'no-store');
      const files = await contactFileRepository.list({
          workspaceId,
          limit: query.data.limit + 1,
          offset: query.data.offset,
          now: new Date(),
          ...(query.data.contactId ? { contactId: query.data.contactId } : {}),
          ...(query.data.search ? { search: query.data.search } : {}),
          ...(query.data.fileType ? { fileType: query.data.fileType } : {}),
          ...(query.data.direction ? { direction: query.data.direction } : {}),
          ...(query.data.occurredFrom ? { occurredFrom: query.data.occurredFrom } : {}),
          ...(query.data.occurredTo ? { occurredTo: query.data.occurredTo } : {}),
        });
      const hasMore = files.length > query.data.limit;
      return {
        data: files.slice(0, query.data.limit),
        meta: {
          limit: query.data.limit,
          offset: query.data.offset,
          hasMore,
          nextOffset: hasMore ? query.data.offset + query.data.limit : null,
        },
      };
    });
  }

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
        .header(
          'content-disposition',
          `${media.disposition}; filename*=UTF-8''${encodeURIComponent(media.fileName)}`,
        )
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
