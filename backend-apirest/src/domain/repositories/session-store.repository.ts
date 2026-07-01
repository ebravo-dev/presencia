import type { StoredUatSession } from '../types/uat.interfaces.js';

export interface IUatSessionRepository {
  create(sessionId: string, session: StoredUatSession): Promise<void>;
  get(sessionId: string): Promise<StoredUatSession | null>;
  delete(sessionId: string): Promise<boolean>;
  size(): Promise<number>;
}
