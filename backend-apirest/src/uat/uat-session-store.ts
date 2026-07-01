import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { UatSessionNotFoundError } from '../errors/api-error.js';
import { UatPortalClient } from './uat-client.js';
import type { UatCredentials, UatLoginResponse } from './uat.types.js';

export interface StoredUatSession {
  id: string;
  client: UatPortalClient;
  login: UatLoginResponse;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export class UatSessionStore {
  private readonly sessions = new Map<string, StoredUatSession>();

  constructor(private readonly ttlMs: number) {}

  async create(credentials: UatCredentials): Promise<StoredUatSession> {
    this.cleanupExpired();

    const client = new UatPortalClient();
    const login = await client.authenticate(credentials);
    const now = new Date();
    const session: StoredUatSession = {
      id: randomUUID(),
      client,
      login,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): StoredUatSession {
    this.cleanupExpired();

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new UatSessionNotFoundError(sessionId);
    }

    const now = new Date();
    if (session.expiresAt.getTime() <= now.getTime()) {
      this.sessions.delete(sessionId);
      throw new UatSessionNotFoundError(sessionId);
    }

    session.lastUsedAt = now;
    session.expiresAt = new Date(now.getTime() + this.ttlMs);
    return session;
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  size(): number {
    this.cleanupExpired();
    return this.sessions.size;
  }

  private cleanupExpired(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt.getTime() <= now) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

export const uatSessionStore = new UatSessionStore(env.UAT_SESSION_TTL_MINUTES * 60 * 1000);
