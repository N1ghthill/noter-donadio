import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { readEnvironment } from '../../../config/env.js';
import { createPrismaClient } from '../../../config/database.js';
import { PrismaBullMqOperationalMetricsCollector } from './operational-metrics.js';

const environment = readEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);

test.after(async () => prisma.$disconnect());

test('coleta contagens persistidas e filas isoladas sem dados de negócio', async (context) => {
  const prefix = `metrics-test-${randomUUID()}`;
  const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', () => undefined);
  const queue = new Queue('ai-processing', { connection, prefix });
  const collector = new PrismaBullMqOperationalMetricsCollector(prisma, environment.REDIS_URL, prefix);
  context.after(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
    await collector.close();
  });
  await queue.add('synthetic-metrics-job', { internalId: randomUUID() });

  const snapshot = await collector.collect();

  assert.equal(snapshot.queues['ai-processing'].waiting, 1);
  assert.equal(snapshot.queues['media-download'].waiting, 0);
  assert.equal(snapshot.queues['audio-transcription'].waiting, 0);
  assert.equal(Number.isInteger(snapshot.mediaDeletionTasks), true);
  assert.equal(Object.keys(snapshot.outbox).length, 4);
  assert.equal(Object.keys(snapshot.mediaDownloads).length, 4);
  assert.equal(Object.keys(snapshot.transcriptions).length, 4);
  assert.equal(Object.keys(snapshot.analyses).length, 4);
});

test('fecha com segurança antes de a conexão Redis terminar de abrir', async () => {
  const collector = new PrismaBullMqOperationalMetricsCollector(
    prisma,
    environment.REDIS_URL,
    `metrics-close-test-${randomUUID()}`,
  );
  await collector.close();
});
