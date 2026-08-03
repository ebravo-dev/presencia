import { describe, expect, it, vi } from 'vitest';
import type { SharedClassAssignmentDetail, SharedClassRepository } from '../domain/shared-class.js';
import { SharedClassService } from './shared-class.service.js';

describe('SharedClassService', () => {
  it('normalizes notes and preserves coordinator audit context', async () => {
    let received: unknown;
    const service = new SharedClassService(repositoryStub({
      create: async (input: unknown) => { received = input; return assignment; },
    }));
    await service.create({
      sourceAssignmentId: 'group-1', assignedTeacherId: 'teacher-2', schoolCycleYear: 2026,
      schoolCycleTerm: 2, notes: '  Cobertura autorizada  ', actorIdentityId: 'coord-1',
      actorRole: 'COORDINATOR', reason: 'Alta desde coordinación.', correlationId: 'request-1',
    });
    expect(received).toMatchObject({ notes: 'Cobertura autorizada', actorIdentityId: 'coord-1', correlationId: 'request-1' });
  });

  it('maps an assigned class to the existing Flutter contract', async () => {
    const service = new SharedClassService(repositoryStub({ listForTeacher: async () => [assignment] }));
    const result = await service.listForTeacher('teacher-2', { year: 2026, term: 2 });
    expect(result.data[0]).toMatchObject({
      id: '947699', code: 'SW-101', groupLetter: 'A', source: 'SHARED', isSubstitute: true,
      sharedAssignmentId: 'shared-1', primaryProfessor: { name: 'Profesor Titular' },
    });
  });

  it('does not hide repository failures on deletion', async () => {
    const service = new SharedClassService(repositoryStub({ delete: vi.fn(async () => { throw new Error('not found'); }) }));
    await expect(service.delete('missing', actor)).rejects.toThrow('not found');
  });

  it('marks legacy imports as audited system migrations', async () => {
    let receivedActor: unknown;
    const service = new SharedClassService(repositoryStub({
      importLegacy: async (_records, importActor) => {
        receivedActor = importActor;
        return { imported: 1, updated: 0, unchanged: 0 };
      },
    }));
    const result = await service.importLegacy([], 'migration-1');
    expect(result).toEqual({ imported: 1, updated: 0, unchanged: 0 });
    expect(receivedActor).toMatchObject({
      actorIdentityId: 'legacy-uat-integration', actorRole: 'SYSTEM', correlationId: 'migration-1',
    });
  });
});

const actor = {
  actorIdentityId: 'coord-1', actorRole: 'COORDINATOR' as const,
  reason: 'Baja desde coordinación.', correlationId: 'request-1',
};

const assignment: SharedClassAssignmentDetail = {
  id: 'shared-1', sourceAssignmentId: 'group-1', assignedTeacherId: 'teacher-2',
  schoolCycleYear: 2026, schoolCycleTerm: 2, active: true, notes: null,
  createdAt: new Date('2026-08-03T12:00:00.000Z'), updatedAt: new Date('2026-08-03T12:00:00.000Z'),
  sourceAssignment: {
    id: 'group-1', externalGroupId: '947699', groupCode: 'A', schoolCycleExternalId: '151',
    schoolCycleName: '2026 - 2', classroom: 'AULA 101', educationLevel: 'LIC', period: '2', schedule: {},
    firstSeenAt: new Date('2026-08-03T12:00:00.000Z'), lastSeenAt: new Date('2026-08-03T12:00:00.000Z'),
    teacher: { id: 'teacher-1', externalId: '308127', name: 'Profesor Titular' },
    subject: { id: 'subject-1', externalId: 'subject-1', code: 'SW-101', name: 'Arquitectura' },
    coordination: { id: 'coord-1', externalId: '12', name: 'FIUAT' },
  },
  assignedTeacher: {
    id: 'teacher-2', externalId: '308128', institutionalCode: '308128',
    name: 'Profesor Sustituto', email: 'sustituto@uat.edu.mx',
  },
};

function repositoryStub(overrides: Partial<SharedClassRepository> = {}): SharedClassRepository {
  return {
    listOptions: async () => ({ teachers: [], assignments: [] }), list: async () => [], listForTeacher: async () => [],
    create: async () => assignment, update: async () => assignment, delete: async () => {},
    importLegacy: async () => ({ imported: 0, updated: 0, unchanged: 0 }), ...overrides,
  };
}
