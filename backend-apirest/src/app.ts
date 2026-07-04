import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SyncTeacherDataListener } from './application/listeners/sync-teacher-data.listener.js';
import { CoordinationService } from './application/services/coordination.service.js';
import { CoordinatorAuthService } from './application/services/coordinator-auth.service.js';
import { WeeklyAttendanceReportService } from './application/services/weekly-attendance-report.service.js';
import { UatService } from './application/services/uat.service.js';
import { HarvestTeacherDataUseCase } from './application/use-cases/harvest-teacher-data.use-case.js';
import { env } from './config/env.js';
import { ApiError } from './errors/api-error.js';
import { UatClientFactory } from './infrastructure/http/client/uat-client.factory.js';
import { AttendanceBackendClient } from './infrastructure/http/client/attendance-backend.client.js';
import { InMemoryDomainEventBus } from './infrastructure/events/in-memory-domain-event-bus.js';
import { MemoryUatSessionStore } from './infrastructure/persistence/memory-session.store.js';
import { prisma } from './infrastructure/persistence/prisma/prisma.client.js';
import { PrismaCoordinationRepository } from './infrastructure/persistence/prisma/prisma-coordination.repository.js';
import { PrismaGroupAssignmentRepository } from './infrastructure/persistence/prisma/prisma-group-assignment.repository.js';
import { PrismaSubjectRepository } from './infrastructure/persistence/prisma/prisma-subject.repository.js';
import { PrismaTeacherRepository } from './infrastructure/persistence/prisma/prisma-teacher.repository.js';
import { coordinationRoutes } from './presentation/http/routes/coordination.routes.js';
import { coordinatorAuthRoutes } from './presentation/http/routes/coordinator-auth.routes.js';
import { uatRoutes } from './presentation/http/routes/uat.routes.js';

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'debug' : 'info',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
              },
            }
          : undefined,
    },
  });

  const sessionRepository = new MemoryUatSessionStore();
  const clientFactory = new UatClientFactory();
  const uatService = new UatService(sessionRepository, clientFactory);
  const teacherRepository = new PrismaTeacherRepository(prisma);
  const subjectRepository = new PrismaSubjectRepository(prisma);
  const coordinationRepository = new PrismaCoordinationRepository(prisma);
  const groupAssignmentRepository = new PrismaGroupAssignmentRepository(prisma);
  const eventBus = new InMemoryDomainEventBus(fastify.log);
  const harvestTeacherData = new HarvestTeacherDataUseCase(
    uatService,
    teacherRepository,
    subjectRepository,
    coordinationRepository,
    groupAssignmentRepository,
  );
  const unsubscribeSync = new SyncTeacherDataListener(eventBus, harvestTeacherData, fastify.log).register();
  const coordinationService = new CoordinationService(
    teacherRepository,
    subjectRepository,
    coordinationRepository,
    groupAssignmentRepository,
  );
  const coordinatorAuthService = new CoordinatorAuthService(prisma, env.COORDINATION_JWT_SECRET);
  const attendanceBackendClient = new AttendanceBackendClient(
    env.ATTENDANCE_BACKEND_URL,
    env.ATTENDANCE_BACKEND_SERVICE_TOKEN,
  );
  const weeklyAttendanceReport = new WeeklyAttendanceReportService(teacherRepository, attendanceBackendClient);

  fastify.addHook('onClose', async () => {
    unsubscribeSync();
    await prisma.$disconnect();
  });

  await fastify.register(cors, {
    origin: env.NODE_ENV === 'development' ? env.COORDINATION_WEB_ORIGIN : false,
    credentials: true,
  });

  await fastify.register(cookie);
  await fastify.register(rateLimit, { global: false });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  fastify.setErrorHandler((error, request, reply) => {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    request.log.error({ err: error }, message);

    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }

    return reply.code(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: env.NODE_ENV === 'production' ? 'Error interno del servidor.' : message,
    });
  });

  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'backend-apirest',
    activeUatSessions: await uatService.getActiveSessionCount(),
    timestamp: new Date().toISOString(),
  }));

  await fastify.register(uatRoutes, {
    uatService,
    eventBus,
  });

  await fastify.register(coordinatorAuthRoutes, { authService: coordinatorAuthService });

  await fastify.register(coordinationRoutes, {
    coordinationService,
    authService: coordinatorAuthService,
    weeklyAttendanceReport,
    attendanceBackendClient,
  });

  const webDist = resolve(env.COORDINATION_WEB_DIST || resolve(process.cwd(), '../frontend-coord/dist'));
  if (existsSync(webDist)) {
    await fastify.register(fastifyStatic, { root: webDist, prefix: '/coordinacion/' });
    fastify.get('/coordinacion', async (_request, reply) => reply.redirect('/coordinacion/'));
  }

  fastify.setNotFoundHandler((request, reply) => {
    if (existsSync(webDist) && request.method === 'GET' && request.url.startsWith('/coordinacion/')) {
      return reply.type('text/html').sendFile('index.html');
    }
    reply.code(404).send({
      error: 'NOT_FOUND',
      message: `Ruta ${request.method} ${request.url} no encontrada.`,
    });
  });

  return fastify;
}

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });

    app.log.info(`backend-apirest escuchando en http://${env.HOST}:${env.PORT}`);

    const shutdown = async (signal: string) => {
      app.log.info(`${signal} recibido. Cerrando backend-apirest...`);
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

if (import.meta.url === entryPoint) {
  void start();
}
