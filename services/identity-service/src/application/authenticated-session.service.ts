import { randomUUID } from 'node:crypto';
import type { IdentityRepository } from '../domain/identity.repository.js';
import type { ResolveVerifiedIdentityInput } from '../domain/identity.js';
import type { IdentitySessionStore, StoredIdentitySession } from './session-store.js';
import { IdentityTokenService } from './token.service.js';

export interface CreateAuthenticatedSessionInput extends ResolveVerifiedIdentityInput {
  readonly deviceId?: string | undefined;
}

export class AuthenticatedSessionService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly sessions: IdentitySessionStore,
    private readonly tokens: IdentityTokenService,
    private readonly ttlMs: number,
  ) {}

  async create(input: CreateAuthenticatedSessionInput) {
    const identity = await this.identities.resolveVerified(input);
    if (identity.disabledAt) throw new Error('IDENTITY_DISABLED');
    const now = new Date();
    const session: StoredIdentitySession = {
      sessionId: randomUUID(),
      identityId: identity.id,
      role: identity.role,
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
    await this.sessions.replaceActive(session, this.ttlMs);
    return {
      identity,
      sessionId: session.sessionId,
      accessToken: this.tokens.sign(identity, session.sessionId),
      expiresAt: session.expiresAt,
    };
  }

  async verify(token: string): Promise<{ valid: true; claims: ReturnType<IdentityTokenService['verify']> }> {
    const claims = this.tokens.verify(token);
    const session = await this.sessions.get(claims.sessionId);
    if (!session || session.identityId !== claims.sub) throw new Error('SESSION_REVOKED');
    return { valid: true, claims };
  }

  async revoke(token: string): Promise<void> {
    const claims = this.tokens.verify(token);
    await this.sessions.revoke(claims.sessionId, claims.sub);
  }
}
