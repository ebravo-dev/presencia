import { env } from '../../config/env.js';
import type { IUatSessionRepository } from '../../domain/repositories/session-store.repository.js';
import type { StoredUatSession, StoredUatSessionBase } from '../../domain/types/uat.interfaces.js';

export class MemoryUatSessionStore<TSession extends StoredUatSessionBase = StoredUatSession> implements IUatSessionRepository<TSession> {
  private readonly sessions = new Map<string, TSession>();

  constructor(private readonly ttlMs = env.UAT_SESSION_TTL_MINUTES * 60 * 1000) {}

  async create(sessionId: string, session: TSession): Promise<void> {
    this.cleanupExpired();
    this.touch(session);
    this.sessions.set(sessionId, session);
  }

  async get(sessionId: string): Promise<TSession | null> {
    this.cleanupExpired();

    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (this.isExpired(session)) {
      this.sessions.delete(sessionId);
      return null;
    }

    this.touch(session);
    return session;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async size(): Promise<number> {
    this.cleanupExpired();
    return this.sessions.size;
  }

  private cleanupExpired(): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isExpired(session)) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private isExpired(session: TSession): boolean {
    return session.expiresAt.getTime() <= Date.now();
  }

  private touch(session: TSession): void {
    const now = new Date();
    session.lastUsedAt = now;
    session.expiresAt = new Date(now.getTime() + this.ttlMs);
  }
}
