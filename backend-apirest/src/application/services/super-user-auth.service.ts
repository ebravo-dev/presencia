import { ApiError } from '../../errors/api-error.js';
import type { IdentityServiceClient } from '../../infrastructure/http/client/identity-service.client.js';

export interface SuperUserIdentity {
  readonly id: string;
  readonly role: 'SUPER_USER';
}

export class SuperUserAuthService {
  constructor(private readonly identity: IdentityServiceClient) {}

  async login(password: string) {
    try {
      const session = await this.identity.createSuperUserSession(password);
      return {
        token: session.accessToken,
        expiresAt: new Date(session.expiresAt),
        user: { id: session.identityId, role: 'SUPER_USER' as const },
      };
    } catch (error) {
      if (error instanceof ApiError && ['INVALID_SUPER_USER_PASSWORD', 'IDENTITY_DISABLED'].includes(error.code)) {
        throw new Error('INVALID_SUPER_USER_PASSWORD');
      }
      throw error;
    }
  }

  async authenticate(token?: string): Promise<SuperUserIdentity | null> {
    if (!token) return null;
    try {
      const result = await this.identity.verify(token);
      return result.identity.role === 'SUPER_USER'
        ? { id: result.identity.id, role: 'SUPER_USER' }
        : null;
    } catch {
      return null;
    }
  }

  async logout(token?: string): Promise<void> {
    if (token) await this.identity.revoke(token);
  }
}
