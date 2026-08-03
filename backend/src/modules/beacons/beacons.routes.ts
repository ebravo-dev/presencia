import type { FastifyInstance } from 'fastify';
import { env } from '../../core/config/env.js';
import { prisma } from '../../core/database/prisma.js';
import {
    beaconResolveSchema,
    normalizeClassroomKey,
    resolveBeaconsByClassrooms,
} from './beacons.service.js';
import { AttendanceServiceCommandClient } from '../super-user/attendance-service-command.client.js';

const substituteAssignment = (prisma as any).substituteAssignment;
const attendanceCommands = env.ATTENDANCE_SERVICE_URL
    ? new AttendanceServiceCommandClient(env.ATTENDANCE_SERVICE_URL, env.INTERNAL_API_TOKEN)
    : undefined;

export async function beaconsRoutes(fastify: FastifyInstance) {
    // Beacon administration is available through the authenticated coordination
    // and super-user APIs. This operational lookup is scoped to the professor's
    // own groups and active substitutions.
    fastify.post('/api/beacons/resolve', {
        preHandler: fastify.authenticate,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const parsed = beaconResolveSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: parsed.error.errors.map((issue) => issue.message).join(', '),
            });
        }

        const { professorId } = request.user as { professorId: string };
        const authorizedClassrooms = await authorizeClassroomsForProfessor(professorId, parsed.data.classrooms);
        if (attendanceCommands) {
            return reply.send(await attendanceCommands.resolveAuthorizedClassroomBeacons(authorizedClassrooms));
        }
        const resolved = await resolveBeaconsByClassrooms(authorizedClassrooms);
        const found = new Set(resolved.map((beacon) => normalizeClassroomKey(beacon.classroom)));

        return reply.send({
            data: resolved,
            missing: authorizedClassrooms.filter((classroom) => !found.has(normalizeClassroomKey(classroom))),
        });
    });
}

export async function authorizeClassroomsForProfessor(professorId: string, classrooms: string[]): Promise<string[]> {
    const requestedByKey = new Map(classrooms.map((classroom) => [normalizeClassroomKey(classroom), classroom]));
    const now = new Date();
    const substitutions = await substituteAssignment.findMany({
            where: {
                substituteProfessorId: professorId,
                active: true,
                AND: [
                    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                    { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
                ],
            },
            select: { groupId: true },
    });
    const groups = await prisma.group.findMany({
            where: {
                OR: [
                    { professorId },
                    { id: { in: substitutions.map((assignment: { groupId: string }) => assignment.groupId) } },
                ],
            },
            select: { classroom: true },
    });
    const authorizedKeys = new Set(groups.map((group) => normalizeClassroomKey(group.classroom)));
    return Array.from(requestedByKey.entries())
        .filter(([key]) => authorizedKeys.has(key))
        .map(([, classroom]) => classroom);
}
