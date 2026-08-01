import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { env } from './core/config/env.js';
import { connectDatabase, disconnectDatabase, prisma } from './core/database/prisma.js';
import { authRoutes } from './modules/auth/index.js';
import { professorsRoutes } from './modules/professors/index.js';
import { groupsRoutes } from './modules/groups/index.js';
import { attendanceRoutes } from './modules/attendance/index.js';
import { syncRoutes } from './modules/sync/index.js';
import { studentAttendanceRoutes } from './modules/student-attendance/index.js';
import { beaconsRoutes } from './modules/beacons/index.js';
import { uatProxyRoutes } from './modules/uat-proxy/index.js';
import { internalCoordinationRoutes } from './modules/internal-coordination/index.js';
import { superUserRoutes } from './modules/super-user/index.js';
import { sessionService } from './core/security/index.js';
import { SERVER_TIME_ZONE, serverLocalDateString, serverNow } from './core/time/server-time.js';

// Create Fastify instance
const fastify = Fastify({
    logger: {
        level: env.PRESENCIA_DEBUG_MODE || env.PRESENCIA_DEBUG_VERBOSE_LOGS || env.NODE_ENV === 'development' ? 'debug' : 'info',
        transport: env.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                },
            }
            : undefined,
    },
});
const rateLimitRedis = new Redis(env.REDIS_URL, {
    keyPrefix: 'rate-limit:',
    lazyConnect: true,
});

/**
 * Register plugins
 */
async function registerPlugins(): Promise<void> {
    // CORS
    await fastify.register(cors, {
        origin: env.CORS_ALLOWED_ORIGINS,
        credentials: true,
    });

    await fastify.register(rateLimit, {
        global: false,
        hook: 'preHandler',
        redis: rateLimitRedis,
    });

    // CSS/Security
    await fastify.register(helmet, {
        contentSecurityPolicy: false, // Disable for API server
    });

    // JWT
    await fastify.register(import('@fastify/jwt'), {
        secret: env.JWT_SECRET,
    });

    // Auth decorator
    fastify.decorate('authenticate', async (request: any, reply: any) => {
        try {
            await request.jwtVerify();

            // Validate single session via Redis
            const { professorId, sessionId } = request.user;
            if (!professorId || !sessionId) {
                return reply.code(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Token de sesión inválido.',
                });
            }

            const isValid = await sessionService.validateSession(professorId, sessionId);
            if (!isValid) {
                return reply.code(401).send({
                    statusCode: 401,
                    error: 'Unauthorized',
                    message: 'Sesión invalidada. Se inició sesión en otro dispositivo.',
                });
            }
        } catch (err) {
            reply.send(err);
        }
    });
}

/**
 * Register routes
 */
async function registerRoutes(): Promise<void> {
    // Health check
    fastify.get('/health', async () => {
        return {
            status: 'ok',
            timestamp: serverNow().toISOString(),
            timezone: SERVER_TIME_ZONE,
            environment: env.NODE_ENV,
            debugMode: env.PRESENCIA_DEBUG_MODE,
        };
    });

    fastify.get('/time', async () => {
        const now = serverNow();
        return {
            now: now.toISOString(),
            timezone: SERVER_TIME_ZONE,
            localDate: serverLocalDateString(now),
        };
    });

    // API routes
    await fastify.register(authRoutes);
    await fastify.register(professorsRoutes);
    await fastify.register(groupsRoutes);
    await fastify.register(attendanceRoutes);
    await fastify.register(syncRoutes);
    await fastify.register(uatProxyRoutes);
    await fastify.register(studentAttendanceRoutes);
    await fastify.register(beaconsRoutes);
    await fastify.register(internalCoordinationRoutes);
    await fastify.register(superUserRoutes);

    // 404 handler
    fastify.setNotFoundHandler((request, reply) => {
        reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Route ${request.method} ${request.url} not found`,
        });
    });

    // Global error handler
    fastify.setErrorHandler((error, request, reply) => {
        request.log.error(error);

        const normalizedError = error instanceof Error ? error : new Error('Unknown error');
        const errorWithStatus = normalizedError as Error & { statusCode?: number };
        const statusCode = errorWithStatus.statusCode || 500;
        const message = statusCode === 500
            ? 'Internal Server Error'
            : normalizedError.message;

        reply.code(statusCode).send({
            statusCode,
            error: normalizedError.name || 'Error',
            message,
        });
    });
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    try {
        await fastify.close();
        console.log('✅ Fastify closed');

        await sessionService.close();
        console.log('✅ Session store closed');

        await rateLimitRedis.quit();
        console.log('✅ Rate-limit store closed');

        await disconnectDatabase();
        console.log('✅ Database disconnected');

        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

/**
 * Start the server
 */
async function start(): Promise<void> {
    try {
        console.log('🚀 Starting Presencia Backend...\n');

        // Connect to database
        await connectDatabase();

        // Register plugins and routes
        await registerPlugins();
        await registerRoutes();

        await failStaleSyncState();

        // Start server
        await fastify.listen({
            port: env.PORT,
            host: '0.0.0.0', // Listen on all interfaces for Docker
        });

        console.log(`\n✅ Server is running on http://localhost:${env.PORT}`);
        console.log(`📋 Environment: ${env.NODE_ENV}`);
        console.log(`🔍 Health check: http://localhost:${env.PORT}/health\n`);

        // Handle graceful shutdown
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    } catch (error) {
        console.error('❌ Error starting server:', error);
        process.exit(1);
    }
}

async function failStaleSyncState(): Promise<void> {
    const updatedSyncJobs = await prisma.syncJob.updateMany({
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        data: {
            status: 'FAILED',
            error: 'Cancelado: el servidor se reinició',
            completedAt: new Date(),
        },
    });

    const updatedAttendance = await prisma.attendanceRecord.updateMany({
        where: { portalSyncStatus: { in: ['PENDING', 'IN_PROGRESS'] } },
        data: {
            portalSyncStatus: 'FAILED',
            portalSyncError: 'Cancelado: el servidor se reinició',
        },
    });

    if (updatedSyncJobs.count > 0 || updatedAttendance.count > 0) {
        console.log(`🧹 Limpieza de sincronizaciones: ${updatedSyncJobs.count} sync(s), ${updatedAttendance.count} asistencia(s)`);
    }
}

// Start the application
start();
