import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';
import { z } from 'zod';
import type { AuthenticatedSessionService } from '../application/authenticated-session.service.js';
import type { StaffAccessService } from '../application/staff-access.service.js';
import type { IdentityEnv } from '../infrastructure/config.js';
import {
  authenticatedSessionSchema,
  staffAccountCreateSchema,
  staffAccountImportSchema,
  staffAccountUpdateSchema,
  staffLoginSchema,
  superUserLoginSchema,
  tokenSchema,
} from './schemas.js';

const purgeDataSchema = z.object({ confirmation: z.literal('PURGE_ALL_DATA') }).strict();
const professorDeviceUnbindSchema = z.object({
  actorIdentityId: z.string().trim().min(1).max(160),
  correlationId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(500),
}).strict();

export interface IdentityReadiness {
  check(): Promise<{ database: boolean; redis: boolean }>;
}

export interface IdentityAppOptions {
  readonly env: IdentityEnv;
  readonly sessions: AuthenticatedSessionService;
  readonly staff?: StaffAccessService;
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

  app.get('/internal/v1/identities/students', { preHandler: requireInternal }, async (_request, reply) => {
    if (!options.env.PRESENCIA_DEBUG_MODE) return reply.code(404).send({ error: 'DEMO_MODE_DISABLED' });
    return { data: (await options.sessions.listRegisteredStudents()).map(registeredStudentResponse) };
  });

  app.get('/internal/v1/identities/professors', { preHandler: requireInternal }, async () => ({
    data: (await options.sessions.listRegisteredProfessors()).map(registeredProfessorResponse),
    meta: { generatedAt: new Date().toISOString() },
  }));

  app.delete('/internal/v1/identities/professors/:institutionalIdentifier/device', { preHandler: requireInternal }, async (request, reply) => {
    const { institutionalIdentifier } = request.params as { institutionalIdentifier: string };
    const input = professorDeviceUnbindSchema.parse(request.body);
    const deleted = await options.sessions.clearProfessorDeviceBinding(institutionalIdentifier, input);
    return deleted
      ? reply.code(204).send()
      : reply.code(404).send({ error: 'REGISTERED_PROFESSOR_NOT_FOUND', message: 'El profesor no se ha registrado en el sistema.' });
  });

  app.get('/internal/v1/identities/students/:matricula', { preHandler: requireInternal }, async (request, reply) => {
    if (!options.env.PRESENCIA_DEBUG_MODE) return reply.code(404).send({ error: 'DEMO_MODE_DISABLED' });
    const { matricula } = request.params as { matricula: string };
    const student = await options.sessions.registeredStudentByMatricula(matricula);
    return student
      ? { data: registeredStudentResponse(student) }
      : reply.code(404).send({ error: 'REGISTERED_STUDENT_NOT_FOUND', message: 'El alumno no se ha registrado en el sistema.' });
  });

  app.post('/internal/v1/staff/sessions', {
    preHandler: requireInternal,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = staffLoginSchema.parse(request.body);
    const result = await requireStaff(options).login(input.email, input.password, request.id);
    return reply.code(201).send({ data: sessionResponse(result) });
  });

  app.post('/internal/v1/super-user/sessions', {
    preHandler: requireInternal,
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = superUserLoginSchema.parse(request.body);
    const result = await requireStaff(options).loginSuperUser(input.password, request.id);
    return reply.code(201).send({ data: sessionResponse(result) });
  });

  app.get('/internal/v1/staff/accounts', { preHandler: requireInternal }, async () => ({
    data: await requireStaff(options).list(),
    meta: { generatedAt: new Date().toISOString() },
  }));

  app.post('/internal/v1/staff/accounts', { preHandler: requireInternal }, async (request, reply) => {
    const input = staffAccountCreateSchema.parse(request.body);
    const { actorIdentityId, correlationId, reason, ...account } = input;
    return reply.code(201).send({ data: await requireStaff(options).create(account, {
      actorIdentityId, correlationId, reason, source: 'SUPER_USER',
    }) });
  });

  app.put<{ Params: { id: string } }>('/internal/v1/staff/accounts/:id', { preHandler: requireInternal }, async (request) => {
    const input = staffAccountUpdateSchema.parse(request.body);
    const { actorIdentityId, correlationId, reason, ...account } = input;
    return { data: await requireStaff(options).update(request.params.id, account, {
      actorIdentityId, correlationId, reason, source: 'SUPER_USER',
    }) };
  });

