import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Redis } from 'ioredis';
import { SyncTeacherDataListener } from './application/listeners/sync-teacher-data.listener.js';
import { CoordinatorAuthService } from './application/services/coordinator-auth.service.js';
import { SuperUserAuthService } from './application/services/super-user-auth.service.js';
import { UatStudentService } from './application/services/uat-student.service.js';
import { AttendanceUploadService } from './application/services/attendance-upload.service.js';
import { UatService } from './application/services/uat.service.js';
import { HarvestTeacherDataUseCase } from './application/use-cases/harvest-teacher-data.use-case.js';
import { env } from './config/env.js';
import type { StoredUatStudentSession } from './domain/types/uat.interfaces.js';
import { ApiError } from './errors/api-error.js';
import { UatClientFactory } from './infrastructure/http/client/uat-client.factory.js';
import { UatStudentClientFactory } from './infrastructure/http/client/uat-student-client.factory.js';
import { IdentityServiceClient } from './infrastructure/http/client/identity-service.client.js';
import { AcademicServiceClient } from './infrastructure/http/client/academic-service.client.js';
import { AttendanceServiceCommandClient } from './infrastructure/http/client/attendance-service-command.client.js';
import { AttendanceCaptureClient } from './infrastructure/http/client/attendance-capture.client.js';
import { CoordinationQueryClient } from './infrastructure/http/client/coordination-query.client.js';
import { DemoPortalClient } from './infrastructure/http/client/demo-portal.client.js';
import { DurableDomainEventBus } from './infrastructure/events/durable-domain-event-bus.js';
import { registerUatIntegrationMetrics } from './infrastructure/observability/http-metrics.js';
import { RedisKeyValueStore } from './infrastructure/persistence/redis-key-value.store.js';
import { RedisUatSessionStore } from './infrastructure/persistence/redis-session.store.js';
import { StudentSessionCodec, TeacherSessionCodec } from './infrastructure/persistence/session-codec.js';
import { prisma } from './infrastructure/persistence/prisma/prisma.client.js';
import { PrismaAttendanceUploadRepository } from './infrastructure/persistence/prisma/prisma-attendance-upload.repository.js';
import { CredentialCipher } from './infrastructure/security/credential-cipher.js';
import { AttendanceUploadWorker } from './infrastructure/jobs/attendance-upload.worker.js';
import { coordinationRoutes } from './presentation/http/routes/coordination.routes.js';
import { coordinatorAuthRoutes } from './presentation/http/routes/coordinator-auth.routes.js';
import { superUserRoutes } from './presentation/http/routes/super-user.routes.js';
import { uatRoutes } from './presentation/http/routes/uat.routes.js';

const SERVER_TIME_ZONE = env.APP_TIME_ZONE;

