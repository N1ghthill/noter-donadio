import { Redis } from 'ioredis';

import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  DependencyState,
  ReadinessProbe,
  ReadinessResult,
} from '../domain/readiness.js';

const DEFAULT_TIMEOUT_MS = 1_500;

export class DependencyReadinessProbe implements ReadinessProbe {
  private readonly redis: Redis;

  public constructor(
    private readonly prisma: PrismaClient,
    redisUrl: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.redis = new Redis(redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: timeoutMs,
    });
    this.redis.on('error', () => undefined);
  }

  public async check(): Promise<ReadinessResult> {
    const [database, redis] = await Promise.all([
      checkDependency(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }, this.timeoutMs),
      checkDependency(async () => {
        await this.redis.ping();
      }, this.timeoutMs),
    ]);
    return { database, redis };
  }

  public close(): void {
    this.redis.disconnect();
  }
}

async function checkDependency(
  action: () => Promise<void>,
  timeoutMs: number,
): Promise<DependencyState> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      action(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('dependency_timeout')), timeoutMs);
      }),
    ]);
    return 'ok';
  } catch {
    return 'unavailable';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
