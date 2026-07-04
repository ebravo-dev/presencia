import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../core/database/prisma.js';
import { jwtService, rsaService, sessionService } from '../../core/security/index.js';
import { addAttendanceUploadJob } from '../../core/queue/queue.config.js';
import { AttendanceStatus, PortalSyncStatus, SyncStatus } from '@prisma/client';
import {
    registerAttendanceSchema,
    attendanceHistoryQuerySchema,
    professorBeaconEntrySchema,
    studentBeaconDetectionsSchema,
    studentBeaconBindingsSchema,
    type RegisterAttendanceRequest,
    type AttendanceHistoryQuery,
    type ProfessorBeaconEntryRequest,
    type StudentBeaconDetectionsRequest,
    type StudentBeaconBindingsRequest,
} from './attendance.schemas.js';

const studentDeviceBinding = (prisma as any).studentDeviceBinding;
const substituteAssignment = (prisma as any).substituteAssignment;

type StudentDeviceBindingRow = {
    matricula: string;
    attendanceUuid: string;
    deviceBindingId?: string | null;
    updatedAt?: Date | null;
};

interface AuthenticatedRequest extends FastifyRequest {
    professorId?: string;
}

function normalizeUuid(uuid: string): string {
    return uuid.replace(/-/g, '').toLowerCase().trim();
}

type ResolvedAttendanceGroup = {
    group: {
        id: string;
        code: string;
        groupLetter: string;
        period: string;
        name: string;
        classroom: string;
        professorId: string;
    };
    attendanceProfessorId: string;
    isSubstitute: boolean;
    substituteAssignmentId?: string;
};

function activeSubstitutionWindow(now: Date) {
    return {
        active: true,
        AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
    };
}

async function resolveProfessorGroup(params: {
    professorId: string;
    code: string;
    groupLetter: string;
    period: string;
}): Promise<ResolvedAttendanceGroup | null> {
    const ownedGroup = await prisma.group.findFirst({
        where: {
            code: params.code,
            groupLetter: params.groupLetter,
            period: params.period,
            professorId: params.professorId,
        },
        select: {
            id: true,
            code: true,
            groupLetter: true,
            period: true,
            name: true,
            classroom: true,
            professorId: true,
        },
    });

    if (ownedGroup) {
        return {
            group: ownedGroup,
            attendanceProfessorId: ownedGroup.professorId,
            isSubstitute: false,
        };
    }

    const assignment = await substituteAssignment.findFirst({
        where: {
            substituteProfessorId: params.professorId,
            ...activeSubstitutionWindow(new Date()),
            group: {
                code: params.code,
                groupLetter: params.groupLetter,
                period: params.period,
            },
        },
        include: {
            group: {
                select: {
                    id: true,
                    code: true,
                    groupLetter: true,
                    period: true,
                    name: true,
                    classroom: true,
                    professorId: true,
                },
            },
        },
    }) as {
        id: string;
        primaryProfessorId: string;
        group: ResolvedAttendanceGroup['group'];
    } | null;

    if (!assignment) return null;

    return {
        group: assignment.group,
        attendanceProfessorId: assignment.primaryProfessorId,
        isSubstitute: true,
        substituteAssignmentId: assignment.id,
    };
}

async function canAccessGroup(params: {
    professorId: string;
    groupId: string;
}): Promise<boolean> {
    const ownedGroup = await prisma.group.findFirst({
        where: {
            id: params.groupId,
            professorId: params.professorId,
        },
        select: { id: true },
    });

    if (ownedGroup) return true;

    const assignment = await substituteAssignment.findFirst({
        where: {
            substituteProfessorId: params.professorId,
            groupId: params.groupId,
            ...activeSubstitutionWindow(new Date()),
        },
        select: { id: true },
    });

    return Boolean(assignment);
}

/**
 * Auth middleware
 */
async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    try {
        const authHeader = request.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Token no proporcionado',
            });
        }

        const token = authHeader.substring(7);
        const payload = jwtService.verify(token);

        // Validate single session
        if (payload.sessionId) {
            const isValid = await sessionService.validateSession(payload.professorId, payload.sessionId);
            if (!isValid) {
                return reply.code(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Sesión invalidada. Se inició sesión en otro dispositivo.',
                });
            }
        }

        (request as AuthenticatedRequest).professorId = payload.professorId;
    } catch {
        return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Token inválido o expirado',
        });
    }
}

