import { describe, expect, it } from 'vitest';
import { attendanceEnvSchema } from '../infrastructure/config.js';
import { buildAttendanceApp } from './app.js';

const token = 'test-internal-service-token-with-at-least-32-characters';

describe('Attendance HTTP API', () => {
  it('hides device binding creation from unauthenticated callers', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'POST', url: '/internal/v1/attendance/device-bindings/initial', payload: {} });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('returns a scoped token after an initial UAT-authorized binding', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/device-bindings/initial',
      headers: { 'x-internal-service-token': token, 'x-correlation-id': 'request-1' },
      payload: {
        matricula: '2251330007', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
        deviceBindingId: '12345678-1234-4234-9234-123456789abd', platform: 'android',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.bindingToken.split('.')).toHaveLength(3);
    await app.close();
  });

  it('requires idempotency for captures', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/captures', headers: { 'x-internal-service-token': token }, payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('IDEMPOTENCY_KEY_REQUIRED');
    await app.close();
  });

  it('protects and exposes the coordination reconciliation snapshot internally', async () => {
    const app = await testApp();
    const hidden = await app.inject({ method: 'GET', url: '/internal/v1/attendance/coordination-projection' });
    expect(hidden.statusCode).toBe(404);
    const response = await app.inject({
      method: 'GET', url: '/internal/v1/attendance/coordination-projection',
      headers: { 'x-internal-service-token': token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    await app.close();
  });

  it('keeps the authoritative binding list private', async () => {
    const app = await testApp();
    expect((await app.inject({ method: 'GET', url: '/internal/v1/attendance/device-bindings' })).statusCode).toBe(404);
    const response = await app.inject({
      method: 'GET', url: '/internal/v1/attendance/device-bindings?q=2251',
      headers: { 'x-internal-service-token': token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    await app.close();
  });
});

async function testApp() {
  const now = new Date('2026-08-02T12:00:00.000Z');
  return buildAttendanceApp({
    env: attendanceEnvSchema.parse({
      NODE_ENV: 'test', INTERNAL_API_TOKEN: token,
      BINDING_JWT_SECRET: 'test-binding-jwt-secret-with-at-least-32-characters',
    }),
    repository: {
      applyRoster: async () => {}, coordinationProjectionSnapshot: async () => [],
      listDeviceBindings: async () => [], bindingInfrastructureSummary: async () => ({ count: 0, recentBindings: [] }),
    } as never,
    captures: { capture: async () => { throw new Error('unexpected'); } } as never,
    bindings: {
      bindAfterUatAuthentication: async (command: { matricula: string; attendanceUuid: string; deviceBindingId?: string }) => ({
        binding: {
          id: 'binding-1', matricula: command.matricula, attendanceUuid: command.attendanceUuid,
          deviceBindingId: command.deviceBindingId ?? null, platform: 'android', deviceInfo: null,
          bindingVersion: 1, active: true, updatedAt: now,
        },
        created: true, duplicate: false,
      }),
    } as never,
    ready: async () => ({ database: true, rabbitmq: true }),
  });
}
