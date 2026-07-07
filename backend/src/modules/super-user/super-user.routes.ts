import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../core/config/env.js';
import { SuperUserService } from './super-user.service.js';
import {
    coordinatorCreateSchema,
    coordinatorUpdateSchema,
    superUserBeaconSchema,
    superUserBeaconUpdateSchema,
    superUserLoginSchema,
} from './super-user.schemas.js';

const SUPER_USER_COOKIE = 'super_user_session';
const superUserService = new SuperUserService();

export async function superUserRoutes(fastify: FastifyInstance) {
    fastify.post('/api/superUsuario/auth/login', async (request, reply) => {
        const parsed = superUserLoginSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Validation Error',
                message: parsed.error.errors.map((issue) => issue.message).join(', '),
            });
        }

        try {
            const session = superUserService.login(parsed.data.password);
            setSuperUserCookie(reply, session.token, superUserService.sessionDurationSeconds);
            return reply.send({
                data: {
                    user: session.user,
                    expiresAt: session.expiresAt.toISOString(),
                },
            });
        } catch {
            return reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Contraseña de super usuario inválida.',
            });
        }
    });

    fastify.get('/api/superUsuario/auth/me', { preHandler: requireSuperUser }, async (_request, reply) => {
        return reply.send({ data: { user: { role: 'SUPER_USER' } } });
    });

    fastify.post('/api/superUsuario/auth/logout', async (_request, reply) => {
        clearSuperUserCookie(reply);
        return reply.code(204).send();
    });

    fastify.get('/api/superUsuario/coordinadores', { preHandler: requireSuperUser }, async (_request, reply) => {
        return reply.send(await superUserService.listCoordinators());
    });

    fastify.post('/api/superUsuario/coordinadores', { preHandler: requireSuperUser }, async (request, reply) => {
        const parsed = coordinatorCreateSchema.safeParse(request.body);
        if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));

        return reply.code(201).send(await superUserService.createCoordinator(parsed.data));
    });

    fastify.put<{ Params: { id: string } }>(
        '/api/superUsuario/coordinadores/:id',
        { preHandler: requireSuperUser },
        async (request, reply) => {
            const parsed = coordinatorUpdateSchema.safeParse(request.body);
            if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));

            return reply.send(await superUserService.updateCoordinator(request.params.id, parsed.data));
        }
    );

    fastify.delete<{ Params: { id: string } }>(
        '/api/superUsuario/coordinadores/:id',
        { preHandler: requireSuperUser },
        async (request, reply) => {
            await superUserService.deleteCoordinator(request.params.id);
            return reply.code(204).send();
        }
    );

    fastify.get('/api/superUsuario/beacons', { preHandler: requireSuperUser }, async (_request, reply) => {
        return reply.send({ data: await superUserService.listBeacons() });
    });

    fastify.post('/api/superUsuario/beacons', { preHandler: requireSuperUser }, async (request, reply) => {
        const parsed = superUserBeaconSchema.safeParse(request.body);
        if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));

        try {
            return reply.code(201).send({ data: await superUserService.createBeacon(parsed.data) });
        } catch (error: any) {
            return sendBeaconError(error, reply);
        }
    });

    fastify.put<{ Params: { id: string } }>(
        '/api/superUsuario/beacons/:id',
        { preHandler: requireSuperUser },
        async (request, reply) => {
            const parsed = superUserBeaconUpdateSchema.safeParse(request.body);
            if (!parsed.success) return sendValidationError(reply, parsed.error.errors.map((issue) => issue.message));

            try {
                return reply.send({ data: await superUserService.updateBeacon(request.params.id, parsed.data) });
            } catch (error: any) {
                return sendBeaconError(error, reply);
            }
        }
    );

    fastify.delete<{ Params: { id: string } }>(
        '/api/superUsuario/beacons/:id',
        { preHandler: requireSuperUser },
        async (request, reply) => {
            try {
                await superUserService.deleteBeacon(request.params.id);
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
        }
    );

    fastify.get('/api/superUsuario/alumnos-vinculados', { preHandler: requireSuperUser }, async (request, reply) => {
        const { q } = request.query as { q?: string };
        return reply.send({ data: await superUserService.listStudentDeviceBindings(q) });
    });

    fastify.delete<{ Params: { matricula: string } }>(
        '/api/superUsuario/alumnos-vinculados/:matricula',
        { preHandler: requireSuperUser },
        async (request, reply) => {
            const deleted = await superUserService.deleteStudentDeviceBinding(decodeURIComponent(request.params.matricula));
            if (!deleted) {
                return reply.code(404).send({
                    statusCode: 404,
                    error: 'Not Found',
                    message: 'Vinculación no encontrada',
                });
            }

            return reply.code(204).send();
        }
    );
}

function requireSuperUser(request: FastifyRequest, reply: FastifyReply) {
    const cookies = parseCookies(request.headers.cookie);
    const user = superUserService.authenticate(cookies[SUPER_USER_COOKIE]);
    if (!user) {
        return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Sesión de super usuario requerida.',
        });
    }
}

function setSuperUserCookie(reply: FastifyReply, token: string, maxAgeSeconds: number) {
    reply.header(
        'Set-Cookie',
        `${SUPER_USER_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/api/superUsuario; HttpOnly; SameSite=Lax${env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    );
}

function clearSuperUserCookie(reply: FastifyReply) {
    reply.header(
        'Set-Cookie',
        `${SUPER_USER_COOKIE}=; Max-Age=0; Path=/api/superUsuario; HttpOnly; SameSite=Lax${env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    );
}

function parseCookies(header?: string): Record<string, string> {
    if (!header) return {};
    return Object.fromEntries(
        header.split(';').map((part) => {
            const [rawKey, ...rawValue] = part.trim().split('=');
            return [rawKey, decodeURIComponent(rawValue.join('='))];
        }).filter(([key]) => key)
    );
}

function sendValidationError(reply: FastifyReply, messages: string[]) {
    return reply.code(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: messages.join(', '),
    });
}

function sendBeaconError(error: any, reply: FastifyReply) {
    if (error.message === 'BEACON_CLASSROOM_EXISTS') {
        return reply.code(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Ya existe un beacon asignado a ese salón',
        });
    }
    if (error.code === 'P2002') {
        return reply.code(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Ya existe un beacon con ese UUID',
        });
    }
    if (error.code === 'P2025') {
        return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Beacon no encontrado',
        });
    }
    throw error;
}
