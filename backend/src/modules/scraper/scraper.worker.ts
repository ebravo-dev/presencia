import { Worker, Job } from 'bullmq';
import {
    redisConnection,
    QUEUE_NAMES,
    type ScrapingJobData,
    type ScrapingJobResult
} from '../../core/queue/queue.config.js';
import { scraperService } from './scraper.service.js';
import { prisma } from '../../core/database/prisma.js';
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

    try {
        // Scrape groups from UAT portal
        const result = await scraperService.scrapeGroups(email, password);

        if (!result.success) {
            throw new Error(result.error || 'Scraping failed');
        }

        // Save groups to database
        let studentsCount = 0;

        for (const group of result.groups) {
            await prisma.group.upsert({
                where: {
                    code_professorId_period: {
                        code: group.code,
                        professorId,
                        period: currentPeriod,
                    },
                },
                create: {
                    code: group.code,
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

        // Scrape students for ALL groups in a single session (efficient)
        console.log(`👥 Scraping students for ${result.groups.length} groups in single session...`);

        const groupCodes = result.groups.map(g => g.code);
        const studentsResult = await scraperService.scrapeAllStudentsInSession(email, password, groupCodes);

        if (studentsResult.success) {
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
                console.log(`⚠️ Some groups had errors: ${studentsResult.errors.join(', ')}`);
            }
        } else {
            console.log(`⚠️ Student scraping session failed`);
        }

        console.log(`✅ Job ${job.id} completed: ${result.groups.length} groups, ${studentsCount} students saved`);

        // Clear password from job data (security measure)
        // Note: BullMQ may have already stored this in Redis temporarily
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
