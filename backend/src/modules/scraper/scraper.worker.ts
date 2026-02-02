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

    // Helper function to update progress with percentage
    // We use currentGroup/totalGroups to calculate percentage
    // For initial phases, we set totalGroups=100 so currentGroup IS the percentage
    const updateProgress = async (phase: string, percentage?: number) => {
        await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
                currentGroupName: phase,
                // Use percentage directly: currentGroup/100 = percentage%
                currentGroup: percentage ?? undefined,
                totalGroups: percentage !== undefined ? 100 : undefined,
            },
        });
    };

    try {
        // Phase 1: Starting (5%)
        await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
                status: 'IN_PROGRESS',
                currentGroupName: 'Conectando con el portal UAT...',
                currentGroup: 5,
                totalGroups: 100,
            },
        });

        // Phase 2: Cleaning old data (10%)
        await updateProgress('Preparando sincronización...', 10);
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

        // Phase 3: Extracting groups from UAT portal (15%)
        await updateProgress('Accediendo al portal UAT...', 15);
        const result = await scraperService.scrapeGroups(email, password);

        if (!result.success) {
            throw new Error(result.error || 'Scraping failed');
        }

        // Phase 4: Groups found (20%)
        await updateProgress(`${result.groups.length} materias encontradas`, 20);

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

        // Phase 5: Getting students for each group (25% to 90% distributed across groups)
        const studentsResult = await scraperService.scrapeAllStudentsInSession(
            email,
            password,
            groupCodes,
            async (groupIndex: number, _groupCode: string) => {
                const groupName = groupNames[groupIndex] || `Grupo ${groupIndex + 1}`;
                // Calculate percentage: 25% base + (65% distributed across groups)
                // So each group contributes 65/totalGroupCount percent
                const progressPercent = Math.round(25 + ((groupIndex + 1) / totalGroupCount) * 65);
                await prisma.syncJob.update({
                    where: { id: syncJob.id },
                    data: {
                        currentGroupName: `Obteniendo alumnos de ${groupName}`,
                        currentGroup: progressPercent,
                        totalGroups: 100,
                    },
                });
            }
        );

        let studentErrors: string[] = [];
        let studentSessionFailed = false;

        if (studentsResult.success) {
            // Phase 6: Saving data (95%)
            await updateProgress('Guardando datos...', 95);

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
        // - COMPLETED: Everything worked (or worked with warnings - errors stored in error field)
        // - FAILED: Complete failure (handled in catch block)
        const finalStatus: SyncStatus = SyncStatus.COMPLETED;
        let errorSummary: string | null = null;

        if (studentSessionFailed) {
            // Students failed but groups saved - still mark as completed with error message
            errorSummary = 'Hubo un problema al obtener los alumnos. Las materias se guardaron pero sin alumnos. Intenta sincronizar de nuevo.';
        } else if (studentErrors.length > 0) {
            errorSummary = `Algunos grupos tuvieron problemas: ${studentErrors.length} errores. Intenta sincronizar de nuevo.`;
        }

        // Mark SyncJob with final status
        await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
                status: finalStatus,
                completedAt: new Date(),
                currentGroup: result.groups.length,
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
        console.error(`❌ Job ${job.id} failed:`, errorMessage);

        // Mark SyncJob as FAILED
        await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
                status: 'FAILED',
                error: errorMessage,
                completedAt: new Date(),
            },
        });

        // Clear password even on failure
        await job.updateData({
            ...job.data,
            password: '[REDACTED]',
        });


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
