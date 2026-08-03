import { describe, expect, it } from 'vitest';
import type { AcademicRepository } from '../domain/academic.repository.js';
import type { ProfessorAcademicSnapshot } from '../domain/academic-snapshot.js';
import { ApplyAcademicSnapshotService } from './apply-academic-snapshot.service.js';

describe('ApplyAcademicSnapshotService', () => {
  it('rejects duplicate groups before opening a database transaction', async () => {
    let called = false;
    const service = new ApplyAcademicSnapshotService({
      async applySnapshot() { called = true; throw new Error('unexpected'); },
      async applyStudentSnapshot() { throw new Error('unexpected'); },
      async groupsForTeacher() { return []; },
      async groupByExternalId() { return null; },
      async studentByMatricula() { return null; },
      async coordinationProjectionSnapshot() { return []; },
    });
    const snapshot = makeSnapshot();
    await expect(service.apply({ ...snapshot, groups: [snapshot.groups[0]!, snapshot.groups[0]!] }))
      .rejects.toThrow('DUPLICATE_EXTERNAL_GROUP_ID');
    expect(called).toBe(false);
  });

  it('normalizes roster validation and delegates a unique snapshot', async () => {
    const repository: AcademicRepository = {
      async applySnapshot(snapshot) {
        return { snapshotId: snapshot.snapshotId, duplicate: false, activeGroups: 1, activeEnrollments: 1, deactivatedGroups: 0 };
      },
      async applyStudentSnapshot() { throw new Error('unexpected'); },
      async groupsForTeacher() { return []; },
      async groupByExternalId() { return null; },
      async studentByMatricula() { return null; },
      async coordinationProjectionSnapshot() { return []; },
    };
    await expect(new ApplyAcademicSnapshotService(repository).apply(makeSnapshot())).resolves.toMatchObject({ activeGroups: 1 });
  });
});

function makeSnapshot(): ProfessorAcademicSnapshot {
  return {
    snapshotId: 'd62c1408-7b0d-41b1-8cd8-7eac1b0698e8',
    correlationId: 'request-1', causationId: 'uat-event-1',
    teacher: { externalId: 'teacher-1', name: 'Profesor', authenticatedAt: new Date() },
    cycle: { externalId: '151', name: '2026 - 2 VERANO' },
    groups: [{
      externalGroupId: '1001', code: '1001', groupLetter: 'A', name: 'Arquitectura', schedule: {},
      subject: { externalId: 'subject-1', name: 'Arquitectura' },
      coordination: { externalId: '12', name: 'FIUAT' },
      rosterAuthoritative: true,
      students: [{ matricula: '9900000001', name: 'Alumno' }],
    }],
  };
}
