import type { IUatSessionRepository } from '../../domain/repositories/session-store.repository.js';
import type { StoredUatSessionBase } from '../../domain/types/uat.interfaces.js';
import type { SessionCodec } from './session-codec.js';
import type { SessionKeyValueStore } from './redis-key-value.store.js';

export interface RedisSessionStoreOptions {
  readonly prefix: string;
  readonly ttlMs: number;
  readonly now?: () => Date;
}

export class RedisUatSessionStore<TSession extends StoredUatSessionBase>
implements IUatSessionRepository<TSession> {
  private readonly now: () => Date;

  constructor(
    private readonly store: SessionKeyValueStore,
    private readonly codec: SessionCodec<TSession>,
    private readonly options: RedisSessionStoreOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async create(sessionId: string, session: TSession): Promise<void> {
    this.touch(session);
    await this.persist(sessionId, session);
  }

  async get(sessionId: string): Promise<TSession | null> {
    const value = await this.store.get(this.key(sessionId));
    if (!value) return null;

    const session = this.codec.decode(value);
    if (session.expiresAt.getTime() <= this.now().getTime()) {
      await this.store.delete(this.key(sessionId));
      return null;
    }

    this.touch(session);
    await this.persist(sessionId, session);
    return session;
  }

  delete(sessionId: string): Promise<boolean> {
    return this.store.delete(this.key(sessionId));
  }

  async size(): Promise<number> {
    let cursor = '0';
    let total = 0;
    do {
      const [nextCursor, keys] = await this.store.scan(cursor, `${this.options.prefix}:*`, 250);
      cursor = nextCursor;
      total += keys.length;
    } while (cursor !== '0');
    return total;
  }

  async clear(): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    do {
      const [nextCursor, keys] = await this.store.scan(cursor, `${this.options.prefix}:*`, 250);
      cursor = nextCursor;
      for (const key of keys) if (await this.store.delete(key)) deleted += 1;
    } while (cursor !== '0');
    return deleted;
  }

  private async persist(sessionId: string, session: TSession): Promise<void> {
    await this.store.setWithTtl(this.key(sessionId), this.codec.encode(session), this.options.ttlMs);
  }

  private key(sessionId: string): string {
    return `${this.options.prefix}:${sessionId}`;
  }

  private touch(session: TSession): void {
    const now = this.now();
    session.lastUsedAt = now;
    session.expiresAt = new Date(now.getTime() + this.options.ttlMs);
  }
}
