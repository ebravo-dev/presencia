import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../core/database/prisma.js';
import { jwtService } from '../../core/security/index.js';

interface AuthenticatedRequest extends FastifyRequest {
    professorId?: string;
}

/**
 * Auth middleware to verify JWT token
 */
async function authMiddleware(
    request: AuthenticatedRequest,
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

        request.professorId = payload.professorId;
    } catch (error) {
        return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Token inválido o expirado',
        });
    }
}

export async function professorsRoutes(fastify: FastifyInstance): Promise<void> {
    // Apply auth middleware to all routes in this plugin
    fastify.addHook('preHandler', authMiddleware);

    /**
     * GET /professors/me
     * Get current professor profile
     */
    fastify.get(
        '/professors/me',
        async (request: AuthenticatedRequest, reply: FastifyReply) => {
            const professor = await prisma.professor.findUnique({
                where: { id: request.professorId },
                select: {
                    id: true,
                    institutionalEmail: true,
                    name: true,
                    createdAt: true,
                },
            });

            if (!professor) {
                return reply.code(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Profesor no encontrado',
                });
            }

            return reply.send({ data: professor });
        }
    );

    /**
     * GET /professors/classes
     * Get all classes/groups for the authenticated professor
     * Returns empty array if sync is in progress to prevent loading incomplete data
     */
    fastify.get(
        '/professors/classes',
        async (request: AuthenticatedRequest, reply: FastifyReply) => {
            // Check if there's a sync in progress - don't return incomplete data
            const activeSyncJob = await prisma.syncJob.findFirst({
                where: {
                    professorId: request.professorId,
                    status: { in: ['PENDING', 'IN_PROGRESS'] },
                },
            });

            if (activeSyncJob) {
                // Auto-reset stuck syncs (> 10 minutes)
                const stuckThreshold = 10 * 60 * 1000;
                const syncAge = activeSyncJob.startedAt
                    ? Date.now() - activeSyncJob.startedAt.getTime()
                    : 0;

                if (syncAge > stuckThreshold) {
                    console.log(`🔧 [classes] Sync ${activeSyncJob.id} stuck for ${Math.round(syncAge / 60000)} min, marking as FAILED`);
                    await prisma.syncJob.update({
                        where: { id: activeSyncJob.id },
                        data: {
                            status: 'FAILED',
                            error: 'Sincronización cancelada (timeout automático)',
                            completedAt: new Date(),
                        },
                    });
                    // Continue to return classes (don't block)
                } else {
                    // Sync in progress - return empty with flag
                    return reply.send({
                        data: [],
                        syncInProgress: true,
                        message: 'Sincronización en progreso, espera a que termine',
                    });
                }
            }

            const groups = await prisma.group.findMany({
                where: { professorId: request.professorId },
                select: {
                    id: true,
                    code: true,
                    groupLetter: true,
                    period: true,
                    name: true,
                    level: true,
                    classroom: true,
                    schedule: true,
                    students: {
                        select: {
                            id: true,
                            matricula: true,
                            name: true,
                        },
                        orderBy: { name: 'asc' },
                    },
                    _count: {
                        select: { students: true },
                    },
                },
                orderBy: { name: 'asc' },
            });

            // Transform to match Flutter app expected format
            const formattedGroups = groups.map((group) => {
                // Extract group letter/number from code (e.g., "RC.06061.2873.5-5" -> "5-5")
                const codeMatch = group.code.match(/\.(\d+-\d+)$/);
                const groupCode = codeMatch ? codeMatch[1] : group.code;

                return {
                    id: group.id,
                    code: group.code,
                    groupLetter: group.groupLetter,
                    period: group.period,
                    group: groupCode, // For Flutter compatibility
                    name: group.name,
                    level: group.level,
                    classroom: group.classroom,
                    schedule: group.schedule,
                    students: group.students.map((student, index) => ({
                        id: student.id,
                        matricula: student.matricula,
                        name: student.name,
                        number: index + 1,
                    })),
                    studentsCount: group._count.students,
                };
            });

            return reply.send({ data: formattedGroups, syncInProgress: false });
        }
    );

    /**
     * GET /professors/sync-status
     * Check the status of the latest synchronization job for this professor
     */
    fastify.get(
        '/professors/sync-status',
        async (request: AuthenticatedRequest, reply: FastifyReply) => {
            // Get the most recent sync job for this professor
            const syncJob = await prisma.syncJob.findFirst({
                where: { professorId: request.professorId },
                orderBy: { startedAt: 'desc' },
            });

            if (!syncJob) {
                return reply.send({
                    data: {
                        status: 'NO_SYNC',
                        message: 'No hay sincronizaciones previas',
                        step: 0,
                        totalSteps: 6,
                    },
                });
            }

            // Auto-reset stuck syncs (> 10 minutes in PENDING or IN_PROGRESS)
            const stuckThreshold = 10 * 60 * 1000; // 10 minutes
            const isStuck = ['PENDING', 'IN_PROGRESS'].includes(syncJob.status);
            const syncAge = syncJob.startedAt
                ? Date.now() - syncJob.startedAt.getTime()
                : 0;

            if (isStuck && syncAge > stuckThreshold) {
                console.log(`🔧 [sync-status] Sync ${syncJob.id} stuck for ${Math.round(syncAge / 60000)} min, marking as FAILED`);
                await prisma.syncJob.update({
                    where: { id: syncJob.id },
                    data: {
                        status: 'FAILED',
                        error: 'Sincronización cancelada (timeout automático)',
                        completedAt: new Date(),
                    },
                });

                // Return the updated status
                return reply.send({
                    data: {
                        status: 'FAILED',
                        step: syncJob.currentGroup || 0,
                        totalSteps: syncJob.totalGroups || 6,
                        stepDescription: syncJob.currentGroupName,
                        percentage: 0,
                        message: 'Sincronización cancelada (timeout automático)',
                        startedAt: syncJob.startedAt,
                        completedAt: new Date(),
                        error: 'Sincronización cancelada (timeout automático)',
                        supportPhone: '8331048282',
                    },
                });
            }

            // Get step info (currentGroup = step number, totalGroups = total steps)
            const currentStep = syncJob.currentGroup || 0;
            const totalSteps = syncJob.totalGroups || 6;

            // Calculate percentage for backwards compatibility
            const percentage = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

            // Build descriptive message based on step
            let message: string;
            switch (syncJob.status) {
                case 'PENDING':
                    message = 'Preparando sincronización...';
                    break;
                case 'IN_PROGRESS':
                    message = syncJob.currentGroupName || 'Procesando...';
                    break;
                case 'COMPLETED':
                    if (syncJob.error) {
                        message = `Sincronización completada con advertencias`;
                    } else {
                        message = '¡Clases construidas con éxito!';
                    }
                    break;
                case 'FAILED':
                    message = syncJob.error || 'Error desconocido';
                    break;
                default:
                    message = 'Estado desconocido';
            }

            return reply.send({
                data: {
                    status: syncJob.status,
                    step: currentStep,
                    totalSteps,
                    stepDescription: syncJob.currentGroupName,
                    percentage, // Keep for backwards compatibility
                    message,
                    startedAt: syncJob.startedAt,
                    completedAt: syncJob.completedAt,
                    error: syncJob.error,
                    // Support phone for error states
                    supportPhone: '8331048282',
                },
            });
        }
    );
}
