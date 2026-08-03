import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Registry, collectDefaultMetrics } from 'prom-client';
import type { CaptureAttendanceService } from '../application/capture-attendance.service.js';
import type { DeviceBindingService } from '../application/device-binding.service.js';
import { AttendanceDomainError } from '../domain/attendance.js';
import type { AttendanceRepository } from '../domain/attendance.repository.js';
import { issueBindingToken, verifyBindingToken } from '../infrastructure/binding-token.js';
import type { AttendanceEnv } from '../infrastructure/config.js';
import { captureAttendanceSchema, coordinatorBindingSchema, coordinatorUnbindSchema, deviceBindingSchema, resolveDeviceBindingsSchema, rosterSnapshotSchema } from './schemas.js';

export async function buildAttendanceApp(options: {
  env: AttendanceEnv;
  repository: AttendanceRepository;
  captures: CaptureAttendanceService;
  bindings: DeviceBindingService;
  ready: () => Promise<{ database: boolean; rabbitmq: boolean }>;
}) {
  const app = Fastify({ logger: { level: options.env.NODE_ENV === 'test' ? 'silent' : 'info' } });
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'presencia_attendance_' });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { global: false });
  const internal = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers['x-internal-service-token'] !== options.env.INTERNAL_API_TOKEN) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  };

  app.get('/health/live', async () => ({ status: 'ok', service: 'attendance-service' }));
  app.get('/health', async () => ({ status: 'ok', service: 'attendance-service' }));
  app.get('/health/ready', async (_request, reply) => {
    const dependencies = await options.ready();
    const ready = Object.values(dependencies).every(Boolean);
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ok' : 'degraded', dependencies });
  });
  app.get('/metrics', async (request, reply) => {
    if (request.headers.authorization !== `Bearer ${options.env.METRICS_TOKEN}`) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    return reply.type(registry.contentType).send(await registry.metrics());
  });

  app.put('/internal/v1/attendance/rosters/:externalGroupId', { preHandler: internal }, async (request, reply) => {
    const parsed = rosterSnapshotSchema.parse(request.body);
    const externalGroupId = (request.params as { externalGroupId: string }).externalGroupId;
    if (parsed.externalGroupId !== externalGroupId) return reply.code(409).send({ error: 'GROUP_ID_MISMATCH' });
    await options.repository.applyRoster({ ...parsed, rosterObservedAt: new Date(parsed.rosterObservedAt) });
    return reply.code(204).send();
  });

  app.post('/internal/v1/attendance/captures', { preHandler: internal }, async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !zUuid(idempotencyKey)) {
      return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
    const parsed = captureAttendanceSchema.parse(request.body);
    const result = await options.captures.capture({
      ...parsed,
      idempotencyKey,
      correlationId: correlationId(request),
      professorEntryAt: parsed.professorEntryAt ? new Date(parsed.professorEntryAt) : null,
      professorExitAt: parsed.professorExitAt ? new Date(parsed.professorExitAt) : null,
    });
    return reply.code(result.duplicate ? 200 : 202).send({ data: result });
  });

  app.post('/internal/v1/attendance/device-bindings/initial', {
    preHandler: internal,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const parsed = deviceBindingSchema.parse(request.body);
    const result = await options.bindings.bindAfterUatAuthentication({ ...parsed, correlationId: correlationId(request) });
    const bindingToken = await issueBindingToken(result.binding, options.env.BINDING_JWT_SECRET);
    return reply.code(result.created ? 201 : 200).send({
      statusCode: result.created ? 201 : 200,
      message: 'Dispositivo vinculado',
      data: { ...result.binding, bindingToken },
    });
  });

  app.post('/api/student-device-bindings', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Se requiere la autorización del celular.' });
    }
    let claims;
    try {
      claims = await verifyBindingToken(authorization.slice(7), options.env.BINDING_JWT_SECRET);
    } catch {
      return reply.code(401).send({ error: 'INVALID_BINDING_TOKEN', message: 'La autorización del celular no es válida.' });
    }
    const parsed = deviceBindingSchema.parse(request.body);
    const result = await options.bindings.reconcileExisting({ ...parsed, correlationId: correlationId(request) }, claims);
    return reply.send({
      statusCode: 200,
      message: 'Dispositivo vinculado',
      data: { ...result.binding, bindingToken: await issueBindingToken(result.binding, options.env.BINDING_JWT_SECRET) },
    });
  });

  app.post('/internal/v1/attendance/device-bindings/resolve', { preHandler: internal }, async (request) => {
    const parsed = resolveDeviceBindingsSchema.parse(request.body);
    return options.bindings.resolveForProfessor(parsed);
  });

  app.put('/internal/v1/attendance/device-bindings/:matricula', { preHandler: internal }, async (request, reply) => {
    const parsed = coordinatorBindingSchema.parse(request.body);
    const matricula = (request.params as { matricula: string }).matricula;
    if (parsed.matricula.trim().toUpperCase() !== matricula.trim().toUpperCase()) {
      return reply.code(409).send({ error: 'MATRICULA_MISMATCH' });
    }
    const result = await options.bindings.replaceByCoordinator({ ...parsed, correlationId: correlationId(request) });
    return reply.send({ data: result.binding });
  });

  app.delete('/internal/v1/attendance/device-bindings/:matricula', { preHandler: internal }, async (request, reply) => {
    const parsed = coordinatorUnbindSchema.parse(request.body);
    const deleted = await options.bindings.unbindByCoordinator({
      ...parsed, matricula: (request.params as { matricula: string }).matricula, correlationId: correlationId(request),
    });
    return reply.code(204).send();
  });

  app.get('/internal/v1/attendance/device-bindings', { preHandler: internal }, async (request) => {
    const query = request.query as { q?: string };
    return { data: await options.repository.listDeviceBindings(query.q) };
  });

  app.get('/internal/v1/attendance/infrastructure/bindings', { preHandler: internal }, async () => ({
    data: await options.repository.bindingInfrastructureSummary(),
    meta: { generatedAt: new Date().toISOString() },
  }));

  app.get('/internal/v1/attendance/coordination-projection', { preHandler: internal }, async () => ({
    data: await options.repository.coordinationProjectionSnapshot(),
  }));

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Attendance request failed.');
    if (error instanceof AttendanceDomainError) {
      const conflict = ['IDEMPOTENCY_KEY_REUSED', 'ATTENDANCE_UPLOAD_IN_PROGRESS', 'DEVICE_BINDING_CHANGE_REQUIRES_COORDINATOR', 'DEVICE_IDENTIFIER_ALREADY_BOUND'];
      const forbidden = ['PROFESSOR_GROUP_FORBIDDEN', 'DEVICE_BINDING_TOKEN_MISMATCH'].includes(error.code);
      const notFound = error.code === 'ATTENDANCE_GROUP_NOT_FOUND';
      const unauthorized = error.code === 'DEVICE_BINDING_TOKEN_REVOKED';
      return reply.code(conflict.includes(error.code) ? 409 : forbidden ? 403 : unauthorized ? 401 : notFound ? 404 : 400).send({ error: error.code, message: error.message });
    }
    if (typeof error === 'object' && error !== null && 'issues' in error) return reply.code(400).send({ error: 'VALIDATION_ERROR' });
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });
  return app;
}

function correlationId(request: FastifyRequest): string {
  const value = request.headers['x-correlation-id'];
  return typeof value === 'string' && value.length <= 128 ? value : request.id;
}

function zUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
