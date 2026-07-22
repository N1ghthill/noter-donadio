import type { FastifyInstance } from 'fastify';

import { internalTokensMatch } from '../../../shared/http/internal-auth.js';
import type { ReadinessProbe } from '../domain/readiness.js';

interface HealthRouteOptions {
  readonly readinessProbe: ReadinessProbe;
  readonly internalToken: string;
}

export function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions,
): void {
  app.get('/api/internal/health/ready', async (request, reply) => {
    const suppliedToken = request.headers['x-internal-token'];
    if (
      typeof suppliedToken !== 'string'
      || !internalTokensMatch(suppliedToken, options.internalToken)
    ) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    reply.header('Cache-Control', 'no-store');
    const checks = await options.readinessProbe.check();
    const ready = checks.database === 'ok' && checks.redis === 'ok';
    return reply.code(ready ? 200 : 503).send({
      service: 'noter-backend',
      status: ready ? 'ready' : 'unavailable',
      checks,
    });
  });
}
