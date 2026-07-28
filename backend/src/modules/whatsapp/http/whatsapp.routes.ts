import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';
import {
  QrCodeUnavailableError,
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
    return options.service.startSetup(workspaceId);
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
