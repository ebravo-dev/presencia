import { randomUUID } from 'node:crypto';
import type { IdentityRepository } from '../domain/identity.repository.js';
import type { Identity, ResolveVerifiedIdentityInput } from '../domain/identity.js';
import type { IdentitySessionStore, StoredIdentitySession } from './session-store.js';
import { IdentityTokenService } from './token.service.js';

export interface CreateAuthenticatedSessionInput extends ResolveVerifiedIdentityInput {
  readonly deviceId?: string | undefined;
  readonly devicePlatform?: string | undefined;
  readonly deviceInfo?: string | undefined;
}

export class AuthenticatedSessionService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly sessions: IdentitySessionStore,
    private readonly tokens: IdentityTokenService,
    private readonly ttlMs: number,
  ) {}

  async create(input: CreateAuthenticatedSessionInput, ttlMs = this.ttlMs) {
    const identity = await this.identities.resolveVerified(input);
    if (identity.disabledAt) throw new Error('IDENTITY_DISABLED');
    const now = new Date();
    const session: StoredIdentitySession = {
      sessionId: randomUUID(),
      identityId: identity.id,
      role: identity.role,
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    await this.sessions.replaceActive(session, ttlMs);
    return {
      identity,
      sessionId: session.sessionId,
      accessToken: this.tokens.sign(identity, session.sessionId, Math.ceil(ttlMs / 1_000)),
      expiresAt: session.expiresAt,
    };
  }

  async verify(token: string): Promise<{ valid: true; claims: ReturnType<IdentityTokenService['verify']>; identity: Identity }> {
    const claims = this.tokens.verify(token);
    const session = await this.sessions.get(claims.sessionId);
    if (!session || session.identityId !== claims.sub) throw new Error('SESSION_REVOKED');
    const identity = await this.identities.findById(claims.sub);
    if (!identity || identity.disabledAt) throw new Error('IDENTITY_DISABLED');
    return { valid: true, claims, identity };
  }

  async revoke(token: string): Promise<void> {
    const claims = this.tokens.verify(token);
    await this.sessions.revoke(claims.sessionId, claims.sub);
  }

  listRegisteredStudents(): Promise<Identity[]> {
    return this.identities.listRegisteredStudents();
  }

  listRegisteredProfessors(): Promise<Identity[]> {
    return this.identities.listRegisteredProfessors();
  }

  registeredStudentByMatricula(matricula: string): Promise<Identity | null> {
    return this.identities.findRegisteredStudentByMatricula(matricula);
  }

  async clearProfessorDeviceBinding(
    institutionalIdentifier: string,
    input: { actorIdentityId: string; correlationId: string; reason: string },
  ): Promise<boolean> {
    const identityId = await this.identities.clearProfessorDeviceBinding(institutionalIdentifier, input);
    if (!identityId) return false;
    await this.sessions.revokeIdentities([identityId]);
    return true;
  }

  async resetDemoIdentities(): Promise<number> {
    const identityIds = await this.identities.resetDemoIdentities();
    await this.sessions.revokeIdentities(identityIds);
    return identityIds.length;
  }

  async purgeAllIdentities(): Promise<number> {
    const identityIds = await this.identities.purgeAllIdentities();
    await this.sessions.revokeIdentities(identityIds);
    return identityIds.length;
  }
}
