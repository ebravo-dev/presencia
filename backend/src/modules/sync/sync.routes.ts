import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../core/database/prisma.js';
import { addScrapingJob } from '../../core/queue/queue.config.js';
import { rsaService } from '../../core/security/index.js';

/**
 * Sync routes - SSE streaming and retry functionality
 */
export async function syncRoutes(fastify: FastifyInstance): Promise<void> {
    /**
     * GET /sync/stream/:professorId
     * Server-Sent Events endpoint for real-time sync progress updates
     * Requires JWT authentication
     */
    fastify.get<{ Params: { professorId: string } }>(
        '/sync/stream/:professorId',
        {
            preHandler: [fastify.authenticate],
        },
        async (request: FastifyRequest<{ Params: { professorId: string } }>, reply: FastifyReply) => {
            const { professorId } = request.params;
            const user = request.user as { professorId: string };

            // Verify user owns this professor ID
            if (user.professorId !== professorId) {
                return reply.code(403).send({
                    error: 'Forbidden',
                    message: 'No tienes permiso para ver este progreso',
                });
            }

            // Set SSE headers
            reply.raw.setHeader('Content-Type', 'text/event-stream');
            reply.raw.setHeader('Cache-Control', 'no-cache');
            reply.raw.setHeader('Connection', 'keep-alive');
            reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

            // Send initial connection message
            reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

            let isClientConnected = true;
            let lastStatus: string | null = null;
            let lastStep: number | null = null;
            let noChangeCount = 0;
            const MAX_NO_CHANGE = 150; // 150 * 2s = 300s (5 min) timeout if no changes

            // Polling interval for sync job status
            const interval = setInterval(async () => {
                if (!isClientConnected) {
                    clearInterval(interval);
                    return;
                }

                try {
                    // Get latest ACTIVE sync job for this professor (only PENDING or IN_PROGRESS)
                    const activeSyncJob = await prisma.syncJob.findFirst({
                        where: {
                            professorId,
                            status: { in: ['PENDING', 'IN_PROGRESS'] },
                        },
                        orderBy: { startedAt: 'desc' },
                    });

                    if (activeSyncJob) {
                        const currentStatus = activeSyncJob.status;
                        const currentStep = activeSyncJob.currentGroup;

                        // Check if there's a change
                        if (currentStatus !== lastStatus || currentStep !== lastStep) {
                            noChangeCount = 0;
                            lastStatus = currentStatus;
                            lastStep = currentStep;
                        } else {
                            // Only count no-change for PENDING jobs (not yet started)
                            // IN_PROGRESS jobs may take time per group, that's normal
                            if (currentStatus === 'PENDING') {
                                noChangeCount++;
                            } else {
                                // For IN_PROGRESS, reset counter more slowly
                                noChangeCount += 0.5;
                            }
                        }

                        // Send update to client
                        const event = {
                            type: 'progress',
                            status: activeSyncJob.status,
                            step: activeSyncJob.currentGroup || 0,
                            totalSteps: activeSyncJob.totalGroups || 5,
                            message: activeSyncJob.currentGroupName || '',
                            error: activeSyncJob.error,
                            attemptsMade: activeSyncJob.error?.includes('intento') ?
                                parseInt(activeSyncJob.error.match(/intento (\d+)/)?.[1] || '0') : 0,
                        };

                        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

                        // Timeout if no changes for too long
                        if (noChangeCount >= MAX_NO_CHANGE) {
                            reply.raw.write(`data: ${JSON.stringify({
                                type: 'timeout',
                                message: 'El portal de la UAT está tardando más de lo esperado. Intenta de nuevo más tarde.'
                            })}\n\n`);
                            clearInterval(interval);
                            reply.raw.end();
                        }
                    } else {
                        // No active sync job - check if there's a recently completed one
                        const recentJob = await prisma.syncJob.findFirst({
                            where: { professorId },
                            orderBy: { startedAt: 'desc' },
                        });

                        if (recentJob && (recentJob.status === 'COMPLETED' || recentJob.status === 'FAILED')) {
                            // Determine if this was a credential error
                            const isCredentialError = recentJob.error?.includes('CREDENTIAL_ERROR') ||
                                recentJob.error?.toLowerCase().includes('contraseña') ||
                                recentJob.error?.toLowerCase().includes('usuario');

                            // Send final state and close
                            const event = {
                                type: recentJob.status === 'COMPLETED' ? 'completed' : 'failed',
                                status: recentJob.status,
                                step: recentJob.currentGroup || 0,
                                totalSteps: recentJob.totalGroups || 5,
                                message: recentJob.status === 'COMPLETED'
                                    ? '¡Sincronización completada!'
                                    : (recentJob.error || 'Error en sincronización'),
                                error: recentJob.error,
                                errorType: isCredentialError ? 'credential' : 'portal',
                                isCompleted: recentJob.status === 'COMPLETED',
                                isFailed: recentJob.status === 'FAILED',
                            };
                            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
                            clearInterval(interval);
                            reply.raw.end();
                        } else {
                            // No sync job at all
                            reply.raw.write(`data: ${JSON.stringify({
                                type: 'no_job',
                                message: 'No hay sincronización activa'
                            })}\n\n`);
                        }
                    }
                } catch (error) {
                    console.error('SSE polling error:', error);
                    reply.raw.write(`data: ${JSON.stringify({
                        type: 'error',
                        message: 'Error interno del servidor'
                    })}\n\n`);
                }
            }, 2000); // Poll every 2 seconds

            // Handle client disconnect
            request.raw.on('close', () => {
                isClientConnected = false;
                clearInterval(interval);
            });

            // Prevent Fastify from sending response (we're handling it manually)
            return reply;
        }
    );

    /**
     * GET /sync/status
     * Get current sync status (for initial load before SSE connects)
     */
    fastify.get(
        '/sync/status',
        {
            preHandler: [fastify.authenticate],
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = request.user as { professorId: string };

            try {
                const syncJob = await prisma.syncJob.findFirst({
                    where: { professorId: user.professorId },
                    orderBy: { startedAt: 'desc' },
                });

                if (!syncJob) {
                    return reply.code(200).send({
                        hasSync: false,
                        message: 'No hay sincronizaciones previas',
                    });
                }

                return reply.code(200).send({
                    hasSync: true,
                    status: syncJob.status,
                    step: syncJob.currentGroup || 0,
                    totalSteps: syncJob.totalGroups || 5,
                    message: syncJob.currentGroupName || '',
                    error: syncJob.error,
                    startedAt: syncJob.startedAt,
                    completedAt: syncJob.completedAt,
                });
            } catch (error) {
                console.error('Get sync status error:', error);
                return reply.code(500).send({
                    error: 'Internal Server Error',
                    message: 'Error al obtener el estado de sincronización',
                });
            }
        }
    );
}
