import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../core/database/prisma.js';

const substituteAssignment = (prisma as any).substituteAssignment;

const dateStringSchema = z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => value || null)
    .refine((value) => value == null || !Number.isNaN(Date.parse(value)), {
        message: 'Fecha inválida',
    });

const substituteAssignmentSchema = z.object({
    groupId: z.string().min(1, 'El grupo es requerido'),
    substituteProfessorId: z.string().min(1, 'El profesor sustituto es requerido'),
    startsAt: dateStringSchema,
    endsAt: dateStringSchema,
    active: z.boolean().optional().default(true),
    notes: z.string().trim().max(500).optional().nullable().transform((value) => value || null),
});

const substituteAssignmentUpdateSchema = substituteAssignmentSchema.partial();

function parseDate(value: string | null | undefined): Date | null {
    return value ? new Date(value) : null;
}

function assignmentInclude() {
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

export async function substitutionsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/api/substitutions/options', async (_request, reply) => {
        const [professors, groups] = await Promise.all([
            prisma.professor.findMany({
                select: {
                    id: true,
                    name: true,
                    institutionalEmail: true,
                },
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
                    professor: {
                        select: {
                            id: true,
                            name: true,
                            institutionalEmail: true,
                        },
                    },
                },
                orderBy: [{ name: 'asc' }, { groupLetter: 'asc' }],
                take: 1000,
            }),
        ]);

        return reply.send({ data: { professors, groups } });
    });

    fastify.get('/api/substitute-assignments', async (_request, reply) => {
        const assignments = await substituteAssignment.findMany({
            include: assignmentInclude(),
            orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
            take: 500,
        });

        return reply.send({ data: assignments });
    });

    fastify.post('/api/substitute-assignments', async (request, reply) => {
        const parsed = substituteAssignmentSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: parsed.error.errors.map(e => e.message).join(', '),
            });
        }

        const group = await prisma.group.findUnique({
            where: { id: parsed.data.groupId },
            select: { id: true, professorId: true },
        });

        if (!group) {
            return reply.code(404).send({
                statusCode: 404,
                error: 'Not Found',
                message: 'Grupo no encontrado',
            });
        }

        if (group.professorId === parsed.data.substituteProfessorId) {
            return reply.code(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'El profesor titular no puede ser su propio sustituto',
            });
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
                include: assignmentInclude(),
            });

            return reply.code(201).send({ data: assignment });
        } catch (error: any) {
            if (error.code === 'P2002') {
                return reply.code(409).send({
                    statusCode: 409,
                    error: 'Conflict',
                    message: 'Ese sustituto ya está asignado a este grupo',
                });
            }
            if (error.code === 'P2003') {
                return reply.code(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Profesor sustituto no encontrado',
                });
            }
            throw error;
        }
    });

    fastify.put<{ Params: { id: string } }>('/api/substitute-assignments/:id', async (request, reply) => {
        const parsed = substituteAssignmentUpdateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: parsed.error.errors.map(e => e.message).join(', '),
            });
        }

        const current = await substituteAssignment.findUnique({
            where: { id: request.params.id },
            select: {
                id: true,
                groupId: true,
                primaryProfessorId: true,
                substituteProfessorId: true,
            },
        });

        if (!current) {
            return reply.code(404).send({
                statusCode: 404,
                error: 'Not Found',
                message: 'Sustitución no encontrada',
            });
        }

        let groupId = current.groupId;
        let primaryProfessorId = current.primaryProfessorId;
        if (parsed.data.groupId && parsed.data.groupId !== current.groupId) {
            const group = await prisma.group.findUnique({
                where: { id: parsed.data.groupId },
                select: { id: true, professorId: true },
            });
            if (!group) {
                return reply.code(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Grupo no encontrado',
                });
            }
            groupId = group.id;
            primaryProfessorId = group.professorId;
        }

        const substituteProfessorId = parsed.data.substituteProfessorId ?? current.substituteProfessorId;
        if (primaryProfessorId === substituteProfessorId) {
            return reply.code(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'El profesor titular no puede ser su propio sustituto',
            });
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
                include: assignmentInclude(),
            });

            return reply.send({ data: assignment });
        } catch (error: any) {
            if (error.code === 'P2002') {
                return reply.code(409).send({
                    statusCode: 409,
                    error: 'Conflict',
                    message: 'Ese sustituto ya está asignado a este grupo',
                });
            }
            if (error.code === 'P2003') {
                return reply.code(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Profesor sustituto no encontrado',
                });
            }
            throw error;
        }
    });

    fastify.delete<{ Params: { id: string } }>('/api/substitute-assignments/:id', async (request, reply) => {
        try {
            await substituteAssignment.delete({
                where: { id: request.params.id },
            });
            return reply.code(204).send();
        } catch (error: any) {
            if (error.code === 'P2025') {
                return reply.code(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Sustitución no encontrada',
                });
            }
            throw error;
        }
    });
}
