import { describe, expect, it } from 'vitest';
import type { AttendanceRepository } from '../domain/attendance.repository.js';
import { DeviceBindingService } from './device-binding.service.js';

describe('DeviceBindingService', () => {
  it('normalizes an initial binding authorized by UAT', async () => {
    const repository = repositoryStub();
    let received: unknown;
    repository.bindInitial = async (command) => {
      received = command;
      throw new Error('stop');
    };
    const service = new DeviceBindingService(repository);
    await expect(service.bindAfterUatAuthentication({
      matricula: ' 2251330007 ', attendanceUuid: '12345678-1234-4234-9234-123456789ABC',
      platform: ' Android ', correlationId: 'request-1',
    })).rejects.toThrow('stop');
    expect(received).toMatchObject({
      matricula: '2251330007', attendanceUuid: '12345678-1234-4234-9234-123456789abc', platform: 'android',
    });
  });

  it('requires an auditable reason for coordinator changes', async () => {
    const service = new DeviceBindingService(repositoryStub());
    expect(() => service.replaceByCoordinator({
      matricula: '2251330007', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      actorIdentityId: 'coord-1', actorRole: 'COORDINATOR', reason: 'cambio', correlationId: 'request-1',
    })).toThrow('motivo auditable');
  });

  it('only reconciles the exact active binding represented by the scoped token', async () => {
    const repository = repositoryStub();
    repository.bindingByMatricula = async () => ({
      id: 'binding-1', matricula: '2251330007',
      attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      deviceBindingId: '12345678-1234-4234-9234-123456789abd',
      platform: 'android', deviceInfo: null, bindingVersion: 3, active: true,
      updatedAt: new Date('2026-08-03T12:00:00.000Z'),
    });
    const service = new DeviceBindingService(repository);
    await expect(service.reconcileExisting({
      matricula: '2251330007', attendanceUuid: '12345678-1234-4234-9234-123456789abc',
      deviceBindingId: '12345678-1234-4234-9234-123456789abd', correlationId: 'request-1',
    }, {
      subject: 'binding-1', matricula: '2251330007',
      deviceBindingId: '12345678-1234-4234-9234-123456789abd', bindingVersion: 3,
    })).resolves.toMatchObject({ created: false, duplicate: true });
  });

  it('rejects a revoked token version without reactivating the binding', async () => {
    const repository = repositoryStub();
    repository.bindingByMatricula = async () => ({
      id: 'binding-1', matricula: '2251330007',
      attendanceUuid: '12345678-1234-4234-9234-123456789abc', deviceBindingId: null,
      platform: 'ios', deviceInfo: null, bindingVersion: 4, active: false,
      updatedAt: new Date('2026-08-03T12:00:00.000Z'),
    });
    const service = new DeviceBindingService(repository);
    await expect(service.reconcileExisting({
      matricula: '2251330007', attendanceUuid: '12345678-1234-4234-9234-123456789abc', correlationId: 'request-1',
    }, {
      subject: 'binding-1', matricula: '2251330007', deviceBindingId: null, bindingVersion: 3,
    })).rejects.toMatchObject({ code: 'DEVICE_BINDING_TOKEN_REVOKED' });
  });

  it('normalizes and deduplicates the professor-scoped roster query', async () => {
    const repository = repositoryStub();
    let received: unknown;
    repository.resolveDeviceBindings = async (input) => {
      received = input;
      return { data: [], missing: [] };
    };
    const service = new DeviceBindingService(repository);
    await service.resolveForProfessor({
      professorExternalId: ' teacher-1 ',
      matriculas: [' 2251330007 ', '2251330007', ' 2251330008'],
    });
    expect(received).toEqual({
      professorExternalId: 'teacher-1',
      matriculas: ['2251330007', '2251330008'],
    });
  });
});

function repositoryStub(): AttendanceRepository {
  return {
    async applyRoster() {},
    async deactivateRoster() {},
    async markUploadResult() { return true; },
    async capture() { throw new Error('unexpected'); },
    async bindInitial() { throw new Error('unexpected'); },
    async replaceBinding() { throw new Error('unexpected'); },
    async unbind() { return false; },
    async bindingByMatricula() { return null; },
    async resolveDeviceBindings() { return { data: [], missing: [] }; },
    async listDeviceBindings() { return []; },
    async bindingInfrastructureSummary() { return { count: 0, recentBindings: [] }; },
    async coordinationProjectionSnapshot() { return []; },
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
