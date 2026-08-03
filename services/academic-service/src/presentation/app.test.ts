import { describe, expect, it } from 'vitest';
import { academicEnvSchema } from '../infrastructure/config.js';
import { buildAcademicApp } from './app.js';

const token = 'test-internal-service-token-with-at-least-32-characters';

describe('Academic HTTP API', () => {
  it('hides snapshot mutation from public traffic', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'POST', url: '/internal/v1/academic/snapshots/professors', payload: {} });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('accepts a valid internal differential snapshot', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/academic/snapshots/professors',
      headers: { 'x-internal-service-token': token },
      payload: {
        snapshotId: 'd62c1408-7b0d-41b1-8cd8-7eac1b0698e8', correlationId: 'request-1', causationId: 'uat-event-1',
        teacher: { externalId: 'teacher-1', name: 'Profesor', authenticatedAt: new Date().toISOString() },
        cycle: { externalId: '151', name: '2026 - 2 VERANO' },
        groups: [],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().data.snapshotId).toBe('d62c1408-7b0d-41b1-8cd8-7eac1b0698e8');
    await app.close();
  });

  it('accepts a safe student schedule snapshot', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/academic/snapshots/students',
      headers: { 'x-internal-service-token': token },
      payload: {
        snapshotId: '6af650f3-6772-4d72-b23b-837390c24701', correlationId: 'request-1', causationId: 'request-1',
        synchronizedAt: '2026-08-02T12:00:00.000Z',
        student: { matricula: '2251330007', displayName: 'Ana Alumna' },
        career: { planExternalId: '3313', name: 'Ingenieria', coordinationExternalId: '12' },
        cycle: { externalId: '151', name: '2026 - 2' },
        schedule: [{ externalGroupId: '947699', groupLetter: 'A', subjectName: 'Calculo', schedule: {} }],
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({ activeScheduleEntries: 0 });
    await app.close();
  });

  it('protects and exposes the coordination reconciliation snapshot internally', async () => {
    const app = await testApp();
    const hidden = await app.inject({ method: 'GET', url: '/internal/v1/academic/coordination-projection' });
    expect(hidden.statusCode).toBe(404);
    const response = await app.inject({
      method: 'GET', url: '/internal/v1/academic/coordination-projection',
      headers: { 'x-internal-service-token': token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    await app.close();
  });
});

async function testApp() {
  return buildAcademicApp({
    env: academicEnvSchema.parse({ NODE_ENV: 'test', INTERNAL_API_TOKEN: token }),
    snapshots: { apply: async (snapshot: { snapshotId: string }) => ({
      snapshotId: snapshot.snapshotId, duplicate: false, activeGroups: 0, activeEnrollments: 0, deactivatedGroups: 0,
    }) } as never,
    studentSnapshots: { apply: async (snapshot: { snapshotId: string }) => ({
      snapshotId: snapshot.snapshotId, duplicate: false, activeScheduleEntries: 0,
    }) } as never,
    repository: {
      groupsForTeacher: async () => [], groupByExternalId: async () => null, studentByMatricula: async () => null,
      coordinationProjectionSnapshot: async () => [],
    } as never,
    ready: async () => ({ database: true, rabbitmq: true }),
  });
}
