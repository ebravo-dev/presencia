export interface StoredIdentitySession {
  readonly sessionId: string;
  readonly identityId: string;
  readonly role: string;
  readonly deviceId?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface IdentitySessionStore {
  replaceActive(session: StoredIdentitySession, ttlMs: number): Promise<void>;
  get(sessionId: string): Promise<StoredIdentitySession | null>;
  revoke(sessionId: string, identityId: string): Promise<void>;
  revokeIdentities(identityIds: string[]): Promise<void>;
}
