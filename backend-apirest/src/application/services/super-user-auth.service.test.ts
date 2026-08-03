import { describe, expect, it } from 'vitest';
import { SuperUserAuthService } from './super-user-auth.service.js';

describe('SuperUserAuthService', () => {
  it('accepts only a live SUPER_USER session from Identity', async () => {
    const service = new SuperUserAuthService({
      createSuperUserSession: async () => ({
        user: { role: 'SUPER_USER' }, identityId: 'identity-super', sessionId: 'session-super',
        accessToken: 'token-super', expiresAt: '2026-08-03T00:00:00.000Z',
      }),
      verify: async (token: string) => ({
        valid: true,
        identity: {
          id: token === 'super' ? 'identity-super' : 'identity-coord', email: null,
          displayName: 'Usuario', role: token === 'super' ? 'SUPER_USER' : 'COORDINATOR', disabledAt: null,
        },
      }),
    } as never);

    await expect(service.login('password')).resolves.toMatchObject({ token: 'token-super', user: { id: 'identity-super' } });
    await expect(service.authenticate('super')).resolves.toEqual({ id: 'identity-super', role: 'SUPER_USER' });
    await expect(service.authenticate('coordinator')).resolves.toBeNull();
  });
});