export async function attendanceRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', authMiddleware);

    /**
     * POST /attendance
     * Register attendance for a group session
     */
    fastify.post<{ Body: RegisterAttendanceRequest }>(
        '/attendance',
        async (request, reply) => {
            try {
                const validated = registerAttendanceSchema.parse(request.body);
                const { code, groupLetter, period, date, attendances, encryptedPassword } = validated;
                const professorId = (request as AuthenticatedRequest).professorId!;

                // Resolve group by stable identifiers — no CUID needed from client
                const resolvedGroup = await resolveProfessorGroup({ professorId, code, groupLetter, period });
                if (!resolvedGroup) {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: `Grupo no encontrado (code: ${code}, group: ${groupLetter}, period: ${period})`,
                    });
                }

                const { group, attendanceProfessorId, isSubstitute } = resolvedGroup;
                const groupId = group.id;

                // Create or update attendance record
                const attendanceRecord = await prisma.attendanceRecord.upsert({
                    where: {
                        date_groupId: {
                            date: new Date(date),
                            groupId,
                        },
                    },
                    create: {
                        date: new Date(date),
                        groupId,
                        professorId: attendanceProfessorId,
                    },
                    update: {
                        professorId: attendanceProfessorId,
                    },
                });

                // Upsert individual attendances
                for (const attendance of attendances) {
                    await prisma.attendance.upsert({
                        where: {
                            studentId_attendanceRecordId: {
                                studentId: attendance.studentId,
                                attendanceRecordId: attendanceRecord.id,
                            },
                        },
                        create: {
                            studentId: attendance.studentId,
                            attendanceRecordId: attendanceRecord.id,
                            status: attendance.status,
                        },
                        update: {
                            status: attendance.status,
                        },
                    });
                }

                const refreshedRecord = await prisma.attendanceRecord.findUnique({
                    where: { id: attendanceRecord.id },
                });

                if (!refreshedRecord) {
                    return reply.code(500).send({
                        statusCode: 500,
                        error: 'Internal Server Error',
                        message: 'No se pudo leer el registro de asistencia',
                    });
                }

                // Only block if sync is actively in progress (prevents duplicate jobs)
                // Do NOT block on COMPLETED — the scraper is idempotent and the professor
                // explicitly triggered this upload, so always re-sync to ensure portal matches.

                if (refreshedRecord.portalSyncStatus === PortalSyncStatus.IN_PROGRESS) {
                    return reply.code(409).send({
                        statusCode: 409,
                        error: 'Conflict',
                        message: 'La asistencia ya se esta subiendo al portal',
                    });
                }

                if (isSubstitute) {
                    await prisma.attendanceRecord.update({
                        where: { id: refreshedRecord.id },
                        data: {
                            portalSyncStatus: PortalSyncStatus.NOT_REQUESTED,
                            portalSyncError: null,
                        },
                    });

                    return reply.code(201).send({
                        data: {
                            attendanceRecordId: attendanceRecord.id,
                            date,
                            groupId,
                            attendancesCount: attendances.length,
                            primaryProfessorId: attendanceProfessorId,
                            substituteProfessorId: professorId,
                            substituteAssignmentId: resolvedGroup.substituteAssignmentId,
                            needsPrimaryPortalSync: true,
                        },
                        message: 'Asistencia registrada contra el profesor titular; sincronización UAT pendiente de delegación',
                    });
                }

                const professor = await prisma.professor.findUnique({
                    where: { id: attendanceProfessorId },
                });

                if (!professor) {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: 'Profesor no encontrado',
                    });
                }

                const decryptedPassword = rsaService.decryptPasswordOrPlain(encryptedPassword);

                const syncJob = await prisma.syncJob.create({
                    data: {
                        professorId: attendanceProfessorId,
                        status: SyncStatus.PENDING,
                        totalGroups: attendances.length,
                        currentGroup: 0,
                        currentGroupName: 'Preparando subida de asistencia...',
                    },
                });

                await prisma.attendanceRecord.update({
                    where: { id: refreshedRecord.id },
                    data: {
                        portalSyncStatus: PortalSyncStatus.PENDING,
                        portalSyncError: null,
                    },
                });

                await addAttendanceUploadJob({
                    professorId: attendanceProfessorId,
                    email: professor.institutionalEmail,
                    password: decryptedPassword,
                    attendanceRecordId: refreshedRecord.id,
                    syncJobId: syncJob.id,
                    groupId,
                    date,
                    attendances,
                });

                return reply.code(201).send({
                    data: {
                        attendanceRecordId: attendanceRecord.id,
                        date: date,
                        groupId,
                        attendancesCount: attendances.length,
                    },
                    message: 'Asistencia registrada y en cola para subir',
                });
            } catch (error) {
                request.log.error(error);
                return reply.code(500).send({
                    statusCode: 500,
                    error: 'Internal Server Error',
                    message: 'Error al registrar asistencia',
                });
            }
        }
    );

    fastify.post<{ Body: ProfessorBeaconEntryRequest }>(
        '/attendance/professor-entry',
        async (request, reply) => {
            try {
                const validated = professorBeaconEntrySchema.parse(request.body);
                const professorId = (request as AuthenticatedRequest).professorId!;
                const { code, groupLetter, period, date, detectedAt, beaconUuid, rssi, distance, bluetoothAddress } = validated;

                const resolvedGroup = await resolveProfessorGroup({ professorId, code, groupLetter, period });
                if (!resolvedGroup) {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: `Grupo no encontrado (code: ${code}, group: ${groupLetter}, period: ${period})`,
                    });
                }

                const { group, attendanceProfessorId } = resolvedGroup;
                const classroomBeacon = await prisma.beacon.findFirst({
                    where: { classroom: group.classroom },
                });

                if (classroomBeacon && normalizeUuid(classroomBeacon.uuid) !== normalizeUuid(beaconUuid)) {
                    return reply.code(409).send({
                        statusCode: 409,
                        error: 'Conflict',
                        message: 'El beacon detectado no corresponde al salón del grupo',
                    });
                }

                const attendanceRecord = await prisma.attendanceRecord.upsert({
                    where: {
                        date_groupId: {
                            date: new Date(date),
                            groupId: group.id,
                        },
                    },
                    create: {
                        date: new Date(date),
                        groupId: group.id,
                        professorId: attendanceProfessorId,
                        professorEntryAt: new Date(detectedAt),
                        roomBeaconUuid: beaconUuid,
                        roomBeaconRssi: rssi,
                        roomBeaconDistance: distance,
                        roomBeaconAddress: bluetoothAddress,
                    },
                    update: {
                        professorEntryAt: new Date(detectedAt),
                        roomBeaconUuid: beaconUuid,
                        roomBeaconRssi: rssi,
                        roomBeaconDistance: distance,
                        roomBeaconAddress: bluetoothAddress,
                    },
                });

                return reply.code(201).send({
                    data: {
                        attendanceRecordId: attendanceRecord.id,
                        groupId: group.id,
                        date,
                        professorEntryAt: attendanceRecord.professorEntryAt,
                    },
                    message: 'Entrada del profesor registrada por beacon',
                });
            } catch (error) {
                request.log.error(error);
                return reply.code(500).send({
                    statusCode: 500,
                    error: 'Internal Server Error',
                    message: 'Error registrando entrada del profesor',
                });
            }
        }
    );

    fastify.post<{ Body: StudentBeaconDetectionsRequest }>(
        '/attendance/student-beacon-detections',
        async (request, reply) => {
            try {
                const validated = studentBeaconDetectionsSchema.parse(request.body);
                const professorId = (request as AuthenticatedRequest).professorId!;
                const { code, groupLetter, period, date, detections } = validated;

                const resolvedGroup = await resolveProfessorGroup({ professorId, code, groupLetter, period });
                if (!resolvedGroup) {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: `Grupo no encontrado (code: ${code}, group: ${groupLetter}, period: ${period})`,
                    });
                }

                const { group, attendanceProfessorId } = resolvedGroup;
                const attendanceRecord = await prisma.attendanceRecord.upsert({
                    where: {
                        date_groupId: {
                            date: new Date(date),
                            groupId: group.id,
                        },
                    },
                    create: {
                        date: new Date(date),
                        groupId: group.id,
                        professorId: attendanceProfessorId,
                    },
                    update: {
                        professorId: attendanceProfessorId,
                    },
                });

                const students = await prisma.student.findMany({
                    where: {
                        groupId: group.id,
                    },
                    select: {
                        id: true,
                        matricula: true,
                        beaconUuid: true,
                    },
                });

                const bindings = await studentDeviceBinding.findMany({
                    where: {
                        matricula: { in: students.map(student => student.matricula) },
                    },
                    select: {
                        matricula: true,
                        attendanceUuid: true,
                    },
                }) as StudentDeviceBindingRow[];
                const bindingByMatricula = new Map(
                    bindings.map(binding => [binding.matricula, binding.attendanceUuid])
                );

                const studentsByBeacon = new Map<string, { id: string; matricula: string }>();
                for (const student of students) {
                    const beaconUuid = bindingByMatricula.get(student.matricula) ?? student.beaconUuid;
                    if (beaconUuid) {
                        studentsByBeacon.set(normalizeUuid(beaconUuid), student);
                    }
                }

                const matched: Array<{ studentId: string; beaconUuid: string; detectedAt: string }> = [];

                for (const detection of detections) {
                    const student = studentsByBeacon.get(normalizeUuid(detection.beaconUuid));
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
                            status: AttendanceStatus.PRESENT,
                        },
                        update: {
                            status: AttendanceStatus.PRESENT,
                        },
                    });

                    await prisma.studentBeaconDetection.upsert({
                        where: {
                            studentId_attendanceRecordId: {
                                studentId: student.id,
                                attendanceRecordId: attendanceRecord.id,
                            },
                        },
                        create: {
                            studentId: student.id,
                            attendanceRecordId: attendanceRecord.id,
                            beaconUuid: detection.beaconUuid,
                            detectedAt: new Date(detection.detectedAt),
                            rssi: detection.rssi,
                            distance: detection.distance,
                            txPower: detection.txPower,
                            bluetoothAddress: detection.bluetoothAddress,
                        },
                        update: {
                            beaconUuid: detection.beaconUuid,
                            detectedAt: new Date(detection.detectedAt),
                            rssi: detection.rssi,
                            distance: detection.distance,
                            txPower: detection.txPower,
                            bluetoothAddress: detection.bluetoothAddress,
                        },
                    });

                    matched.push({
                        studentId: student.id,
                        beaconUuid: detection.beaconUuid,
                        detectedAt: detection.detectedAt,
                    });
                }

                return reply.code(201).send({
                    data: {
                        attendanceRecordId: attendanceRecord.id,
                        matchedCount: matched.length,
                        matched,
                    },
                    message: 'Detecciones de alumnos procesadas',
                });
            } catch (error) {
                request.log.error(error);
                return reply.code(500).send({
                    statusCode: 500,
                    error: 'Internal Server Error',
                    message: 'Error registrando beacons de alumnos',
                });
            }
        }
    );

    fastify.post<{ Body: StudentBeaconBindingsRequest }>(
        '/attendance/student-beacon-bindings',
        async (request, reply) => {
            try {
                const validated = studentBeaconBindingsSchema.parse(request.body);
                const professorId = (request as AuthenticatedRequest).professorId!;
                const { code, groupLetter, period } = validated;

                const resolvedGroup = await resolveProfessorGroup({ professorId, code, groupLetter, period });
                if (!resolvedGroup) {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: `Grupo no encontrado (code: ${code}, group: ${groupLetter}, period: ${period})`,
                    });
                }

                const { group } = resolvedGroup;
                const students = await prisma.student.findMany({
                    where: { groupId: group.id },
                    select: {
                        id: true,
                        matricula: true,
                        name: true,
                        beaconUuid: true,
                    },
                    orderBy: { name: 'asc' },
                });

                const matriculas = students.map(student => student.matricula);
                const bindings = await studentDeviceBinding.findMany({
                    where: { matricula: { in: matriculas } },
                    select: {
                        matricula: true,
                        attendanceUuid: true,
                        deviceBindingId: true,
                        updatedAt: true,
                    },
                }) as StudentDeviceBindingRow[];
                const bindingByMatricula = new Map(
                    bindings.map(binding => [binding.matricula, binding])
                );

                const data: Array<{
                    studentId: string;
                    matricula: string;
                    name: string;
                    beaconUuid: string;
                    deviceBindingId: string | null;
                    updatedAt: Date | null;
                }> = [];

                for (const student of students) {
                    const binding = bindingByMatricula.get(student.matricula);
                    const beaconUuid = binding?.attendanceUuid ?? student.beaconUuid;
                    if (!beaconUuid) continue;

                    data.push({
                        studentId: student.id,
                        matricula: student.matricula,
                        name: student.name,
                        beaconUuid,
                        deviceBindingId: binding?.deviceBindingId ?? null,
                        updatedAt: binding?.updatedAt ?? null,
                    });
                }

                return reply.send({
                    data,
                    totalStudents: students.length,
                    registeredCount: data.length,
                });
            } catch (error) {
                request.log.error(error);
                return reply.code(500).send({
                    statusCode: 500,
                    error: 'Internal Server Error',
                    message: 'Error obteniendo UUIDs de alumnos',
                });
            }
        }
    );

    /**
     * GET /attendance/:groupId/history
     * Get attendance history for a group
     */
    fastify.get<{
        Params: { groupId: string };
        Querystring: AttendanceHistoryQuery;
    }>(
        '/attendance/:groupId/history',
        async (request, reply) => {
            try {
                const { groupId } = request.params;
                const query = attendanceHistoryQuerySchema.parse(request.query);
                const professorId = (request as AuthenticatedRequest).professorId;

                if (!professorId || !(await canAccessGroup({ professorId, groupId }))) {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: 'Grupo no encontrado',
                    });
                }

                // Build date filter
                const dateFilter: { gte?: Date; lte?: Date } = {};
                if (query.startDate) {
                    dateFilter.gte = new Date(query.startDate);
                }
                if (query.endDate) {
                    dateFilter.lte = new Date(query.endDate);
                }

                // Get attendance records
                const records = await prisma.attendanceRecord.findMany({
                    where: {
                        groupId,
                        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
                    },
                    include: {
                        attendances: {
                            include: {
                                student: {
                                    select: {
                                        id: true,
                                        matricula: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { date: 'desc' },
                    take: query.limit,
                    skip: query.offset,
                });

                // Get total count
                const total = await prisma.attendanceRecord.count({
                    where: {
                        groupId,
                        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
                    },
                });

                return reply.send({
                    data: records,
                    pagination: {
                        total,
                        limit: query.limit,
                        offset: query.offset,
                    },
                });
            } catch (error) {
                request.log.error(error);
                return reply.code(500).send({
                    statusCode: 500,
                    error: 'Internal Server Error',
                    message: 'Error al obtener historial',
                });
            }
        }
    );

    /**
     * POST /attendance/check-synced
     * Check which attendance records have been synced to the portal
     * Body: { records: [{ groupId, date }] }
     */
    fastify.post<{
        Body: { records: Array<{ groupId: string; date: string }> };
    }>(
        '/attendance/check-synced',
        async (request, reply) => {
            try {
                const professorId = (request as AuthenticatedRequest).professorId!;
                const { records } = request.body;

                if (!Array.isArray(records) || records.length === 0) {
                    return reply.send({ data: [] });
                }

                const results = await Promise.all(
                    records.map(async ({ groupId, date }) => {
                        const canAccess = await canAccessGroup({ professorId, groupId });
                        if (!canAccess) {
                            return {
                                groupId,
                                date,
                                synced: false,
                                status: 'NOT_FOUND',
                            };
                        }

                        const record = await prisma.attendanceRecord.findFirst({
                            where: {
                                groupId,
                                date: new Date(date),
                            },
                            select: {
                                portalSyncStatus: true,
                                portalSyncedAt: true,
                            },
                        });
                        return {
                            groupId,
                            date,
                            synced: record?.portalSyncStatus === PortalSyncStatus.COMPLETED,
                            status: record?.portalSyncStatus ?? 'NOT_FOUND',
                        };
                    })
                );

                return reply.send({ data: results });
            } catch (error) {
                request.log.error(error);
                return reply.code(500).send({
                    statusCode: 500,
                    error: 'Internal Server Error',
                    message: 'Error al verificar estado de sincronización',
                });
            }
        }
    );

    /**
     * GET /attendance/:groupId/summary
     * Get attendance summary/statistics for a group
     */
    fastify.get<{ Params: { groupId: string } }>(
        '/attendance/:groupId/summary',
        async (request, reply) => {
            const { groupId } = request.params;
            const professorId = (request as AuthenticatedRequest).professorId;

            if (!professorId || !(await canAccessGroup({ professorId, groupId }))) {
                return reply.code(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Grupo no encontrado',
                });
            }

            const group = await prisma.group.findUnique({
                where: { id: groupId },
                include: { students: true },
            });

            if (!group) {
                return reply.code(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Grupo no encontrado',
                });
            }

            // Get attendance stats
            const totalSessions = await prisma.attendanceRecord.count({
                where: { groupId },
            });

            const attendanceStats = await prisma.attendance.groupBy({
                by: ['status'],
                where: {
                    attendanceRecord: { groupId },
                },
                _count: true,
            });

            const statsMap: Record<string, number> = {};
            for (const stat of attendanceStats) {
                statsMap[stat.status] = stat._count;
            }

            return reply.send({
                data: {
                    groupId,
                    groupName: group.name,
                    totalStudents: group.students.length,
                    totalSessions,
                    stats: statsMap,
                },
            });
        }
    );
}
