import { FastifyInstance } from 'fastify';
import {
    listBeacons,
    createBeacon,
    updateBeacon,
    deleteBeacon,
    beaconSchema,
    beaconUpdateSchema,
} from './beacons.service.js';

export async function beaconsRoutes(fastify: FastifyInstance) {
    // ── GET /beacons ─────────────────────────────────────────────
    fastify.get('/beacons', async (_request, reply) => {
        const beacons = await listBeacons();
        return reply.send({ data: beacons });
    });

    // ── POST /beacons ────────────────────────────────────────────
    fastify.post('/beacons', async (request, reply) => {
        const parsed = beaconSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: parsed.error.errors.map(e => e.message).join(', '),
            });
        }

        try {
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

    // ── PUT /beacons/:id ─────────────────────────────────────────
    fastify.put<{ Params: { id: string } }>('/beacons/:id', async (request, reply) => {
        const parsed = beaconUpdateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: parsed.error.errors.map(e => e.message).join(', '),
            });
        }

        try {
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

    // ── DELETE /beacons/:id ──────────────────────────────────────
    fastify.delete<{ Params: { id: string } }>('/beacons/:id', async (request, reply) => {
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
}
