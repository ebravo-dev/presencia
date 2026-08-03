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
        student: { matricula: '9900000001', displayName: 'Ana Alumna' },
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

  it('keeps shared-class authorization private and returns the Flutter-compatible envelope', async () => {
    const app = await testApp();
    expect((await app.inject({
      method: 'POST', url: '/internal/v1/academic/shared-classes/for-teacher', payload: { identity: 'teacher-2' },
    })).statusCode).toBe(404);
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/academic/shared-classes/for-teacher',
      headers: { 'x-internal-service-token': token }, payload: { identity: 'teacher-2', year: 2026, term: 2 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ source: 'SHARED_CLASSES', data: [] });
    await app.close();
  });

  it('accepts a versioned legacy shared-class import only through the internal route', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST', url: '/internal/v1/academic/shared-classes/import-legacy',
      headers: { 'x-internal-service-token': token, 'x-correlation-id': 'migration-1' },
      payload: { records: [legacySharedClassRecord] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { imported: 1, updated: 0, unchanged: 0 } });
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
    sharedClasses: {
      listOptions: async () => ({ data: { teachers: [], assignments: [] }, meta: { generatedAt: new Date().toISOString() } }),
      list: async () => ({ data: [], meta: { generatedAt: new Date().toISOString() } }),
      listForTeacher: async () => ({ source: 'SHARED_CLASSES', data: [], fetchedAt: new Date().toISOString() }),
      create: async () => { throw new Error('unexpected'); }, update: async () => { throw new Error('unexpected'); },
      delete: async () => { throw new Error('unexpected'); },
      importLegacy: async () => ({ imported: 1, updated: 0, unchanged: 0 }),
    } as never,
    repository: {
      groupsForTeacher: async () => [], groupByExternalId: async () => null, studentByMatricula: async () => null,
      coordinationProjectionSnapshot: async () => [],
    } as never,
    ready: async () => ({ database: true, rabbitmq: true }),
  });
}

const legacySharedClassRecord = {
  legacySourceId: 'legacy-shared-1', schoolCycleYear: 2026, schoolCycleTerm: 2,
  active: true, notes: null, createdAt: '2026-08-01T12:00:00.000Z', observedAt: '2026-08-02T12:00:00.000Z',
  sourceAssignment: {
    externalGroupId: '947699', groupCode: 'A', schoolCycleExternalId: '151', schoolCycleName: '2026 - 2',
    classroom: 'AULA 101', educationLevel: 'LIC', period: '2', schedule: {},
    teacher: {
      externalId: 'teacher-1', institutionalCode: '308127', name: 'Profesor Titular',
      email: 'titular@uat.edu.mx', lastAuthenticatedAt: '2026-08-02T12:00:00.000Z',
    },
    subject: { externalId: 'subject-1', code: 'SW-101', name: 'Arquitectura' },
    coordination: { externalId: 'coord-1', name: 'FIUAT', shortName: 'FI' },
  },
  assignedTeacher: {
    externalId: 'teacher-2', institutionalCode: '308128', name: 'Profesor Sustituto',
    email: 'sustituto@uat.edu.mx', lastAuthenticatedAt: '2026-08-02T12:00:00.000Z',
  },
};
