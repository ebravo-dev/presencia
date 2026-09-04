import { timingSafeEqual } from 'node:crypto';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { ZodError } from 'zod';
import type { LogIngestionService } from '../application/log-ingestion.service.js';
import type { LogRepository } from '../domain/log.repository.js';
import { logBatchSchema, logQuerySchema } from '../domain/log-event.js';
import type { AppLogEnv } from '../infrastructure/config.js';

export async function buildAppLogApp(options: {
  env: AppLogEnv;
  repository: LogRepository;
  ingestion: LogIngestionService;
  ready: () => Promise<boolean>;
}) {
  const app = Fastify({
    bodyLimit: 1_000_000,
    logger: { level: options.env.NODE_ENV === 'test' ? 'silent' : 'info' },
    // This service is private and receives traffic through exactly one
    // Gateway hop. Never trust an arbitrary client-provided proxy chain.
    trustProxy: 1,
  });
  const registry = new Registry();
  const requestStart = new Map<string, bigint>();
  collectDefaultMetrics({ register: registry, prefix: 'presencia_app_logs_' });
  const httpRequests = new Counter({
    name: 'presencia_app_logs_http_requests_total', help: 'HTTP requests handled by App Log Service',
    labelNames: ['method', 'route', 'status_code'], registers: [registry],
  });
  const httpDuration = new Histogram({
    name: 'presencia_app_logs_http_request_duration_seconds', help: 'App Log Service HTTP request duration',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [registry],
  });
  const acknowledged = new Counter({
    name: 'presencia_app_logs_events_acknowledged_total', help: 'Committed or idempotently acknowledged mobile log events',
    labelNames: ['application', 'level'], registers: [registry],
  });
  const duplicates = new Counter({
    name: 'presencia_app_logs_duplicates_total', help: 'Idempotently acknowledged duplicate events', registers: [registry],
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { global: false });
  app.addHook('onRequest', async (request) => {
    requestStart.set(request.id, process.hrtime.bigint());
  });
  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStart.get(request.id);
    requestStart.delete(request.id);
    if (startedAt === undefined) return;
    const labels = {
      method: request.method,
      route: request.routeOptions.url ?? 'unknown',
      status_code: String(reply.statusCode),
    };
    httpRequests.inc(labels);
    httpDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1_000_000_000);
  });

  const internal = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!secureHeaderEquals(request.headers['x-internal-service-token'], options.env.INTERNAL_API_TOKEN)) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  };
  const mobileClient = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!secureHeaderEquals(request.headers['x-app-log-key'], options.env.APP_LOG_INGESTION_KEY)) {
      return reply.code(401).send({ error: 'INVALID_APP_LOG_KEY', message: 'Cliente de logs no autorizado.' });
    }
  };

  app.get('/health/live', async () => ({ status: 'ok', service: 'app-log-service' }));
  app.get('/health', async () => ({ status: 'ok', service: 'app-log-service' }));
  app.get('/health/ready', async (_request, reply) => {
    const database = await options.ready();
    return reply.code(database ? 200 : 503).send({ status: database ? 'ok' : 'degraded', dependencies: { database } });
  });
  app.get('/metrics', async (request, reply) => {
    if (!secureHeaderEquals(bearer(request.headers.authorization), options.env.METRICS_TOKEN)) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    return reply.type(registry.contentType).send(await registry.metrics());
  });

  app.post('/api/app-logs/batches', {
    preHandler: mobileClient,
    config: { rateLimit: { max: options.env.INGESTION_RATE_LIMIT_MAX, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const batch = logBatchSchema.parse(request.body);
    const result = await options.ingestion.append(batch, sourceIp(request));
    const acceptedSet = new Set(result.acceptedEventIds);
    for (const event of batch.events) {
      if (acceptedSet.has(event.eventId)) acknowledged.inc({ application: event.application, level: event.level });
    }
    if (result.duplicates > 0) duplicates.inc(result.duplicates);
    return reply.code(result.inserted > 0 ? 202 : 200).send({
      data: { batchId: batch.batchId, ...result, committedAt: new Date().toISOString() },
    });
  });

  app.get('/internal/v1/app-logs', { preHandler: internal }, async (request) => (
    options.repository.search(logQuerySchema.parse(request.query))
  ));
  app.get('/internal/v1/app-logs/summary', { preHandler: internal }, async () => ({
    data: await options.repository.summary(),
  }));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR', message: 'El lote de logs no cumple el contrato.',
        details: error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
      });
    }
    if (error instanceof Error) {
      const statusCode = 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
      if (statusCode && statusCode >= 400 && statusCode < 500) {
        const code = 'code' in error && typeof error.code === 'string' ? error.code : 'BAD_REQUEST';
        return reply.code(statusCode).send({
          error: code,
          message: error.message,
        });
      }
    }
    request.log.error({ err: error }, 'App Log Service request failed.');
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR', message: 'No se pudo procesar la solicitud.' });
  });
  return app;
}

function secureHeaderEquals(value: string | string[] | undefined, expected: string): boolean {
  if (typeof value !== 'string') return false;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function bearer(value: string | undefined): string | undefined {
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined;
}

function sourceIp(request: FastifyRequest): string | undefined {
  const value = request.ip;
  return value && value.length <= 64 ? value : undefined;
}
