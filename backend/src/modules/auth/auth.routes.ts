import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service.js';
import { loginSchema, type LoginRequest } from './auth.schemas.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
    /**
     * POST /professors/login
     * Login a professor (creates account if doesn't exist)
     * - First login: creates professor + triggers scraping
     * - Same period: returns JWT without scraping
     * - New period: triggers scraping to update groups
     */
    fastify.post<{ Body: LoginRequest }>(
        '/professors/login',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['institutionalEmail', 'encryptedPassword'],
                    properties: {
                        institutionalEmail: { type: 'string', format: 'email' },
                        encryptedPassword: { type: 'string' },
                    },
                },
            },
        },
        async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
            try {
                // Validate request body
                const validatedData = loginSchema.parse(request.body);

                // Login professor (upsert behavior)
                const result = await authService.login(validatedData);

                return reply.code(200).send({
                    data: result.profesor,
                    token: result.token,
                    message: result.message,
                    currentPeriod: result.currentPeriod,
                    needsSync: result.needsSync,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Error en el login';

                if (message.includes('decrypt')) {
                    return reply.code(400).send({
                        statusCode: 400,
                        error: 'Bad Request',
                        message: 'Error al procesar credenciales',
                    });
                }

                request.log.error(error);
                return reply.code(500).send({
                    statusCode: 500,
                    error: 'Internal Server Error',
                    message: 'Error interno del servidor',
                });
            }
        }
    );
}
