import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';

import { NEGOTIATION_STAGES } from '@noter/contracts';

import type { MessageIngestionService } from './modules/messages/domain/message-ingestion.js';
import { registerMessageIngestionRoute } from './modules/messages/http/message-ingestion.route.js';
import type { ConversationRepository } from './modules/messages/domain/conversation.repository.js';
import type { DemoMessageService } from './modules/messages/domain/demo-message.js';
import { registerConversationRoutes } from './modules/messages/http/conversation.routes.js';
import type { CrmRepository } from './modules/crm/domain/crm.repository.js';
import { registerCrmRoutes } from './modules/crm/http/crm.routes.js';
import type { AuthService, SessionAuthenticator } from './modules/auth/domain/auth.service.js';
import { registerAuthRoutes } from './modules/auth/http/auth.routes.js';
import { registerOriginProtection } from './modules/auth/http/origin-protection.js';
import type { WhatsappConnectionService } from './modules/whatsapp/domain/whatsapp-connection.js';
import { registerWhatsappRoutes } from './modules/whatsapp/http/whatsapp.routes.js';
import type { MediaAccessService } from './modules/media/domain/media-access.js';
import { registerMediaRoutes } from './modules/media/http/media.routes.js';
import type { ContactDeletionService } from './modules/privacy/domain/contact-deletion.js';
import { registerContactDeletionRoute } from './modules/privacy/http/contact-deletion.route.js';
import type { WorkspaceExportRepository } from './modules/privacy/domain/workspace-export.js';
import { registerWorkspaceExportRoute } from './modules/privacy/http/workspace-export.route.js';
import type { ReadinessProbe } from './modules/health/domain/readiness.js';
import { registerHealthRoutes } from './modules/health/http/health.routes.js';

interface AppOptions {
  readonly ingestionService?: MessageIngestionService;
  readonly internalIngestionToken?: string;
  readonly crmRepository?: CrmRepository;
  readonly authService?: AuthService;
  readonly sessionAuthenticator?: SessionAuthenticator;
  readonly secureCookie?: boolean;
  readonly whatsappService?: WhatsappConnectionService;
  readonly conversationRepository?: ConversationRepository;
  readonly demoMessageService?: DemoMessageService;
  readonly mediaAccessService?: MediaAccessService;
  readonly allowedOrigins?: readonly string[];
  readonly contactDeletionService?: ContactDeletionService;
  readonly workspaceExportRepository?: WorkspaceExportRepository;
  readonly readinessProbe?: ReadinessProbe;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.content',
        'body.notes',
        'body.password',
        'body.phoneNumber',
      ],
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url.split('?', 1)[0] ?? request.url,
          };
        },
      },
    },
  });

  void app.register(cookie);
  void app.register(rateLimit, { global: false });

  if (options.allowedOrigins) registerOriginProtection(app, options.allowedOrigins);

  app.setErrorHandler((error, request, reply) => {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined;

    if (errorCode?.startsWith('FST_ERR_CTP_')) {
      return reply.code(400).send({ error: 'invalid_request' });
    }

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

  if (options.readinessProbe && options.internalIngestionToken) {
    registerHealthRoutes(app, {
      readinessProbe: options.readinessProbe,
      internalToken: options.internalIngestionToken,
    });
  }

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

  if (options.contactDeletionService && sessionAuthenticator) {
    registerContactDeletionRoute(app, {
      service: options.contactDeletionService,
      sessionAuthenticator,
    });
  }

  if (options.workspaceExportRepository && sessionAuthenticator) {
    registerWorkspaceExportRoute(app, {
      repository: options.workspaceExportRepository,
      sessionAuthenticator,
    });
  }

  if (options.whatsappService && sessionAuthenticator) {
    registerWhatsappRoutes(app, {
      service: options.whatsappService,
      sessionAuthenticator,
    });
  }

  if (options.conversationRepository && sessionAuthenticator) {
    registerConversationRoutes(app, {
      repository: options.conversationRepository,
      sessionAuthenticator,
      demoMessageService: options.demoMessageService,
    });
  }

  if (options.mediaAccessService && sessionAuthenticator) {
    registerMediaRoutes(app, {
      service: options.mediaAccessService,
      sessionAuthenticator,
    });
  }

  return app;
}
