import { describe, expect, it } from 'vitest';
import { identityEnvSchema } from '../infrastructure/config.js';
import { buildIdentityApp } from './app.js';

const internalToken = 'test-internal-service-token-with-at-least-32-characters';

describe('Identity HTTP API', () => {
  it('hides internal identity creation without a service token', async () => {
    const app = await buildIdentityApp({
      env: identityEnvSchema.parse({ NODE_ENV: 'test', INTERNAL_API_TOKEN: internalToken }),
      sessions: {
        create: async () => { throw new Error('must not execute'); },
        verify: async () => ({ valid: true, claims: {} }),
        revoke: async () => undefined,
      } as never,
      readiness: { check: async () => ({ database: true, redis: true }) },
    });
    const response = await app.inject({ method: 'POST', url: '/internal/v1/authenticated-sessions', payload: {} });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('accepts facts only from an authenticated internal UAT service', async () => {
    const app = await buildIdentityApp({
      env: identityEnvSchema.parse({ NODE_ENV: 'test', INTERNAL_API_TOKEN: internalToken }),
      sessions: {
        create: async (input: { institutionalIdentifier: string }) => ({
          identity: {
            id: 'identity-1', kind: 'STUDENT', role: 'STUDENT',
            institutionalIdentifier: input.institutionalIdentifier,
            email: null, displayName: 'Alumno', disabledAt: null, lastAuthenticatedAt: new Date(),
          },
          sessionId: 'session-1', accessToken: 'signed-token', expiresAt: new Date().toISOString(),
        }),
      } as never,
      readiness: { check: async () => ({ database: true, redis: true }) },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/internal/v1/authenticated-sessions',
      headers: { 'x-internal-service-token': internalToken },
      payload: {
        kind: 'STUDENT', role: 'STUDENT', institutionalIdentifier: '9900000001',
        displayName: 'Alumno', source: 'UAT_STUDENT', correlationId: 'request-1',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.accessToken).toBe('signed-token');
    await app.close();
  });

  it('keeps staff authentication private and returns the Identity session contract', async () => {
    const app = await buildIdentityApp({
      env: identityEnvSchema.parse({ NODE_ENV: 'test', INTERNAL_API_TOKEN: internalToken }),
      sessions: {} as never,
      staff: {
        login: async () => ({
          user: { id: 'staff-1', identityId: 'identity-1', email: 'coord@uat.edu.mx', name: 'Coord', role: 'COORDINATOR', disabled: false },
          identity: { id: 'identity-1' }, sessionId: 'session-1', accessToken: 'signed-token', expiresAt: '2026-08-03T00:00:00.000Z',
        }),
      } as never,
      readiness: { check: async () => ({ database: true, redis: true }) },
    });

    expect((await app.inject({ method: 'POST', url: '/internal/v1/staff/sessions', payload: {} })).statusCode).toBe(404);
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/staff/sessions',
      headers: { 'x-internal-service-token': internalToken },
      payload: { email: 'coord@uat.edu.mx', password: 'secret' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ identityId: 'identity-1', accessToken: 'signed-token' });
    await app.close();
  });
});
