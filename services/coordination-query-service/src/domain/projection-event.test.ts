import { describe, expect, it } from 'vitest';
import { parseProjectionEvent } from './projection-event.js';

describe('parseProjectionEvent', () => {
  it('requires the complete academic facts needed by the read model', () => {
    const event = parseProjectionEvent({
      eventId: '7bdf4fdc-09da-4e37-986f-ee8666456ee8', eventType: 'academic.roster_updated.v1',
      occurredAt: '2026-08-02T12:00:00.000Z', correlationId: 'request-1', causationId: 'event-1',
      producer: 'academic-service', aggregateId: '947699', schemaVersion: 1,
      payload: {
        externalGroupId: '947699', rosterVersion: 'snapshot-1',
        teacher: { externalId: '308127', institutionalCode: '308127', name: 'Profesor', email: null, lastAuthenticatedAt: '2026-08-02T12:00:00.000Z' },
        cycle: { externalId: '151', name: '2026 - 2 VERANO' },
        group: { externalGroupId: '947699', code: 'ISC-1', groupLetter: '1-A', name: 'Calculo', level: 'LIC', classroom: 'A1', period: '1', schedule: {} },
        subject: { externalId: 'subject-1', code: 'ISC-1', name: 'Calculo' },
        coordination: { externalId: '12', name: 'FIUAT', shortName: 'FIUAT' },
      },
    });
    expect(event.payload).toMatchObject({ teacher: { externalId: '308127' }, coordination: { externalId: '12' } });
  });
});
