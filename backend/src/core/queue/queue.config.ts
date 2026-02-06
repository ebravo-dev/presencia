import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.js';

// Queue names
export const QUEUE_NAMES = {
    SCRAPING: 'scraping',
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

/**
 * Get queue stats for monitoring
 */
export async function getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
        scrapingQueue.getWaitingCount(),
        scrapingQueue.getActiveCount(),
        scrapingQueue.getCompletedCount(),
        scrapingQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
}

/**
 * Close queue connection gracefully
 */
export async function closeQueue(): Promise<void> {
    await scrapingQueue.close();
    console.log('📤 Queue connections closed');
}

// Export connection for worker
export { redisConnection };

// =============================================================================
// RETRY TOKEN SYSTEM
// Temporary password storage for retry without re-entering credentials
// =============================================================================

const RETRY_TOKEN_TTL = 30 * 60; // 30 minutes in seconds

/**
 * Store password temporarily for retry functionality
 * Password is stored in Redis with 30-minute TTL
 */
export async function storeRetryPassword(professorId: string, password: string): Promise<void> {
    const redis = new Redis(env.REDIS_URL);
    try {
        await redis.setex(`retry:password:${professorId}`, RETRY_TOKEN_TTL, password);
        console.log(`🔐 Retry password stored for professor ${professorId} (TTL: 30min)`);
    } finally {
        await redis.quit();
    }
}

/**
 * Retrieve stored password for retry
 * Returns null if password expired or doesn't exist
 */
export async function getRetryPassword(professorId: string): Promise<string | null> {
    const redis = new Redis(env.REDIS_URL);
    try {
        const password = await redis.get(`retry:password:${professorId}`);
        return password;
    } finally {
        await redis.quit();
    }
}

/**
 * Clear stored retry password (call after successful sync or logout)
 */
export async function clearRetryPassword(professorId: string): Promise<void> {
    const redis = new Redis(env.REDIS_URL);
    try {
        await redis.del(`retry:password:${professorId}`);
    } finally {
        await redis.quit();
    }
}

