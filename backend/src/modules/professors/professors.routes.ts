import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../core/database/prisma.js';
import { jwtService } from '../../core/security/index.js';
import { getQueueStats } from '../../core/queue/queue.config.js';

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
     */
    fastify.get(
        '/professors/classes',
        async (request: AuthenticatedRequest, reply: FastifyReply) => {
            const groups = await prisma.group.findMany({
                where: { professorId: request.professorId },
                select: {
                    id: true,
                    code: true,
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
                    group: groupCode, // For Flutter compatibility
                    name: group.name,
                    level: group.level,
                    classroom: group.classroom,
                    schedule: group.schedule,
                    students: group.students.map((student, index) => ({
                        id: student.id,
                        matricula: student.matricula,
                        name: student.name,
                        number: index + 1, // For Flutter's Alumno model
                    })),
                    studentsCount: group._count.students,
                };
            });

            return reply.send({ data: formattedGroups });
        }
    );

    /**
     * GET /professors/sync-status
     * Check the status of the scraping job
     */
    fastify.get(
        '/professors/sync-status',
        async (request: AuthenticatedRequest, reply: FastifyReply) => {
            const stats = await getQueueStats();

            return reply.send({
                data: {
                    queueStats: stats,
                    message: stats.active > 0
                        ? 'Sincronización en progreso...'
                        : 'Sincronización completada',
                },
            });
        }
    );
}
