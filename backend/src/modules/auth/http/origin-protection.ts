import type { FastifyInstance } from 'fastify';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function registerOriginProtection(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  const allowed = new Set(allowedOrigins);
  app.addHook('onRequest', async (request, reply) => {
    if (SAFE_METHODS.has(request.method)
      || !request.url.startsWith('/api/')
      || request.url.startsWith('/api/internal/')) {
      return;
    }
    const origin = request.headers.origin;
    if (!origin || !allowed.has(origin)) {
      return reply.code(403).send({ error: 'invalid_origin' });
    }
  });
}
