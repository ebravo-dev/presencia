import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Registry, collectDefaultMetrics } from 'prom-client';
import type { ApplyAcademicSnapshotService } from '../application/apply-academic-snapshot.service.js';
import type { ApplyStudentAcademicSnapshotService } from '../application/apply-student-academic-snapshot.service.js';
import type { AcademicRepository } from '../domain/academic.repository.js';
import type { AcademicEnv } from '../infrastructure/config.js';
import { academicSnapshotSchema, studentAcademicSnapshotSchema } from './schemas.js';

export async function buildAcademicApp(options: {
  env: AcademicEnv;
  snapshots: ApplyAcademicSnapshotService;
  studentSnapshots: ApplyStudentAcademicSnapshotService;
  repository: AcademicRepository;
  ready: () => Promise<boolean>;
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
    const ready = await options.ready();
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ok' : 'degraded', dependencies: { database: ready } });
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
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Academic request failed.');
    if (error instanceof Error && error.message.startsWith('DUPLICATE_')) return reply.code(409).send({ error: error.message });
    if (typeof error === 'object' && error !== null && 'issues' in error) return reply.code(400).send({ error: 'VALIDATION_ERROR' });
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });
  return app;
}
