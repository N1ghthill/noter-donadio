import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import {
  CrmConflictError,
  CrmCloseReasonRequiredError,
  CrmDecisionConflictError,
  CrmNotFoundError,
  CrmNoNextActionError,
  CrmTagLimitError,
  type CrmRepository,
} from '../domain/crm.repository.js';

const stageSchema = z.enum([
  'lead', 'qualified', 'proposal_sent', 'in_negotiation', 'on_hold', 'closed_won', 'closed_lost',
]);
const phoneSchema = z.string().min(8).max(30).refine(
  (value) => value.replace(/\D/g, '').length >= 8 && value.replace(/\D/g, '').length <= 20,
);
const moneySchema = z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/);

export function registerCrmRoutes(
  app: FastifyInstance,
  options: { repository: CrmRepository; sessionAuthenticator: SessionAuthenticator },
): void {
  app.get('/api/dashboard', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const query = z.object({
      periodDays: z.coerce.number().pipe(z.union([z.literal(30), z.literal(90), z.literal(365)])).default(30),
    }).strict().safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    return options.repository.getDashboard(workspaceId, query.data.periodDays);
  });

  app.get('/api/contacts', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const query = z.object({ search: z.string().trim().max(255).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    return { data: await options.repository.listContacts(workspaceId, query.data.search, query.data.limit) };
  });

  app.post('/api/contacts', async (request, reply) => {
    const user = await authenticatedUser(request, options.sessionAuthenticator);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const body = z.object({ displayName: z.string().trim().min(1).max(255), phoneNumber: phoneSchema, tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]), notes: z.string().max(10_000).optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const contact = await options.repository.createContact({ workspaceId: user.workspaceId, userId: user.userId, ...body.data });
    return reply.code(201).send(contact);
  });

  app.patch('/api/contacts/:id', async (request, reply) => {
    const user = await authenticatedUser(request, options.sessionAuthenticator);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({
      displayName: z.string().trim().min(1).max(255).optional(),
      phoneNumber: phoneSchema.optional(),
      tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
      notes: z.string().max(10_000).nullable().optional(),
    }).refine((value) => Object.keys(value).length > 0).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      return await options.repository.updateContact({
        workspaceId: user.workspaceId,
        userId: user.userId,
        contactId: params.data.id,
        ...body.data,
      });
    } catch (error: unknown) {
      if (error instanceof CrmNotFoundError) return reply.code(404).send({ error: 'not_found' });
      throw error;
    }
  });

  app.get('/api/negotiations', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const query = z.object({
      stage: stageSchema.optional(),
      followUp: z.enum(['overdue', 'today', 'upcoming', 'missing']).optional(),
      activeOnly: z.enum(['true']).transform(() => true).optional(),
      search: z.string().trim().min(1).max(255).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(200),
    }).strict().safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_request' });
    return { data: await options.repository.listNegotiations(workspaceId, query.data) };
  });

  app.post('/api/negotiations', async (request, reply) => {
    const user = await authenticatedUser(request, options.sessionAuthenticator);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const body = z.object({
      contactId: z.uuid(),
      title: z.string().trim().min(1).max(255).optional(),
      stage: stageSchema.default('lead'),
      value: moneySchema.optional(),
      currency: z.literal('BRL').default('BRL'),
      expectedCloseDate: z.iso.date().optional(),
      productInterest: z.string().trim().min(1).max(1_000).optional(),
      nextAction: z.string().trim().min(1).max(1_000).optional(),
      nextActionDueDate: z.iso.date().optional(),
    }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      const negotiation = await options.repository.createNegotiation({
        workspaceId: user.workspaceId,
        userId: user.userId,
        ...body.data,
      });
      return reply.code(201).send(negotiation);
    } catch (error: unknown) {
      if (error instanceof CrmNotFoundError) return reply.code(404).send({ error: 'contact_not_found' });
      throw error;
    }
  });

  app.get('/api/negotiations/:id', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      return await options.repository.getNegotiation(workspaceId, params.data.id);
    } catch (error: unknown) {
      if (error instanceof CrmNotFoundError) return reply.code(404).send({ error: 'not_found' });
      throw error;
    }
  });

  app.patch('/api/negotiations/:id', async (request, reply) => {
    const user = await authenticatedUser(request, options.sessionAuthenticator);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({
      expectedVersion: z.number().int().positive(),
      title: z.string().trim().min(1).max(255).nullable().optional(),
      value: moneySchema.nullable().optional(),
      expectedCloseDate: z.iso.date().nullable().optional(),
      productInterest: z.string().trim().min(1).max(1_000).nullable().optional(),
      nextAction: z.string().trim().min(1).max(1_000).nullable().optional(),
      nextActionDueDate: z.iso.date().nullable().optional(),
    }).strict().refine((value) => Object.keys(value).some((field) => field !== 'expectedVersion')).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      return await options.repository.updateNegotiation({
        workspaceId: user.workspaceId,
        userId: user.userId,
        negotiationId: params.data.id,
        ...body.data,
      });
    } catch (error: unknown) {
      if (error instanceof CrmNotFoundError) return reply.code(404).send({ error: 'not_found' });
      if (error instanceof CrmConflictError) return reply.code(409).send({ error: 'version_conflict' });
      throw error;
    }
  });

  app.patch('/api/negotiations/:id/stage', async (request, reply) => {
    const user = await authenticatedUser(request, options.sessionAuthenticator);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({
      stage: stageSchema,
      expectedVersion: z.number().int().positive(),
      closeReason: z.string().trim().min(1).max(1_000).optional(),
    }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    const closing = body.data.stage === 'closed_won' || body.data.stage === 'closed_lost';
    if (closing !== (body.data.closeReason !== undefined)) {
      return reply.code(400).send({ error: closing ? 'close_reason_required' : 'invalid_request' });
    }
    try {
      return await options.repository.updateNegotiationStage({
        workspaceId: user.workspaceId,
        userId: user.userId,
        negotiationId: params.data.id,
        ...body.data,
      });
    } catch (error: unknown) {
      if (error instanceof CrmNotFoundError) return reply.code(404).send({ error: 'not_found' });
      if (error instanceof CrmConflictError) return reply.code(409).send({ error: 'version_conflict' });
      if (error instanceof CrmCloseReasonRequiredError) return reply.code(400).send({ error: 'close_reason_required' });
      throw error;
    }
  });

  app.post('/api/negotiations/:id/next-action/complete', async (request, reply) => {
    const user = await authenticatedUser(request, options.sessionAuthenticator);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({ expectedVersion: z.number().int().positive() }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      return await options.repository.completeNextAction({
        workspaceId: user.workspaceId,
        userId: user.userId,
        negotiationId: params.data.id,
        expectedVersion: body.data.expectedVersion,
      });
    } catch (error: unknown) {
      if (error instanceof CrmNotFoundError) return reply.code(404).send({ error: 'not_found' });
      if (error instanceof CrmNoNextActionError) return reply.code(409).send({ error: 'next_action_missing' });
      if (error instanceof CrmConflictError) return reply.code(409).send({ error: 'version_conflict' });
      throw error;
    }
  });

  app.post('/api/negotiations/:id/analyses/:analysisId/decision', async (request, reply) => {
    const user = await authenticatedUser(request, options.sessionAuthenticator);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const params = z.object({ id: z.uuid(), analysisId: z.uuid() }).safeParse(request.params);
    const body = z.discriminatedUnion('decision', [
      z.object({
        decisionId: z.uuid(),
        decision: z.literal('accepted'),
        expectedVersion: z.number().int().positive(),
        stage: stageSchema.optional(),
        tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
        value: moneySchema.optional(),
        expectedCloseDate: z.iso.date().optional(),
        productInterest: z.string().trim().min(1).max(1_000).optional(),
        nextAction: z.string().trim().min(1).max(1_000).optional(),
        nextActionDueDate: z.iso.date().optional(),
      }).strict().refine((value) => value.stage !== undefined
        || Boolean(value.tags?.length)
        || value.value !== undefined
        || value.expectedCloseDate !== undefined
        || value.productInterest !== undefined
        || value.nextAction !== undefined
        || value.nextActionDueDate !== undefined),
      z.object({
        decisionId: z.uuid(),
        decision: z.literal('ignored'),
        expectedVersion: z.number().int().positive(),
      }).strict(),
    ]).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
    try {
      return await options.repository.decideAnalysis({
        workspaceId: user.workspaceId,
        userId: user.userId,
        negotiationId: params.data.id,
        analysisId: params.data.analysisId,
        ...body.data,
      });
    } catch (error: unknown) {
      if (error instanceof CrmNotFoundError) return reply.code(404).send({ error: 'not_found' });
      if (error instanceof CrmConflictError) return reply.code(409).send({ error: 'version_conflict' });
      if (error instanceof CrmDecisionConflictError) return reply.code(409).send({ error: 'decision_conflict' });
      if (error instanceof CrmTagLimitError) return reply.code(409).send({ error: 'contact_tag_limit' });
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

async function authenticatedUser(
  request: FastifyRequest,
  authenticator: SessionAuthenticator,
) {
  return authenticator.authenticate(request.cookies[SESSION_COOKIE_NAME]);
}
