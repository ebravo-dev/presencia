import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../core/database/prisma.js';
import { jwtService, rsaService } from '../../core/security/index.js';
import { addAttendanceUploadJob } from '../../core/queue/queue.config.js';
import { PortalSyncStatus, SyncStatus } from '@prisma/client';
import {
    registerAttendanceSchema,
    attendanceHistoryQuerySchema,
    type RegisterAttendanceRequest,
    type AttendanceHistoryQuery,
} from './attendance.schemas.js';

interface AuthenticatedRequest extends FastifyRequest {
    professorId?: string;
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
                const { groupId, date, attendances, encryptedPassword, forceUpload } = validated;
                const professorId = (request as AuthenticatedRequest).professorId!;

                // Verify professor owns this group
                const group = await prisma.group.findFirst({
                    where: {
                        id: groupId,
                        professorId,
                    },
                });

                if (!group) {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: 'Grupo no encontrado',
                    });
                }

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
                        professorId,
                    },
                    update: {
                        // Just touch to update the record
                    },
                });

                // Check if any attendance status actually changed before upserting
                const existingAttendances = await prisma.attendance.findMany({
                    where: { attendanceRecordId: attendanceRecord.id },
                    select: { studentId: true, status: true },
                });
                const existingMap = new Map(existingAttendances.map(a => [a.studentId, a.status]));
                const hasChanges = attendances.some(a => existingMap.get(a.studentId) !== a.status);

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

                if (
                    refreshedRecord.portalSyncStatus === PortalSyncStatus.COMPLETED &&
                    !forceUpload &&
                    !hasChanges
                ) {
                    return reply.code(200).send({
                        data: {
                            attendanceRecordId: refreshedRecord.id,
                            date,
                            groupId,
                            attendancesCount: attendances.length,
                        },
                        message: 'Asistencia ya fue subida al portal',
                    });
                }

                if (refreshedRecord.portalSyncStatus === PortalSyncStatus.IN_PROGRESS) {
                    return reply.code(409).send({
                        statusCode: 409,
                        error: 'Conflict',
                        message: 'La asistencia ya se esta subiendo al portal',
                    });
                }

                const professor = await prisma.professor.findUnique({
                    where: { id: professorId },
                });

                if (!professor) {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: 'Profesor no encontrado',
                    });
                }

                const decryptedPassword = rsaService.decryptPassword(encryptedPassword);

                const syncJob = await prisma.syncJob.create({
                    data: {
                        professorId,
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
                    professorId,
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

                // Verify professor owns this group
                const group = await prisma.group.findFirst({
                    where: {
                        id: groupId,
                        professorId,
                    },
                });

                if (!group) {
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
     * GET /attendance/:groupId/summary
     * Get attendance summary/statistics for a group
     */
    fastify.get<{ Params: { groupId: string } }>(
        '/attendance/:groupId/summary',
        async (request, reply) => {
            const { groupId } = request.params;
            const professorId = (request as AuthenticatedRequest).professorId;

            // Verify professor owns this group
            const group = await prisma.group.findFirst({
                where: {
                    id: groupId,
                    professorId,
                },
                include: {
                    students: true,
                },
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
