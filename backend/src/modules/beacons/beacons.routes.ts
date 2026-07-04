import { FastifyInstance } from 'fastify';
import {
    listBeacons,
    createBeacon,
    updateBeacon,
    deleteBeacon,
    findBeaconByClassroom,
    resolveBeaconsByClassrooms,
    normalizeClassroomKey,
    beaconSchema,
    beaconUpdateSchema,
    beaconResolveSchema,
} from './beacons.service.js';

export async function beaconsRoutes(fastify: FastifyInstance) {
    const registerCrudRoutes = (basePath: string) => {
        // ── GET /beacons | /api/beacons ─────────────────────────
        fastify.get(basePath, async (_request, reply) => {
            const beacons = await listBeacons();
            return reply.send({ data: beacons });
        });

        // ── POST /beacons | /api/beacons ────────────────────────
        fastify.post(basePath, async (request, reply) => {
            const parsed = beaconSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(400).send({
                    statusCode: 400,
                    error: 'Validation Error',
                    message: parsed.error.errors.map(e => e.message).join(', '),
                });
            }

            try {
                const existingClassroom = await findBeaconByClassroom(parsed.data.classroom);
                if (existingClassroom) {
                    return reply.code(409).send({
                        statusCode: 409,
                        error: 'Conflict',
                        message: 'Ya existe un beacon asignado a ese salón',
                    });
                }

                const beacon = await createBeacon(parsed.data);
                return reply.code(201).send({ data: beacon });
            } catch (error: any) {
                if (error.code === 'P2002') {
                    return reply.code(409).send({
                        statusCode: 409,
                        error: 'Conflict',
                        message: 'Ya existe un beacon con ese UUID',
                    });
                }
                throw error;
            }
        });

        // ── PUT /beacons/:id | /api/beacons/:id ─────────────────
        fastify.put<{ Params: { id: string } }>(`${basePath}/:id`, async (request, reply) => {
            const parsed = beaconUpdateSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(400).send({
                    statusCode: 400,
                    error: 'Validation Error',
                    message: parsed.error.errors.map(e => e.message).join(', '),
                });
            }

            try {
                if (parsed.data.classroom) {
                    const existingClassroom = await findBeaconByClassroom(
                        parsed.data.classroom,
                        request.params.id
                    );
                    if (existingClassroom) {
                        return reply.code(409).send({
                            statusCode: 409,
                            error: 'Conflict',
                            message: 'Ya existe un beacon asignado a ese salón',
                        });
                    }
                }

                const beacon = await updateBeacon(request.params.id, parsed.data);
                return reply.send({ data: beacon });
            } catch (error: any) {
                if (error.code === 'P2025') {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: 'Beacon no encontrado',
                    });
                }
                if (error.code === 'P2002') {
                    return reply.code(409).send({
                        statusCode: 409,
                        error: 'Conflict',
                        message: 'Ya existe un beacon con ese UUID',
                    });
                }
                throw error;
            }
        });

        // ── DELETE /beacons/:id | /api/beacons/:id ──────────────
        fastify.delete<{ Params: { id: string } }>(`${basePath}/:id`, async (request, reply) => {
            try {
                await deleteBeacon(request.params.id);
                return reply.code(204).send();
            } catch (error: any) {
                if (error.code === 'P2025') {
                    return reply.code(404).send({
                        statusCode: 404,
                        error: 'Not Found',
                        message: 'Beacon no encontrado',
                    });
                }
                throw error;
            }
        });
    };

    registerCrudRoutes('/beacons');
    registerCrudRoutes('/api/beacons');

    // ── POST /api/beacons/resolve ───────────────────────────────
    fastify.post('/api/beacons/resolve', async (request, reply) => {
        const parsed = beaconResolveSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: parsed.error.errors.map(e => e.message).join(', '),
            });
        }

        const requested = new Map(
            parsed.data.classrooms.map((classroom) => [normalizeClassroomKey(classroom), classroom])
        );
        const resolved = await resolveBeaconsByClassrooms(parsed.data.classrooms);
        const found = new Set(resolved.map(beacon => normalizeClassroomKey(beacon.classroom)));

        return reply.send({
            data: resolved,
            missing: Array.from(requested.entries())
                .filter(([classroomKey]) => !found.has(classroomKey))
                .map(([, classroom]) => classroom),
        });
    });
}
