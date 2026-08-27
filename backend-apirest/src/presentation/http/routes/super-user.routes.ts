import { createHash } from 'node:crypto';
import type { FastifyBaseLogger, FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { SuperUserAuthService } from '../../../application/services/super-user-auth.service.js';
import type { AcademicServiceClient } from '../../../infrastructure/http/client/academic-service.client.js';
import type { AttendanceCaptureClient } from '../../../infrastructure/http/client/attendance-capture.client.js';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import type { IdentityServiceClient } from '../../../infrastructure/http/client/identity-service.client.js';
import type { CoordinationQueryClient } from '../../../infrastructure/http/client/coordination-query.client.js';
import type {
  DemoPortalAttendanceWrite,
  DemoPortalClass,
  DemoPortalClient,
  DemoPortalStatus,
} from '../../../infrastructure/http/client/demo-portal.client.js';
import { env } from '../../../config/env.js';
import { ApiError } from '../../../errors/api-error.js';
import { buildSuperUserAuthHook, SUPER_USER_COOKIE } from '../hooks/super-user-auth.hook.js';

interface SuperUserRoutesOptions {
  authService: SuperUserAuthService;
  identityService: IdentityServiceClient;
  attendanceService: AttendanceServiceCommandClient;
  attendanceCapture: AttendanceCaptureClient;
  academicService: AcademicServiceClient;
  coordinationQuery: CoordinationQueryClient;
  demoPortal: DemoPortalClient;
  resetLocalDemoData: () => Promise<{ teacherSessions: number; studentSessions: number }>;
}

const loginSchema = z.object({ password: z.string().min(1).max(256) });
const activeAcademicCycleSchema = z.object({ cycleExternalId: z.number().int().positive() });
const coordinatorCreateSchema = z.object({
  email: z.string().email(), name: z.string().trim().min(1), password: z.string().min(8),
  role: z.enum(['COORDINATOR', 'READ_ONLY']).default('COORDINATOR'),
});
const coordinatorUpdateSchema = coordinatorCreateSchema.partial().extend({ disabled: z.boolean().optional() });
const beaconSchema = z.object({ classroom: z.string().trim().min(1), uuid: z.string().trim().min(8) });
const beaconUpdateSchema = beaconSchema.partial();
const studentBeaconBindingSchema = z.object({
  matricula: z.string().trim().min(1).max(40),
  attendanceUuid: z.string().trim().uuid(),
}).strict();
const scheduleSlotSchema = z.object({
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).refine(({ startTime, endTime }) => endTime > startTime, { message: 'La hora final debe ser posterior a la inicial.' });
const debugScheduleSchema = z.object({
  monday: z.array(scheduleSlotSchema).max(8).optional(), tuesday: z.array(scheduleSlotSchema).max(8).optional(),
  wednesday: z.array(scheduleSlotSchema).max(8).optional(), thursday: z.array(scheduleSlotSchema).max(8).optional(),
  friday: z.array(scheduleSlotSchema).max(8).optional(), saturday: z.array(scheduleSlotSchema).max(8).optional(),
  sunday: z.array(scheduleSlotSchema).max(8).optional(),
});
const debugTeacherCreateSchema = z.object({ email: z.string().email(), name: z.string().trim().min(1).max(240), password: z.string().min(8).max(128) });
const debugTeacherUpdateSchema = debugTeacherCreateSchema.partial().refine((value) => Object.keys(value).length > 0);
const debugStudentCreateSchema = z.object({
  matricula: z.string().trim().min(1).max(40), email: z.string().email(), name: z.string().trim().min(1).max(240),
  password: z.string().min(8).max(128), attendanceUuid: z.string().uuid().optional(), careerName: z.string().trim().min(1).max(240).optional(),
});
const debugStudentUpdateSchema = debugStudentCreateSchema.partial().refine((value) => Object.keys(value).length > 0);
const debugClassCreateSchema = z.object({
  professorId: z.string().uuid().optional(), professorEmail: z.string().email().optional(), professorName: z.string().trim().min(1).max(240).optional(),
  code: z.string().trim().min(1).max(80).default('DEMO-101'), groupLetter: z.string().trim().max(40).default('DBG'),
  period: z.string().trim().max(80).optional(), name: z.string().trim().min(1).max(240).default('Materia de demostración'),
  level: z.string().trim().min(1).max(160).default('DEBUG'), classroom: z.string().trim().min(1).max(160).default('DEMO-101'),
  beaconUuid: z.string().uuid(), schedule: debugScheduleSchema.default({}), studentIds: z.array(z.string().uuid()).max(1_000).optional(),
}).refine((value) => Boolean(value.professorId || value.professorEmail), { message: 'Selecciona o indica un profesor demo.' });
const debugClassUpdateSchema = z.object({
  code: z.string().trim().min(1).max(80).optional(), groupLetter: z.string().trim().max(40).optional(),
  period: z.string().trim().min(1).max(80).optional(), name: z.string().trim().min(1).max(240).optional(),
  level: z.string().trim().min(1).max(160).optional(), classroom: z.string().trim().min(1).max(160).optional(),
  beaconUuid: z.string().uuid().optional(), schedule: debugScheduleSchema.optional(), studentIds: z.array(z.string().uuid()).max(1_000).optional(),
}).refine((value) => Object.keys(value).length > 0);
const debugSettingsSchema = z.object({ teacherAttendanceToleranceMinutes: z.number().int().min(0).max(120) });
const debugMembershipSchema = z.object({ studentId: z.string().uuid() });
const debugRegisteredMembershipSchema = z.object({ matricula: z.string().trim().min(1).max(40) }).strict();
const debugAttendanceSimulationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  })).min(1).max(1_000),
});
const debugResetSchema = z.object({ confirmation: z.literal('BORRAR DEMO') }).strict();
const databaseTargetSchema = z.enum([
  'integration', 'identity', 'academic', 'attendance', 'coordination-query', 'all',
]);
const databasePurgeSchema = z.object({
  target: databaseTargetSchema,
  confirmation: z.string().trim().min(1).max(80),
}).strict();

