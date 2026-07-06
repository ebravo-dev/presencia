import type { StoredUatSession, StoredUatSessionBase } from '../types/uat.interfaces.js';

export interface IUatSessionRepository<TSession extends StoredUatSessionBase = StoredUatSession> {
  create(sessionId: string, session: TSession): Promise<void>;
  get(sessionId: string): Promise<TSession | null>;
  delete(sessionId: string): Promise<boolean>;
  size(): Promise<number>;
}
