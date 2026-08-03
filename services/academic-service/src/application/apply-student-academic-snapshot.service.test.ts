import { describe, expect, it } from 'vitest';
import type { AcademicRepository } from '../domain/academic.repository.js';
import type { StudentAcademicSnapshot } from '../domain/student-academic-snapshot.js';
import { ApplyStudentAcademicSnapshotService } from './apply-student-academic-snapshot.service.js';

describe('ApplyStudentAcademicSnapshotService', () => {
  it('rejects duplicate group entries', async () => {
    let called = false;
    const repository = repositoryStub(async () => {
      called = true;
      throw new Error('unexpected');
    });
    const snapshot = makeSnapshot();
    await expect(new ApplyStudentAcademicSnapshotService(repository).apply({
      ...snapshot,
      schedule: [snapshot.schedule[0]!, snapshot.schedule[0]!],
    })).rejects.toThrow('DUPLICATE_STUDENT_SCHEDULE_GROUP_ID');
    expect(called).toBe(false);
  });

  it('delegates a valid normalized student schedule', async () => {
    const repository = repositoryStub(async (snapshot) => ({
      snapshotId: snapshot.snapshotId, duplicate: false, activeScheduleEntries: snapshot.schedule.length,
    }));
    await expect(new ApplyStudentAcademicSnapshotService(repository).apply(makeSnapshot()))
      .resolves.toMatchObject({ activeScheduleEntries: 1 });
  });
});

function repositoryStub(applyStudentSnapshot: AcademicRepository['applyStudentSnapshot']): AcademicRepository {
  return {
    async applySnapshot() { throw new Error('unexpected'); },
    applyStudentSnapshot,
    async groupsForTeacher() { return []; },
    async groupByExternalId() { return null; },
    async studentByMatricula() { return null; },
    async coordinationProjectionSnapshot() { return []; },
  };
}

function makeSnapshot(): StudentAcademicSnapshot {
  return {
    snapshotId: '6af650f3-6772-4d72-b23b-837390c24701', correlationId: 'request-1', causationId: 'request-1',
    synchronizedAt: new Date('2026-08-02T12:00:00.000Z'),
    student: { matricula: '9900000001', displayName: 'Ana Alumna', email: 'ana@alumnos.uat.edu.mx' },
    career: { planExternalId: '3313', name: 'Ingenieria en Sistemas', coordinationExternalId: '12' },
    cycle: { externalId: '151', name: '2026 - 2 VERANO' },
    schedule: [{ externalGroupId: '947699', groupLetter: 'A', subjectName: 'Calculo', schedule: {} }],
  };
}