type DatabaseTarget = z.infer<typeof databaseTargetSchema>;
type SingleDatabaseTarget = Exclude<DatabaseTarget, 'all'>;

const DATABASE_TARGETS: ReadonlyArray<{
  id: SingleDatabaseTarget;
  name: string;
  description: string;
  confirmationPhrase: string;
  invalidatesSuperUserSession: boolean;
}> = [
  {
    id: 'integration',
    name: 'Integración UAT',
    description: 'Sesiones UAT, clases compartidas, cosechas locales y cola de subidas.',
    confirmationPhrase: 'BORRAR INTEGRACION UAT',
    invalidatesSuperUserSession: false,
  },
  {
    id: 'identity',
    name: 'Identidad',
    description: 'Identidades, cuentas coordinadoras, credenciales y sesiones. Cerrará esta sesión.',
    confirmationPhrase: 'BORRAR IDENTIDAD',
    invalidatesSuperUserSession: true,
  },
  {
    id: 'academic',
    name: 'Académica',
    description: 'Profesores, alumnos, ciclos observados, materias, grupos y clases compartidas.',
    confirmationPhrase: 'BORRAR ACADEMICA',
    invalidatesSuperUserSession: false,
  },
  {
    id: 'attendance',
    name: 'Asistencia',
    description: 'Listas, capturas, detecciones, dispositivos vinculados y beacons.',
    confirmationPhrase: 'BORRAR ASISTENCIA',
    invalidatesSuperUserSession: false,
  },
  {
    id: 'coordination-query',
    name: 'Proyección de coordinación',
    description: 'Proyecciones utilizadas por dashboard, profesores y reportes.',
    confirmationPhrase: 'BORRAR PROYECCION COORDINACION',
    invalidatesSuperUserSession: false,
  },
] as const;

const ALL_DATABASES_CONFIRMATION = 'BORRAR TODAS LAS BASES';