function serverLocalDateString(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SERVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: env.PRESENCIA_DEBUG_MODE || env.PRESENCIA_DEBUG_VERBOSE_LOGS ? 'debug' : env.NODE_ENV === 'development' ? 'debug' : 'info',
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
  registerUatIntegrationMetrics(fastify, env.METRICS_TOKEN);

  const clientFactory = new UatClientFactory();
  const studentClientFactory = new UatStudentClientFactory();
  const credentialCipher = new CredentialCipher(
    env.ATTENDANCE_JOB_ENCRYPTION_SECRET,
  );
  const sessionCipher = new CredentialCipher(env.UAT_SESSION_ENCRYPTION_SECRET);
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  await redis.connect();
  const sessionKeyValueStore = new RedisKeyValueStore(redis);
  const sessionTtlMs = env.UAT_SESSION_TTL_MINUTES * 60 * 1000;
  const sessionRepository = new RedisUatSessionStore(
    sessionKeyValueStore,
    new TeacherSessionCodec(clientFactory, sessionCipher),
    { prefix: 'presencia:uat:teacher-session', ttlMs: sessionTtlMs },
  );
  const studentSessionRepository = new RedisUatSessionStore<StoredUatStudentSession>(
    sessionKeyValueStore,
    new StudentSessionCodec(studentClientFactory, sessionCipher),
    { prefix: 'presencia:uat:student-session', ttlMs: sessionTtlMs },
  );
  const identityServiceClient = new IdentityServiceClient(
    env.IDENTITY_SERVICE_URL,
    env.INTERNAL_API_TOKEN,
  );
  const academicServiceClient = new AcademicServiceClient(
    env.ACADEMIC_SERVICE_URL,
    env.INTERNAL_API_TOKEN,
  );
  const uatService = new UatService(sessionRepository, clientFactory, credentialCipher, identityServiceClient);
  const attendanceServiceCommands = new AttendanceServiceCommandClient(
    env.ATTENDANCE_SERVICE_URL,
    env.ATTENDANCE_BACKEND_SERVICE_TOKEN,
  );
  const attendanceBindingClient = attendanceServiceCommands;
  const attendanceCaptureClient = new AttendanceCaptureClient(
    env.ATTENDANCE_SERVICE_URL,
    env.ATTENDANCE_BACKEND_SERVICE_TOKEN,
  );
  const coordinationQuery = new CoordinationQueryClient(
    env.COORDINATION_QUERY_SERVICE_URL,
    env.INTERNAL_API_TOKEN,
  );
  const demoPortal = new DemoPortalClient(env.PRESENCIA_DEMO_PORTAL_URL, env.INTERNAL_API_TOKEN);
  const uatStudentService = new UatStudentService(
    studentSessionRepository,
    studentClientFactory,
    attendanceBindingClient,
    identityServiceClient,
    academicServiceClient,
    fastify.log,
  );
  const attendanceUploadRepository = new PrismaAttendanceUploadRepository(prisma);
  const attendanceUploadService = new AttendanceUploadService(attendanceUploadRepository);
  const attendanceUploadWorker = new AttendanceUploadWorker(
    attendanceUploadRepository,
    clientFactory,
    credentialCipher,
    fastify.log,
  );
  if (env.PRESENCIA_DEBUG_MODE) {
    fastify.log.warn('Modo demo activo: login y consultas conectados a UAT; worker de subida de asistencias deshabilitado.');
  } else {
    await attendanceUploadWorker.start();
  }
  const eventBus = new DurableDomainEventBus(
    prisma,
    {
      rabbitmqUrl: env.RABBITMQ_URL,
      pollIntervalMs: env.DOMAIN_EVENT_POLL_INTERVAL_MS,
    },
    fastify.log,
  );
  const harvestTeacherData = new HarvestTeacherDataUseCase(
    uatService,
    academicServiceClient,
    {
      preferredCycleId: env.PRESENCIA_DEBUG_MODE
        ? env.UAT_ID_CICLO_ESCOLAR
        : async () => (await academicServiceClient.activeAcademicCycle()).data.active.externalId,
    },
    undefined,
    fastify.log,
  );
  const unsubscribeSync = new SyncTeacherDataListener(eventBus, harvestTeacherData, fastify.log).register();
  await eventBus.start();
  const coordinatorAuthService = new CoordinatorAuthService(identityServiceClient);
  const superUserAuthService = new SuperUserAuthService(identityServiceClient);

  fastify.addHook('onClose', async () => {
    unsubscribeSync();
    await eventBus.stop();
    await attendanceUploadWorker.stop();
    await prisma.$disconnect();
    await redis.quit();
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
    activeUatStudentSessions: await uatStudentService.getActiveSessionCount(),
    timestamp: new Date().toISOString(),
    timezone: SERVER_TIME_ZONE,
    mode: env.PRESENCIA_DEBUG_MODE ? 'demo' : 'uat',
  }));

  fastify.get('/health/live', async () => ({
    status: 'ok',
    service: 'backend-apirest',
    timestamp: new Date().toISOString(),
  }));

  fastify.get('/health/ready', async (_request, reply) => {
    const [database, redisStatus, identityStatus, academicStatus, attendanceStatus, coordinationQueryStatus, demoPortalStatus] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => ({ ok: true })).catch((error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown PostgreSQL error',
      })),
      redis.ping().then((result) => ({ ok: result === 'PONG' })).catch((error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      })),
      identityServiceClient.health().then(() => ({ ok: true })).catch((error: unknown) => ({
        ok: false, error: error instanceof Error ? error.message : 'Unknown Identity error',
      })),
      academicServiceClient.health().then(() => ({ ok: true })).catch((error: unknown) => ({
        ok: false, error: error instanceof Error ? error.message : 'Unknown Academic error',
      })),
      attendanceServiceCommands.health().then(() => ({ ok: true })).catch((error: unknown) => ({
        ok: false, error: error instanceof Error ? error.message : 'Unknown Attendance error',
      })),
      coordinationQuery.health().then(() => ({ ok: true })).catch((error: unknown) => ({
        ok: false, error: error instanceof Error ? error.message : 'Unknown Coordination Query error',
      })),
      env.PRESENCIA_DEBUG_MODE
        || env.PRESENCIA_APP_REVIEW_ENABLED
        ? demoPortal.health().then(() => ({ ok: true })).catch((error: unknown) => ({
            ok: false, error: error instanceof Error ? error.message : 'Unknown Demo Portal error',
          }))
        : Promise.resolve({ ok: true, disabled: true }),
    ]);
    const rabbitmq = { ok: eventBus.isReady() };
    const ready = database.ok && redisStatus.ok && rabbitmq.ok
      && identityStatus.ok && academicStatus.ok && attendanceStatus.ok && coordinationQueryStatus.ok && demoPortalStatus.ok;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ok' : 'degraded',
      service: 'backend-apirest',
      dependencies: {
        database,
        redis: redisStatus,
        rabbitmq,
        identity: identityStatus,
        academic: academicStatus,
        attendance: attendanceStatus,
        coordinationQuery: coordinationQueryStatus,
        demoPortal: demoPortalStatus,
      },
    });
  });

  fastify.get('/time', async () => {
    const now = new Date();
    return {
      now: now.toISOString(),
      timezone: SERVER_TIME_ZONE,
      localDate: serverLocalDateString(now),
    };
  });

  await fastify.register(uatRoutes, {
    uatService,
    uatStudentService,
    eventBus,
    academicServiceClient,
    attendanceUploadService,
    attendanceUploadWorker,
    attendanceCaptureClient,
    attendanceServiceCommands,
    appReviewPortal: demoPortal,
  });

  await fastify.register(coordinatorAuthRoutes, { authService: coordinatorAuthService });
  await fastify.register(superUserRoutes, {
    authService: superUserAuthService,
    identityService: identityServiceClient,
    attendanceService: attendanceServiceCommands,
    attendanceCapture: attendanceCaptureClient,
    academicService: academicServiceClient,
    coordinationQuery,
    demoPortal,
    resetLocalDemoData: async () => {
      const [teacherSessions, studentSessions] = await Promise.all([
        sessionRepository.clear(),
        studentSessionRepository.clear(),
      ]);
      await prisma.$transaction(async (transaction) => {
        await transaction.sharedClassAssignment.deleteMany();
        await transaction.groupAssignment.deleteMany();
        await transaction.subject.deleteMany();
        await transaction.coordination.deleteMany();
        await transaction.teacher.deleteMany();
        await transaction.attendanceUploadJob.deleteMany();
        await transaction.attendanceUploadBatch.deleteMany();
        await transaction.processedDomainEvent.deleteMany();
        await transaction.domainOutboxEvent.deleteMany();
      });
      return { teacherSessions, studentSessions };
    },
  });
  await fastify.register(coordinationRoutes, {
    authService: coordinatorAuthService,
    academicServiceClient,
    attendanceServiceCommands,
    coordinationQuery,
    identityService: identityServiceClient,
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
