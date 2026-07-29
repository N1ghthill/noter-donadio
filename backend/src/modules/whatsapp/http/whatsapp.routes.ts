import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AuthenticatedUser, SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import {
  QrCodeUnavailableError,
  WhatsappAccountNotFoundError,
  WhatsappAuthenticationResetUnavailableError,
  WhatsappAlreadyConnectedError,
  WhatsappSimulationUnavailableError,
  type WhatsappConnectionService,
} from '../domain/whatsapp-connection.js';

export function registerWhatsappRoutes(
  app: FastifyInstance,
  options: {
    service: WhatsappConnectionService;
    sessionAuthenticator: SessionAuthenticator;
  },
): void {
  app.get('/api/whatsapp/connection', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    reply.header('cache-control', 'no-store');
    return options.service.get(workspaceId);
  });

  app.post('/api/whatsapp/setup', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    reply.header('cache-control', 'no-store');
    try {
      return await options.service.startSetup(workspaceId);
    } catch (error: unknown) {
      if (error instanceof WhatsappAlreadyConnectedError) {
        return reply.code(409).send({ error: 'already_connected' });
      }
      if (error instanceof QrCodeUnavailableError) {
        return reply.code(503).send({ error: 'qr_unavailable' });
      }
      throw error;
    }
  });

  app.delete('/api/whatsapp/session', async (request, reply) => {
    const user = await authenticatedUser(request, options.sessionAuthenticator);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const body = z.object({ confirmation: z.uuid() }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'confirmation_required' });
    reply.header('cache-control', 'no-store');
    try {
      return await options.service.resetAuthentication(
        user.workspaceId,
        body.data.confirmation,
        user.userId,
      );
    } catch (error: unknown) {
      if (error instanceof WhatsappAlreadyConnectedError) {
        return reply.code(409).send({ error: 'still_connected' });
      }
      if (error instanceof WhatsappAccountNotFoundError) {
        return reply.code(404).send({ error: 'not_found' });
      }
      if (error instanceof WhatsappAuthenticationResetUnavailableError) {
        return reply.code(404).send({ error: 'not_found' });
      }
      throw error;
    }
  });

  app.post('/api/whatsapp/demo/connect', async (request, reply) => {
    const workspaceId = await authenticatedWorkspace(request, options.sessionAuthenticator);
    if (!workspaceId) return reply.code(401).send({ error: 'unauthorized' });
    reply.header('cache-control', 'no-store');
    try {
      return await options.service.simulateScan(workspaceId);
    } catch (error: unknown) {
      if (error instanceof QrCodeUnavailableError) {
        return reply.code(409).send({ error: 'qr_unavailable' });
      }
      if (error instanceof WhatsappSimulationUnavailableError) {
        return reply.code(404).send({ error: 'not_found' });
      }
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
): Promise<AuthenticatedUser | null> {
  return authenticator.authenticate(request.cookies[SESSION_COOKIE_NAME]);
}
