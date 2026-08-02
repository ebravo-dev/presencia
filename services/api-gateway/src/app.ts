import { randomBytes, randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import replyFrom from '@fastify/reply-from';
import { resolveGatewayTarget, type GatewayTarget } from '@presencia/contracts-http';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { type GatewayEnv, loadGatewayEnv, parseCorsOrigins, parseRouteOverrides } from './config.js';
import { createGatewayMetrics } from './metrics.js';
import type { GatewayRedis } from './redis.js';

export interface BuildGatewayOptions {
  readonly env?: GatewayEnv;
  readonly redis?: GatewayRedis;
}

interface DependencyStatus {
  readonly ok: boolean;
  readonly status?: number;
  readonly error?: string;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function createTraceparent(): string {
  return `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
}

function validTraceparent(value: string | undefined): string | undefined {
  return value && /^00-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/i.test(value) ? value.toLowerCase() : undefined;
}

async function checkHttpDependency(url: string, timeoutMs: number): Promise<DependencyStatus> {
  try {
    const response = await fetch(new URL('/health', url), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown dependency error' };
  }
}

export async function buildGateway(options: BuildGatewayOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadGatewayEnv();
  const ownedRedis = options.redis === undefined;
  const redis: GatewayRedis = options.redis ?? new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  const metrics = createGatewayMetrics();
  const requestStart = new Map<string, bigint>();
  const requestTraceparent = new Map<string, string>();
  const routeOverrides = parseRouteOverrides(env.ROUTE_TARGET_OVERRIDES);
  const upstreams: Partial<Record<GatewayTarget, string>> = {
    'legacy-backend': env.LEGACY_BACKEND_URL,
    'uat-integration': env.UAT_INTEGRATION_URL,
    ...(env.IDENTITY_SERVICE_URL ? { identity: env.IDENTITY_SERVICE_URL } : {}),
    ...(env.ACADEMIC_SERVICE_URL ? { academic: env.ACADEMIC_SERVICE_URL } : {}),
    ...(env.ATTENDANCE_SERVICE_URL ? { attendance: env.ATTENDANCE_SERVICE_URL } : {}),
    ...(env.COORDINATION_QUERY_SERVICE_URL ? { 'coordination-query': env.COORDINATION_QUERY_SERVICE_URL } : {}),
  };

  const app = Fastify({
    bodyLimit: env.BODY_LIMIT_BYTES,
    logger: { level: env.LOG_LEVEL },
    genReqId(request) {
      const supplied = headerValue(request.headers['x-correlation-id']);
      return supplied && supplied.length <= 128 ? supplied : randomUUID();
    },
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: parseCorsOrigins(env.CORS_ORIGINS),
    credentials: true,
    exposedHeaders: ['x-correlation-id', 'traceparent'],
  });
  const rateLimitOptions = {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  };
  await app.register(rateLimit, ownedRedis
    ? { ...rateLimitOptions, redis }
    : rateLimitOptions);
  await app.register(replyFrom, {
    http: { requestOptions: { timeout: env.UPSTREAM_TIMEOUT_MS } },
  });

  app.addHook('onRequest', async (request, reply) => {
    requestStart.set(request.id, process.hrtime.bigint());
    const traceparent = validTraceparent(headerValue(request.headers.traceparent)) ?? createTraceparent();
    requestTraceparent.set(request.id, traceparent);
    reply.header('x-correlation-id', request.id);
    reply.header('traceparent', traceparent);
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStart.get(request.id);
    requestStart.delete(request.id);
    requestTraceparent.delete(request.id);
    if (startedAt === undefined) return;

    const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    metrics.observe(request.method, request.routeOptions.url ?? request.url, reply.statusCode, elapsedSeconds);
  });

  app.get('/health/live', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const [legacyBackend, uatIntegration, redisResult] = await Promise.all([
      checkHttpDependency(env.LEGACY_BACKEND_URL, env.UPSTREAM_TIMEOUT_MS),
      checkHttpDependency(env.UAT_INTEGRATION_URL, env.UPSTREAM_TIMEOUT_MS),
      redis.ping().then((value) => ({ ok: value === 'PONG' })).catch((error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      })),
    ]);
    const dependencies = { legacyBackend, uatIntegration, redis: redisResult };
    const ready = Object.values(dependencies).every(({ ok }) => ok);
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ok' : 'degraded',
      service: 'api-gateway',
      dependencies,
    });
  });

  app.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  }));

  app.get('/metrics', { config: { rateLimit: false } }, async (request, reply) => {
    const authorization = headerValue(request.headers.authorization);
    if (authorization !== `Bearer ${env.METRICS_TOKEN}`) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Token de métricas inválido.' });
    }
    return reply.type(metrics.registry.contentType).send(await metrics.registry.metrics());
  });

  app.setNotFoundHandler(async (request, reply) => {
    const target = resolveGatewayTarget(request.raw.url ?? request.url, routeOverrides);
    if (target === 'denied') {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Ruta no encontrada.' });
    }
    if (target === 'gateway') {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Ruta no encontrada.' });
    }

    const upstream = upstreams[target];
    if (!upstream) {
      request.log.error({ target }, 'La ruta apunta a un servicio sin URL configurada.');
      return reply.code(503).send({
        error: 'UPSTREAM_NOT_CONFIGURED',
        message: 'El servicio solicitado no está disponible durante la migración.',
      });
    }
    const upstreamUrl = new URL(request.raw.url ?? request.url, upstream).toString();

    return reply.from(upstreamUrl, {
      rewriteRequestHeaders(_originalRequest, headers) {
        const forwardedHeaders = { ...headers };
        delete forwardedHeaders.host;
        delete forwardedHeaders['x-internal-service-token'];
        forwardedHeaders['x-correlation-id'] = request.id;
        forwardedHeaders.traceparent = requestTraceparent.get(request.id) ?? createTraceparent();
        forwardedHeaders['x-internal-service-token'] = env.INTERNAL_API_TOKEN;
        return forwardedHeaders;
      },
    });
  });

  app.addHook('onClose', async () => {
    if (ownedRedis) await redis.quit();
  });

  return app;
}
