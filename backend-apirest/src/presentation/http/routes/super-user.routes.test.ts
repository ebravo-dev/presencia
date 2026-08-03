import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { resetDemoEnvironment, superUserRoutes } from './super-user.routes.js';

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
      coordinationQuery: {} as never,
      demoPortal: {} as never,
      resetLocalDemoData: async () => ({ teacherSessions: 0, studentSessions: 0 }),
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
    const disabledReset = await app.inject({
      method: 'DELETE', url: '/api/superUsuario/debug/data',
      headers: { cookie: 'super_user_session=identity-token' },
      payload: { confirmation: 'BORRAR DEMO' },
    });
    expect(disabledReset.statusCode).toBe(404);
    await app.close();
  });

  it('coordinates every isolated demo store during a reset', async () => {
    const demoPortal = { resetData: vi.fn(async () => ({
      data: { deleted: { teachers: 2, students: 4, classes: 3, attendanceWrites: 5 } },
    })) };
    const identityService = { resetDemoData: vi.fn(async () => ({ data: { identities: 6 } })) };
    const academicService = { resetDemoData: vi.fn(async () => undefined) };
    const attendanceService = { resetDemoData: vi.fn(async () => undefined) };
    const coordinationQuery = { resetDemoData: vi.fn(async () => undefined) };
    const resetLocalDemoData = vi.fn(async () => ({ teacherSessions: 7, studentSessions: 8 }));

    await expect(resetDemoEnvironment({
      demoPortal: demoPortal as never,
      identityService: identityService as never,
      academicService: academicService as never,
      attendanceService: attendanceService as never,
      coordinationQuery: coordinationQuery as never,
      resetLocalDemoData,
    })).resolves.toEqual({
      teachers: 2, students: 4, classes: 3, attendanceWrites: 5,
      identities: 6, teacherSessions: 7, studentSessions: 8,
    });
    expect(academicService.resetDemoData).toHaveBeenCalledOnce();
    expect(attendanceService.resetDemoData).toHaveBeenCalledOnce();
    expect(coordinationQuery.resetDemoData).toHaveBeenCalledOnce();
  });
});
