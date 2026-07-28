import type { FastifyInstance } from 'fastify';

import {
  InvalidMetaCloudMessageError,
  MetaCloudAccountNotMappedError,
  MetaCloudAudioNotReadyError,
  type MetaCloudIngestionService,
} from '../domain/meta-cloud-ingestion.js';
import {
  InvalidMetaWebhookPayloadError,
  normalizeMetaWebhookPayload,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from '../infrastructure/meta-cloud-webhook.js';

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export interface MetaCloudWebhookRouteOptions {
  readonly appSecret: string;
  readonly verifyToken: string;
  readonly ingestionService: Pick<MetaCloudIngestionService, 'execute'>;
}

export function registerMetaCloudWebhookRoutes(
  app: FastifyInstance,
  options: MetaCloudWebhookRouteOptions,
): void {
  app.get('/api/whatsapp/webhook', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const challenge = verifyMetaWebhookChallenge(request.query, options.verifyToken);
    if (challenge === null) return reply.code(403).send({ error: 'verification_failed' });
    return reply.type('text/plain; charset=utf-8').send(challenge);
  });

  void app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );

    webhookScope.post('/api/whatsapp/webhook', {
      bodyLimit: MAX_WEBHOOK_BYTES,
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      if (!Buffer.isBuffer(request.body)) {
        return reply.code(400).send({ error: 'invalid_request' });
      }

      const suppliedSignature = request.headers['x-hub-signature-256'];
      if (
        typeof suppliedSignature !== 'string'
        || !verifyMetaWebhookSignature(request.body, suppliedSignature, options.appSecret)
      ) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }

      let payload: unknown;
      try {
        payload = JSON.parse(request.body.toString('utf8')) as unknown;
      } catch {
        return reply.code(400).send({ error: 'invalid_request' });
      }

      try {
        const messages = normalizeMetaWebhookPayload(payload);
        await options.ingestionService.execute(messages);
        return reply.code(200).send({ received: true });
      } catch (error: unknown) {
        if (error instanceof InvalidMetaWebhookPayloadError) {
          return reply.code(400).send({ error: 'invalid_request' });
        }
        if (error instanceof InvalidMetaCloudMessageError) {
          return reply.code(400).send({ error: 'invalid_request' });
        }
        if (
          error instanceof MetaCloudAccountNotMappedError
          || error instanceof MetaCloudAudioNotReadyError
        ) {
          return reply.code(503).send({ error: 'temporarily_unavailable' });
        }
        throw error;
      }
    });
  });
}
