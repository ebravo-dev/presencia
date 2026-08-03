import { describe, expect, it } from 'vitest';
import { ClassroomBeaconDomainError } from '../domain/classroom-beacon.js';
import type { SaveClassroomBeaconCommand } from '../domain/classroom-beacon.js';
import { ClassroomBeaconService } from './classroom-beacon.service.js';

describe('ClassroomBeaconService', () => {
  it('normalizes classroom and UUID before writing', async () => {
    let received: unknown;
    const service = new ClassroomBeaconService(repositoryStub({
      createClassroomBeacon: async (command: SaveClassroomBeaconCommand) => {
        received = command;
        return beacon;
      },
    }));

    await service.create({
      uuid: '12345678-1234-4234-9234-123456789ABC', classroom: '  salón  á-101 ', ...actor,
    });

    expect(received).toMatchObject({
      uuid: '12345678-1234-4234-9234-123456789abc', classroom: 'SALÓN Á-101', classroomKey: 'SALONA101',
    });
  });

  it('rejects ambiguous legacy imports before opening a transaction', async () => {
    let called = false;
    const service = new ClassroomBeaconService(repositoryStub({
      importClassroomBeacons: async () => { called = true; return { imported: 0, unchanged: 0 }; },
    }));

    await expect(service.import({
      beacons: [
        { uuid: '12345678-1234-4234-9234-123456789abc', classroom: 'A-101' },
        { uuid: '12345678-1234-4234-9234-123456789abc', classroom: 'A-102' },
      ],
      ...actor,
    })).rejects.toBeInstanceOf(ClassroomBeaconDomainError);
    expect(called).toBe(false);
  });

  it('deduplicates equivalent classroom requests for professor resolution', async () => {
    let received: unknown;
    const service = new ClassroomBeaconService(repositoryStub({
      resolveClassroomBeaconsForProfessor: async (input: unknown) => { received = input; return { data: [], missing: [] }; },
    }));

    await service.resolveForProfessor({ professorExternalId: 'teacher-1', classrooms: ['Salón A-101', ' salon a 101 '] });
    expect(received).toEqual({
      professorExternalId: 'teacher-1',
      classrooms: [{ classroom: 'SALÓN A-101', classroomKey: 'SALONA101' }],
    });
  });
});

const actor = {
  actorIdentityId: 'coord-1', actorRole: 'COORDINATOR' as const,
  reason: 'Configuración desde coordinación.', correlationId: 'request-1',
};
const now = new Date('2026-08-03T10:30:00.000Z');
const beacon = {
  id: 'beacon-1', uuid: '12345678-1234-4234-9234-123456789abc', classroom: 'SALÓN Á-101',
  classroomKey: 'SALONA101', createdAt: now, updatedAt: now,
};

function repositoryStub(overrides: Record<string, unknown> = {}) {
  return {
    listClassroomBeacons: async () => [],
    createClassroomBeacon: async () => beacon,
    updateClassroomBeacon: async () => beacon,
    deleteClassroomBeacon: async () => {},
    importClassroomBeacons: async () => ({ imported: 0, unchanged: 0 }),
    resolveClassroomBeaconsForProfessor: async () => ({ data: [], missing: [] }),
    resolveAuthorizedClassroomBeacons: async () => ({ data: [], missing: [] }),
    ...overrides,
  } as never;
}
