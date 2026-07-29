import type { FastifyInstance } from 'fastify';

import type { SessionAuthenticator } from '../../auth/domain/auth.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/http/auth.routes.js';

export interface ProductCapabilities {
  readonly demoSimulationEnabled: boolean;
  readonly audioTranscriptionEnabled: boolean;
  readonly messageAnalysisEnabled: boolean;
}

export function registerCapabilitiesRoutes(
  app: FastifyInstance,
  options: {
    readonly sessionAuthenticator: SessionAuthenticator;
    readonly capabilities: ProductCapabilities;
  },
): void {
  app.get('/api/capabilities', async (request, reply) => {
    const user = await options.sessionAuthenticator.authenticate(
      request.cookies[SESSION_COOKIE_NAME],
    );
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return reply
      .header('cache-control', 'no-store')
      .send(options.capabilities);
  });
}
