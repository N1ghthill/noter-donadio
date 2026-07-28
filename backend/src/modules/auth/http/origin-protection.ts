import type { FastifyInstance } from 'fastify';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const NON_BROWSER_MUTATION_PATHS = new Set([
  '/api/whatsapp/webhook',
]);

export function registerOriginProtection(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  const allowed = new Set(allowedOrigins);
  app.addHook('onRequest', async (request, reply) => {
    if (SAFE_METHODS.has(request.method)
      || !request.url.startsWith('/api/')
      || request.url.startsWith('/api/internal/')
      || NON_BROWSER_MUTATION_PATHS.has(request.url.split('?', 1)[0] ?? request.url)) {
      return;
    }
    const origin = request.headers.origin;
    if (!origin || !allowed.has(origin)) {
      return reply.code(403).send({ error: 'invalid_origin' });
    }
  });
}
