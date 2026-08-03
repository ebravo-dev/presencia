import type { Redis } from 'ioredis';

export interface SessionKeyValueStore {
  get(key: string): Promise<string | null>;
  setWithTtl(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  scan(cursor: string, pattern: string, count: number): Promise<readonly [string, string[]]>;
}

export class RedisKeyValueStore implements SessionKeyValueStore {
  constructor(private readonly redis: Redis) {}

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async setWithTtl(key: string, value: string, ttlMs: number): Promise<void> {
    await this.redis.set(key, value, 'PX', ttlMs);
  }

  async delete(key: string): Promise<boolean> {
    return (await this.redis.del(key)) > 0;
  }

  scan(cursor: string, pattern: string, count: number): Promise<[string, string[]]> {
    return this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
  }
}
