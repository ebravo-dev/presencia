import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdentityServiceClient } from './identity-service.client.js';

describe('IdentityServiceClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends verified identity facts without institutional credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        identity: { id: 'identity-1' },
        sessionId: 'session-1',
        accessToken: 'signed-token',
        expiresAt: '2026-08-02T13:00:00.000Z',
      },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const client = new IdentityServiceClient(
      'http://identity-service:3200',
      'test-internal-service-token-with-at-least-32-characters',
    );

    const result = await client.createAuthenticatedSession({
      kind: 'STUDENT',
      role: 'STUDENT',
      institutionalIdentifier: '2251330007',
      displayName: 'Alumno',
      source: 'UAT_STUDENT',
      correlationId: 'request-1',
      deviceId: 'device-1',
    });

    expect(result?.accessToken).toBe('signed-token');
    const request = fetchMock.mock.calls[0]?.[1];
    expect(String(request?.body)).not.toContain('password');
    expect(JSON.parse(String(request?.body))).toMatchObject({ institutionalIdentifier: '2251330007' });
  });

  it('fails visibly when Identity Service is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
    const client = new IdentityServiceClient('http://identity-service:3200', 'x'.repeat(32));
    await expect(client.createAuthenticatedSession({
      kind: 'PROFESSOR', role: 'PROFESSOR', institutionalIdentifier: '123',
      displayName: 'Profesor', source: 'UAT_TEACHER', correlationId: 'request-1',
    })).rejects.toMatchObject({ statusCode: 503, code: 'IDENTITY_SERVICE_UNAVAILABLE' });
  });

  it('delegates staff credential verification and account administration to Identity', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        user: { id: 'staff-1', identityId: 'identity-1', email: 'coord@uat.edu.mx', name: 'Coord', role: 'COORDINATOR', disabled: false },
        identityId: 'identity-1', sessionId: 'session-1', accessToken: 'token-1', expiresAt: '2026-08-03T00:00:00.000Z',
      },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const client = new IdentityServiceClient('http://identity-service:3200', 'x'.repeat(32));

    await expect(client.createStaffSession('coord@uat.edu.mx', 'password')).resolves.toMatchObject({ accessToken: 'token-1' });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'coord@uat.edu.mx', password: 'password' }),
    }));
  });
});
