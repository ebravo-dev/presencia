import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service.js';
import { loginSchema, type LoginRequest } from './auth.schemas.js';
import { scraperService } from '../scraper/scraper.service.js';
import { rsaService } from '../../core/security/index.js';

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

    /**
     * POST /professors/sync
     * Force sync groups for a professor (triggers scraping)
     * Requires jwt authentication and password for UAT login
     */
    fastify.post<{ Body: LoginRequest }>(
        '/professors/sync',
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
            preHandler: [fastify.authenticate],
        },
        async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
            try {
                const { institutionalEmail, encryptedPassword } = request.body;
                const user = request.user as { professorId: string; email: string };

                if (user.email !== institutionalEmail) {
                    return reply.code(403).send({
                        statusCode: 403,
                        error: 'Forbidden',
                        message: 'No tienes permiso para sincronizar este usuario',
                    });
                }

                const result = await authService.forceSync(
                    user.professorId,
                    institutionalEmail,
                    encryptedPassword
                );

                return reply.code(200).send(result);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Error en la sincronización';

                request.log.error(error);
                return reply.code(500).send({
                    statusCode: 500,
                    error: 'Internal Server Error',
                    message: message,
                });
            }
        }
    );

    /**
     * POST /debug/scrape-groups
     * Debug endpoint - Scrape groups directly without queue
     * Returns raw scraping results for debugging
     * WARNING: Only for development/debugging
     */
    fastify.post<{ Body: LoginRequest }>(
        '/debug/scrape-groups',
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
                const { institutionalEmail, encryptedPassword } = request.body;

                // Decrypt password
                const decryptedPassword = rsaService.decryptPassword(encryptedPassword);

                request.log.info(`🔍 Debug: Starting scrape for ${institutionalEmail}`);

                // Initialize scraper
                await scraperService.init();

                // Scrape groups directly (synchronous for debugging)
                const result = await scraperService.scrapeGroups(institutionalEmail, decryptedPassword);

                // Return raw results for debugging
                return reply.code(200).send({
                    success: result.success,
                    groupCount: result.groups.length,
                    groups: result.groups,
                    error: result.error,
                    debug: {
                        email: institutionalEmail,
                        timestamp: new Date().toISOString(),
                    }
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                request.log.error({ err: error }, `❌ Debug scraping failed: ${message}`);

                return reply.code(500).send({
                    success: false,
                    error: message,
                    stack: error instanceof Error ? error.stack : undefined,
                });
            }
        }
    );
}
