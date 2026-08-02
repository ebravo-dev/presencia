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
        kind: 'STUDENT', role: 'STUDENT', institutionalIdentifier: '2251330007',
        displayName: 'Alumno', source: 'UAT_STUDENT', correlationId: 'request-1',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.accessToken).toBe('signed-token');
    await app.close();
  });
});