export const superUserRoutes: FastifyPluginAsync<SuperUserRoutesOptions> = async (
  fastify,
  { authService, identityService, attendanceService, attendanceCapture, academicService, coordinationQuery, demoPortal, resetLocalDemoData },
) => {
  fastify.post('/api/superUsuario/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    try {
      const session = await authService.login(input.password);
      reply.setCookie(SUPER_USER_COOKIE, session.token, cookieOptions(session.expiresAt));
      return reply.send({ data: { user: { role: session.user.role }, expiresAt: session.expiresAt.toISOString() } });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_SUPER_USER_PASSWORD') {
        return reply.code(401).send({ error: 'INVALID_SUPER_USER_PASSWORD', message: 'Contraseña de super usuario inválida.' });
      }
      throw error;
    }
  });

  fastify.post('/api/superUsuario/auth/logout', async (request, reply) => {
    await authService.logout(request.cookies[SUPER_USER_COOKIE]);
    reply.clearCookie(SUPER_USER_COOKIE, cookieClearOptions());
    return reply.code(204).send();
  });

  const requireSuperUser = buildSuperUserAuthHook(authService);
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions.url === '/api/superUsuario/auth/login'
      || request.routeOptions.url === '/api/superUsuario/auth/logout') return;
    return requireSuperUser(request, reply);
  });

  fastify.get('/api/superUsuario/auth/me', async (request) => ({ data: { user: { role: request.superUser?.role } } }));
  fastify.get('/api/superUsuario/bases-datos', async () => ({
    data: {
      databases: DATABASE_TARGETS,
      all: {
        id: 'all',
        name: 'Todas las bases de datos',
        description: 'Borra los registros de los cinco servicios. Conserva esquemas y migraciones.',
        confirmationPhrase: ALL_DATABASES_CONFIRMATION,
        invalidatesSuperUserSession: true,
      },
    },
    meta: { generatedAt: new Date().toISOString() },
  }));
  fastify.post('/api/superUsuario/bases-datos/borrar', {
    config: { rateLimit: { max: 2, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = databasePurgeSchema.parse(request.body);
    const expectedConfirmation = input.target === 'all'
      ? ALL_DATABASES_CONFIRMATION
      : DATABASE_TARGETS.find(({ id }) => id === input.target)?.confirmationPhrase;
    if (input.confirmation !== expectedConfirmation) {
      return reply.code(400).send({
        error: 'INVALID_DATABASE_PURGE_CONFIRMATION',
        message: `Escribe ${expectedConfirmation} para confirmar el borrado.`,
      });
    }

    request.log.warn({ target: input.target, actorIdentityId: request.superUser?.id }, 'Super user database purge started.');
    const purged = await purgeDatabaseData(input.target, {
      identityService, academicService, attendanceService, coordinationQuery, resetLocalDemoData,
    });
    request.log.warn({ target: input.target, purged }, 'Super user database purge completed.');
    return {
      data: {
        purged,
        purgedAt: new Date().toISOString(),
        sessionInvalidated: input.target === 'identity' || input.target === 'all',
      },
    };
  });
  fastify.get('/api/superUsuario/ciclo-escolar', async () => {
    const result = await academicService.activeAcademicCycle();
    return { ...result, meta: { mode: env.PRESENCIA_DEBUG_MODE ? 'DEMO' : 'PRODUCTION' } };
  });
  fastify.put('/api/superUsuario/ciclo-escolar', async (request, reply) => {
    if (env.PRESENCIA_DEBUG_MODE) {
      return reply.code(409).send({
        error: 'ACADEMIC_CYCLE_PRODUCTION_ONLY',
        message: 'El ciclo académico de producción no se modifica mientras el entorno está en modo demo.',
      });
    }
    const input = activeAcademicCycleSchema.parse(request.body);
    const result = await academicService.changeActiveAcademicCycle({
      cycleExternalId: input.cycleExternalId,
      ...actor(request.superUser?.id, request.id, 'Cambio del ciclo escolar activo desde super usuario.'),
    });
    return { ...result, meta: { mode: 'PRODUCTION' } };
  });
  fastify.get('/api/superUsuario/coordinadores', async () => identityService.listStaffAccounts());
  fastify.post('/api/superUsuario/coordinadores', async (request, reply) => {
    const input = coordinatorCreateSchema.parse(request.body);
    return reply.code(201).send(await identityService.createStaffAccount({
      ...input, ...staffAudit(request.superUser?.id, request.id, 'Alta de cuenta coordinadora.'),
    }));
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/coordinadores/:id', async (request) => {
    const input = coordinatorUpdateSchema.parse(request.body);
    return identityService.updateStaffAccount(request.params.id, {
      ...input, ...staffAudit(request.superUser?.id, request.id, 'Actualización de cuenta coordinadora.'),
    });
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/coordinadores/:id', async (request, reply) => {
    await identityService.deleteStaffAccount(
      request.params.id,
      staffAudit(request.superUser?.id, request.id, 'Baja de cuenta coordinadora.'),
    );
    return reply.code(204).send();
  });

  fastify.get('/api/superUsuario/beacons', async () => attendanceService.listClassroomBeacons());
  fastify.post('/api/superUsuario/beacons', async (request, reply) => {
    const input = beaconSchema.parse(request.body);
    return reply.code(201).send(await attendanceService.createClassroomBeacon({
      ...input, ...actor(request.superUser?.id, request.id, 'Alta de beacon desde super usuario.'),
    }));
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/beacons/:id', async (request) => {
    const input = beaconUpdateSchema.parse(request.body);
    return attendanceService.updateClassroomBeacon(request.params.id, {
      ...input, ...actor(request.superUser?.id, request.id, 'Actualización de beacon desde super usuario.'),
    });
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/beacons/:id', async (request, reply) => {
    await attendanceService.deleteClassroomBeacon(request.params.id, actor(
      request.superUser?.id, request.id, 'Baja de beacon desde super usuario.',
    ));
    return reply.code(204).send();
  });

  fastify.get('/api/superUsuario/alumnos-vinculados', async (request) => {
    const { q } = request.query as { q?: string };
    return attendanceService.listStudentDeviceBindings({ q });
  });
  fastify.post('/api/superUsuario/alumnos-vinculados', async (request, reply) => {
    const parsed = studentBeaconBindingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_STUDENT_BEACON_BINDING',
        message: 'Captura una matrícula y un UUID válido para vincular al alumno.',
      });
    }
    const input = parsed.data;
    const result = await attendanceService.replaceStudentDeviceBinding({
      matricula: input.matricula.trim().toUpperCase(),
      attendanceUuid: input.attendanceUuid.trim().toLowerCase(),
      deviceBindingId: null,
      platform: 'ios',
      deviceInfo: 'Beacon iOS registrado manualmente por super usuario.',
      ...actor(request.superUser?.id, request.id, 'Alta manual de beacon iOS para alumno desde super usuario.'),
    });
    return reply.code(201).send(result);
  });
  fastify.delete<{ Params: { matricula: string } }>('/api/superUsuario/alumnos-vinculados/:matricula', async (request, reply) => {
    await attendanceService.unbindStudentDevice({
      matricula: request.params.matricula,
      ...actor(request.superUser?.id, request.id, 'Desvinculación solicitada desde super usuario.'),
    });
    return reply.code(204).send();
  });

  fastify.get('/api/superUsuario/debug/status', async () => {
    if (!env.PRESENCIA_DEBUG_MODE) return disabledDebugStatus();
    const { data } = await demoPortal.status();
    return {
      data: {
        enabled: true, period: data.cycleName, settings: data.settings,
        apiRestPolicy: 'Portal UAT simulado y privado. No se realizan solicitudes a las plataformas reales.',
      },
      meta: { generatedAt: new Date().toISOString() },
    };
  });
  fastify.get('/api/superUsuario/debug/catalog', async (_request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    return demoPortal.catalog();
  });
  fastify.get('/api/superUsuario/debug/registered-students', async (_request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const result = await identityService.listRegisteredStudents();
    return { ...result, meta: { generatedAt: new Date().toISOString() } };
  });
  fastify.get('/api/superUsuario/debug/settings', async (_request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const { data } = await demoPortal.status();
    return { data: data.settings, meta: { generatedAt: new Date().toISOString() } };
  });
  fastify.put('/api/superUsuario/debug/settings', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const result = await demoPortal.updateSettings(debugSettingsSchema.parse(request.body));
    return { ...result, meta: { generatedAt: new Date().toISOString() } };
  });
  fastify.get('/api/superUsuario/debug/teachers', async (_request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    return { data: (await demoPortal.catalog()).data.teachers };
  });
  fastify.post('/api/superUsuario/debug/teachers', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const result = await demoPortal.createTeacher(debugTeacherCreateSchema.parse(request.body));
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return reply.code(201).send(withSynchronizationMeta(result, sync));
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/debug/teachers/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const result = await demoPortal.updateTeacher(request.params.id, debugTeacherUpdateSchema.parse(request.body));
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return withSynchronizationMeta(result, sync);
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/debug/teachers/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    await demoPortal.deleteTeacher(request.params.id);
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return sendDemoDeletion(reply, sync);
  });
  fastify.get('/api/superUsuario/debug/students', async (_request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    return { data: (await demoPortal.catalog()).data.students };
  });
  fastify.post('/api/superUsuario/debug/students', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const result = await demoPortal.createStudent(debugStudentCreateSchema.parse(request.body));
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return reply.code(201).send(withSynchronizationMeta(result, sync));
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/debug/students/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const result = await demoPortal.updateStudent(request.params.id, debugStudentUpdateSchema.parse(request.body));
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return withSynchronizationMeta(result, sync);
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/debug/students/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    await demoPortal.deleteStudent(request.params.id);
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return sendDemoDeletion(reply, sync);
  });
  fastify.get('/api/superUsuario/debug/classes', async (_request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return { data: [], meta: { generatedAt: new Date().toISOString() } };
    const status = (await demoPortal.status()).data;
    return { data: status.classes.map((item) => mapDebugClass(item, status)), meta: { generatedAt: new Date().toISOString() } };
  });
  fastify.post('/api/superUsuario/debug/classes', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const parsed = debugClassCreateSchema.parse(request.body);
    const period = parsed.period || (await demoPortal.status()).data.cycleName;
    const result = await demoPortal.createClass({ ...parsed, period });
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return reply.code(201).send(withSynchronizationMeta({ data: mapDebugClass(result.data, sync.catalog) }, sync));
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const parsed = debugClassUpdateSchema.parse(request.body);
    const result = await demoPortal.updateClass(request.params.id, parsed);
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return withSynchronizationMeta({ data: mapDebugClass(result.data, sync.catalog) }, sync);
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    await demoPortal.deleteClass(request.params.id);
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return sendDemoDeletion(reply, sync);
  });
  fastify.post<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id/students', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const { studentId } = debugMembershipSchema.parse(request.body);
    const result = await demoPortal.addStudentToClass(request.params.id, studentId);
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return reply.code(201).send(withSynchronizationMeta(result, sync));
  });
  fastify.post<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id/registered-students', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const { matricula } = debugRegisteredMembershipSchema.parse(request.body);
    const { data: student } = await identityService.registeredStudentByMatricula(matricula);
    const result = await demoPortal.addRegisteredStudentToClass(request.params.id, {
      matricula: student.matricula,
      email: student.email,
      name: student.name,
    });
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return reply.code(201).send(withSynchronizationMeta(result, sync));
  });
  fastify.delete<{ Params: { id: string; studentId: string } }>('/api/superUsuario/debug/classes/:id/students/:studentId', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    await demoPortal.removeStudentFromClass(request.params.id, request.params.studentId);
    const sync = await synchronizeAfterDemoMutation(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id, request.log,
    );
    return sendDemoDeletion(reply, sync);
  });
  fastify.post('/api/superUsuario/debug/synchronize', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const synchronized = await synchronizeDemoCatalogWithRetry(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id,
    );
    const status = synchronized.catalog;
    return {
      data: { teachers: status.teachers.length, students: status.students.length, classes: status.classes.length },
      meta: { synchronizedAt: new Date().toISOString(), attempts: synchronized.attempts },
    };
  });
  fastify.delete('/api/superUsuario/debug/data', {
    config: { rateLimit: { max: 2, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const confirmation = debugResetSchema.safeParse(request.body);
    if (!confirmation.success) {
      return reply.code(400).send({
        error: 'INVALID_DEMO_RESET_CONFIRMATION',
        message: 'Escribe BORRAR DEMO para confirmar el borrado.',
      });
    }

    const deleted = await resetDemoEnvironment({
      demoPortal, identityService, academicService, attendanceService, coordinationQuery, resetLocalDemoData,
    });

    return {
      data: {
        reset: true,
        deleted,
        resetAt: new Date().toISOString(),
      },
    };
  });
  fastify.post<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id/simulate-attendance', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const input = debugAttendanceSimulationSchema.parse(request.body);
    const synchronized = await synchronizeDemoCatalogWithRetry(
      { demoPortal, academicService, attendanceService }, request.superUser?.id, request.id,
    );
    const status = synchronized.catalog;
    const item = status.classes.find(({ id }) => id === request.params.id);
    if (!item || !item.professor) return reply.code(404).send({ error: 'DEMO_CLASS_NOT_FOUND', message: 'Materia demo no encontrada.' });
    const students = new Map(item.students.map((student) => [student.id, student]));
    const entries = input.entries.map((entry) => {
      const student = students.get(entry.studentId);
      if (!student) throw new ApiError(400, 'DEMO_STUDENT_NOT_IN_CLASS', 'El alumno demo no pertenece a la materia.');
      return { uatStudentId: student.uatStudentId, status: entry.status };
    });
    const capture = await attendanceCapture.capture({
      correlationId: request.id,
      externalGroupId: String(item.groupId),
      professorExternalId: item.professor.externalId,
      date: input.date,
      entries,
    });
    const write = await demoPortal.simulateAttendance(request.params.id, input);
    return reply.code(capture.data.duplicate ? 200 : 201).send({
      data: {
        capture: capture.data,
        attendanceRecord: mapDebugAttendance(write.data, (await demoPortal.status()).data)[0] ?? null,
      },
    });
  });
  fastify.get('/api/superUsuario/debug/student-attendance', async () => {
    if (!env.PRESENCIA_DEBUG_MODE) return { data: [], meta: { generatedAt: new Date().toISOString() } };
    const status = (await demoPortal.status()).data;
    return { data: status.attendanceWrites.flatMap((write) => mapDebugAttendance(write, status)), meta: { generatedAt: new Date().toISOString() } };
  });
  fastify.get('/api/superUsuario/debug/flow-logs', async () => {
    if (!env.PRESENCIA_DEBUG_MODE) return { data: { syncJobs: [], attendanceRecords: [], recentBindings: [] } };
    const status = (await demoPortal.status()).data;
    return {
      data: {
        syncJobs: [],
        attendanceRecords: status.attendanceWrites.flatMap((write) => mapDebugAttendance(write, status)).map((item) => ({
          ...item, _count: { attendances: item.attendances.length, studentBeaconDetections: 0 },
        })),
        recentBindings: [],
      },
    };
  });
};

