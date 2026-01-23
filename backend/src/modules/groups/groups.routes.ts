import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../core/database/prisma.js';
import { jwtService } from '../../core/security/index.js';

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

export async function groupsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', authMiddleware);

    /**
     * GET /groups/:id
     * Get a specific group by ID
     */
    fastify.get<{ Params: { id: string } }>(
        '/groups/:id',
        async (request, reply) => {
            const { id } = request.params;
            const professorId = (request as AuthenticatedRequest).professorId;

            const group = await prisma.group.findFirst({
                where: {
                    id,
                    professorId, // Ensure professor owns this group
                },
                include: {
                    students: {
                        select: {
                            id: true,
                            matricula: true,
                            name: true,
                        },
                        orderBy: { name: 'asc' },
                    },
                },
            });

            if (!group) {
                return reply.code(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Grupo no encontrado',
                });
            }

            return reply.send({ data: group });
        }
    );

    /**
     * GET /groups/:id/students
     * Get all students in a group
     */
    fastify.get<{ Params: { id: string } }>(
        '/groups/:id/students',
        async (request, reply) => {
            const { id } = request.params;
            const professorId = (request as AuthenticatedRequest).professorId;

            // Verify professor owns this group
            const group = await prisma.group.findFirst({
                where: {
                    id,
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

            const students = await prisma.student.findMany({
                where: { groupId: id },
                select: {
                    id: true,
                    matricula: true,
                    name: true,
                },
                orderBy: { name: 'asc' },
            });

            return reply.send({ data: students });
        }
    );
}
