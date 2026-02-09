import { Worker, Job } from 'bullmq';
import {
    redisConnection,
    QUEUE_NAMES,
    type ScrapingJobData,
    type ScrapingJobResult
} from '../../core/queue/queue.config.js';
import { scraperService } from './scraper.service.js';
import { prisma } from '../../core/database/prisma.js';
import { SyncStatus } from '@prisma/client';
import { calculateCurrentPeriod } from '../auth/auth.service.js';

/**
 * Process a scraping job
 */
async function processScrapingJob(
    job: Job<ScrapingJobData, ScrapingJobResult, string>
): Promise<ScrapingJobResult> {
    const { professorId, email, password } = job.data;
    const currentPeriod = calculateCurrentPeriod();

    console.log(`🔄 Processing scraping job ${job.id} for ${email} (${currentPeriod})`);

    // Create SyncJob record to track progress
    const syncJob = await prisma.syncJob.create({
        data: {
            professorId,
            status: 'PENDING',
        },
    });
    console.log(`📊 Created SyncJob ${syncJob.id}`);

    // Step-based progress tracking (5 total steps)
    // Step 1: Conectando con el portal
    // Step 2: Obteniendo clases
    // Step 3: N clases encontradas  
    // Step 4: Recolectando alumnos
    // Step 5: ¡Completado!
    const TOTAL_STEPS = 5;

    const updateStep = async (step: number, description: string) => {
        await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
                currentGroupName: description,
                currentGroup: step,
                totalGroups: TOTAL_STEPS,
            },
        });
    };

    try {
        // Step 1: Conectando
        await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
                status: 'IN_PROGRESS',
                currentGroupName: 'Conectando con el portal UAT...',
                currentGroup: 1,
                totalGroups: TOTAL_STEPS,
            },
        });
        console.log(`🗑️ Cleaning old data for professor ${email}...`);
        const deletedGroups = await prisma.group.deleteMany({
            where: {
                professorId,
                period: currentPeriod,
            },
        });
        console.log(`   Deleted ${deletedGroups.count} old groups (cascade deletes students)`);

        // Clean up old sync jobs (keep only the current one and last 5 completed)
        const oldJobs = await prisma.syncJob.findMany({
            where: {
                professorId,
                id: { not: syncJob.id },
            },
            orderBy: { startedAt: 'desc' },
            skip: 5, // Keep last 5
        });
        if (oldJobs.length > 0) {
            await prisma.syncJob.deleteMany({
                where: {
                    id: { in: oldJobs.map(j => j.id) },
                },
            });
            console.log(`   Cleaned up ${oldJobs.length} old sync jobs`);
        }

        // Step 2: Obteniendo clases (scraping includes login)
        await updateStep(2, 'Iniciando sesión y obteniendo clases...');
        const result = await scraperService.scrapeGroups(email, password);

        if (!result.success) {
            throw new Error(result.error || 'Scraping failed');
        }

        // Step 3: N clases encontradas
        await updateStep(3, `${result.groups.length} clases encontradas`);

        // Save groups to database
        let studentsCount = 0;

        for (const group of result.groups) {
            const groupLetter = group.groupLetter || '';
            await prisma.group.upsert({
                where: {
                    code_groupLetter_professorId_period: {
                        code: group.code,
                        groupLetter,
                        professorId,
                        period: currentPeriod,
                    },
                },
                create: {
                    code: group.code,
                    groupLetter,
                    name: group.name,
                    level: group.level,
                    classroom: group.classroom,
                    schedule: group.schedule,
                    period: currentPeriod,
                    professorId,
                },
                update: {
                    name: group.name,
                    level: group.level,
                    classroom: group.classroom,
                    schedule: group.schedule,
                },
            });
        }

        // Scrape students for ALL groups in a single session
        console.log(`👥 Scraping students for ${result.groups.length} groups in single session...`);

        const groupCodes = result.groups.map(g => g.code);
        const groupNames = result.groups.map(g => g.name);
        const totalGroupCount = result.groups.length;

        // Step 4: Recolectando alumnos
        await updateStep(4, 'Recolectando alumnos...');
        const studentsResult = await scraperService.scrapeAllStudentsInSession(
            email,
            password,
            groupCodes,
            async (groupIndex: number, _groupCode: string) => {
                const groupName = groupNames[groupIndex] || `Clase ${groupIndex + 1}`;
                // Keep step 4 but update the detail message
                await prisma.syncJob.update({
                    where: { id: syncJob.id },
                    data: {
                        currentGroupName: `Obteniendo alumnos de ${groupName} (${groupIndex + 1}/${totalGroupCount})`,
                        currentGroup: 4,
                        totalGroups: TOTAL_STEPS,
                    },
                });
            }
        );

        let studentErrors: string[] = [];
        let studentSessionFailed = false;

        if (studentsResult.success) {
            // Step 5: Finalizing - ¡Completado!
            await updateStep(5, '¡Clases sincronizadas!');

            // Save students to database
            for (const [groupCode, students] of studentsResult.studentsByGroup) {
                const dbGroup = await prisma.group.findFirst({
                    where: { code: groupCode, professorId, period: currentPeriod },
                });

                if (!dbGroup) {
                    console.log(`⚠️ Group ${groupCode} not found in database, skipping students`);
                    continue;
                }

                for (const student of students) {
                    await prisma.student.upsert({
                        where: {
                            matricula_groupId: {
                                matricula: student.matricula,
                                groupId: dbGroup.id,
                            },
                        },
                        create: {
                            matricula: student.matricula,
                            name: student.name,
                            groupId: dbGroup.id,
                        },
                        update: {
                            name: student.name,
                        },
                    });
                }
                studentsCount += students.length;
            }

            if (studentsResult.errors.length > 0) {
                studentErrors = studentsResult.errors;
                console.log(`⚠️ Some groups had errors: ${studentsResult.errors.join(', ')}`);
            }
        } else {
            studentSessionFailed = true;
            studentErrors = studentsResult.errors;
            console.log(`⚠️ Student scraping session failed`);
        }

        // Determine final status and error message
        // - COMPLETED: ALL groups AND students obtained successfully
        // - FAILED: No students obtained (even if groups saved)
        let finalStatus: SyncStatus = SyncStatus.COMPLETED;
        let errorSummary: string | null = null;

        if (studentSessionFailed || studentsCount === 0) {
            // No students obtained - mark as FAILED so professor can retry
            finalStatus = SyncStatus.FAILED;
            errorSummary = 'No se pudieron obtener los alumnos. Por favor intenta sincronizar de nuevo.';
        } else if (studentErrors.length > 0) {
            // Some groups had errors but we got some students
            finalStatus = SyncStatus.FAILED;
            errorSummary = `Algunos grupos tuvieron problemas: ${studentErrors.length} errores. Intenta sincronizar de nuevo.`;
        }

        // Mark SyncJob with final status
        await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
                status: finalStatus,
                completedAt: new Date(),
                currentGroup: 100, // 100% progress
                totalGroups: 100,
                currentGroupName: errorSummary
                    ? errorSummary
                    : `¡Listo! ${result.groups.length} materias y ${studentsCount} alumnos`,
                error: errorSummary,
            },
        });

        console.log(`✅ Job ${job.id} completed: ${result.groups.length} groups, ${studentsCount} students saved`);

        // Clear password from job data (security measure)
        await job.updateData({
            ...job.data,
            password: '[REDACTED]',
        });

        return {
            success: true,
            groupsCount: result.groups.length,
            studentsCount,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const attemptNumber = job.attemptsMade + 1;
        const maxAttempts = job.opts.attempts || 3;

        console.error(`❌ Job ${job.id} failed (attempt ${attemptNumber}/${maxAttempts}):`, errorMessage);

        // Determine if this error should be retried
        // CREDENTIAL_ERROR should NOT be retried (wrong password/username)
        // PORTAL_ERROR should be retried (slow portal, timeout)
        const isCredentialError =
            errorMessage.includes('CREDENTIAL_ERROR') ||
            errorMessage.toLowerCase().includes('contraseña incorrecta') ||
            errorMessage.toLowerCase().includes('usuario incorrecto') ||
            errorMessage.toLowerCase().includes('credenciales inválidas') ||
            errorMessage.toLowerCase().includes('invalid credentials');

        const isRetryable = !isCredentialError && attemptNumber < maxAttempts;

        if (isRetryable) {
            // Update SyncJob to show retry status
            await prisma.syncJob.update({
                where: { id: syncJob.id },
                data: {
                    currentGroupName: `Reintentando... (intento ${attemptNumber + 1}/${maxAttempts})`,
                    error: `Intento ${attemptNumber} falló: ${errorMessage}`,
                },
            });
            console.log(`🔄 Will retry job ${job.id} (attempt ${attemptNumber + 1}/${maxAttempts})...`);
        } else {
            // Mark SyncJob as FAILED (no more retries)
            const finalError = isCredentialError
                ? 'Error de autenticación. Verifica tus credenciales del portal UAT.'
                : `Error después de ${attemptNumber} intentos: ${errorMessage}`;

            await prisma.syncJob.update({
                where: { id: syncJob.id },
                data: {
                    status: 'FAILED',
                    error: finalError,
                    completedAt: new Date(),
                },
            });
            console.error(`❌ Job ${job.id} permanently failed: ${finalError}`);
        }

        // Clear password even on failure
        await job.updateData({
            ...job.data,
            password: '[REDACTED]',
        });

        // For credential errors, throw UnrecoverableError to prevent retries
        if (isCredentialError) {
            const { UnrecoverableError } = await import('bullmq');
            throw new UnrecoverableError(errorMessage);
        }

        throw error;
    }
}