export async function purgeDatabaseData(target: DatabaseTarget, services: {
  identityService: Pick<IdentityServiceClient, 'purgeAllData'>;
  academicService: Pick<AcademicServiceClient, 'purgeAllData'>;
  attendanceService: Pick<AttendanceServiceCommandClient, 'purgeAllData'>;
  coordinationQuery: Pick<CoordinationQueryClient, 'purgeAllData'>;
  resetLocalDemoData: () => Promise<{ teacherSessions: number; studentSessions: number }>;
}): Promise<SingleDatabaseTarget[]> {
  const selected = target === 'all'
    ? DATABASE_TARGETS.map(({ id }) => id)
    : [target];
  const purged: SingleDatabaseTarget[] = [];
  const failed: Array<{ target: SingleDatabaseTarget; code: string; statusCode: number }> = [];

  // Identity is intentionally last: purging it revokes the super-user session
  // that authorized this request.
  const ordered: SingleDatabaseTarget[] = [];
  for (const item of selected) if (item !== 'identity') ordered.push(item);
  if (selected.includes('identity')) ordered.push('identity');

  for (const item of ordered) {
    try {
      await purgeSingleDatabase(item, services);
      purged.push(item);
    } catch (error) {
      failed.push({
        target: item,
        code: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR',
        statusCode: error instanceof ApiError ? error.statusCode : 500,
      });
    }
  }

  if (failed.length > 0) {
    throw new ApiError(
      503,
      'DATABASE_PURGE_FAILED',
      `El borrado quedó incompleto. Falló: ${failed.map(({ target: item }) => item).join(', ')}.`,
      { failed, purged },
    );
  }
  return purged;
}

