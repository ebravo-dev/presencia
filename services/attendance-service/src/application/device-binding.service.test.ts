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
    async coordinationProjectionSnapshot() { return []; },
  };
}
