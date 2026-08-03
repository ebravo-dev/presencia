import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export interface UatIntegrationMetrics {
  readonly registry: Registry;
  observe(method: string, route: string, statusCode: number, durationSeconds: number): void;
}

export function createUatIntegrationMetrics(): UatIntegrationMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'presencia_uat_integration_' });

  const requests = new Counter({
    name: 'presencia_uat_integration_http_requests_total',
    help: 'Total de solicitudes HTTP procesadas por UAT Integration.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'presencia_uat_integration_http_request_duration_seconds',
    help: 'Duración de solicitudes HTTP procesadas por UAT Integration.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry],
  });

  return {
    registry,
    observe(method, route, statusCode, durationSeconds) {
      const labels = { method, route, status_code: String(statusCode) };
      requests.inc(labels);
      duration.observe(labels, durationSeconds);
    },
  };
}

export function registerUatIntegrationMetrics(
  app: FastifyInstance,
  token: string,
): UatIntegrationMetrics {
  const metrics = createUatIntegrationMetrics();
  const requestStart = new WeakMap<FastifyRequest, bigint>();

  app.addHook('onRequest', async (request) => {
    requestStart.set(request, process.hrtime.bigint());
  });
  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStart.get(request);
    requestStart.delete(request);
    if (startedAt === undefined) return;
    metrics.observe(
      request.method,
      request.routeOptions.url ?? 'unmatched',
      reply.statusCode,
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
    );
  });
  app.get('/metrics', async (request, reply) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    return reply.type(metrics.registry.contentType).send(await metrics.registry.metrics());
  });

  return metrics;
}
