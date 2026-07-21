import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';

import { NEGOTIATION_STAGES } from '@noter/contracts';

import type { MessageIngestionService } from './modules/messages/domain/message-ingestion.js';
import { registerMessageIngestionRoute } from './modules/messages/http/message-ingestion.route.js';
import type { CrmRepository } from './modules/crm/domain/crm.repository.js';
import { registerCrmRoutes } from './modules/crm/http/crm.routes.js';
import type { AuthService, SessionAuthenticator } from './modules/auth/domain/auth.service.js';
import { registerAuthRoutes } from './modules/auth/http/auth.routes.js';

interface AppOptions {
  readonly ingestionService?: MessageIngestionService;
  readonly internalIngestionToken?: string;
  readonly crmRepository?: CrmRepository;
  readonly authService?: AuthService;
  readonly sessionAuthenticator?: SessionAuthenticator;
  readonly secureCookie?: boolean;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.content',
        'body.phoneNumber',
      ],
    },
  });

  void app.register(cookie);
  void app.register(rateLimit, { global: false });

  app.setErrorHandler((error, request, reply) => {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined;

    request.log.error(
      {
        errorName,
        errorCode,
      },
      'Falha não tratada na requisição',
    );

    return reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/health', async () => ({
    service: 'noter-backend',
    status: 'ok',
  }));

  app.get('/api/meta/negotiation-stages', async () => ({
    stages: NEGOTIATION_STAGES,
  }));

  if (options.ingestionService && options.internalIngestionToken) {
    registerMessageIngestionRoute(app, {
      ingestionService: options.ingestionService,
      internalToken: options.internalIngestionToken,
    });
  }

  if (options.authService) {
    registerAuthRoutes(app, {
      authService: options.authService,
      secureCookie: options.secureCookie ?? false,
    });
  }

  const sessionAuthenticator = options.sessionAuthenticator ?? options.authService;
  if (options.crmRepository && sessionAuthenticator) {
    registerCrmRoutes(app, {
      repository: options.crmRepository,
      sessionAuthenticator,
    });
  }

  return app;
}
