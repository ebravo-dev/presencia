import { describe, expect, it } from 'vitest';
import { DeviceBindingService } from '../application/device-binding.service.js';
import { ClassroomBeaconService } from '../application/classroom-beacon.service.js';
import { PresenceObservationService } from '../application/presence-observation.service.js';
import { attendanceEnvSchema } from '../infrastructure/config.js';
import { buildAttendanceApp } from './app.js';

const token = 'test-internal-service-token-with-at-least-32-characters';

describe('Attendance HTTP API', () => {
  it('rejects an invalid campus timezone during startup', () => {
    expect(() => attendanceEnvSchema.parse({ APP_TIME_ZONE: 'Campus/Unknown' })).toThrow();
  });

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
        matricula: '9900000001', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
        deviceBindingId: '12345678-1234-4234-9234-123456789abd', platform: 'android',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.bindingToken.split('.')).toHaveLength(3);
    await app.close();
  });

  it('rejects an initial binding without a complete phone identity', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/device-bindings/initial',
      headers: { 'x-internal-service-token': token },
      payload: {
        matricula: '9900000001',
        attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('lets the student app refresh only its exact active binding through the public route', async () => {
    const app = await testApp();
    const initial = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/device-bindings/initial',
      headers: { 'x-internal-service-token': token },
      payload: {
        matricula: '9900000001', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
        deviceBindingId: '12345678-1234-4234-9234-123456789abd', platform: 'android',
      },
    });
    const bindingToken = initial.json().data.bindingToken as string;
    const response = await app.inject({
      method: 'POST', url: '/api/student-device-bindings',
      headers: { authorization: `Bearer ${bindingToken}` },
      payload: {
        matricula: '9900000001', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
        deviceBindingId: '12345678-1234-4234-9234-123456789abd', platform: 'android',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ matricula: '9900000001', bindingVersion: 1 });
    expect(response.json().data.bindingToken.split('.')).toHaveLength(3);
    await app.close();
  });

  it('rejects public binding reconciliation without the scoped token', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'POST', url: '/api/student-device-bindings', payload: {} });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('UNAUTHORIZED');
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

  it('forces external upload skipping for captures when demo mode is active', async () => {
    let command: Record<string, unknown> | undefined;
    const app = await testApp({
      debugMode: true,
      capture: async (input) => {
        command = input as unknown as Record<string, unknown>;
        return {
          attendanceSessionId: 'session-demo', externalGroupId: '990000', date: '2026-08-03',
          entriesCount: 1, uploadStatus: 'SKIPPED', duplicate: false, version: 1,
        };
      },
    });
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/captures',
      headers: { 'x-internal-service-token': token, 'idempotency-key': '74b29734-65a8-48b2-9e6e-8cd01f1a0016' },
      payload: {
        externalGroupId: '990000', professorExternalId: '90000', date: '2026-08-03',
        entries: [{ matricula: 'DEMO0001', status: 'PRESENT' }],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().data.uploadStatus).toBe('SKIPPED');
    expect(command).toMatchObject({ skipExternalUpload: true });
    await app.close();
  });

  it('allows attendance cleanup only when demo mode is active', async () => {
    let resets = 0;
    const disabled = await testApp({ resetDemoData: async () => { resets += 1; } });
    expect((await disabled.inject({
      method: 'DELETE', url: '/internal/v1/attendance/demo-data', headers: { 'x-internal-service-token': token },
    })).statusCode).toBe(404);
    await disabled.close();

    const enabled = await testApp({ debugMode: true, resetDemoData: async () => { resets += 1; } });
    expect((await enabled.inject({
      method: 'DELETE', url: '/internal/v1/attendance/demo-data', headers: { 'x-internal-service-token': token },
    })).statusCode).toBe(204);
    expect(resets).toBe(1);
    await enabled.close();
  });

  it('rejects professor timestamps on attendance captures', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/captures',
      headers: {
        'x-internal-service-token': token,
        'idempotency-key': '74b29734-65a8-48b2-9e6e-8cd01f1a0016',
      },
      payload: {
        externalGroupId: '947699', professorExternalId: 'teacher-1', date: '2026-08-02',
        professorEntryAt: '2026-08-02T08:00:00.000Z',
        entries: [{ matricula: '9900000001', status: 'PRESENT' }],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('VALIDATION_ERROR');
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

  it('serves dashboard telemetry only on the internal summary route', async () => {
    const app = await testApp();
    const hidden = await app.inject({ method: 'GET', url: '/internal/v1/attendance/infrastructure/summary' });
    expect(hidden.statusCode).toBe(404);
    const response = await app.inject({
      method: 'GET', url: '/internal/v1/attendance/infrastructure/summary',
      headers: { 'x-internal-service-token': token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.counts).toEqual({
      beacons: 0, studentDeviceBindings: 0, studentBleAttendances: 0,
    });
    await app.close();
  });

  it('resolves bindings only through the private professor-scoped command', async () => {
    const app = await testApp();
    const hidden = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/device-bindings/resolve',
      payload: { professorExternalId: 'teacher-1', matriculas: ['9900000001'] },
    });
    expect(hidden.statusCode).toBe(404);
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/device-bindings/resolve',
      headers: { 'x-internal-service-token': token },
      payload: { professorExternalId: 'teacher-1', matriculas: ['9900000001'] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], missing: [] });
    await app.close();
  });

  it('keeps beacon administration private and records coordinator input', async () => {
    const app = await testApp();
    expect((await app.inject({ method: 'GET', url: '/internal/v1/attendance/classroom-beacons' })).statusCode).toBe(404);
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/classroom-beacons',
      headers: { 'x-internal-service-token': token, 'x-correlation-id': 'beacon-request-1' },
      payload: {
        uuid: '12345678-1234-4234-9234-123456789abc', classroom: ' aula á-101 ',
        actorIdentityId: 'coord-1', actorRole: 'COORDINATOR', reason: 'Alta desde el dashboard.',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      uuid: '12345678-1234-4234-9234-123456789abc', classroom: 'AULA Á-101', classroomKey: 'AULAA101',
    });
    await app.close();
  });

  it('resolves classroom beacons only through the professor-scoped private command', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/classroom-beacons/resolve',
      headers: { 'x-internal-service-token': token },
      payload: { professorExternalId: 'teacher-1', classrooms: ['AULA A-101'] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], missing: ['AULA A-101'] });
    await app.close();
  });

  it('accepts only service-authorized classrooms on the rolling-compatibility endpoint', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/classroom-beacons/resolve-authorized',
      headers: { 'x-internal-service-token': token }, payload: { classrooms: ['AULA SUSTITUCIÓN'] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], missing: ['AULA SUSTITUCIÓN'] });
    await app.close();
  });

  it('keeps professor presence private and derives its date from the server clock', async () => {
    const app = await testApp();
    expect((await app.inject({
      method: 'POST', url: '/internal/v1/attendance/presence/professor-entry', payload: {},
    })).statusCode).toBe(404);
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/attendance/presence/professor-entry',
      headers: { 'x-internal-service-token': token },
      payload: {
        professorExternalId: 'teacher-1', externalGroupId: '947699',
        beaconUuid: '12345678-1234-4234-9234-123456789abc',
        clientDetectedAt: '2020-01-01T00:00:00.000Z',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ date: '2026-08-02', professorEntryAt: '2026-08-02T12:00:00.000Z' });
    await app.close();
  });
});