async function purgeSingleDatabase(target: SingleDatabaseTarget, services: {
  identityService: Pick<IdentityServiceClient, 'purgeAllData'>;
  academicService: Pick<AcademicServiceClient, 'purgeAllData'>;
  attendanceService: Pick<AttendanceServiceCommandClient, 'purgeAllData'>;
  coordinationQuery: Pick<CoordinationQueryClient, 'purgeAllData'>;
  resetLocalDemoData: () => Promise<{ teacherSessions: number; studentSessions: number }>;
}): Promise<void> {
  if (target === 'integration') {
    await services.resetLocalDemoData();
    return;
  }
  if (target === 'identity') {
    await services.identityService.purgeAllData();
    return;
  }
  if (target === 'academic') {
    await services.academicService.purgeAllData();
    return;
  }
  if (target === 'attendance') {
    await services.attendanceService.purgeAllData();
    return;
  }
  await services.coordinationQuery.purgeAllData();
}

export async function resetDemoEnvironment(services: {
  demoPortal: DemoPortalClient;
  identityService: IdentityServiceClient;
  academicService: AcademicServiceClient;
  attendanceService: AttendanceServiceCommandClient;
  coordinationQuery: CoordinationQueryClient;
  resetLocalDemoData: () => Promise<{ teacherSessions: number; studentSessions: number }>;
}) {
  const components = [
    'Portal demo',
    'Identity Service',
    'sesiones y datos locales',
    'Academic Service',
    'Attendance Service',
    'Coordination Query Service',
  ] as const;

  // Clear the source catalog first, then each downstream layer. Keeping the
  // phases ordered prevents background synchronization from recreating data
  // while another service is still being reset. Each phase still settles all
  // of its operations so one failure does not skip the remaining cleanups.
  const portal = await settle(() => services.demoPortal.resetData());
  const identityAndLocal = await Promise.allSettled([
    services.identityService.resetDemoData(),
    services.resetLocalDemoData(),
  ]);
  const domainServices = await Promise.allSettled([
    services.academicService.resetDemoData(),
    services.attendanceService.resetDemoData(),
  ]);
  const projection = await settle(() => services.coordinationQuery.resetDemoData());
  const allResults: PromiseSettledResult<unknown>[] = [
    portal,
    ...identityAndLocal,
    ...domainServices,
    projection,
  ];
  const failed = allResults.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const error = result.reason;
    return [{
      component: components[index] ?? 'Componente demo desconocido',
      code: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR',
      statusCode: error instanceof ApiError ? error.statusCode : 500,
    }];
  });
  if (failed.length > 0) {
    throw new ApiError(
      503,
      'DEMO_RESET_FAILED',
      `No se pudo completar el borrado demo. Falló: ${failed.map(({ component }) => component).join(', ')}. Puedes volver a intentarlo.`,
      { failed },
    );
  }

  const portalValue = settledValue(portal);
  const identity = settledValue(identityAndLocal[0]);
  const local = settledValue(identityAndLocal[1]);
  return {
    ...portalValue.data.deleted,
    identities: identity.data.identities,
    teacherSessions: local.teacherSessions,
    studentSessions: local.studentSessions,
  };
}

