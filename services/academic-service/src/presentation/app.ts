import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Registry, collectDefaultMetrics } from 'prom-client';
import type { ApplyAcademicSnapshotService } from '../application/apply-academic-snapshot.service.js';
import type { ApplyStudentAcademicSnapshotService } from '../application/apply-student-academic-snapshot.service.js';
import type { SharedClassService } from '../application/shared-class.service.js';
import type { AcademicRepository } from '../domain/academic.repository.js';
import { SharedClassDomainError } from '../domain/shared-class.js';
import type { AcademicEnv } from '../infrastructure/config.js';
import {
  academicSnapshotSchema,
  createSharedClassSchema,
  deleteSharedClassSchema,
  legacySharedClassImportSchema,
  sharedClassesForTeacherSchema,
  studentAcademicSnapshotSchema,
  updateSharedClassSchema,
} from './schemas.js';

export async function buildAcademicApp(options: {
  env: AcademicEnv;
  snapshots: ApplyAcademicSnapshotService;
  studentSnapshots: ApplyStudentAcademicSnapshotService;
  sharedClasses: SharedClassService;
  repository: AcademicRepository;
  ready: () => Promise<{ database: boolean; rabbitmq: boolean }>;
}) {
  const app = Fastify({ logger: { level: options.env.NODE_ENV === 'test' ? 'silent' : 'info' } });
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'presencia_academic_' });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { global: false });
  const internal = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers['x-internal-service-token'] !== options.env.INTERNAL_API_TOKEN) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  };
  app.get('/health/live', async () => ({ status: 'ok', service: 'academic-service' }));
  app.get('/health/ready', async (_request, reply) => {
    const dependencies = await options.ready();
    const ready = Object.values(dependencies).every(Boolean);
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ok' : 'degraded', dependencies });
  });
  app.get('/health', async () => ({ status: 'ok', service: 'academic-service' }));
  app.get('/metrics', async (request, reply) => {
    if (request.headers.authorization !== `Bearer ${options.env.METRICS_TOKEN}`) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    return reply.type(registry.contentType).send(await registry.metrics());
  });
  app.post('/internal/v1/academic/snapshots/professors', { preHandler: internal }, async (request, reply) => {
    const parsed = academicSnapshotSchema.parse(request.body);
    const result = await options.snapshots.apply({
      ...parsed,
      teacher: { ...parsed.teacher, authenticatedAt: new Date(parsed.teacher.authenticatedAt) },
    });
    return reply.code(result.duplicate ? 200 : 202).send({ data: result });
  });
  app.post('/internal/v1/academic/snapshots/students', { preHandler: internal }, async (request, reply) => {
    const parsed = studentAcademicSnapshotSchema.parse(request.body);
    const result = await options.studentSnapshots.apply({
      ...parsed,
      synchronizedAt: new Date(parsed.synchronizedAt),
    });
    return reply.code(result.duplicate ? 200 : 202).send({ data: result });
  });
  app.get('/internal/v1/academic/professors/:externalId/groups', { preHandler: internal }, async (request) => {
    const params = request.params as { externalId: string };
    const query = request.query as { cycleExternalId?: string };
    return { data: await options.repository.groupsForTeacher(params.externalId, query.cycleExternalId) };
  });
  app.get('/internal/v1/academic/groups/:externalGroupId', { preHandler: internal }, async (request, reply) => {
    const { externalGroupId } = request.params as { externalGroupId: string };
    const group = await options.repository.groupByExternalId(externalGroupId);
    return group ? { data: group } : reply.code(404).send({ error: 'GROUP_NOT_FOUND' });
  });
  app.get('/internal/v1/academic/students/:matricula', { preHandler: internal }, async (request, reply) => {
    const { matricula } = request.params as { matricula: string };
    const student = await options.repository.studentByMatricula(matricula);
    return student ? { data: student } : reply.code(404).send({ error: 'STUDENT_NOT_FOUND' });
  });
  app.get('/internal/v1/academic/shared-classes/options', { preHandler: internal }, () => options.sharedClasses.listOptions());
  app.get('/internal/v1/academic/shared-classes', { preHandler: internal }, () => options.sharedClasses.list());
  app.post('/internal/v1/academic/shared-classes/for-teacher', { preHandler: internal }, (request) => {
    const parsed = sharedClassesForTeacherSchema.parse(request.body);
    const cycle = parsed.year !== undefined && parsed.term !== undefined ? { year: parsed.year, term: parsed.term } : undefined;
    return options.sharedClasses.listForTeacher(parsed.identity, cycle);
  });
  app.post('/internal/v1/academic/shared-classes', { preHandler: internal }, async (request, reply) => {
    const parsed = createSharedClassSchema.parse(request.body);
    return reply.code(201).send(await options.sharedClasses.create({ ...parsed, correlationId: correlationId(request) }));
  });
  app.put('/internal/v1/academic/shared-classes/:id', { preHandler: internal }, async (request) => {
    const parsed = updateSharedClassSchema.parse(request.body);
    return options.sharedClasses.update((request.params as { id: string }).id, {
      actorIdentityId: parsed.actorIdentityId, actorRole: parsed.actorRole, reason: parsed.reason,
      correlationId: correlationId(request),
      ...(parsed.sourceAssignmentId === undefined ? {} : { sourceAssignmentId: parsed.sourceAssignmentId }),
      ...(parsed.assignedTeacherId === undefined ? {} : { assignedTeacherId: parsed.assignedTeacherId }),
      ...(parsed.schoolCycleYear === undefined ? {} : { schoolCycleYear: parsed.schoolCycleYear }),
      ...(parsed.schoolCycleTerm === undefined ? {} : { schoolCycleTerm: parsed.schoolCycleTerm }),
      ...(parsed.active === undefined ? {} : { active: parsed.active }),
      ...(parsed.notes === undefined ? {} : { notes: parsed.notes }),
    });
  });
  app.delete('/internal/v1/academic/shared-classes/:id', { preHandler: internal }, async (request, reply) => {
    const parsed = deleteSharedClassSchema.parse(request.body);
    await options.sharedClasses.delete((request.params as { id: string }).id, { ...parsed, correlationId: correlationId(request) });
    return reply.code(204).send();
  });
  app.post('/internal/v1/academic/shared-classes/import-legacy', { preHandler: internal }, async (request) => {
    const parsed = legacySharedClassImportSchema.parse(request.body);
    return {
      data: await options.sharedClasses.importLegacy(parsed.records.map((record) => ({
        ...record,
        createdAt: new Date(record.createdAt),
        observedAt: new Date(record.observedAt),
        sourceAssignment: {
          ...record.sourceAssignment,
          teacher: {
            ...record.sourceAssignment.teacher,
            lastAuthenticatedAt: new Date(record.sourceAssignment.teacher.lastAuthenticatedAt),
          },
        },
        assignedTeacher: {
          ...record.assignedTeacher,
          lastAuthenticatedAt: new Date(record.assignedTeacher.lastAuthenticatedAt),
        },
      })), correlationId(request)),
    };
  });
  app.get('/internal/v1/academic/coordination-projection', { preHandler: internal }, async () => ({
    data: await options.repository.coordinationProjectionSnapshot(),
  }));
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Academic request failed.');
    if (error instanceof SharedClassDomainError) {
      const notFound = ['SOURCE_ASSIGNMENT_NOT_FOUND', 'ASSIGNED_TEACHER_NOT_FOUND', 'SHARED_CLASS_NOT_FOUND', 'SHARED_CLASS_REFERENCE_NOT_FOUND'].includes(error.code);
      const conflict = ['INVALID_SHARED_CLASS', 'SHARED_CLASS_EXISTS'].includes(error.code);
      return reply.code(notFound ? 404 : conflict ? 409 : 400).send({ error: error.code, message: error.message });
    }
    if (error instanceof Error && error.message.startsWith('DUPLICATE_')) return reply.code(409).send({ error: error.message });
    if (typeof error === 'object' && error !== null && 'issues' in error) return reply.code(400).send({ error: 'VALIDATION_ERROR' });
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });
  return app;
}

function correlationId(request: FastifyRequest): string {
  const value = request.headers['x-correlation-id'];
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : request.id;
}
