import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import type { ConversationRepository } from '../domain/conversation.repository.js';
import {
  DemoWhatsappNotConnectedError,
  type DemoMessageService,
} from '../domain/demo-message.js';

interface ConversationRouteOptions {
  readonly repository: ConversationRepository;
  readonly sessionAuthenticator: SessionAuthenticator;
  readonly demoMessageService?: DemoMessageService | undefined;
}

export function registerConversationRoutes(
  app: FastifyInstance,
  options: ConversationRouteOptions,
): void {
  app.get('/api/conversations', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    return { data: await options.repository.list(workspaceId, query.data.limit) };
  });

  const demoMessageService = options.demoMessageService;
  if (demoMessageService) {
    app.post('/api/whatsapp/demo/messages', async (request, reply) => {
      const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
      if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
      const body = z.object({
        clientMessageId: z.uuid(),
        content: z.string().trim().min(1).max(2_000),
      }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'invalid_request' });

      try {
        const result = await demoMessageService.simulateInbound({
          workspaceId,
          ...body.data,
        });
        return reply.code(result.duplicate ? 200 : 201).send(result);
      } catch (error: unknown) {
        if (error instanceof DemoWhatsappNotConnectedError) {
          return reply.code(409).send({ error: 'whatsapp_not_connected' });
        }
        throw error;
      }
    });
  }
}

async function authenticatedWorkspace(
  request: FastifyRequest,
  authenticator: SessionAuthenticator,
): Promise<string | undefined> {
  const user = await authenticator.authenticate(request.cookies[SESSION_COOKIE_NAME]);
  return user?.workspaceId;
}
