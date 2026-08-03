import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { superUserRoutes } from './super-user.routes.js';

describe('superUserRoutes', () => {
  it('keeps the public contract while delegating beacon writes with the Identity actor', async () => {
    const createBeacon = vi.fn(async () => ({ data: { id: 'beacon-1', classroom: 'AULA 1', uuid: '12345678' } }));
    const createStaffAccount = vi.fn(async () => ({ data: { id: 'staff-1' } }));
    const app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(superUserRoutes, {
      authService: {
        login: async () => ({ token: 'identity-token', expiresAt: new Date('2026-08-03T00:00:00.000Z'), user: { id: 'identity-super', role: 'SUPER_USER' } }),
        authenticate: async (token?: string) => token === 'identity-token' ? { id: 'identity-super', role: 'SUPER_USER' } : null,
        logout: async () => undefined,
      } as never,
      identityService: { createStaffAccount } as never,
      attendanceService: { createClassroomBeacon: createBeacon } as never,
      attendanceCapture: {} as never,
      academicService: {} as never,
      demoPortal: {} as never,
    });

    const login = await app.inject({ method: 'POST', url: '/api/superUsuario/auth/login', payload: { password: 'master-password' } });
    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('super_user_session=identity-token');

    const unauthorized = await app.inject({ method: 'POST', url: '/api/superUsuario/beacons', payload: { classroom: 'AULA 1', uuid: '12345678' } });
    expect(unauthorized.statusCode).toBe(401);
    const response = await app.inject({
      method: 'POST', url: '/api/superUsuario/beacons',
      headers: { cookie: 'super_user_session=identity-token' },
      payload: { classroom: 'AULA 1', uuid: '12345678' },
    });
    expect(response.statusCode).toBe(201);
    expect(createBeacon).toHaveBeenCalledWith(expect.objectContaining({
      actorIdentityId: 'identity-super', actorRole: 'SUPER_USER',
    }));
    const staffResponse = await app.inject({
      method: 'POST', url: '/api/superUsuario/coordinadores',
      headers: { cookie: 'super_user_session=identity-token' },
      payload: { email: 'coord@uat.edu.mx', name: 'Coord', password: 'password-123', role: 'COORDINATOR' },
    });
    expect(staffResponse.statusCode).toBe(201);
    expect(createStaffAccount).toHaveBeenCalledWith(expect.objectContaining({
      actorIdentityId: 'identity-super', reason: 'Alta de cuenta coordinadora.',
    }));

    const debugStatus = await app.inject({
      method: 'GET', url: '/api/superUsuario/debug/status',
      headers: { cookie: 'super_user_session=identity-token' },
    });
    expect(debugStatus.statusCode).toBe(200);
    expect(debugStatus.json()).toMatchObject({
      data: { enabled: false, period: 'N/A' },
    });

    const disabledMutation = await app.inject({
      method: 'POST', url: '/api/superUsuario/debug/classes',
      headers: { cookie: 'super_user_session=identity-token' },
      payload: {},
    });
    expect(disabledMutation.statusCode).toBe(404);
    expect(disabledMutation.json()).toMatchObject({ error: 'DEBUG_MODE_DISABLED' });
    await app.close();
  });
});
