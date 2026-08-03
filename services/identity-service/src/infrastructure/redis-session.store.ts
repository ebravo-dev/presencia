import type { Redis } from 'ioredis';
import type { IdentitySessionStore, StoredIdentitySession } from '../application/session-store.js';

const REPLACE_ACTIVE_SESSION_LUA = `
local previous = redis.call('GET', KEYS[1])
if previous and previous ~= ARGV[1] then
  redis.call('DEL', KEYS[3] .. previous)
end
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
return previous
`;

export class RedisIdentitySessionStore implements IdentitySessionStore {
  constructor(private readonly redis: Redis, private readonly prefix = 'presencia:identity') {}

  async replaceActive(session: StoredIdentitySession, ttlMs: number): Promise<void> {
    await this.redis.eval(
      REPLACE_ACTIVE_SESSION_LUA,
      3,
      this.activeKey(session.identityId),
      this.sessionKey(session.sessionId),
      `${this.prefix}:session:`,
      session.sessionId,
      JSON.stringify(session),
      String(ttlMs),
    );
  }

  async get(sessionId: string): Promise<StoredIdentitySession | null> {
    const value = await this.redis.get(this.sessionKey(sessionId));
    return value ? JSON.parse(value) as StoredIdentitySession : null;
  }

  async revoke(sessionId: string, identityId: string): Promise<void> {
    const transaction = this.redis.multi();
    transaction.del(this.sessionKey(sessionId));
    transaction.del(this.activeKey(identityId));
    await transaction.exec();
  }

  async revokeIdentities(identityIds: string[]): Promise<void> {
    for (const identityId of identityIds) {
      const sessionId = await this.redis.get(this.activeKey(identityId));
      const transaction = this.redis.multi();
      transaction.del(this.activeKey(identityId));
      if (sessionId) transaction.del(this.sessionKey(sessionId));
      await transaction.exec();
    }
  }

  private activeKey(identityId: string): string {
    return `${this.prefix}:active:${identityId}`;
  }

  private sessionKey(sessionId: string): string {
    return `${this.prefix}:session:${sessionId}`;
  }
}
