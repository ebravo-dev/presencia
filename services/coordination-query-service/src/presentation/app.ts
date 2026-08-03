import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Registry, collectDefaultMetrics } from 'prom-client';
import type { CoordinationReportService } from '../application/coordination-report.service.js';
import type { CoordinationQueryRepository } from '../domain/query.repository.js';
import type { CoordinationQueryEnv } from '../infrastructure/config.js';
import { rangeReportSchema, teacherListSchema, teacherParamsSchema, weeklyReportSchema } from './schemas.js';

export async function buildCoordinationQueryApp(options: {
  env: CoordinationQueryEnv; repository: CoordinationQueryRepository; reports: CoordinationReportService;
  ready: () => Promise<{ database: boolean; rabbitmq: boolean; reconciliation: boolean }>;
}) {
  const app = Fastify({ logger: { level: options.env.NODE_ENV === 'test' ? 'silent' : 'info' } });
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'presencia_coordination_query_' });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { global: false });
  const internal = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers['x-internal-service-token'] !== options.env.INTERNAL_API_TOKEN) return reply.code(404).send({ error: 'NOT_FOUND' });
  };

  app.get('/health', async () => ({ status: 'ok', service: 'coordination-query-service' }));
  app.get('/health/live', async () => ({ status: 'ok', service: 'coordination-query-service' }));
  app.get('/health/ready', async (_request, reply) => {
    const dependencies = await options.ready();
    const ready = Object.values(dependencies).every(Boolean);
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ok' : 'degraded', dependencies });
  });
  app.get('/metrics', async (request, reply) => {
    if (request.headers.authorization !== `Bearer ${options.env.METRICS_TOKEN}`) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    return reply.type(registry.contentType).send(await registry.metrics());
  });

  app.get('/internal/v1/coordination/overview', { preHandler: internal }, () => options.repository.overview());
  app.get('/internal/v1/coordination/coordinations', { preHandler: internal }, () => options.repository.coordinations());
  app.get('/internal/v1/coordination/teachers', { preHandler: internal }, (request) => {
    return options.repository.teachers(teacherListSchema.parse(request.query));
  });
  app.get('/internal/v1/coordination/teachers/:teacherId/assignments', { preHandler: internal }, async (request, reply) => {
    const { teacherId } = teacherParamsSchema.parse(request.params);
    const result = await options.repository.teacherAssignments(teacherId);
    return result ? result : reply.code(404).send({ error: 'TEACHER_NOT_FOUND', message: 'Profesor no encontrado.' });
  });
  app.get('/internal/v1/coordination/reports/attendance-weekly', { preHandler: internal }, async (request, reply) => {
    const query = weeklyReportSchema.parse(request.query);
    const result = await options.reports.weekly(query.teacherId, query.weekStart);
    return result ? result : reply.code(404).send({ error: 'TEACHER_NOT_FOUND', message: 'Profesor no encontrado.' });
  });
  app.get('/internal/v1/coordination/reports/attendance-range', { preHandler: internal }, async (request, reply) => {
    const query = rangeReportSchema.parse(request.query);
    const result = await options.reports.range(query.teacherId, query.startDate, query.endDate);
    return result ? result : reply.code(404).send({ error: 'TEACHER_NOT_FOUND', message: 'Profesor no encontrado.' });
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Coordination Query request failed.');
    if (typeof error === 'object' && error !== null && 'issues' in error) return reply.code(400).send({ error: 'VALIDATION_ERROR' });
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });
  return app;
}
