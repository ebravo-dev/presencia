import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AttendanceStatus, PortalSyncStatus } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../core/config/env.js';
import { prisma } from '../../core/database/prisma.js';
import {
  findBeaconByClassroom,
  normalizeClassroomDisplay,
  serializeBeacon,
} from '../beacons/beacons.service.js';
import { attendanceDateFromServerNow, serverLocalHourMinute, serverNow } from '../../core/time/server-time.js';

const querySchema = z.object({
  professorEmail: z.string().email().transform((value) => value.toLowerCase()),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const studentDeviceBinding = (prisma as any).studentDeviceBinding;
const substituteAssignment = (prisma as any).substituteAssignment;

const beaconSchema = z.object({
  classroom: z.string().trim().min(1).transform(normalizeClassroomDisplay),
  uuid: z.string().trim().min(8).transform((value) => value.toLowerCase()),
});

const beaconUpdateSchema = beaconSchema.partial();

const bindingQuerySchema = z.object({
  q: z.string().trim().optional(),
});

const dateStringSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null)
  .refine((value) => value == null || !Number.isNaN(Date.parse(value)), {
    message: 'Fecha inválida',
  });

const substitutionSchema = z.object({
  groupId: z.string().min(1),
  substituteProfessorId: z.string().min(1),
  startsAt: dateStringSchema,
  endsAt: dateStringSchema,
  active: z.boolean().optional().default(true),
  notes: z.string().trim().max(500).optional().nullable().transform((value) => value || null),
});

const substitutionUpdateSchema = substitutionSchema.partial();

const debugAttendanceSchema = z.object({
  professorEmail: z.string().email().transform((value) => value.toLowerCase()),
  professorName: z.string().trim().optional().nullable().transform((value) => value || null),
  code: z.string().trim().min(1),
  groupLetter: z.string().trim().default(''),
  period: z.string().trim().min(1),
  groupName: z.string().trim().optional().nullable().transform((value) => value || null),
  classroom: z.string().trim().optional().nullable().transform((value) => value || null),
  level: z.string().trim().optional().nullable().transform((value) => value || null),
  schedule: z.record(z.unknown()).optional().nullable().transform((value) => value || null),
  createMissingGroup: z.boolean().optional().default(false),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  professorEntryAt: dateStringSchema,
  professorExitAt: dateStringSchema,
  roomBeaconUuid: z.string().trim().optional().nullable().transform((value) => value || null),
  roomBeaconRssi: z.number().int().optional().nullable().transform((value) => value ?? null),
  roomBeaconDistance: z.number().optional().nullable().transform((value) => value ?? null),
  roomBeaconAddress: z.string().trim().optional().nullable().transform((value) => value || null),
  attendances: z.array(z.object({
    studentId: z.string().trim().min(1),
    status: z.nativeEnum(AttendanceStatus),
  })).optional().default([]),
});

function debugCurrentClassSchedule(now: Date): Record<string, string> {
  const durationHours = Math.max(1, env.DEBUG_EXTRA_CLASS_HOURS);
  const start = new Date(now.getTime() - 10 * 60 * 1000);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const value = `${serverLocalHourMinute(start)}-${serverLocalHourMinute(end)}`;
  return {
    monday: value,
    lunes: value,
    tuesday: value,
    martes: value,
    wednesday: value,
    miercoles: value,
    thursday: value,
    jueves: value,
    friday: value,
    viernes: value,
    saturday: value,
    sabado: value,
    sunday: value,
    domingo: value,
  };
}

function parseDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

async function attachStudentsToBindings<TBinding extends { matricula: string }>(bindings: TBinding[]) {
  const matriculas = bindings.map((binding) => binding.matricula);
  const students = await prisma.student.findMany({
    where: { matricula: { in: matriculas } },
    select: {
      id: true,
      matricula: true,
      name: true,
      group: {
        select: {
          code: true,
          groupLetter: true,
          name: true,
          classroom: true,
          period: true,
          professor: {
            select: {
              name: true,
              institutionalEmail: true,
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const studentsByMatricula = new Map<string, typeof students>();
  for (const student of students) {
    const list = studentsByMatricula.get(student.matricula) ?? [];
    list.push(student);
    studentsByMatricula.set(student.matricula, list);
  }

  return bindings.map((binding) => ({
    ...binding,
    students: studentsByMatricula.get(binding.matricula) ?? [],
  }));
}

function substitutionInclude() {
  return {
    group: {
      select: {
        id: true,
        code: true,
        groupLetter: true,
        period: true,
        name: true,
        classroom: true,
        schedule: true,
      },
    },
    primaryProfessor: {
      select: {
        id: true,
        name: true,
        institutionalEmail: true,
      },
    },
    substituteProfessor: {
      select: {
        id: true,
        name: true,
        institutionalEmail: true,
      },
    },
  } as const;
}

function hasValidServiceToken(request: FastifyRequest): boolean {
  const provided = request.headers['x-internal-service-token'];
  if (typeof provided !== 'string') return false;
  const expectedBuffer = Buffer.from(env.INTERNAL_API_TOKEN);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function internalCoordinationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!hasValidServiceToken(request)) {
      return reply.code(401).send({ error: 'UNAUTHORIZED_INTERNAL_CLIENT', message: 'Token interno invalido.' });
    }
  });

  fastify.get(
    '/internal/coordination/attendance-weekly',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const professor = await prisma.professor.findUnique({
        where: { institutionalEmail: parsed.data.professorEmail },
        select: {
          id: true,
          institutionalEmail: true,
          name: true,
          groups: {
            select: {
              id: true,
              code: true,
              groupLetter: true,
              name: true,
              level: true,
              classroom: true,
              schedule: true,
              period: true,
              attendanceRecords: {
                where: {
                  date: {
                    gte: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
                    lte: new Date(`${parsed.data.endDate}T23:59:59.999Z`),
                  },
                },
                select: {
                  date: true,
                  professorEntryAt: true,
                  professorExitAt: true,
                  portalSyncStatus: true,
                  portalSyncError: true,
                  portalSyncedAt: true,
                  createdAt: true,
                },
              },
            },
            orderBy: [{ name: 'asc' }, { groupLetter: 'asc' }],
          },
        },
      });

      if (!professor) {
        return reply.code(404).send({ error: 'PROFESSOR_NOT_SYNCED', message: 'Profesor no sincronizado.' });
      }

      return reply.send({ data: professor });
    },
  );

  fastify.post('/internal/coordination/debug-attendance', async (request, reply) => {
    const parsed = debugAttendanceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    let professor = await prisma.professor.findUnique({
      where: { institutionalEmail: parsed.data.professorEmail },
      select: { id: true, institutionalEmail: true },
    });

    if (!professor && parsed.data.createMissingGroup) {
      professor = await prisma.professor.create({
        data: {
          institutionalEmail: parsed.data.professorEmail,
          name: parsed.data.professorName ?? parsed.data.professorEmail.split('@')[0] ?? parsed.data.professorEmail,
          lastSyncPeriod: parsed.data.period,
        },
        select: { id: true, institutionalEmail: true },
      });
    }

    if (!professor) {
      return reply.code(404).send({ error: 'PROFESSOR_NOT_SYNCED', message: 'Profesor no sincronizado en backend principal.' });
    }

    let group = await prisma.group.findFirst({
      where: {
        professorId: professor.id,
        code: parsed.data.code,
        groupLetter: parsed.data.groupLetter,
        period: parsed.data.period,
      },
      select: { id: true, code: true, groupLetter: true, period: true },
    });

    const serverTimestamp = serverNow();
    const debugSchedule = parsed.data.createMissingGroup
      ? debugCurrentClassSchedule(serverTimestamp)
      : parsed.data.schedule;

    if (!group && parsed.data.createMissingGroup) {
      group = await prisma.group.create({
        data: {
          professorId: professor.id,
          code: parsed.data.code,
          groupLetter: parsed.data.groupLetter,
          period: parsed.data.period,
          name: parsed.data.groupName ?? `DEBUG ${parsed.data.code}`,
          classroom: parsed.data.classroom ?? 'DEBUG',
          level: parsed.data.level ?? 'DEBUG',
          schedule: (debugSchedule ?? {}) as any,
        },
        select: { id: true, code: true, groupLetter: true, period: true },
      });

      request.log.info({
        professorEmail: parsed.data.professorEmail,
        groupId: group.id,
        code: parsed.data.code,
        groupLetter: parsed.data.groupLetter,
        period: parsed.data.period,
      }, 'debug group created for coordination reports');
    }

    if (group && parsed.data.createMissingGroup) {
      group = await prisma.group.update({
        where: { id: group.id },
        data: {
          name: parsed.data.groupName ?? `DEBUG ${parsed.data.code}`,
          classroom: parsed.data.classroom ?? 'DEBUG',
          level: parsed.data.level ?? 'DEBUG',
          schedule: (debugSchedule ?? {}) as any,
        },
        select: { id: true, code: true, groupLetter: true, period: true },
      });
    }

    if (!group) {
      return reply.code(404).send({
        error: 'GROUP_NOT_SYNCED',
        message: `Grupo no sincronizado (code: ${parsed.data.code}, group: ${parsed.data.groupLetter}, period: ${parsed.data.period}).`,
      });
    }

    const recordDate = attendanceDateFromServerNow(serverTimestamp);
    const existingRecord = await prisma.attendanceRecord.findUnique({
      where: {
        date_groupId: {
          date: recordDate,
          groupId: group.id,
        },
      },
      select: {
        id: true,
        professorEntryAt: true,
      },
    });
    const attendanceRecord = await prisma.attendanceRecord.upsert({
      where: {
        date_groupId: {
          date: recordDate,
          groupId: group.id,
        },
      },
      create: {
        date: recordDate,
        groupId: group.id,
        professorId: professor.id,
        professorEntryAt: serverTimestamp,
        professorExitAt: parsed.data.professorExitAt ? serverTimestamp : null,
        roomBeaconUuid: parsed.data.roomBeaconUuid,
        roomBeaconRssi: parsed.data.roomBeaconRssi,
        roomBeaconDistance: parsed.data.roomBeaconDistance,
        roomBeaconAddress: parsed.data.roomBeaconAddress,
        portalSyncStatus: PortalSyncStatus.NOT_REQUESTED,
        portalSyncError: 'DEBUG_REPORT_ONLY: registro visible en reportes sin enviar al portal/API REST.',
        portalSyncedAt: null,
      },
      update: {
        professorId: professor.id,
        professorEntryAt: existingRecord?.professorEntryAt ?? serverTimestamp,
        ...(parsed.data.professorExitAt ? { professorExitAt: serverTimestamp } : {}),
        roomBeaconUuid: parsed.data.roomBeaconUuid,
        roomBeaconRssi: parsed.data.roomBeaconRssi,
        roomBeaconDistance: parsed.data.roomBeaconDistance,
        roomBeaconAddress: parsed.data.roomBeaconAddress,
        portalSyncStatus: PortalSyncStatus.NOT_REQUESTED,
        portalSyncError: 'DEBUG_REPORT_ONLY: registro visible en reportes sin enviar al portal/API REST.',
        portalSyncedAt: null,
      },
    });

    const groupStudents = await prisma.student.findMany({
      where: { groupId: group.id },
      select: { id: true, matricula: true },
    });
    const validStudentIds = new Set(groupStudents.flatMap((student) => [student.id, student.matricula]));
    let savedAttendances = 0;

    for (const attendance of parsed.data.attendances) {
      if (!validStudentIds.has(attendance.studentId)) continue;
      const student = groupStudents.find((item) => item.id === attendance.studentId || item.matricula === attendance.studentId);
      if (!student) continue;

      await prisma.attendance.upsert({
        where: {
          studentId_attendanceRecordId: {
            studentId: student.id,
            attendanceRecordId: attendanceRecord.id,
          },
        },
        create: {
          studentId: student.id,
          attendanceRecordId: attendanceRecord.id,
          status: attendance.status,
        },
        update: {
          status: attendance.status,
        },
      });
      savedAttendances += 1;
    }

    request.log.info({
      professorEmail: parsed.data.professorEmail,
      groupId: group.id,
      date: recordDate.toISOString().slice(0, 10),
      savedAttendances,
    }, 'debug attendance stored for coordination reports');

    return reply.code(201).send({
      data: {
        attendanceRecordId: attendanceRecord.id,
        groupId: group.id,
        date: recordDate.toISOString().slice(0, 10),
        debug: true,
        reportVisible: true,
        savedAttendances,
      },
      message: 'Modo debug: asistencia registrada en backend principal para reportes, sin enviar al portal/API REST.',
    });
  });

  fastify.get('/internal/coordination/beacons', async (_request, reply) => {
    const beacons = await prisma.beacon.findMany({ orderBy: { classroom: 'asc' } });
    return reply.send({ data: beacons.map(serializeBeacon) });
  });

  fastify.get('/internal/coordination/infrastructure-summary', async (_request, reply) => {
    const now = new Date();
    const [beaconsCount, bindingsCount, legacyAttendanceCount, beaconDetectionCount, activeSubstitutionsCount, recentBindings, recentSubstitutions, recentBeacons] =
      await Promise.all([
        prisma.beacon.count(),
        studentDeviceBinding.count(),
        prisma.studentBleAttendance.count(),
        prisma.studentBeaconDetection.count(),
        substituteAssignment.count({
          where: {
            active: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            ],
          },
        }),
        studentDeviceBinding.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 6,
        }),
        substituteAssignment.findMany({
          where: {
            active: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            ],
          },
          include: substitutionInclude(),
          orderBy: { updatedAt: 'desc' },
          take: 6,
        }),
        prisma.beacon.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 6,
        }),
      ]);

    return reply.send({
      data: {
        counts: {
          beacons: beaconsCount,
          studentDeviceBindings: bindingsCount,
          studentBleAttendances: legacyAttendanceCount + beaconDetectionCount,
          activeSubstitutions: activeSubstitutionsCount,
        },
        recentBindings: await attachStudentsToBindings(recentBindings),
        recentSubstitutions,
        recentBeacons: recentBeacons.map(serializeBeacon),
      },
      meta: { generatedAt: new Date().toISOString() },
    });
  });

  fastify.post('/internal/coordination/beacons', async (request, reply) => {
    const parsed = beaconSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const existingClassroom = await findBeaconByClassroom(parsed.data.classroom);
    if (existingClassroom) {
      return reply.code(409).send({ error: 'CLASSROOM_BEACON_EXISTS', message: 'Ya existe un beacon asignado a ese salón.' });
    }

    try {
      const beacon = await prisma.beacon.create({ data: parsed.data });
      return reply.code(201).send({ data: serializeBeacon(beacon) });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'BEACON_UUID_EXISTS', message: 'Ya existe un beacon con ese UUID.' });
      }
      throw error;
    }
  });

  fastify.put<{ Params: { id: string } }>('/internal/coordination/beacons/:id', async (request, reply) => {
    const parsed = beaconUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    if (parsed.data.classroom) {
      const existingClassroom = await findBeaconByClassroom(parsed.data.classroom, request.params.id);
      if (existingClassroom) {
        return reply.code(409).send({ error: 'CLASSROOM_BEACON_EXISTS', message: 'Ya existe un beacon asignado a ese salón.' });
      }
    }

    try {
      const beacon = await prisma.beacon.update({ where: { id: request.params.id }, data: parsed.data });
      return reply.send({ data: serializeBeacon(beacon) });
    } catch (error: any) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'BEACON_NOT_FOUND', message: 'Beacon no encontrado.' });
      if (error.code === 'P2002') return reply.code(409).send({ error: 'BEACON_UUID_EXISTS', message: 'Ya existe un beacon con ese UUID.' });
      throw error;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/internal/coordination/beacons/:id', async (request, reply) => {
    try {
      await prisma.beacon.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    } catch (error: any) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'BEACON_NOT_FOUND', message: 'Beacon no encontrado.' });
      throw error;
    }
  });

  fastify.get('/internal/coordination/student-device-bindings', async (request, reply) => {
    const parsed = bindingQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const normalizedQuery = parsed.data.q?.toUpperCase();
    const bindings = await studentDeviceBinding.findMany({
      where: normalizedQuery ? { matricula: { contains: normalizedQuery } } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return reply.send({
      data: await attachStudentsToBindings(bindings),
    });
  });

  fastify.delete<{ Params: { matricula: string } }>(
    '/internal/coordination/student-device-bindings/:matricula',
    async (request, reply) => {
      const matricula = request.params.matricula.trim().toUpperCase();
      const deleted = await studentDeviceBinding.deleteMany({ where: { matricula } });
      if (deleted.count === 0) {
        return reply.code(404).send({ error: 'BINDING_NOT_FOUND', message: 'Vinculación no encontrada.' });
      }
      await prisma.student.updateMany({ where: { matricula }, data: { beaconUuid: null } });
      return reply.code(204).send();
    },
  );

  fastify.get('/internal/coordination/substitutions/options', async (_request, reply) => {
    const [professors, groups] = await Promise.all([
      prisma.professor.findMany({
        select: { id: true, name: true, institutionalEmail: true },
        orderBy: { name: 'asc' },
      }),
      prisma.group.findMany({
        select: {
          id: true,
          code: true,
          groupLetter: true,
          period: true,
          name: true,
          classroom: true,
          professor: { select: { id: true, name: true, institutionalEmail: true } },
        },
        orderBy: [{ name: 'asc' }, { groupLetter: 'asc' }],
        take: 1000,
      }),
    ]);
    return reply.send({ data: { professors, groups } });
  });

  fastify.get('/internal/coordination/substitute-assignments', async (_request, reply) => {
    const assignments = await substituteAssignment.findMany({
      include: substitutionInclude(),
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    });
    return reply.send({ data: assignments });
  });

  fastify.post('/internal/coordination/substitute-assignments', async (request, reply) => {
    const parsed = substitutionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const group = await prisma.group.findUnique({
      where: { id: parsed.data.groupId },
      select: { id: true, professorId: true },
    });
    if (!group) return reply.code(404).send({ error: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
    if (group.professorId === parsed.data.substituteProfessorId) {
      return reply.code(409).send({ error: 'INVALID_SUBSTITUTE', message: 'El profesor titular no puede ser su propio sustituto.' });
    }

    try {
      const assignment = await substituteAssignment.create({
        data: {
          groupId: group.id,
          primaryProfessorId: group.professorId,
          substituteProfessorId: parsed.data.substituteProfessorId,
          startsAt: parseDate(parsed.data.startsAt),
          endsAt: parseDate(parsed.data.endsAt),
          active: parsed.data.active,
          notes: parsed.data.notes,
        },
        include: substitutionInclude(),
      });
      return reply.code(201).send({ data: assignment });
    } catch (error: any) {
      if (error.code === 'P2002') return reply.code(409).send({ error: 'DUPLICATE_SUBSTITUTE', message: 'Ese sustituto ya está asignado a este grupo.' });
      if (error.code === 'P2003') return reply.code(404).send({ error: 'PROFESSOR_NOT_FOUND', message: 'Profesor sustituto no encontrado.' });
      throw error;
    }
  });

  fastify.put<{ Params: { id: string } }>('/internal/coordination/substitute-assignments/:id', async (request, reply) => {
    const parsed = substitutionUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const current = await substituteAssignment.findUnique({
      where: { id: request.params.id },
      select: { id: true, groupId: true, primaryProfessorId: true, substituteProfessorId: true },
    });
    if (!current) return reply.code(404).send({ error: 'SUBSTITUTION_NOT_FOUND', message: 'Sustitución no encontrada.' });

    let groupId = current.groupId;
    let primaryProfessorId = current.primaryProfessorId;
    if (parsed.data.groupId && parsed.data.groupId !== current.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: parsed.data.groupId },
        select: { id: true, professorId: true },
      });
      if (!group) return reply.code(404).send({ error: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
      groupId = group.id;
      primaryProfessorId = group.professorId;
    }

    const substituteProfessorId = parsed.data.substituteProfessorId ?? current.substituteProfessorId;
    if (primaryProfessorId === substituteProfessorId) {
      return reply.code(409).send({ error: 'INVALID_SUBSTITUTE', message: 'El profesor titular no puede ser su propio sustituto.' });
    }

    try {
      const assignment = await substituteAssignment.update({
        where: { id: request.params.id },
        data: {
          groupId,
          primaryProfessorId,
          substituteProfessorId,
          startsAt: parsed.data.startsAt === undefined ? undefined : parseDate(parsed.data.startsAt),
          endsAt: parsed.data.endsAt === undefined ? undefined : parseDate(parsed.data.endsAt),
          active: parsed.data.active,
          notes: parsed.data.notes,
        },
        include: substitutionInclude(),
      });
      return reply.send({ data: assignment });
    } catch (error: any) {
      if (error.code === 'P2002') return reply.code(409).send({ error: 'DUPLICATE_SUBSTITUTE', message: 'Ese sustituto ya está asignado a este grupo.' });
      if (error.code === 'P2003') return reply.code(404).send({ error: 'PROFESSOR_NOT_FOUND', message: 'Profesor sustituto no encontrado.' });
      throw error;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/internal/coordination/substitute-assignments/:id', async (request, reply) => {
    try {
      await substituteAssignment.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    } catch (error: any) {
      if (error.code === 'P2025') return reply.code(404).send({ error: 'SUBSTITUTION_NOT_FOUND', message: 'Sustitución no encontrada.' });
      throw error;
    }
  });
}
