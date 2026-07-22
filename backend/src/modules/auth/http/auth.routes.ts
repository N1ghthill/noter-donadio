import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { AuthService, InvalidCredentialsError } from '../domain/auth.service.js';

export const SESSION_COOKIE_NAME = 'noter_session';

export function registerAuthRoutes(
  app: FastifyInstance,
  options: { authService: AuthService; secureCookie: boolean },
): void {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = z.object({
        workspace: z.string().trim().min(1).max(100),
        email: z.email().max(320),
        password: z.string().min(12).max(256),
      }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });

      try {
        const result = await options.authService.login(
          parsed.data.workspace,
          parsed.data.email,
          parsed.data.password,
        );
        reply.setCookie(SESSION_COOKIE_NAME, result.token, cookieOptions(options.secureCookie, result.expiresAt));
        reply.header('cache-control', 'no-store');
        return { user: result.user, expiresAt: result.expiresAt.toISOString() };
      } catch (error: unknown) {
        if (error instanceof InvalidCredentialsError) {
          return reply.code(401).send({ error: 'invalid_credentials' });
        }
        throw error;
      }
    },
  );

  app.get('/api/auth/me', async (request, reply) => {
    const user = await options.authService.authenticate(request.cookies[SESSION_COOKIE_NAME]);
    reply.header('cache-control', 'no-store');
    return user ? { user } : reply.code(401).send({ error: 'unauthorized' });
  });

  app.get('/api/auth/sessions', async (request, reply) => {
    const sessions = await options.authService.listSessions(request.cookies[SESSION_COOKIE_NAME]);
    reply.header('cache-control', 'no-store');
    return sessions ? { data: sessions } : reply.code(401).send({ error: 'unauthorized' });
  });

  app.delete('/api/auth/sessions/:id', async (request, reply) => {
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    const body = z.object({ confirmation: z.string() }).strict().safeParse(request.body);
    if (!params.success || !body.success || body.data.confirmation !== params.data.id) {
      return reply.code(400).send({ error: 'confirmation_required' });
    }
    const result = await options.authService.revokeManagedSession(
      request.cookies[SESSION_COOKIE_NAME], params.data.id,
    );
    if (!result) return reply.code(401).send({ error: 'unauthorized' });
    if (!result.revoked) return reply.code(404).send({ error: 'not_found' });
    if (result.current) {
      reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions(options.secureCookie));
      reply.header('clear-site-data', '"cache", "cookies", "storage"');
    }
    reply.header('cache-control', 'no-store');
    return reply.code(204).send();
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await options.authService.logout(request.cookies[SESSION_COOKIE_NAME]);
    reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions(options.secureCookie));
    reply.header('cache-control', 'no-store');
    reply.header('clear-site-data', '"cache", "cookies", "storage"');
    return reply.code(204).send();
  });
}

function cookieOptions(secure: boolean, expires?: Date) {
  return {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    ...(expires ? { expires } : {}),
  };
}