async function settle<T>(operation: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: 'fulfilled', value: await operation() };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

function settledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}

function debugDisabled(reply: FastifyReply) {
  return reply.code(404).send({
    error: 'DEBUG_MODE_DISABLED',
    message: 'El modo demo no está habilitado en este despliegue.',
  });
}

function disabledDebugStatus() {
  return {
    data: {
      enabled: false, period: 'N/A', settings: { teacherAttendanceToleranceMinutes: 10 },
      apiRestPolicy: 'Modo demo desactivado. La integración utiliza las plataformas UAT configuradas.',
    },
    meta: { generatedAt: new Date().toISOString() },
  };
}

function actor(identityId: string | undefined, correlationId: string, reason: string) {
  if (!identityId) throw new Error('SUPER_USER_IDENTITY_REQUIRED');
  return { actorIdentityId: identityId, actorRole: 'SUPER_USER' as const, reason, correlationId };
}

function staffAudit(identityId: string | undefined, correlationId: string, reason: string) {
  if (!identityId) throw new Error('SUPER_USER_IDENTITY_REQUIRED');
  return { actorIdentityId: identityId, correlationId, reason };
}

function cookieOptions(expires: Date) {
  return {
    path: '/api/superUsuario', httpOnly: true, sameSite: 'strict' as const,
    secure: env.COORDINATION_COOKIE_SECURE ?? env.NODE_ENV === 'production', expires,
  };
}

function cookieClearOptions() {
  return {
    path: '/api/superUsuario', httpOnly: true, sameSite: 'strict' as const,
    secure: env.COORDINATION_COOKIE_SECURE ?? env.NODE_ENV === 'production',
  };
}

function mapDebugClass(item: DemoPortalClass, status: DemoPortalStatus) {
  const professor = item.professor ?? status.teachers.find(({ id }) => id === item.professorId);
  return {
    id: item.id,
    externalGroupId: String(item.groupId),
    code: item.code,
    groupLetter: item.groupLetter,
    period: item.period,
    name: item.name,
    level: item.level,
    classroom: item.classroom,
    beaconUuid: item.beaconUuid,
    schedule: item.schedule,
    professor: {
      id: professor?.id ?? item.professorId,
      name: professor?.name ?? 'Profesor demo',
      institutionalEmail: professor?.email ?? '',
    },
    students: item.students.map((student) => ({
      id: student.id, matricula: student.matricula, name: student.name, beaconUuid: student.attendanceUuid,
    })),
    attendanceRecords: status.attendanceWrites.flatMap((write) => write.groupId === item.groupId ? mapDebugAttendance(write, status) : []),
  };
}