  app.delete<{ Params: { id: string } }>('/internal/v1/staff/accounts/:id', { preHandler: requireInternal }, async (request, reply) => {
    const audit = staffAuditSchemaForDelete(request.body);
    await requireStaff(options).delete(request.params.id, { ...audit, source: 'SUPER_USER' });
    return reply.code(204).send();
  });

  app.post('/internal/v1/staff/accounts/import', { preHandler: requireInternal }, async (request) => {
    const input = staffAccountImportSchema.parse(request.body);
    const { actorIdentityId, correlationId, reason } = input;
    return {
      data: await requireStaff(options).import(input.accounts, {
        actorIdentityId, correlationId, reason, source: 'LEGACY_IMPORT',
      }),
      meta: { imported: input.accounts.length },
    };
  });

  app.delete('/internal/v1/identities/demo-data', { preHandler: requireInternal }, async (_request, reply) => {
    if (!options.env.PRESENCIA_DEBUG_MODE) return reply.code(404).send({ error: 'DEMO_MODE_DISABLED' });
    const deleted = await options.sessions.resetDemoIdentities();
    return { data: { identities: deleted } };
  });

  app.post('/internal/v1/identities/data/purge', { preHandler: requireInternal }, async (request) => {
    purgeDataSchema.parse(request.body);
    const identities = await options.sessions.purgeAllIdentities();
    return { data: { purged: true, service: 'identity', identities } };
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Identity request failed.');
    if (error instanceof Error && (error.message === 'IDENTITY_DISABLED' || error.message === 'SESSION_REVOKED')) {
      return reply.code(401).send({ error: error.message });
    }
    if (error instanceof Error && ['INVALID_STAFF_CREDENTIALS', 'INVALID_SUPER_USER_PASSWORD'].includes(error.message)) {
      return reply.code(401).send({ error: error.message });
    }
    if (error instanceof Error && error.message === 'DEVICE_BINDING_CONFLICT') {
      return reply.code(409).send({
        error: 'DEVICE_BINDING_CONFLICT',
        message: 'Esta cuenta ya está vinculada a otro celular. Solicita autorización de cambio a coordinación.',
      });
    }
    if (errorCode(error) === 'P2002') return reply.code(409).send({ error: 'STAFF_ACCOUNT_EXISTS' });
    if (errorCode(error) === 'P2025') return reply.code(404).send({ error: 'STAFF_ACCOUNT_NOT_FOUND' });
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Solicitud inválida.' });
    }
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor.' });
  });

  return app;
}

function staffAuditSchemaForDelete(value: unknown) {
  return z.object({
    actorIdentityId: z.string().trim().min(1).max(160),
    correlationId: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(1).max(500),
  }).parse(value);
}

function requireStaff(options: IdentityAppOptions): StaffAccessService {
  if (!options.staff) throw new Error('STAFF_ACCESS_NOT_CONFIGURED');
  return options.staff;
}

function sessionResponse(result: {
  user: unknown;
  identity: { id: string };
  sessionId: string;
  accessToken: string;
  expiresAt: string;
}) {
  return {
    user: result.user,
    identityId: result.identity.id,
    sessionId: result.sessionId,
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
  };
}

function registeredStudentResponse(student: {
  id: string;
  institutionalIdentifier: string;
  email: string | null;
  displayName: string;
  lastAuthenticatedAt: Date;
}) {
  return {
    id: student.id,
    matricula: student.institutionalIdentifier,
    email: student.email,
    name: student.displayName,
    lastAuthenticatedAt: student.lastAuthenticatedAt.toISOString(),
  };
}

function registeredProfessorResponse(professor: {
  id: string;
  institutionalIdentifier: string;
  email: string | null;
  displayName: string;
  deviceBindingId?: string | null;
  devicePlatform?: string | null;
  deviceInfo?: string | null;
  lastAuthenticatedAt: Date;
}) {
  return {
    id: professor.id,
    externalId: professor.institutionalIdentifier,
    email: professor.email,
    name: professor.displayName,
    deviceBindingId: professor.deviceBindingId ?? null,
    platform: professor.devicePlatform ?? null,
    deviceInfo: professor.deviceInfo ?? null,
    lastAuthenticatedAt: professor.lastAuthenticatedAt.toISOString(),
  };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
