import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../../core/config/env.js';
import { prisma } from '../../core/database/prisma.js';
import {
    studentDeviceBindingResolveSchema,
    studentDeviceBindingSchema,
} from './student-attendance.schemas.js';
import {
    issueStudentBindingToken,
    safeTokenEqual,
    verifyStudentBindingToken,
} from './student-device-binding-auth.js';

const studentDeviceBinding = (prisma as any).studentDeviceBinding;
const substituteAssignment = (prisma as any).substituteAssignment;

export async function studentAttendanceRoutes(fastify: FastifyInstance) {
    // Creation is authorized by backend-apirest after a successful UAT login.
    // Later reconciliation uses the scoped token returned by this endpoint.
    fastify.post('/api/student-device-bindings', {
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const parsed = studentDeviceBindingSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: parsed.error.errors.map((issue) => issue.message).join(', '),
            });
        }

        const data = parsed.data;
        const existing = await studentDeviceBinding.findUnique({
            where: { matricula: data.matricula },
        });
        const tokenPayload = readStudentBindingToken(request);
        const hasScopedAuthorization = tokenPayload?.matricula === data.matricula
            && (!tokenPayload.deviceBindingId || tokenPayload.deviceBindingId === data.deviceBindingId);
        // Compatibility for one release: an existing installation can repeat
        // the exact registered identity while it upgrades and receives a token.
        const isExactLegacyRetry = existing?.attendanceUuid === data.attendanceUuid
            && existing?.deviceBindingId === data.deviceBindingId;

        if (!hasValidInternalToken(request) && !hasScopedAuthorization && !isExactLegacyRetry) {
            return reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'La vinculación debe ser autorizada por una sesión de alumno válida.',
            });
        }

        const existingUuidOwner = await studentDeviceBinding.findUnique({
            where: { attendanceUuid: data.attendanceUuid },
        });
        if (existingUuidOwner && existingUuidOwner.matricula !== data.matricula) {
            return reply.code(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'Este identificador ya está vinculado a otra matrícula.',
            });
        }

        const binding = await prisma.$transaction(async (transaction) => {
            const bindingDelegate = (transaction as any).studentDeviceBinding;
            const saved = await bindingDelegate.upsert({
                where: { matricula: data.matricula },
                create: {
                    matricula: data.matricula,
                    attendanceUuid: data.attendanceUuid,
                    deviceBindingId: data.deviceBindingId,
                    platform: data.platform,
                    deviceInfo: data.deviceInfo,
                },
                update: {
                    attendanceUuid: data.attendanceUuid,
                    deviceBindingId: data.deviceBindingId,
                    platform: data.platform,
                    deviceInfo: data.deviceInfo,
                },
            });

            await transaction.student.updateMany({
                where: { matricula: data.matricula },
                data: { beaconUuid: data.attendanceUuid },
            });
            return saved;
        });

        return reply.code(existing ? 200 : 201).send({
            statusCode: existing ? 200 : 201,
            message: 'Dispositivo vinculado',
            data: {
                matricula: binding.matricula,
                attendanceUuid: binding.attendanceUuid,
                deviceBindingId: binding.deviceBindingId,
                bindingToken: issueStudentBindingToken({
                    matricula: binding.matricula,
                    deviceBindingId: binding.deviceBindingId ?? undefined,
                }, env.JWT_SECRET),
                updatedAt: binding.updatedAt,
            },
        });
    });

    fastify.post('/api/student-device-bindings/resolve', {
        preHandler: fastify.authenticate,
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const parsed = studentDeviceBindingResolveSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: parsed.error.errors.map((issue) => issue.message).join(', '),
            });
        }

        const { professorId } = request.user as { professorId: string };
        const requested = Array.from(new Set(parsed.data.matriculas));
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
        const ownedGroups = await prisma.group.findMany({
            where: { professorId },
            select: { id: true },
        });
        const authorizedGroupIds = [
            ...ownedGroups.map((group) => group.id),
            ...substitutions.map((assignment: { groupId: string }) => assignment.groupId),
        ];
        const authorizedStudents = await prisma.student.findMany({
            where: {
                matricula: { in: requested },
                groupId: { in: authorizedGroupIds },
            },
            select: { matricula: true },
        });
        const authorized = Array.from(new Set(authorizedStudents.map((student) => student.matricula)));
        const bindings = await studentDeviceBinding.findMany({
            where: { matricula: { in: authorized } },
            select: {
                matricula: true,
                attendanceUuid: true,
                deviceBindingId: true,
                platform: true,
                updatedAt: true,
            },
        });
        const found = new Set(bindings.map((binding: { matricula: string }) => binding.matricula));

        return reply.send({
            data: bindings,
            missing: authorized.filter((matricula) => !found.has(matricula)),
        });
    });
}

function hasValidInternalToken(request: FastifyRequest): boolean {
    const provided = request.headers['x-internal-service-token'];
    if (typeof provided !== 'string') return false;
    return safeTokenEqual(env.INTERNAL_API_TOKEN, provided);
}

function readStudentBindingToken(request: FastifyRequest) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) return null;
    return verifyStudentBindingToken(authorization.slice(7), env.JWT_SECRET);
}
