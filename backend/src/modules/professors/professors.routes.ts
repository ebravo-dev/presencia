import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../core/database/prisma.js';
import { jwtService, sessionService } from '../../core/security/index.js';
import { normalizeClassroomKey, serializeBeacon } from '../beacons/beacons.service.js';
import { env } from '../../core/config/env.js';

const studentDeviceBinding = (prisma as any).studentDeviceBinding;
const substituteAssignment = (prisma as any).substituteAssignment;

type StudentDeviceBindingRow = {
    matricula: string;
    attendanceUuid: string;
};

const groupSelect = {
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
            beaconUuid: true,
        },
        orderBy: { name: 'asc' },
    },
    _count: {
        select: { students: true },
    },
} as const;

type GroupRow = {
    id: string;
    code: string;
    groupLetter: string;
    period: string;
    name: string;
    level: string;
    classroom: string;
    schedule: unknown;
    students: Array<{
        id: string;
        matricula: string;
        name: string;
        beaconUuid: string | null;
    }>;
    _count: {
        students: number;
    };
};

type ProfessorSummary = {
    id: string;
    name: string;
    institutionalEmail: string;
};

function uniqueGroupsById(groups: GroupRow[]) {
    const seen = new Set<string>();
    return groups.filter((group) => {
        if (seen.has(group.id)) return false;
        seen.add(group.id);
        return true;
    });
}

function formatGroupForApp(params: {
    group: GroupRow;
    bindingByMatricula: Map<string, string>;
    beaconByClassroomKey?: Map<string, { id: string; uuid: string; classroom: string; classroomKey: string }>;
    isSubstitute?: boolean;
    substituteAssignmentId?: string;
    primaryProfessor?: ProfessorSummary;
}) {
    const { group, bindingByMatricula, beaconByClassroomKey, isSubstitute = false, substituteAssignmentId, primaryProfessor } = params;
    const codeMatch = group.code.match(/\.(\d+-\d+)$/);
    const groupCode = codeMatch ? codeMatch[1] : group.code;
    const classroomKey = normalizeClassroomKey(group.classroom);

    return {
        id: group.id,
        code: group.code,
        groupLetter: group.groupLetter,
        period: group.period,
        group: groupCode,
        name: group.name,
        level: group.level,
        classroom: group.classroom,
        classroomKey,
        classroomBeacon: beaconByClassroomKey?.get(classroomKey) ?? null,
        schedule: group.schedule,
        students: group.students.map((student, index) => ({
            id: student.id,
            matricula: student.matricula,
            beaconUuid: bindingByMatricula.get(student.matricula) ?? student.beaconUuid,
            name: student.name,
            number: index + 1,
        })),
        studentsCount: group._count.students,
        source: group.level === 'DEBUG' ? 'DEBUG' : isSubstitute ? 'SUBSTITUTE' : 'OFFICIAL',
        isSubstitute,
        substituteAssignmentId,
        primaryProfessor,
    };
}

interface AuthenticatedRequest extends FastifyRequest {
    professorId?: string;
}

/**
 * Auth middleware to verify JWT token and validate session
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

        if (!payload.professorId || !payload.sessionId) {
            return reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Token de sesión inválido.',
            });
        }

        const isValid = await sessionService.validateSession(payload.professorId, payload.sessionId);
        if (!isValid) {
            return reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Sesión invalidada. Se inició sesión en otro dispositivo.',
            });
        }

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
                select: groupSelect,
                orderBy: { name: 'asc' },
            }) as GroupRow[];

            const debugGroups = env.PRESENCIA_DEBUG_MODE
                ? await prisma.group.findMany({
                    where: {
                        level: 'DEBUG',
                        NOT: { professorId: request.professorId },
                    },
                    select: groupSelect,
                    orderBy: [{ professor: { name: 'asc' } }, { name: 'asc' }],
                }) as GroupRow[]
                : [];

            const now = new Date();
            const substituteAssignments = await substituteAssignment.findMany({
                where: {
                    substituteProfessorId: request.professorId,
                    active: true,
                    AND: [
                        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
                    ],
                },
                include: {
                    group: {
                        select: groupSelect,
                    },
                    primaryProfessor: {
                        select: {
                            id: true,
                            name: true,
                            institutionalEmail: true,
                        },
                    },
                },
                orderBy: { updatedAt: 'desc' },
            }) as Array<{
                id: string;
                group: GroupRow;
                primaryProfessor: ProfessorSummary;
            }>;

            const assignmentByGroupId = new Map(
                substituteAssignments.map((assignment) => [assignment.group.id, assignment])
            );
            const substituteGroups = substituteAssignments
                .map((assignment) => assignment.group)
                .filter((group) => !groups.some((ownedGroup) => ownedGroup.id === group.id));
            const allGroups = uniqueGroupsById([...groups, ...debugGroups, ...substituteGroups]);

            const matriculas = Array.from(
                new Set(allGroups.flatMap(group => group.students.map(student => student.matricula)))
            );
            const bindings = await studentDeviceBinding.findMany({
                where: { matricula: { in: matriculas } },
                select: {
                    matricula: true,
                    attendanceUuid: true,
                },
            }) as StudentDeviceBindingRow[];
            const bindingByMatricula = new Map(
                bindings.map(binding => [binding.matricula, binding.attendanceUuid])
            );

            // Fetch all beacons for classroom matching
            const rawBeacons = await prisma.beacon.findMany({
                select: { id: true, uuid: true, classroom: true },
                orderBy: { classroom: 'asc' },
            });
            const beacons = rawBeacons.map(serializeBeacon);
            const beaconByClassroomKey = new Map(
                beacons.map((beacon) => [beacon.classroomKey, beacon])
            );

            // Transform to match Flutter app expected format
            const formattedGroups = allGroups.map((group) => {
                const assignment = assignmentByGroupId.get(group.id);
                return formatGroupForApp({
                    group,
                    bindingByMatricula,
                    beaconByClassroomKey,
                    isSubstitute: Boolean(assignment),
                    substituteAssignmentId: assignment?.id,
                    primaryProfessor: assignment?.primaryProfessor,
                });
            });

            return reply.send({ data: formattedGroups, beacons, syncInProgress: false });
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
