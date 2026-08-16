import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { DemoPortalStatus } from '../../../infrastructure/http/client/demo-portal.client.js';
import { ApiError } from '../../../errors/api-error.js';
import {
  resetDemoEnvironment,
  superUserRoutes,
  synchronizeAfterDemoMutation,
  synchronizeDemoCatalog,
} from './super-user.routes.js';

describe('superUserRoutes', () => {
  it('keeps the public contract while delegating beacon writes with the Identity actor', async () => {
    const createBeacon = vi.fn(async () => ({ data: { id: 'beacon-1', classroom: 'AULA 1', uuid: '12345678' } }));
    const createStaffAccount = vi.fn(async () => ({ data: { id: 'staff-1' } }));
    const cycleStatus = { data: {
      active: { externalId: 152, year: 2026, term: 3, name: '2026 - 3 OTOÑO', revision: 1, updatedAt: '2026-08-05T00:00:00.000Z', updatedByIdentityId: null },
      availableCycles: [], lockedCycles: [], nextUnlockAt: '2027-01-01T00:00:00', timeZone: 'America/Monterrey',
    } };
    const changeActiveAcademicCycle = vi.fn(async () => cycleStatus);
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
      academicService: { activeAcademicCycle: vi.fn(async () => cycleStatus), changeActiveAcademicCycle } as never,
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

    const cycleResponse = await app.inject({
      method: 'PUT', url: '/api/superUsuario/ciclo-escolar',
      headers: { cookie: 'super_user_session=identity-token' }, payload: { cycleExternalId: 152 },
    });
    expect(cycleResponse.statusCode).toBe(200);
    expect(changeActiveAcademicCycle).toHaveBeenCalledWith(expect.objectContaining({
      cycleExternalId: 152, actorIdentityId: 'identity-super', actorRole: 'SUPER_USER',
      reason: 'Cambio del ciclo escolar activo desde super usuario.',
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

  it('attempts every demo cleanup and identifies the failing component', async () => {
    const demoPortal = { resetData: vi.fn(async () => ({
      data: { deleted: { teachers: 0, students: 0, classes: 0, attendanceWrites: 0 } },
    })) };
    const identityService = { resetDemoData: vi.fn(async () => ({ data: { identities: 0 } })) };
    const academicService = { resetDemoData: vi.fn(async () => {
      throw new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Error interno del servidor.');
    }) };
    const attendanceService = { resetDemoData: vi.fn(async () => undefined) };
    const coordinationQuery = { resetDemoData: vi.fn(async () => undefined) };
    const resetLocalDemoData = vi.fn(async () => ({ teacherSessions: 0, studentSessions: 0 }));

    await expect(resetDemoEnvironment({
      demoPortal: demoPortal as never,
      identityService: identityService as never,
      academicService: academicService as never,
      attendanceService: attendanceService as never,
      coordinationQuery: coordinationQuery as never,
      resetLocalDemoData,
    })).rejects.toMatchObject({
      statusCode: 503,
      code: 'DEMO_RESET_FAILED',
      details: { failed: [{ component: 'Academic Service', code: 'INTERNAL_SERVER_ERROR', statusCode: 500 }] },
    });
    expect(demoPortal.resetData).toHaveBeenCalledOnce();
    expect(identityService.resetDemoData).toHaveBeenCalledOnce();
    expect(resetLocalDemoData).toHaveBeenCalledOnce();
    expect(attendanceService.resetDemoData).toHaveBeenCalledOnce();
    expect(coordinationQuery.resetDemoData).toHaveBeenCalledOnce();
  });

  it('synchronizes demo snapshots sequentially and reuses stable snapshot ids', async () => {
    const status = demoStatus();
    let activeAcademicWrites = 0;
    let maxConcurrentAcademicWrites = 0;
    const snapshotIds: string[] = [];
    const recordSnapshot = async (snapshot: { snapshotId: string }) => {
      activeAcademicWrites += 1;
      maxConcurrentAcademicWrites = Math.max(maxConcurrentAcademicWrites, activeAcademicWrites);
      snapshotIds.push(snapshot.snapshotId);
      await Promise.resolve();
      activeAcademicWrites -= 1;
    };
    const services = {
      demoPortal: { status: vi.fn(async () => ({ data: status })) },
      academicService: {
        publishProfessorSnapshot: vi.fn(recordSnapshot),
        publishStudentSnapshot: vi.fn(recordSnapshot),
      },
      attendanceService: {
        listClassroomBeacons: vi.fn(async () => ({ data: [] })),
        applyRoster: vi.fn(async () => undefined),
      },
    };

    await synchronizeDemoCatalog(services as never, 'super-user-id', 'correlation-1');
    await synchronizeDemoCatalog(services as never, 'super-user-id', 'correlation-2');

    expect(maxConcurrentAcademicWrites).toBe(1);
    expect(snapshotIds).toHaveLength(4);
    expect(snapshotIds[0]).toBe(snapshotIds[2]);
    expect(snapshotIds[1]).toBe(snapshotIds[3]);
    expect(snapshotIds[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('reports a saved demo mutation as pending instead of throwing a false 500', async () => {
    const status = demoStatus();
    const publishProfessorSnapshot = vi.fn(async () => {
      throw new ApiError(503, 'ACADEMIC_SERVICE_UNAVAILABLE', 'Academic Service no está disponible.');
    });
    const logger = { error: vi.fn() };

    const result = await synchronizeAfterDemoMutation({
      demoPortal: { status: vi.fn(async () => ({ data: status })) } as never,
      academicService: { publishProfessorSnapshot, publishStudentSnapshot: vi.fn() } as never,
      attendanceService: { listClassroomBeacons: vi.fn(async () => ({ data: [] })), applyRoster: vi.fn() } as never,
    }, 'super-user-id', 'correlation-1', logger as never);

    expect(publishProfessorSnapshot).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      catalog: status,
      synchronization: { status: 'PENDING', attempts: 3, error: 'ACADEMIC_SERVICE_UNAVAILABLE' },
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

function demoStatus(): DemoPortalStatus {
  const updatedAt = '2026-08-03T22:00:00.000Z';
  return {
    enabled: true,
    cycleId: 20263,
    cycleName: '2026-3',
    coordinationId: 99,
    coordinationName: 'Coordinación demo',
    settings: { teacherAttendanceToleranceMinutes: 10 },
    updatedAt,
    attendanceWrites: [],
    classes: [],
    teachers: [{
      id: '4b97db38-dbb4-466f-9633-9c8a3a53deaa', externalId: 'demo-teacher-1',
      email: 'teacher@demo.local', name: 'Profesora Demo', createdAt: updatedAt, updatedAt,
    }],
    students: [{
      id: '9e008c58-e4a3-4a79-9fd2-ad46f70b4692', uatStudentId: 990001,
      matricula: '990001', email: 'student@demo.local', name: 'Alumno Demo',
      attendanceUuid: '3c9f5afd-a116-44a7-8dc5-9b6e33900001', careerName: 'Carrera demo',
      createdAt: updatedAt, updatedAt,
    }],
  };
}
