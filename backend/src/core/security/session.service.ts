import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { env } from '../config/env.js';

const SESSION_PREFIX = 'session:';

/**
 * Session Service — Single session management via Redis
 * 
 * On login, a unique sessionId is generated and stored in Redis.
 * On every authenticated request, the sessionId from the JWT is
 * compared against Redis. If they don't match, the session is invalid
 * (another device logged in).
 * 
 * Redis key: session:{professorId} → sessionId
 * Lookup: O(1)
 */
export class SessionService {
    private redis: Redis;

    constructor() {
        const redisUrl = new URL(env.REDIS_URL);
        this.redis = new Redis({
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port) || 6379,
            password: redisUrl.password || undefined,
            username: redisUrl.username || undefined,
        });
    }

    /**
     * Create a new session for a professor, invalidating any previous session
     * @returns The new sessionId to include in the JWT
     */
    async createSession(professorId: string): Promise<string> {
        const sessionId = randomBytes(16).toString('hex');
        await this.redis.set(
            `${SESSION_PREFIX}${professorId}`,
            sessionId,
            'EX',
            180 * 24 * 60 * 60 // 180 days (matches JWT expiry)
        );
        return sessionId;
    }

    /**
     * Validate that a sessionId matches the current active session
     * @returns true if valid, false if another session replaced it
     */
    async validateSession(professorId: string, sessionId: string): Promise<boolean> {
        const currentSessionId = await this.redis.get(`${SESSION_PREFIX}${professorId}`);
        return currentSessionId === sessionId;
    }

    /**
     * Close Redis connection
     */
    async close(): Promise<void> {
        await this.redis.quit();
    }
}

// Singleton
export const sessionService = new SessionService();
