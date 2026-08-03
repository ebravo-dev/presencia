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
import { CoordinationService } from './application/services/coordination.service.js';
import { CoordinatorAccountService } from './application/services/coordinator-account.service.js';
import { CoordinatorAuthService } from './application/services/coordinator-auth.service.js';
import { SuperUserAuthService } from './application/services/super-user-auth.service.js';
import { WeeklyAttendanceReportService } from './application/services/weekly-attendance-report.service.js';
import { UatStudentService } from './application/services/uat-student.service.js';
import { AttendanceUploadService } from './application/services/attendance-upload.service.js';
import { UatService } from './application/services/uat.service.js';
import { HarvestTeacherDataUseCase } from './application/use-cases/harvest-teacher-data.use-case.js';
import { ProcessAttendanceUploadRequestedUseCase } from './application/use-cases/process-attendance-upload-requested.use-case.js';
import { env } from './config/env.js';
import type { StoredUatStudentSession } from './domain/types/uat.interfaces.js';
import { ApiError } from './errors/api-error.js';
import { UatClientFactory } from './infrastructure/http/client/uat-client.factory.js';
import { UatStudentClientFactory } from './infrastructure/http/client/uat-student-client.factory.js';
import { AttendanceBackendClient } from './infrastructure/http/client/attendance-backend.client.js';
import { IdentityServiceClient } from './infrastructure/http/client/identity-service.client.js';
import { AcademicServiceClient } from './infrastructure/http/client/academic-service.client.js';
import { AttendanceServiceCommandClient } from './infrastructure/http/client/attendance-service-command.client.js';
import { AttendanceCaptureClient } from './infrastructure/http/client/attendance-capture.client.js';
import { CoordinationQueryClient } from './infrastructure/http/client/coordination-query.client.js';
import { DurableDomainEventBus } from './infrastructure/events/durable-domain-event-bus.js';
import { AttendanceUploadRequestedConsumer } from './infrastructure/events/attendance-upload-requested.consumer.js';
import { RedisKeyValueStore } from './infrastructure/persistence/redis-key-value.store.js';
import { RedisUatSessionStore } from './infrastructure/persistence/redis-session.store.js';
import { StudentSessionCodec, TeacherSessionCodec } from './infrastructure/persistence/session-codec.js';
import { prisma } from './infrastructure/persistence/prisma/prisma.client.js';
import { PrismaCoordinationRepository } from './infrastructure/persistence/prisma/prisma-coordination.repository.js';
import { PrismaGroupAssignmentRepository } from './infrastructure/persistence/prisma/prisma-group-assignment.repository.js';
import { PrismaSubjectRepository } from './infrastructure/persistence/prisma/prisma-subject.repository.js';
import { PrismaTeacherRepository } from './infrastructure/persistence/prisma/prisma-teacher.repository.js';
import { PrismaAttendanceUploadRepository } from './infrastructure/persistence/prisma/prisma-attendance-upload.repository.js';
import { CredentialCipher } from './infrastructure/security/credential-cipher.js';
import { AttendanceUploadWorker } from './infrastructure/jobs/attendance-upload.worker.js';
import { coordinationRoutes } from './presentation/http/routes/coordination.routes.js';
import { coordinatorAuthRoutes } from './presentation/http/routes/coordinator-auth.routes.js';
import { superUserRoutes } from './presentation/http/routes/super-user.routes.js';
import { internalCoordinationRoutes } from './presentation/http/routes/internal-coordination.routes.js';
import { uatRoutes } from './presentation/http/routes/uat.routes.js';
import type { DebugProfessorInput, HarvestDebugOptions } from './application/use-cases/harvest-teacher-data.use-case.js';

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
    env.IDENTITY_SERVICE_REQUIRED,
  );
  const academicServiceClient = new AcademicServiceClient(
    env.ACADEMIC_SERVICE_URL,
    env.INTERNAL_API_TOKEN,
    env.ACADEMIC_SERVICE_REQUIRED,
  );
  const uatService = new UatService(sessionRepository, clientFactory, credentialCipher, identityServiceClient);
  const attendanceBackendClient = new AttendanceBackendClient(
    env.ATTENDANCE_BACKEND_URL,
    env.ATTENDANCE_BACKEND_SERVICE_TOKEN,
  );
  const attendanceServiceCommands = env.ATTENDANCE_SERVICE_URL
    ? new AttendanceServiceCommandClient(env.ATTENDANCE_SERVICE_URL, env.ATTENDANCE_BACKEND_SERVICE_TOKEN)
    : undefined;
  const attendanceBindingClient = attendanceServiceCommands;
  const attendanceCaptureClient = env.ATTENDANCE_SERVICE_URL
    ? new AttendanceCaptureClient(env.ATTENDANCE_SERVICE_URL, env.ATTENDANCE_BACKEND_SERVICE_TOKEN)
    : undefined;
  const coordinationQuery = env.COORDINATION_QUERY_SERVICE_URL
    ? new CoordinationQueryClient(env.COORDINATION_QUERY_SERVICE_URL, env.INTERNAL_API_TOKEN)
    : undefined;
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
  const attendanceUploadRequested = new ProcessAttendanceUploadRequestedUseCase(
    uatService,
    attendanceUploadService,
    attendanceUploadWorker,
  );
  const attendanceUploadConsumer = new AttendanceUploadRequestedConsumer(
    prisma,
    env.RABBITMQ_URL,
    attendanceUploadRequested,
    fastify.log,
  );
  if (env.PRESENCIA_DEBUG_MODE) {
    fastify.log.warn('Modo debug activo: worker de subida UAT deshabilitado.');
  } else {
    await attendanceUploadWorker.start();
  }
  const teacherRepository = new PrismaTeacherRepository(prisma);
  const subjectRepository = new PrismaSubjectRepository(prisma);
  const coordinationRepository = new PrismaCoordinationRepository(prisma);
  const groupAssignmentRepository = new PrismaGroupAssignmentRepository(prisma);
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
    teacherRepository,
    subjectRepository,
    coordinationRepository,
    groupAssignmentRepository,
    {
      preferredCycleId: env.PRESENCIA_DEBUG_MODE ? env.PRESENCIA_DEBUG_CYCLE_ID : env.UAT_ID_CICLO_ESCOLAR,
      debug: buildHarvestDebugOptions(),
    },
    undefined,
    fastify.log,
    academicServiceClient,
  );
  const unsubscribeSync = new SyncTeacherDataListener(eventBus, harvestTeacherData, fastify.log).register();
  await eventBus.start();
  if (!env.PRESENCIA_DEBUG_MODE) await attendanceUploadConsumer.start();
  const coordinationService = new CoordinationService(
    teacherRepository,
    subjectRepository,
    coordinationRepository,
    groupAssignmentRepository,
  );
  const coordinatorAuthService = new CoordinatorAuthService(identityServiceClient);
  const superUserAuthService = new SuperUserAuthService(identityServiceClient);
  const coordinatorAccountService = new CoordinatorAccountService(prisma);
  const weeklyAttendanceReport = new WeeklyAttendanceReportService(
    teacherRepository,
    attendanceBackendClient,
    groupAssignmentRepository,
  );

  fastify.addHook('onClose', async () => {
    unsubscribeSync();
    await attendanceUploadConsumer.stop();
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
  }));

  fastify.get('/health/live', async () => ({
    status: 'ok',
    service: 'backend-apirest',
    timestamp: new Date().toISOString(),
  }));

  fastify.get('/health/ready', async (_request, reply) => {
    const [database, redisStatus, coordinationQueryStatus] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => ({ ok: true })).catch((error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown PostgreSQL error',
      })),
      redis.ping().then((result) => ({ ok: result === 'PONG' })).catch((error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      })),
      coordinationQuery
        ? coordinationQuery.health().then(() => ({ ok: true })).catch((error: unknown) => ({
          ok: false, error: error instanceof Error ? error.message : 'Unknown Coordination Query error',
        }))
        : Promise.resolve({ ok: !env.COORDINATION_QUERY_SERVICE_REQUIRED }),
    ]);
    const rabbitmq = { ok: eventBus.isReady() };
    const attendanceConsumer = {
      ok: env.PRESENCIA_DEBUG_MODE || attendanceUploadConsumer.isReady(),
      disabled: env.PRESENCIA_DEBUG_MODE,
    };
    const ready = database.ok && redisStatus.ok && rabbitmq.ok && attendanceConsumer.ok && coordinationQueryStatus.ok;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ok' : 'degraded',
      service: 'backend-apirest',
      dependencies: { database, redis: redisStatus, rabbitmq, attendanceConsumer, coordinationQuery: coordinationQueryStatus },
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
    attendanceBackendClient,
    attendanceUploadService,
    attendanceUploadWorker,
    ...(attendanceCaptureClient ? { attendanceCaptureClient } : {}),
    ...(attendanceServiceCommands ? { attendanceServiceCommands } : {}),
  });

  await fastify.register(coordinatorAuthRoutes, { authService: coordinatorAuthService });
  if (attendanceServiceCommands) {
    await fastify.register(superUserRoutes, {
      authService: superUserAuthService,
      identityService: identityServiceClient,
      attendanceService: attendanceServiceCommands,
      attendanceBackend: attendanceBackendClient,
    });
  }
  await fastify.register(internalCoordinationRoutes, {
    coordinatorAccountService,
    internalToken: env.INTERNAL_API_TOKEN,
  });

  await fastify.register(coordinationRoutes, {
    coordinationService,
    authService: coordinatorAuthService,
    weeklyAttendanceReport,
    attendanceBackendClient,
    academicServiceClient,
    ...(attendanceServiceCommands ? { attendanceServiceCommands } : {}),
    ...(coordinationQuery ? { coordinationQuery } : {}),
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

function buildHarvestDebugOptions(): HarvestDebugOptions {
  return {
    enabled: env.PRESENCIA_DEBUG_MODE,
    cycleId: env.PRESENCIA_DEBUG_CYCLE_ID,
    cycleName: env.PRESENCIA_DEBUG_CYCLE_NAME,
    extraProfessorCount: env.PRESENCIA_DEBUG_EXTRA_PROFESSORS,
    extraProfessors: parseDebugProfessors(env.PRESENCIA_DEBUG_EXTRA_PROFESSORS_JSON),
    verboseLogs: env.PRESENCIA_DEBUG_MODE || env.PRESENCIA_DEBUG_VERBOSE_LOGS,
  };
}

function parseDebugProfessors(value?: string): DebugProfessorInput[] | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((item): item is DebugProfessorInput => typeof item === 'object' && item !== null);
  } catch {
    return undefined;
  }
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
