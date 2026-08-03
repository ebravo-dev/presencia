import { describe, expect, it } from 'vitest';
import { issueBindingToken, verifyBindingToken } from './binding-token.js';

const secret = 'binding-token-secret-with-at-least-32-characters';

describe('binding token', () => {
  it('round-trips only the scoped device identity and binding version', async () => {
    const token = await issueBindingToken({
      id: 'binding-1', matricula: '2251330007',
      attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      deviceBindingId: '12345678-1234-4234-9234-123456789abd',
      platform: 'android', deviceInfo: 'test', bindingVersion: 2, active: true,
      updatedAt: new Date('2026-08-03T12:00:00.000Z'),
    }, secret);
    await expect(verifyBindingToken(token, secret)).resolves.toEqual({
      subject: 'binding-1', matricula: '2251330007',
      deviceBindingId: '12345678-1234-4234-9234-123456789abd', bindingVersion: 2,
    });
  });

  it('rejects a token signed by another service', async () => {
    const token = await issueBindingToken({
      id: 'binding-1', matricula: '2251330007',
      attendanceUuid: '12345678-1234-4234-9234-123456789abc', deviceBindingId: null,
      platform: null, deviceInfo: null, bindingVersion: 1, active: true,
      updatedAt: new Date('2026-08-03T12:00:00.000Z'),
    }, secret);
    await expect(verifyBindingToken(token, 'different-secret-with-at-least-32-characters')).rejects.toThrow();
  });
});
