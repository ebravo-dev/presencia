import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { SuperUserAuthService } from '../../../application/services/super-user-auth.service.js';
import type { AcademicServiceClient } from '../../../infrastructure/http/client/academic-service.client.js';
import type { AttendanceCaptureClient } from '../../../infrastructure/http/client/attendance-capture.client.js';
import type { AttendanceServiceCommandClient } from '../../../infrastructure/http/client/attendance-service-command.client.js';
import type { IdentityServiceClient } from '../../../infrastructure/http/client/identity-service.client.js';
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
  demoPortal: DemoPortalClient;
}

const loginSchema = z.object({ password: z.string().min(1).max(256) });
const coordinatorCreateSchema = z.object({
  email: z.string().email(), name: z.string().trim().min(1), password: z.string().min(8),
  role: z.enum(['COORDINATOR', 'READ_ONLY']).default('COORDINATOR'),
});
const coordinatorUpdateSchema = coordinatorCreateSchema.partial().extend({ disabled: z.boolean().optional() });
const beaconSchema = z.object({ classroom: z.string().trim().min(1), uuid: z.string().trim().min(8) });
const beaconUpdateSchema = beaconSchema.partial();
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
const debugAttendanceSimulationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  })).min(1).max(1_000),
});

export const superUserRoutes: FastifyPluginAsync<SuperUserRoutesOptions> = async (
  fastify,
  { authService, identityService, attendanceService, attendanceCapture, academicService, demoPortal },
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
    await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return reply.code(201).send(result);
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/debug/teachers/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const result = await demoPortal.updateTeacher(request.params.id, debugTeacherUpdateSchema.parse(request.body));
    await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return result;
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/debug/teachers/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    await demoPortal.deleteTeacher(request.params.id);
    await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return reply.code(204).send();
  });
  fastify.get('/api/superUsuario/debug/students', async (_request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    return { data: (await demoPortal.catalog()).data.students };
  });
  fastify.post('/api/superUsuario/debug/students', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const result = await demoPortal.createStudent(debugStudentCreateSchema.parse(request.body));
    await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return reply.code(201).send(result);
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/debug/students/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const result = await demoPortal.updateStudent(request.params.id, debugStudentUpdateSchema.parse(request.body));
    await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return result;
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/debug/students/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    await demoPortal.deleteStudent(request.params.id);
    await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return reply.code(204).send();
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
    const status = await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return reply.code(201).send({ data: mapDebugClass(result.data, status) });
  });
  fastify.put<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const parsed = debugClassUpdateSchema.parse(request.body);
    const result = await demoPortal.updateClass(request.params.id, parsed);
    const status = await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return { data: mapDebugClass(result.data, status) };
  });
  fastify.delete<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    await demoPortal.deleteClass(request.params.id);
    await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return reply.code(204).send();
  });
  fastify.post<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id/students', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const { studentId } = debugMembershipSchema.parse(request.body);
    const result = await demoPortal.addStudentToClass(request.params.id, studentId);
    await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return reply.code(201).send(result);
  });
  fastify.delete<{ Params: { id: string; studentId: string } }>('/api/superUsuario/debug/classes/:id/students/:studentId', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    await demoPortal.removeStudentFromClass(request.params.id, request.params.studentId);
    await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return reply.code(204).send();
  });
  fastify.post('/api/superUsuario/debug/synchronize', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const status = await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
    return {
      data: { teachers: status.teachers.length, students: status.students.length, classes: status.classes.length },
      meta: { synchronizedAt: new Date().toISOString() },
    };
  });
  fastify.post<{ Params: { id: string } }>('/api/superUsuario/debug/classes/:id/simulate-attendance', async (request, reply) => {
    if (!env.PRESENCIA_DEBUG_MODE) return debugDisabled(reply);
    const input = debugAttendanceSimulationSchema.parse(request.body);
    const status = await synchronizeDemoCatalog({ demoPortal, academicService, attendanceService }, request.superUser?.id, request.id);
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

async function synchronizeDemoCatalog(
  services: {
    demoPortal: DemoPortalClient;
    academicService: AcademicServiceClient;
    attendanceService: AttendanceServiceCommandClient;
  },
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

  await Promise.all([
    ...status.teachers.map((teacher) => services.academicService.publishProfessorSnapshot({
      snapshotId: randomUUID(),
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
    })),
    ...status.students.map((student) => services.academicService.publishStudentSnapshot({
      snapshotId: randomUUID(),
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
    })),
    ...status.classes.map((item) => services.attendanceService.applyRoster({
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
    })),
  ]);

  return status;
}
