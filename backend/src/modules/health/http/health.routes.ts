import type { FastifyInstance } from 'fastify';

import { internalTokensMatch } from '../../../shared/http/internal-auth.js';
import type { ReadinessProbe } from '../domain/readiness.js';
import {
  renderPrometheusMetrics,
  type OperationalMetricsCollector,
} from '../domain/operational-metrics.js';

interface HealthRouteOptions {
  readonly readinessProbe: ReadinessProbe;
  readonly internalToken: string;
  readonly metricsCollector?: OperationalMetricsCollector | undefined;
}

const METRICS_TIMEOUT_MS = 2_000;

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

  if (options.metricsCollector) {
    app.get('/api/internal/metrics', async (request, reply) => {
      const suppliedToken = request.headers['x-internal-token'];
      if (typeof suppliedToken !== 'string' || !internalTokensMatch(suppliedToken, options.internalToken)) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      reply.header('Cache-Control', 'no-store');
      try {
        const snapshot = await withTimeout(options.metricsCollector?.collect(), METRICS_TIMEOUT_MS);
        if (!snapshot) throw new Error('metrics_collector_unavailable');
        return reply
          .type('text/plain; version=0.0.4; charset=utf-8')
          .send(renderPrometheusMetrics(snapshot));
      } catch (error: unknown) {
        request.log.warn(
          { errorName: error instanceof Error ? error.name : 'UnknownError' },
          'Falha ao coletar métricas operacionais',
        );
        return reply
          .code(503)
          .type('text/plain; charset=utf-8')
          .send('# metrics unavailable\n');
      }
    });
  }
}

async function withTimeout<T>(operation: Promise<T> | undefined, timeoutMs: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation ?? Promise.resolve(undefined),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('metrics_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
