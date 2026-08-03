import { describe, expect, it } from 'vitest';
import { CoordinatorAuthService } from './coordinator-auth.service.js';

describe('CoordinatorAuthService', () => {
  it('uses the Identity identity id for authorization and audit context', async () => {
    const service = new CoordinatorAuthService({
      createStaffSession: async () => ({
        user: {
          id: 'staff-account-1', identityId: 'identity-1', email: 'coord@uat.edu.mx',
          name: 'Coordinación', role: 'COORDINATOR', disabled: false,
        },
        identityId: 'identity-1', sessionId: 'session-1', accessToken: 'token-1',
        expiresAt: '2026-08-03T00:00:00.000Z',
      }),
      verify: async () => ({
        valid: true,
        identity: { id: 'identity-1', email: 'coord@uat.edu.mx', displayName: 'Coordinación', role: 'COORDINATOR', disabledAt: null },
      }),
    } as never);

    await expect(service.login('coord@uat.edu.mx', 'password')).resolves.toMatchObject({
      token: 'token-1', user: { id: 'identity-1', role: 'COORDINATOR' },
    });
    await expect(service.authenticate('token-1')).resolves.toEqual({
      id: 'identity-1', email: 'coord@uat.edu.mx', name: 'Coordinación', role: 'COORDINATOR',
    });
  });
});
