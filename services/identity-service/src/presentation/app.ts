import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';
import type { AuthenticatedSessionService } from '../application/authenticated-session.service.js';
import type { IdentityEnv } from '../infrastructure/config.js';
import { authenticatedSessionSchema, tokenSchema } from './schemas.js';

export interface IdentityReadiness {
  check(): Promise<{ database: boolean; redis: boolean }>;
}

export interface IdentityAppOptions {
  readonly env: IdentityEnv;
  readonly sessions: AuthenticatedSessionService;
  readonly readiness: IdentityReadiness;
}

function bearer(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined;
}

export async function buildIdentityApp(options: IdentityAppOptions) {
  const app = Fastify({ logger: { level: options.env.NODE_ENV === 'test' ? 'silent' : 'info' } });
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'presencia_identity_' });
  const authCounter = new Counter({
    name: 'presencia_identity_authenticated_sessions_total',
    help: 'Sesiones emitidas para identidades verificadas.',
    labelNames: ['kind'] as const,
    registers: [registry],
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { global: false });

  const requireInternal = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers['x-internal-service-token'] !== options.env.INTERNAL_API_TOKEN) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Ruta no encontrada.' });
    }
  };

  app.get('/health/live', async () => ({ status: 'ok', service: 'identity-service' }));
  app.get('/health/ready', async (_request, reply) => {
    const dependencies = await options.readiness.check();
    const ready = dependencies.database && dependencies.redis;
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ok' : 'degraded', dependencies });
  });
  app.get('/health', async () => ({ status: 'ok', service: 'identity-service' }));

  app.get('/metrics', async (request, reply) => {
    if (bearer(request) !== options.env.METRICS_TOKEN) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    return reply.type(registry.contentType).send(await registry.metrics());
  });

  app.post('/internal/v1/authenticated-sessions', {
    preHandler: requireInternal,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = authenticatedSessionSchema.parse(request.body);
    const result = await options.sessions.create(input);
    authCounter.inc({ kind: input.kind });
    return reply.code(201).send({
      data: {
        identity: {
          id: result.identity.id,
          kind: result.identity.kind,
          role: result.identity.role,
          institutionalIdentifier: result.identity.institutionalIdentifier,
          email: result.identity.email,
          displayName: result.identity.displayName,
        },
        sessionId: result.sessionId,
        accessToken: result.accessToken,
        expiresAt: result.expiresAt,
      },
    });
  });

  app.post('/internal/v1/sessions/verify', { preHandler: requireInternal }, async (request) => {
    const { token } = tokenSchema.parse(request.body);
    return { data: await options.sessions.verify(token) };
  });

  app.delete('/internal/v1/sessions/current', { preHandler: requireInternal }, async (request, reply) => {
    const { token } = tokenSchema.parse(request.body);
    await options.sessions.revoke(token);
    return reply.code(204).send();
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Identity request failed.');
    if (error instanceof Error && (error.message === 'IDENTITY_DISABLED' || error.message === 'SESSION_REVOKED')) {
      return reply.code(401).send({ error: error.message });
    }
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Solicitud inválida.' });
    }
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor.' });
  });

  return app;
}
