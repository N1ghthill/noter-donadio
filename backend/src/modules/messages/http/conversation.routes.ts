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

const stageSchema = z.enum([
  'lead', 'qualified', 'proposal_sent', 'in_negotiation', 'on_hold', 'closed_won', 'closed_lost',
]);

export function registerConversationRoutes(
  app: FastifyInstance,
  options: ConversationRouteOptions,
): void {
  app.get('/api/conversations', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).max(100_000).default(0),
      activityFrom: z.iso.datetime({ offset: true }).optional(),
      activityTo: z.iso.datetime({ offset: true }).optional(),
      stage: stageSchema.optional(),
      aiStage: stageSchema.optional(),
      contactId: z.uuid().optional(),
      search: z.string().trim().min(1).max(255).optional(),
    }).strict().refine((value) => (
      !value.activityFrom || !value.activityTo || value.activityFrom < value.activityTo
    )).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    const conversations = await options.repository.list(workspaceId, {
        limit: query.data.limit + 1,
        offset: query.data.offset,
        ...(query.data.activityFrom ? { activityFrom: new Date(query.data.activityFrom) } : {}),
        ...(query.data.activityTo ? { activityTo: new Date(query.data.activityTo) } : {}),
        ...(query.data.stage ? { stage: query.data.stage } : {}),
        ...(query.data.aiStage ? { aiStage: query.data.aiStage } : {}),
        ...(query.data.contactId ? { contactId: query.data.contactId } : {}),
        ...(query.data.search ? { search: query.data.search } : {}),
      });
    const hasMore = conversations.length > query.data.limit;
    return {
      data: conversations.slice(0, query.data.limit),
      meta: {
        limit: query.data.limit,
        offset: query.data.offset,
        hasMore,
        nextOffset: hasMore ? query.data.offset + query.data.limit : null,
      },
    };
  });

  const demoMessageService = options.demoMessageService;
  if (demoMessageService) {
    app.post('/api/whatsapp/demo/messages', async (request, reply) => {
      const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
      if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
      const body = z.object({
        clientMessageId: z.uuid(),
        messageType: z.enum(['text', 'audio']).default('text'),
        content: z.string().trim().min(1).max(2_000).optional(),
      }).superRefine((value, context) => {
        if (value.messageType === 'text' && !value.content) {
          context.addIssue({ code: 'custom', path: ['content'], message: 'required_for_text' });
        }
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
