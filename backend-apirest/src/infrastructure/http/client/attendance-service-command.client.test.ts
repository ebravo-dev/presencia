import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttendanceServiceCommandClient } from './attendance-service-command.client.js';

describe('AttendanceServiceCommandClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the private initial-binding endpoint after UAT authentication', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { bindingToken: 'scoped-token' },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));

    await expect(client.createStudentDeviceBinding({
      matricula: '9900000001', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      deviceBindingId: '12345678-1234-4234-9234-123456789abd', platform: 'android',
    })).resolves.toEqual({ data: { bindingToken: 'scoped-token' } });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://attendance-service:3400/internal/v1/attendance/device-bindings/initial');
    expect(request?.headers).toMatchObject({ 'x-internal-service-token': 'x'.repeat(32) });
  });

  it('writes an authoritative demo roster to the private group endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));
    await client.applyRoster({
      externalGroupId: '990000', uatGroupId: 990000, name: 'Materia demo', groupLetter: 'A',
      professorExternalId: '90000', professorName: 'Profesor Demo', professorEmail: 'profesor.demo@uat.edu.mx',
      classroom: 'DEMO-101', period: '2026-3', schedule: {}, rosterVersion: 'v1',
      rosterObservedAt: '2026-08-03T12:00:00.000Z', rosterAuthoritative: true,
      students: [{ matricula: 'DEMO0001', name: 'Alumno Demo', uatStudentId: 500000, listNumber: 1 }],
    });
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://attendance-service:3400/internal/v1/attendance/rosters/990000');
    expect(request?.method).toBe('PUT');
    expect(JSON.parse(String(request?.body))).toMatchObject({ externalGroupId: '990000', rosterAuthoritative: true });
  });

  it('forwards the coordinator identity and correlation id when unbinding', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));
    await client.unbindStudentDevice({
      matricula: '9900000001', actorIdentityId: 'coord-1', actorRole: 'COORDINATOR',
      reason: 'Cambio solicitado por el alumno.', correlationId: 'request-1',
    });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({ 'x-correlation-id': 'request-1' });
    expect(JSON.parse(String(request?.body))).toMatchObject({ actorIdentityId: 'coord-1', actorRole: 'COORDINATOR' });
  });

  it('writes a manual student UUID through the audited replacement endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { id: 'binding-1', matricula: '2251330008', attendanceUuid: '12345678-1234-4234-9234-123456789abc' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));

    await client.replaceStudentDeviceBinding({
      matricula: '2251330008', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      deviceBindingId: null, platform: 'ios', deviceInfo: 'Beacon iOS manual',
      actorIdentityId: 'super-1', actorRole: 'SUPER_USER', reason: 'Alta manual de beacon iOS para alumno.',
      correlationId: 'request-manual-1',
    });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://attendance-service:3400/internal/v1/attendance/device-bindings/2251330008');
    expect(request?.method).toBe('PUT');
    expect(request?.headers).toMatchObject({ 'x-correlation-id': 'request-manual-1' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      matricula: '2251330008', deviceBindingId: null, platform: 'ios',
      actorIdentityId: 'super-1', actorRole: 'SUPER_USER',
    });
    expect(JSON.parse(String(request?.body))).not.toHaveProperty('correlationId');
  });

  it('reads authoritative device bindings with an encoded filter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));
    await expect(client.listStudentDeviceBindings({ q: '2251 / A' })).resolves.toEqual({ data: [] });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://attendance-service:3400/internal/v1/attendance/device-bindings?q=2251+%2F+A',
    );
  });

  it('resolves student devices through the professor-scoped private command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [], missing: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));
    await expect(client.resolveStudentDeviceBindings({
      professorExternalId: 'teacher-1', matriculas: ['9900000001'],
    })).resolves.toEqual({ data: [], missing: [] });
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://attendance-service:3400/internal/v1/attendance/device-bindings/resolve');
    expect(JSON.parse(String(request?.body))).toEqual({
      professorExternalId: 'teacher-1', matriculas: ['9900000001'],
    });
  });

  it('writes audited beacon commands to Attendance Service', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { id: 'beacon-1', classroom: 'AULA 101' },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));
    await client.createClassroomBeacon({
      uuid: '12345678-1234-4234-9234-123456789abc', classroom: 'AULA 101',
      actorIdentityId: 'coord-1', actorRole: 'COORDINATOR', reason: 'Alta desde coordinación.',
      correlationId: 'request-beacon-1',
    });
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://attendance-service:3400/internal/v1/attendance/classroom-beacons');
    expect(request?.headers).toMatchObject({ 'x-correlation-id': 'request-beacon-1' });
    expect(JSON.parse(String(request?.body))).not.toHaveProperty('correlationId');
  });

  it('resolves beacons through the professor-scoped private command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [], missing: ['AULA 101'],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));
    await expect(client.resolveClassroomBeacons({
      professorExternalId: 'teacher-1', classrooms: ['AULA 101'],
    })).resolves.toEqual({ data: [], missing: ['AULA 101'] });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://attendance-service:3400/internal/v1/attendance/classroom-beacons/resolve',
    );
  });

  it('forwards professor presence without elevating group authorization', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { attendanceSessionId: 'session-1' },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));

    await client.observeProfessorEntry({
      professorExternalId: '308127', externalGroupId: '947699', trustedGroupAuthorization: false,
      beaconUuid: '12345678-1234-4234-9234-123456789abc', correlationId: 'presence-request-1',
    });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://attendance-service:3400/internal/v1/attendance/presence/professor-entry');
    expect(request?.headers).toMatchObject({ 'x-correlation-id': 'presence-request-1' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      professorExternalId: '308127', externalGroupId: '947699', trustedGroupAuthorization: false,
    });
    expect(JSON.parse(String(request?.body))).not.toHaveProperty('correlationId');
  });

  it('reads dashboard telemetry from Attendance Service', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        counts: { beacons: 2, studentDeviceBindings: 3, studentBleAttendances: 4 },
        recentBindings: [], recentBeacons: [],
      },
      meta: { generatedAt: '2026-08-03T12:00:00.000Z' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));
    await expect(client.infrastructureSummary()).resolves.toMatchObject({
      data: { counts: { studentBleAttendances: 4 } },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://attendance-service:3400/internal/v1/attendance/infrastructure/summary',
    );
  });

  it('reads and updates the persistent attendance configuration', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: {
        teacherAttendanceToleranceMinutes: 18,
        updatedAt: '2026-08-04T12:00:00.000Z',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));

    await expect(client.attendanceSettings()).resolves.toMatchObject({
      data: { teacherAttendanceToleranceMinutes: 18 },
    });
    await client.updateAttendanceSettings({
      teacherAttendanceToleranceMinutes: 18,
      actorIdentityId: 'coord-1',
      actorRole: 'COORDINATOR',
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://attendance-service:3400/internal/v1/attendance/settings',
    );
    const updateRequest = fetchMock.mock.calls[1]?.[1];
    expect(updateRequest?.method).toBe('PUT');
    expect(JSON.parse(String(updateRequest?.body))).toEqual({
      teacherAttendanceToleranceMinutes: 18,
      actorIdentityId: 'coord-1',
      actorRole: 'COORDINATOR',
    });
  });
});
