import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { buildApp } from './app.js';
import { createPrismaClient } from './config/database.js';
import { MessageAnalysisService } from './modules/analysis/domain/message-analysis.js';
import { parseMessageAnalysisJob } from './modules/analysis/infrastructure/analysis-job.js';
import { FakeMessageAnalyzer } from './modules/analysis/infrastructure/fake-message-analyzer.js';
import { PrismaMessageAnalysisRepository } from './modules/analysis/infrastructure/prisma-message-analysis.repository.js';
import { MessageIngestionService } from './modules/messages/domain/message-ingestion.js';
import { PrismaMessageIngestionRepository } from './modules/messages/infrastructure/prisma-message-ingestion.repository.js';
import { OutboxDispatcher } from './modules/outbox/domain/outbox-dispatcher.js';
import { BullMqEventPublisher } from './modules/outbox/infrastructure/bullmq-event.publisher.js';
import { PrismaOutboxRepository } from './modules/outbox/infrastructure/prisma-outbox.repository.js';
import { parseRealtimeEvent, type RealtimeEvent } from './modules/realtime/infrastructure/realtime-event.js';

test('pipeline integrado processa texto de HTTP até análise e notificação em tempo real', {
  timeout: 15_000,
}, async (context) => {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  assert.ok(databaseUrl, 'DATABASE_URL é obrigatória para o teste ponta a ponta');
  assert.ok(redisUrl, 'REDIS_URL é obrigatória para o teste ponta a ponta');

  const workspaceId = randomUUID();
  const accountId = randomUUID();
  const externalMessageId = randomUUID();
  const queuePrefix = `noter-e2e-${randomUUID()}`;
  const internalToken = 'token-interno-e2e-com-mais-de-trinta-e-dois-caracteres';
  const prisma = createPrismaClient(databaseUrl);
  const analysisConnection = redisConnection(redisUrl);
  const realtimeConnection = redisConnection(redisUrl);
  const publisher = new BullMqEventPublisher(redisUrl, undefined, queuePrefix);
  const events: RealtimeEvent[] = [];
  const analysisService = new MessageAnalysisService(
    new PrismaMessageAnalysisRepository(prisma),
    new FakeMessageAnalyzer(),
  );
  const analysisWorker = new Worker(
    'ai-processing',
    async (job) => {
      const payload = parseMessageAnalysisJob(job.name, job.data);
      const result = await analysisService.execute(payload.workspaceId, payload.messageId);
      if (result.status === 'busy') throw new Error('analysis_lease_busy');
    },
    { connection: analysisConnection, prefix: queuePrefix },
  );
  const realtimeWorker = new Worker(
    'realtime-events',
    async (job) => {
      events.push(parseRealtimeEvent(job.name, job.data));
    },
    { connection: realtimeConnection, prefix: queuePrefix },
  );
  const ingestionService = new MessageIngestionService(
    new PrismaMessageIngestionRepository(prisma),
  );
  const app = buildApp({
    ingestionService,
    internalIngestionToken: internalToken,
  });

  context.after(async () => {
    await app.close();
    await Promise.all([analysisWorker.close(), realtimeWorker.close()]);
    await publisher.close();
    await Promise.all([analysisConnection.quit(), realtimeConnection.quit()]);
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  await prisma.workspace.create({
    data: {
      id: workspaceId,
      slug: `e2e-${workspaceId}`,
      name: 'Workspace E2E fictício',
      whatsappAccounts: {
        create: {
          id: accountId,
          identifier: `e2e-${accountId}`,
          connectionStatus: 'connected',
        },
      },
    },
  });
  await Promise.all([analysisWorker.waitUntilReady(), realtimeWorker.waitUntilReady()]);

  const request = {
    method: 'POST' as const,
    url: '/api/internal/messages/ingest',
    headers: { 'x-internal-token': internalToken },
    payload: {
      workspaceId,
      whatsappAccountId: accountId,
      externalMessageId,
      remoteJid: '5571999999999@s.whatsapp.net',
      phoneNumber: '5571999999999',
      displayName: 'Contato E2E fictício',
      direction: 'inbound',
      messageType: 'text',
      content: 'Mensagem fictícia para validar o pipeline integrado.',
      occurredAt: new Date().toISOString(),
    },
  };
  const created = await app.inject(request);
  assert.equal(created.statusCode, 201);
  const messageId = created.json<{ messageId: string }>().messageId;

  const repeated = await app.inject(request);
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.json<{ messageId: string }>().messageId, messageId);

  const dispatcher = new OutboxDispatcher(
    new PrismaOutboxRepository(prisma, workspaceId),
    publisher,
  );
  const firstDispatch = await dispatcher.dispatchBatch(10);
  assert.deepEqual(firstDispatch, { claimed: 2, published: 2, failed: 0 });

  await waitFor(async () => prisma.aiAnalysis.findFirst({
    where: { workspaceId, messageId, state: 'completed' },
    select: { id: true },
  }));
  const secondDispatch = await dispatcher.dispatchBatch(10);
  assert.deepEqual(secondDispatch, { claimed: 1, published: 1, failed: 0 });

  await waitFor(async () => events.some((event) => event.type === 'analysis.changed'));
  assert.ok(events.some((event) => event.type === 'message.persisted'));
  assert.ok(events.some((event) => event.type === 'analysis.changed'));
  assert.equal(await prisma.message.count({ where: { workspaceId, externalMessageId } }), 1);
  assert.equal(await prisma.outboxEvent.count({
    where: { workspaceId, status: { not: 'published' } },
  }), 0);
});

function redisConnection(redisUrl: string): Redis {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', () => undefined);
  return connection;
}

async function waitFor<T>(read: () => Promise<T | undefined | null | false>): Promise<T> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value as T;
    await delay(25);
  }
  throw new Error('Tempo esgotado aguardando o pipeline assíncrono');
}
