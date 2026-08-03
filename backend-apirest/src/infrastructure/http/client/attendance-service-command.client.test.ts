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
      matricula: '2251330007', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
    })).resolves.toEqual({ data: { bindingToken: 'scoped-token' } });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://attendance-service:3400/internal/v1/attendance/device-bindings/initial');
    expect(request?.headers).toMatchObject({ 'x-internal-service-token': 'x'.repeat(32) });
  });

  it('forwards the coordinator identity and correlation id when unbinding', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const client = new AttendanceServiceCommandClient('http://attendance-service:3400', 'x'.repeat(32));
    await client.unbindStudentDevice({
      matricula: '2251330007', actorIdentityId: 'coord-1', actorRole: 'COORDINATOR',
      reason: 'Cambio solicitado por el alumno.', correlationId: 'request-1',
    });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({ 'x-correlation-id': 'request-1' });
    expect(JSON.parse(String(request?.body))).toMatchObject({ actorIdentityId: 'coord-1', actorRole: 'COORDINATOR' });
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
      professorExternalId: 'teacher-1', matriculas: ['2251330007'],
    })).resolves.toEqual({ data: [], missing: [] });
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://attendance-service:3400/internal/v1/attendance/device-bindings/resolve');
    expect(JSON.parse(String(request?.body))).toEqual({
      professorExternalId: 'teacher-1', matriculas: ['2251330007'],
    });
  });
});
