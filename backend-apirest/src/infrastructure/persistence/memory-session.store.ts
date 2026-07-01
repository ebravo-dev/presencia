import { env } from '../../config/env.js';
import type { IUatSessionRepository } from '../../domain/repositories/session-store.repository.js';
import type { StoredUatSession } from '../../domain/types/uat.interfaces.js';

export class MemoryUatSessionStore implements IUatSessionRepository {
  private readonly sessions = new Map<string, StoredUatSession>();

  constructor(private readonly ttlMs = env.UAT_SESSION_TTL_MINUTES * 60 * 1000) {}

  async create(sessionId: string, session: StoredUatSession): Promise<void> {
    this.cleanupExpired();
    this.touch(session);
    this.sessions.set(sessionId, session);
  }

  async get(sessionId: string): Promise<StoredUatSession | null> {
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

  private isExpired(session: StoredUatSession): boolean {
    return session.expiresAt.getTime() <= Date.now();
  }

  private touch(session: StoredUatSession): void {
    const now = new Date();
    session.lastUsedAt = now;
    session.expiresAt = new Date(now.getTime() + this.ttlMs);
  }
}