function mapDebugAttendance(write: DemoPortalAttendanceWrite, status: DemoPortalStatus) {
  const item = status.classes.find(({ groupId }) => groupId === write.groupId);
  if (!item) return [];
  const professor = item.professor ?? status.teachers.find(({ id }) => id === item.professorId);
  const studentsByUatId = new Map(status.students.map((student) => [student.uatStudentId, student]));
  return [{
    id: write.id,
    date: attendanceWriteDate(write),
    professorEntryAt: null,
    professorExitAt: null,
    portalSyncStatus: 'SKIPPED',
    portalSyncError: null,
    createdAt: write.createdAt,
    professor: {
      id: professor?.id ?? item.professorId,
      name: professor?.name ?? 'Profesor demo',
      institutionalEmail: professor?.email ?? '',
    },
    group: {
      id: item.id, code: item.code, groupLetter: item.groupLetter, period: item.period,
      name: item.name, classroom: item.classroom,
    },
    attendances: write.attendances.flatMap((attendance, index) => {
      const student = studentsByUatId.get(attendance.id_alumno);
      return student ? [{
        id: `${write.id}:${student.id}:${index}`,
        status: attendance.status ?? (attendance.sn_asistencia ? 'PRESENT' : 'ABSENT'),
        createdAt: write.createdAt,
        student: { id: student.id, matricula: student.matricula, name: student.name, beaconUuid: student.attendanceUuid },
      }] : [];
    }),
    studentBeaconDetections: [],
  }];
}

async function ensureDemoBeacon(
  attendanceService: AttendanceServiceCommandClient,
  classroom: string,
  uuid: string,
  identityId: string | undefined,
  correlationId: string,
) {
  if (!identityId) throw new Error('SUPER_USER_IDENTITY_REQUIRED');
  const { data } = await attendanceService.listClassroomBeacons();
  const normalizedClassroom = classroom.trim().toUpperCase();
  const existing = data.find((item) => item.classroom.trim().toUpperCase() === normalizedClassroom)
    ?? data.find((item) => item.uuid.toLowerCase() === uuid.toLowerCase());
  const actor = {
    actorIdentityId: identityId,
    actorRole: 'SUPER_USER' as const,
    reason: 'Configuración de beacon para materia demo.',
    correlationId,
  };
  if (!existing) return attendanceService.createClassroomBeacon({ classroom, uuid, ...actor });
  if (existing.classroom === classroom && existing.uuid.toLowerCase() === uuid.toLowerCase()) return existing;
  return attendanceService.updateClassroomBeacon(existing.id, { classroom, uuid, ...actor });
}

