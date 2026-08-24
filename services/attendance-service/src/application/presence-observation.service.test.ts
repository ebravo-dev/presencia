import { describe, expect, it } from 'vitest';
import { PresenceObservationService, dateInTimeZone } from './presence-observation.service.js';

describe('PresenceObservationService', () => {
  it('uses the trusted server clock and configured campus timezone', async () => {
    let received: unknown;
    const service = new PresenceObservationService(repositoryStub({
      observeProfessorEntry: async (command: unknown) => { received = command; return professorResult; },
    }), 'America/Monterrey', () => new Date('2026-08-04T05:30:00.000Z'));

    await service.observeProfessorEntry({
      professorExternalId: ' teacher-1 ', externalGroupId: ' 947699 ', correlationId: 'request-1',
      beaconUuid: '12345678-1234-4234-9234-123456789ABC', clientDetectedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(received).toMatchObject({
      professorExternalId: 'teacher-1', externalGroupId: '947699', attendanceDate: '2026-08-03',
      observedAt: new Date('2026-08-04T05:30:00.000Z'), beaconUuid: '12345678-1234-4234-9234-123456789abc',
    });
  });

  it('derives the same idempotency key across HTTP retries with a new correlation id', async () => {
    const keys: string[] = [];
    const service = new PresenceObservationService(repositoryStub({
      observeProfessorExit: async (command: { idempotencyKey: string }) => { keys.push(command.idempotencyKey); return professorResult; },
    }), 'America/Monterrey', () => new Date('2026-08-03T18:00:00.000Z'));
    const base = { professorExternalId: 'teacher-1', externalGroupId: '947699', clientDetectedAt: '2026-08-03T18:00:00.000Z' };
    await service.observeProfessorExit({ ...base, correlationId: 'request-1' });
    await service.observeProfessorExit({ ...base, correlationId: 'request-2' });
    expect(keys[0]).toBe(keys[1]);
  });

  it('does not reuse an observation idempotency key on a later attendance date', async () => {
    const keys: string[] = [];
    const dates = [new Date('2026-08-03T18:00:00.000Z'), new Date('2026-08-04T18:00:00.000Z')];
    const service = new PresenceObservationService(repositoryStub({
      observeProfessorExit: async (command: { idempotencyKey: string }) => { keys.push(command.idempotencyKey); return professorResult; },
    }), 'America/Monterrey', () => dates.shift()!);
    const input = { professorExternalId: 'teacher-1', externalGroupId: '947699', correlationId: 'request-1' };
    await service.observeProfessorExit(input);
    await service.observeProfessorExit(input);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('normalizes and sorts student UUIDs before persistence', async () => {
    let received: any;
    const service = new PresenceObservationService(repositoryStub({
      observeStudentPresence: async (command: unknown) => { received = command; return studentResult; },
    }), 'America/Monterrey', () => new Date('2026-08-03T18:00:00.000Z'));
    await service.observeStudentPresence({
      professorExternalId: 'teacher-1', externalGroupId: '947699', correlationId: 'request-1',
      detections: [
        { beaconUuid: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB' },
        { beaconUuid: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
      ],
    });
    expect(received.detections.map(({ beaconUuid }: { beaconUuid: string }) => beaconUuid)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });

  it('formats dates without depending on the host timezone', () => {
    expect(dateInTimeZone(new Date('2026-08-04T05:59:59.000Z'), 'America/Monterrey')).toBe('2026-08-03');
    expect(dateInTimeZone(new Date('2026-08-04T06:00:00.000Z'), 'America/Monterrey')).toBe('2026-08-04');
  });
});

const professorResult = {
  attendanceSessionId: 'session-1', externalGroupId: '947699', date: '2026-08-03',
  professorEntryAt: null, professorExitAt: null, actualClassroom: null, duplicate: false, version: 1,
};
const studentResult = {
  attendanceSessionId: null, externalGroupId: '947699', date: '2026-08-03', matchedCount: 0,
  matched: [], duplicate: false, version: null,
};

function repositoryStub(overrides: Record<string, unknown> = {}) {
  return {
    observeProfessorEntry: async () => professorResult,
    observeProfessorExit: async () => professorResult,
    observeStudentPresence: async () => studentResult,
    ...overrides,
  } as never;
}
