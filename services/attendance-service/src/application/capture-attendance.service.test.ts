import { describe, expect, it } from 'vitest';
import type { AttendanceRepository } from '../domain/attendance.repository.js';
import { CaptureAttendanceService } from './capture-attendance.service.js';

describe('CaptureAttendanceService', () => {
  it('normalizes and hashes a capture before the transaction', async () => {
    let received: unknown;
    let hash = '';
    const repository = repositoryStub();
    repository.capture = async (command, requestHash) => {
      received = command;
      hash = requestHash;
      return {
        attendanceSessionId: 'session-1', externalGroupId: command.externalGroupId, date: command.date,
        entriesCount: command.entries.length, uploadStatus: 'PENDING', duplicate: false, version: 1,
      };
    };
    const service = new CaptureAttendanceService(repository);

    await service.capture({
      idempotencyKey: '74b29734-65a8-48b2-9e6e-8cd01f1a0016', correlationId: 'request-1',
      professorExternalId: ' teacher-1 ', externalGroupId: ' 947699 ', date: '2026-08-02',
      entries: [{ matricula: 'b2', status: 'ABSENT' }, { matricula: ' a1 ', status: 'PRESENT' }],
    });

    expect(received).toMatchObject({
      professorExternalId: 'teacher-1', externalGroupId: '947699',
      entries: [{ matricula: 'A1', status: 'PRESENT' }, { matricula: 'B2', status: 'ABSENT' }],
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects duplicate matriculas before writing', async () => {
    let called = false;
    const repository = repositoryStub();
    repository.capture = async () => { called = true; throw new Error('unexpected'); };
    const service = new CaptureAttendanceService(repository);
    await expect(service.capture({
      idempotencyKey: '74b29734-65a8-48b2-9e6e-8cd01f1a0016', correlationId: 'request-1',
      professorExternalId: 'teacher-1', externalGroupId: '947699', date: '2026-08-02',
      entries: [{ matricula: 'a1', status: 'PRESENT' }, { matricula: 'A1', status: 'ABSENT' }],
    })).rejects.toMatchObject({ code: 'DUPLICATE_MATRICULA' });
    expect(called).toBe(false);
  });

  it('keeps the payload hash stable when an HTTP retry has a new correlation id', async () => {
    const hashes: string[] = [];
    const repository = repositoryStub();
    repository.capture = async (command, requestHash) => {
      hashes.push(requestHash);
      return {
        attendanceSessionId: 'session-1', externalGroupId: command.externalGroupId, date: command.date,
        entriesCount: command.entries.length, uploadStatus: 'PENDING', duplicate: hashes.length > 1, version: 1,
      };
    };
    const service = new CaptureAttendanceService(repository);
    const capture = {
      idempotencyKey: '74b29734-65a8-48b2-9e6e-8cd01f1a0016',
      professorExternalId: 'teacher-1', externalGroupId: '947699', date: '2026-08-02',
      entries: [{ uatStudentId: 515722, status: 'PRESENT' as const }],
    };

    await service.capture({ ...capture, correlationId: 'request-1' });
    await service.capture({ ...capture, correlationId: 'request-2' });

    expect(hashes).toHaveLength(2);
    expect(hashes[1]).toBe(hashes[0]);
  });

  it('normalizes and rejects duplicate UAT student identifiers before writing', async () => {
    let called = false;
    const repository = repositoryStub();
    repository.capture = async () => { called = true; throw new Error('unexpected'); };
    const service = new CaptureAttendanceService(repository);
    await expect(service.capture({
      idempotencyKey: '74b29734-65a8-48b2-9e6e-8cd01f1a0016', correlationId: 'request-1',
      professorExternalId: 'teacher-1', externalGroupId: '947699', date: '2026-08-02',
      entries: [{ uatStudentId: 515722, status: 'PRESENT' }, { uatStudentId: 515722, status: 'ABSENT' }],
    })).rejects.toMatchObject({ code: 'DUPLICATE_MATRICULA' });
    expect(called).toBe(false);
  });
});

function repositoryStub(): AttendanceRepository {
  return {
    async applyRoster() {},
    async deactivateRoster() {},
    async applyGroupAccessGrant() {},
    async markUploadResult() { return true; },
    async capture() { throw new Error('unexpected'); },
    async bindInitial() { throw new Error('unexpected'); },
    async bindByProfessor() { throw new Error('unexpected'); },
    async replaceBinding() { throw new Error('unexpected'); },
    async unbind() { return false; },
    async bindingByMatricula() { return null; },
    async resolveDeviceBindings() { return { data: [], missing: [] }; },
    async listDeviceBindings() { return []; },
    async bindingInfrastructureSummary() { return { count: 0, recentBindings: [] }; },
    async infrastructureSummary() { return { counts: { beacons: 0, studentDeviceBindings: 0, studentBleAttendances: 0 }, recentBindings: [], recentBeacons: [] }; },
    async coordinationProjectionSnapshot() { return []; },
    async attendanceSettings() { return { teacherAttendanceToleranceMinutes: 10, updatedAt: null }; },
    async updateAttendanceSettings(input) { return { teacherAttendanceToleranceMinutes: input.teacherAttendanceToleranceMinutes, updatedAt: new Date() }; },
    async resetDemoData() {},
    async listClassroomBeacons() { return []; },
    async createClassroomBeacon() { throw new Error('unexpected'); },
    async updateClassroomBeacon() { throw new Error('unexpected'); },
    async deleteClassroomBeacon() {},
    async importClassroomBeacons() { return { imported: 0, unchanged: 0 }; },
    async resolveClassroomBeaconsForProfessor() { return { data: [], missing: [] }; },
    async resolveAuthorizedClassroomBeacons() { return { data: [], missing: [] }; },
    async observeProfessorEntry() { throw new Error('unexpected'); },
    async observeProfessorExit() { throw new Error('unexpected'); },
    async observeStudentPresence() { throw new Error('unexpected'); },
  };
}
