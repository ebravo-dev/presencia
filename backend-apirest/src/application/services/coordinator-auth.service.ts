import { ApiError } from '../../errors/api-error.js';
import type { IdentityServiceClient } from '../../infrastructure/http/client/identity-service.client.js';

export interface CoordinatorIdentity { id: string; email: string; name: string; role: string }
export class CoordinatorAuthService {
  constructor(private readonly identity: IdentityServiceClient) {}

  async login(email: string, password: string): Promise<{ token: string; user: CoordinatorIdentity; expiresAt: Date }> {
    try {
      const session = await this.identity.createStaffSession(email, password);
      return { token: session.accessToken, expiresAt: new Date(session.expiresAt), user: toIdentity(session.user) };
    } catch (error) {
      if (error instanceof ApiError && ['INVALID_STAFF_CREDENTIALS', 'IDENTITY_DISABLED'].includes(error.code)) {
        throw new Error('INVALID_COORDINATOR_CREDENTIALS');
      }
      throw error;
    }
  }

  async authenticate(token?: string): Promise<CoordinatorIdentity | null> {
    if (!token) return null;
    try {
      const result = await this.identity.verify(token);
      const user = result.identity;
      if (!user.email || !['COORDINATOR', 'READ_ONLY'].includes(user.role)) return null;
      return { id: user.id, email: user.email, name: user.displayName, role: user.role };
    } catch { return null; }
  }

  async logout(token?: string): Promise<void> {
    if (token) await this.identity.revoke(token);
  }
}

function toIdentity(user: { identityId: string; email: string; name: string; role: string }): CoordinatorIdentity {
  return { id: user.identityId, email: user.email, name: user.name, role: user.role };
}
