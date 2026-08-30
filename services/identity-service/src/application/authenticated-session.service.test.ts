import { describe, expect, it } from 'vitest';
import type { IdentitySessionStore, StoredIdentitySession } from './session-store.js';
import type { IdentityRepository } from '../domain/identity.repository.js';
import { IdentityTokenService } from './token.service.js';
import { AuthenticatedSessionService } from './authenticated-session.service.js';

describe('AuthenticatedSessionService', () => {
  it('issues a revocable audience-bound token only after a verified UAT identity is resolved', async () => {
    const sessions = new FakeSessionStore();
    const service = new AuthenticatedSessionService(
      fakeIdentities,
      sessions,
      new IdentityTokenService(
        'test-active-identity-secret-with-at-least-32-characters',
        undefined,
        'presencia-identity',
        'presencia-apps',
        600,
      ),
      600_000,
    );
    const created = await service.create({
      kind: 'STUDENT',
      role: 'STUDENT',
      institutionalIdentifier: '9900000001',
      displayName: 'Alumno Prueba',
      source: 'UAT_STUDENT',
      correlationId: 'request-1',
      deviceId: 'device-1',
    });

    await expect(service.verify(created.accessToken)).resolves.toMatchObject({ valid: true });
    await service.revoke(created.accessToken);
    await expect(service.verify(created.accessToken)).rejects.toThrow('SESSION_REVOKED');
  });
});

const fakeIdentities: IdentityRepository = {
  async resolveVerified(input) {
    return {
      id: 'identity-1',
      kind: input.kind,
      role: input.role,
      institutionalIdentifier: input.institutionalIdentifier,
      email: input.email ?? null,
      displayName: input.displayName,
      deviceBindingId: input.deviceId ?? null,
      devicePlatform: input.devicePlatform ?? null,
      deviceInfo: input.deviceInfo ?? null,
      disabledAt: null,
      lastAuthenticatedAt: new Date(),
    };
  },
  async findById(id) {
    return id === 'identity-1' ? {
      id,
      kind: 'STUDENT',
      role: 'STUDENT',
      institutionalIdentifier: '9900000001',
      email: null,
      displayName: 'Alumno Prueba',
      deviceBindingId: 'device-1',
      devicePlatform: null,
      deviceInfo: null,
      disabledAt: null,
      lastAuthenticatedAt: new Date(),
    } : null;
  },
  async listRegisteredStudents() { return []; },
  async listRegisteredProfessors() { return []; },
  async findRegisteredStudentByMatricula() { return null; },
  async clearProfessorDeviceBinding() { return null; },
  async resetDemoIdentities() { return ['identity-1']; },
  async purgeAllIdentities() { return ['identity-1']; },
};

class FakeSessionStore implements IdentitySessionStore {
  private readonly sessions = new Map<string, StoredIdentitySession>();

  async replaceActive(session: StoredIdentitySession): Promise<void> {
    for (const [id, existing] of this.sessions) if (existing.identityId === session.identityId) this.sessions.delete(id);
    this.sessions.set(session.sessionId, session);
  }

  async get(sessionId: string): Promise<StoredIdentitySession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async revoke(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async revokeIdentities(identityIds: string[]): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (identityIds.includes(session.identityId)) this.sessions.delete(sessionId);
    }
  }
}