async function testApp(options: {
  debugMode?: boolean;
  capture?: (input: unknown) => Promise<unknown>;
  resetDemoData?: () => Promise<void>;
} = {}) {
  const now = new Date('2026-08-02T12:00:00.000Z');
  const binding = {
    id: 'binding-1', matricula: '9900000001',
    attendanceUuid: '12345678-1234-4234-9234-123456789abc',
    deviceBindingId: '12345678-1234-4234-9234-123456789abd',
    platform: 'android', deviceInfo: null, bindingVersion: 1, active: true, updatedAt: now,
  };
  const repository = {
    applyRoster: async () => {}, coordinationProjectionSnapshot: async () => [],
    resetDemoData: options.resetDemoData ?? (async () => undefined),
    listDeviceBindings: async () => [], bindingInfrastructureSummary: async () => ({ count: 0, recentBindings: [] }),
    infrastructureSummary: async () => ({
      counts: { beacons: 0, studentDeviceBindings: 0, studentBleAttendances: 0 },
      recentBindings: [], recentBeacons: [],
    }),
    bindInitial: async () => ({ binding, created: true, duplicate: false }),
    bindingByMatricula: async () => binding,
    resolveDeviceBindings: async () => ({ data: [], missing: [] }),
    listClassroomBeacons: async () => [],
    createClassroomBeacon: async (input: Record<string, unknown>) => ({
      id: 'beacon-1', uuid: input.uuid, classroom: input.classroom, classroomKey: input.classroomKey,
      createdAt: now, updatedAt: now,
    }),
    updateClassroomBeacon: async () => { throw new Error('unexpected'); },
    deleteClassroomBeacon: async () => {},
    importClassroomBeacons: async () => ({ imported: 0, unchanged: 0 }),
    resolveClassroomBeaconsForProfessor: async (input: { classrooms: Array<{ classroom: string }> }) => ({
      data: [], missing: input.classrooms.map(({ classroom }) => classroom),
    }),
    resolveAuthorizedClassroomBeacons: async (input: Array<{ classroom: string }>) => ({
      data: [], missing: input.map(({ classroom }) => classroom),
    }),
    observeProfessorEntry: async (input: { externalGroupId: string; attendanceDate: string }) => ({
      attendanceSessionId: 'session-1', externalGroupId: input.externalGroupId, date: input.attendanceDate,
      professorEntryAt: now.toISOString(), professorExitAt: null, duplicate: false, version: 1,
    }),
    observeProfessorExit: async (input: { externalGroupId: string; attendanceDate: string }) => ({
      attendanceSessionId: 'session-1', externalGroupId: input.externalGroupId, date: input.attendanceDate,
      professorEntryAt: null, professorExitAt: now.toISOString(), duplicate: false, version: 1,
    }),
    observeStudentPresence: async (input: { externalGroupId: string; attendanceDate: string }) => ({
      attendanceSessionId: 'session-1', externalGroupId: input.externalGroupId, date: input.attendanceDate,
      matchedCount: 0, matched: [], duplicate: false, version: 1,
    }),
  } as never;
  return buildAttendanceApp({
    env: attendanceEnvSchema.parse({
      NODE_ENV: 'test', INTERNAL_API_TOKEN: token,
      BINDING_JWT_SECRET: 'test-binding-jwt-secret-with-at-least-32-characters',
      PRESENCIA_DEBUG_MODE: options.debugMode ?? false,
    }),
    repository,
    captures: { capture: options.capture ?? (async () => { throw new Error('unexpected'); }) } as never,
    bindings: new DeviceBindingService(repository),
    beacons: new ClassroomBeaconService(repository),
    presence: new PresenceObservationService(repository, 'America/Monterrey', () => now),
    ready: async () => ({ database: true, rabbitmq: true }),
  });
}
