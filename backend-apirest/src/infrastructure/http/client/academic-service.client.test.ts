import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcademicServiceClient } from './academic-service.client.js';

describe('AcademicServiceClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('publishes academic facts without UAT cookies or credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const client = new AcademicServiceClient(
      'http://academic-service:3300',
      'test-internal-service-token-with-at-least-32-characters',
    );

    await client.publishProfessorSnapshot({
      snapshotId: '59d3f009-f4c4-5bda-bd0a-cbbf2e7a31ee',
      correlationId: 'request-1',
      causationId: 'event-1',
      teacher: {
        externalId: '308127',
        institutionalCode: '308127',
        name: 'Profesor UAT',
        email: 'profesor@uat.edu.mx',
        authenticatedAt: '2026-08-02T12:00:00.000Z',
      },
      cycle: { externalId: '150', name: '2026-1' },
      groups: [],
    });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://academic-service:3300/internal/v1/academic/snapshots/professors');
    expect(request?.headers).toMatchObject({
      'x-internal-service-token': 'test-internal-service-token-with-at-least-32-characters',
      'x-correlation-id': 'request-1',
    });
    const serialized = String(request?.body);
    expect(serialized).not.toMatch(/password|cookie|sessionId/i);
  });

  it('publishes student schedules through the dedicated internal endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const client = new AcademicServiceClient('http://academic-service:3300', 'x'.repeat(32));
    await client.publishStudentSnapshot({
      snapshotId: '6af650f3-6772-4d72-b23b-837390c24701', correlationId: 'request-1', causationId: 'request-1',
      synchronizedAt: '2026-08-02T12:00:00.000Z',
      student: { matricula: '9900000001', displayName: 'Ana Alumna' },
      career: { planExternalId: '3313', name: 'Ingenieria' },
      cycle: { externalId: '151', name: '2026 - 2' }, schedule: [],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://academic-service:3300/internal/v1/academic/snapshots/students');
  });

  it('uses the academic shared-class API and forwards audit correlation separately', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'shared-1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new AcademicServiceClient('http://academic-service:3300', 'x'.repeat(32));

    await client.createSharedClass({
      sourceAssignmentId: 'group-1', assignedTeacherId: 'teacher-2',
      schoolCycleYear: 2026, schoolCycleTerm: 2,
      actorIdentityId: 'coord-1', actorRole: 'COORDINATOR',
      reason: 'Alta de clase compartida desde coordinación.', correlationId: 'request-7',
    });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://academic-service:3300/internal/v1/academic/shared-classes');
    expect(request?.method).toBe('POST');
    expect(request?.headers).toMatchObject({ 'x-correlation-id': 'request-7' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      sourceAssignmentId: 'group-1', assignedTeacherId: 'teacher-2', actorIdentityId: 'coord-1',
    });
    expect(String(request?.body)).not.toContain('correlationId');
  });

  it('fails visibly when Academic Service is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
    const client = new AcademicServiceClient('http://academic-service:3300', 'x'.repeat(32));
    await expect(client.listSharedClasses()).rejects.toMatchObject({
      statusCode: 503,
      code: 'ACADEMIC_SERVICE_UNAVAILABLE',
    });
  });
});