/**
 * Create and start the scraping worker
 */
export function createScrapingWorker(): Worker<ScrapingJobData, ScrapingJobResult, string> {
    const worker = new Worker<ScrapingJobData, ScrapingJobResult, string>(
        QUEUE_NAMES.SCRAPING,
        processScrapingJob,
        {
            connection: redisConnection,
            concurrency: 1, // Process one job at a time (single scraper instance)
            maxStalledCount: 2, // Tolerate 2 stalls before failing (for server restarts)
            limiter: {
                max: 5, // Max 5 jobs per minute (avoid overloading UAT portal)
                duration: 60000,
            },
        }
    );

    worker.on('completed', (job) => {
        console.log(`✅ Job ${job.id} completed`);
    });

    worker.on('failed', (job, error) => {
        console.error(`❌ Job ${job?.id} failed:`, error.message);
    });

    worker.on('error', (error) => {
        console.error('❌ Worker error:', error);
    });

    console.log('👷 Scraping worker started');

    return worker;
}

/**
 * Initialize the scraper service and worker
 */
export async function initializeScrapingWorker(): Promise<Worker<ScrapingJobData, ScrapingJobResult, string>> {
    // Initialize browser
    await scraperService.init();

    // Create worker
    const worker = createScrapingWorker();

    return worker;
}
