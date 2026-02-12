import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.js';

// Queue names
export const QUEUE_NAMES = {
    SCRAPING: 'scraping',
    ATTENDANCE_UPLOAD: 'attendance-upload',
} as const;

// Scraping job data types
export interface ScrapingJobData {
    professorId: string;
    email: string;
    password: string; // Decrypted password (only in memory)
}

export interface ScrapingJobResult {
    success: boolean;
    groupsCount?: number;
    studentsCount?: number;
    error?: string;
}

export interface AttendanceUploadJobData {
    professorId: string;
    email: string;
    password: string; // Decrypted password (only in memory)
    attendanceRecordId: string;
    syncJobId: string;
    groupId: string;
    date: string; // YYYY-MM-DD
    attendances: Array<{
        studentId: string;
        status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
    }>;
}

export interface AttendanceUploadJobResult {
    success: boolean;
    attendanceRecordId?: string;
    processedCount?: number;
    error?: string;
}

// Redis connection options
const redisUrl = new URL(env.REDIS_URL);
const redisConnection = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port) || 6379,
    password: redisUrl.password || undefined,
    username: redisUrl.username || undefined,
};

// Create scraping queue
export const scrapingQueue = new Queue<ScrapingJobData, ScrapingJobResult, string>(
    QUEUE_NAMES.SCRAPING,
    {
        connection: redisConnection,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
            removeOnComplete: {
                count: 100, // Keep last 100 completed jobs
            },
            removeOnFail: {
                count: 50, // Keep last 50 failed jobs
            },
        },
    }
);

export const attendanceUploadQueue = new Queue<
    AttendanceUploadJobData,
    AttendanceUploadJobResult,
    string
>(
    QUEUE_NAMES.ATTENDANCE_UPLOAD,
    {
        connection: redisConnection,
        defaultJobOptions: {
            // Attendance uploads should fail fast to avoid a cyclical UX.
            // The professor can manually retry from the app.
            attempts: 1,
            removeOnComplete: {
                count: 100,
            },
            removeOnFail: {
                count: 50,
            },
        },
    }
);

/**
 * Add a scraping job to the queue
 * The password is passed in memory and never persisted to Redis
 * (BullMQ stores job data in Redis, but we clear sensitive data after processing)
 */
export async function addScrapingJob(data: ScrapingJobData): Promise<Job<ScrapingJobData, ScrapingJobResult, string>> {
    const job = await scrapingQueue.add('scrape-uat', data, {
        jobId: `scrape-${data.professorId}-${Date.now()}`,
    });

    console.log(`📤 Scraping job added: ${job.id}`);
    return job;
}

export async function addAttendanceUploadJob(
    data: AttendanceUploadJobData
): Promise<Job<AttendanceUploadJobData, AttendanceUploadJobResult, string>> {
    // Remove any previous failed/completed job for the same group+date
    // to avoid BullMQ silently ignoring a duplicate jobId.
    const baseId = `attendance-${data.professorId}-${data.groupId}-${data.date}`;
    const existingJob = await attendanceUploadQueue.getJob(baseId);
    if (existingJob) {
        const state = await existingJob.getState();
        if (state === 'failed' || state === 'completed') {
            await existingJob.remove();
            console.log(`🗑️ Removed old ${state} job: ${baseId}`);
        }
    }

    const job = await attendanceUploadQueue.add('upload-attendance', data, {
        jobId: baseId,
    });

    console.log(`📤 Attendance upload job added: ${job.id}`);
    return job;
}

/**
 * Get queue stats for monitoring
 */
export async function getQueueStats() {
    const [
        scrapingWaiting,
        scrapingActive,
        scrapingCompleted,
        scrapingFailed,
        attendanceWaiting,
        attendanceActive,
        attendanceCompleted,
        attendanceFailed,
    ] = await Promise.all([
        scrapingQueue.getWaitingCount(),
        scrapingQueue.getActiveCount(),
        scrapingQueue.getCompletedCount(),
        scrapingQueue.getFailedCount(),
        attendanceUploadQueue.getWaitingCount(),
        attendanceUploadQueue.getActiveCount(),
        attendanceUploadQueue.getCompletedCount(),
        attendanceUploadQueue.getFailedCount(),
    ]);

    return {
        scraping: {
            waiting: scrapingWaiting,
            active: scrapingActive,
            completed: scrapingCompleted,
            failed: scrapingFailed,
        },
        attendanceUpload: {
            waiting: attendanceWaiting,
            active: attendanceActive,
            completed: attendanceCompleted,
            failed: attendanceFailed,
        },
    };
}

/**
 * Close queue connection gracefully
 */
export async function closeQueue(): Promise<void> {
    await scrapingQueue.close();
    await attendanceUploadQueue.close();
    console.log('📤 Queue connections closed');
}

// Export connection for worker
export { redisConnection };

