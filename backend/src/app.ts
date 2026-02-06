import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './core/config/env.js';
import { connectDatabase, disconnectDatabase } from './core/database/prisma.js';
import { closeQueue, getQueueStats } from './core/queue/queue.config.js';
import { initializeScrapingWorker } from './modules/scraper/index.js';
import { authRoutes } from './modules/auth/index.js';
import { professorsRoutes } from './modules/professors/index.js';
import { groupsRoutes } from './modules/groups/index.js';
import { attendanceRoutes } from './modules/attendance/index.js';
import { syncRoutes } from './modules/sync/index.js';

// Create Fastify instance
const fastify = Fastify({
    logger: {
        level: env.NODE_ENV === 'development' ? 'debug' : 'info',
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

/**
 * Register plugins
 */
async function registerPlugins(): Promise<void> {
    // CORS
    await fastify.register(cors, {
        origin: true, // Allow all origins in development
        credentials: true,
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
        const queueStats = await getQueueStats();
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: env.NODE_ENV,
            queue: queueStats,
        };
    });

    // API routes
    await fastify.register(authRoutes);
    await fastify.register(professorsRoutes);
    await fastify.register(groupsRoutes);
    await fastify.register(attendanceRoutes);
    await fastify.register(syncRoutes);

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

        const statusCode = error.statusCode || 500;
        const message = statusCode === 500
            ? 'Internal Server Error'
            : error.message;

        reply.code(statusCode).send({
            statusCode,
            error: error.name || 'Error',
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

        await closeQueue();
        console.log('✅ Queue closed');

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

        // Initialize scraping worker (optional - may fail in some Docker environments)
        try {
            await initializeScrapingWorker();
        } catch (scraperError) {
            console.warn('⚠️ Scraping worker failed to initialize:', scraperError instanceof Error ? scraperError.message : scraperError);
            console.warn('⚠️ Server will continue without scraping capabilities');
        }

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

// Start the application
start();