function isoDate(value: string): string {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}T00:00:00.000Z` : value;
}

function attendanceWriteDate(write: DemoPortalAttendanceWrite): string {
  const value = isoDate(write.weekStart);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const dayNumber = write.attendances[0]?.num_dia ?? 1;
  parsed.setUTCDate(parsed.getUTCDate() + Math.max(0, dayNumber - 1));
  return parsed.toISOString();
}

interface DemoSynchronizationServices {
  demoPortal: DemoPortalClient;
  academicService: AcademicServiceClient;
  attendanceService: AttendanceServiceCommandClient;
}

interface DemoSynchronizationResult {
  catalog: DemoPortalStatus;
  synchronization: {
    status: 'COMPLETED' | 'PENDING';
    attempts: number;
    error: string | null;
  };
}

export async function synchronizeAfterDemoMutation(
  services: DemoSynchronizationServices,
  identityId: string | undefined,
  correlationId: string,
  logger: Pick<FastifyBaseLogger, 'error'>,
): Promise<DemoSynchronizationResult> {
  try {
    const synchronized = await synchronizeDemoCatalogWithRetry(services, identityId, correlationId);
    return {
      catalog: synchronized.catalog,
      synchronization: { status: 'COMPLETED', attempts: synchronized.attempts, error: null },
    };
  } catch (error) {
    const errorCode = synchronizationErrorCode(error);
    logger.error({ err: error, correlationId, errorCode }, 'Demo catalog was saved but downstream synchronization is pending');
    const catalog = (await services.demoPortal.status()).data;
    return {
      catalog,
      synchronization: { status: 'PENDING', attempts: synchronizationAttemptCount(error), error: errorCode },
    };
  }
}

export async function synchronizeDemoCatalogWithRetry(
  services: DemoSynchronizationServices,
  identityId: string | undefined,
  correlationId: string,
  maxAttempts = 3,
): Promise<{ catalog: DemoPortalStatus; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { catalog: await synchronizeDemoCatalog(services, identityId, correlationId), attempts: attempt };
    } catch (error) {
      lastError = attachSynchronizationAttempt(error, attempt);
      if (!isRetryableSynchronizationError(error) || attempt === maxAttempts) throw lastError;
    }
  }
  throw lastError;
}

export async function synchronizeDemoCatalog(
  services: DemoSynchronizationServices,
  identityId: string | undefined,
  correlationId: string,
): Promise<DemoPortalStatus> {
  if (!identityId) throw new Error('SUPER_USER_IDENTITY_REQUIRED');
  const status = (await services.demoPortal.status()).data;
  const synchronizedAt = new Date().toISOString();
  const cycle = { externalId: String(status.cycleId), name: status.cycleName };
  const coordination = {
    externalId: String(status.coordinationId),
    name: status.coordinationName,
    shortName: 'DEMO',
  };

  const beaconsByClassroom = new Map<string, { classroom: string; uuid: string }>();
  const classroomsByUuid = new Map<string, string>();
  for (const item of status.classes) {
    const classroomKey = item.classroom.trim().toUpperCase();
    const uuidKey = item.beaconUuid.toLowerCase();
    const existing = beaconsByClassroom.get(classroomKey);
    if (existing && existing.uuid.toLowerCase() !== uuidKey) {
      throw new ApiError(409, 'DEMO_CLASSROOM_BEACON_CONFLICT', 'Las materias demo del mismo salón deben usar el mismo beacon UUID.');
    }
    const existingClassroom = classroomsByUuid.get(uuidKey);
    if (existingClassroom && existingClassroom !== classroomKey) {
      throw new ApiError(409, 'DEMO_BEACON_CLASSROOM_CONFLICT', 'Un beacon UUID demo no puede pertenecer a dos salones.');
    }
    beaconsByClassroom.set(classroomKey, { classroom: item.classroom, uuid: item.beaconUuid });
    classroomsByUuid.set(uuidKey, classroomKey);
  }
  for (const beacon of beaconsByClassroom.values()) {
    await ensureDemoBeacon(services.attendanceService, beacon.classroom, beacon.uuid, identityId, correlationId);
  }

  for (const teacher of status.teachers) {
    await services.academicService.publishProfessorSnapshot({
      snapshotId: demoSnapshotId('teacher', teacher.id, status.updatedAt),
      correlationId,
      causationId: correlationId,
      teacher: {
        externalId: teacher.externalId,
        institutionalCode: teacher.externalId,
        name: teacher.name,
        email: teacher.email,
        authenticatedAt: synchronizedAt,
      },
      cycle,
      groups: status.classes.filter(({ professorId }) => professorId === teacher.id).map((item) => ({
        externalGroupId: String(item.groupId),
        code: item.code,
        groupLetter: item.groupLetter,
        name: item.name,
        level: item.level,
        classroom: item.classroom,
        period: item.period,
        schedule: item.schedule,
        subject: { externalId: item.code, code: item.code, name: item.name },
        coordination,
        rosterAuthoritative: true,
        students: item.students.map((student, index) => ({
          matricula: student.matricula,
          name: student.name,
          uatStudentId: student.uatStudentId,
          listNumber: index + 1,
        })),
      })),
    });
  }

  for (const student of status.students.filter(({ origin }) => origin !== 'REGISTERED')) {
    await services.academicService.publishStudentSnapshot({
      snapshotId: demoSnapshotId('student', student.id, status.updatedAt),
      correlationId,
      causationId: correlationId,
      synchronizedAt,
      student: { matricula: student.matricula, displayName: student.name, email: student.email },
      career: {
        planExternalId: `demo-plan-${student.matricula}`,
        name: student.careerName,
        coordinationExternalId: String(status.coordinationId),
      },
      cycle,
      schedule: status.classes.filter(({ studentIds }) => studentIds.includes(student.id)).map((item) => ({
        externalGroupId: String(item.groupId),
        groupLetter: item.groupLetter,
        subjectName: item.name,
        professorName: item.professor?.name ?? null,
        classroom: item.classroom,
        period: item.period,
        credits: 5,
        schedule: item.schedule,
      })),
    });
  }

  for (const item of status.classes) {
    await services.attendanceService.applyRoster({
      externalGroupId: String(item.groupId),
      uatGroupId: item.groupId,
      name: item.name,
      groupLetter: item.groupLetter,
      professorExternalId: item.professor?.externalId ?? item.professorId,
      professorName: item.professor?.name,
      professorEmail: item.professor?.email ?? null,
      classroom: item.classroom,
      period: item.period,
      schedule: item.schedule,
      rosterVersion: item.updatedAt,
      rosterObservedAt: synchronizedAt,
      rosterAuthoritative: true,
      students: item.students.map((student, index) => ({
        matricula: student.matricula,
        name: student.name,
        uatStudentId: student.uatStudentId,
        listNumber: index + 1,
      })),
    });
  }

  return status;
}

function withSynchronizationMeta<T extends object>(payload: T, result: DemoSynchronizationResult) {
  return { ...payload, meta: { synchronization: result.synchronization } };
}

function sendDemoDeletion(reply: FastifyReply, result: DemoSynchronizationResult) {
  if (result.synchronization.status === 'COMPLETED') return reply.code(204).send();
  return reply.code(202).send(withSynchronizationMeta({ data: { deleted: true } }, result));
}

function demoSnapshotId(kind: 'teacher' | 'student', entityId: string, revision: string): string {
  const bytes = Buffer.from(createHash('sha256').update(`presencia:demo:${kind}:${entityId}:${revision}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isRetryableSynchronizationError(error: unknown): boolean {
  if (error instanceof ApiError) return error.statusCode >= 500 || error.statusCode === 429;
  return false;
}

function synchronizationErrorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'DEMO_SYNCHRONIZATION_FAILED';
}

function attachSynchronizationAttempt(error: unknown, attempt: number): unknown {
  if (error && typeof error === 'object') {
    Object.defineProperty(error, 'demoSynchronizationAttempt', { value: attempt, configurable: true });
  }
  return error;
}

function synchronizationAttemptCount(error: unknown): number {
  if (!error || typeof error !== 'object') return 1;
  const attempt = Reflect.get(error, 'demoSynchronizationAttempt');
  return typeof attempt === 'number' ? attempt : 1;
}
