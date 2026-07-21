import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import {
  CrmConflictError,
  CrmNotFoundError,
  type CrmRepository,
} from '../domain/crm.repository.js';

const stageSchema = z.enum([
  'lead', 'qualified', 'proposal_sent', 'in_negotiation', 'on_hold', 'closed_won', 'closed_lost',
]);

export function registerCrmRoutes(
  app: FastifyInstance,
  options: { repository: CrmRepository; sessionAuthenticator: SessionAuthenticator },
): void {
  app.get('/api/contacts', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const query = z.object({ search: z.string().trim().max(255).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    return { data: await options.repository.listContacts(workspaceId, query.data.search, query.data.limit) };
  });

  app.post('/api/contacts', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const body = z.object({ displayName: z.string().trim().min(1).max(255), phoneNumber: z.string().min(8).max(30), tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]), notes: z.string().max(10_000).optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const contact = await options.repository.createContact({ workspaceId, ...body.data });
    return reply.code(201).send(contact);
  });

  app.get('/api/negotiations', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const query = z.object({ stage: stageSchema.optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    return { data: await options.repository.listNegotiations(workspaceId, query.data.stage) };
  });

  app.patch('/api/negotiations/:id/stage', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({ stage: stageSchema, expectedVersion: z.number().int().positive() }).safeParse(request.body);
    if (!workspaceId || !params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      return await options.repository.updateNegotiationStage({ workspaceId, negotiationId: params.data.id, ...body.data });
    } catch (error: unknown) {
      if (error instanceof CrmNotFoundError) return reply.code(404).send({ error: 'not_found' });
      if (error instanceof CrmConflictError) return reply.code(409).send({ error: 'version_conflict' });
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
