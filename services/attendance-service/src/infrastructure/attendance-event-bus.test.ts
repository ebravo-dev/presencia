import { describe, expect, it } from 'vitest';
import type { AttendanceOutboxEvent } from '../generated/prisma/index.js';
import { toAttendanceEventEnvelope } from './attendance-event-bus.js';

describe('Attendance event envelope', () => {
  it('publishes a versioned traceable contract', () => {
    const event = {
      eventId: '7bdf4fdc-09da-4e37-986f-ee8666456ee8', eventType: 'attendance.upload_requested.v1',
      aggregateId: 'session-1', correlationId: 'request-1', causationId: 'request-1', payload: { version: 1 },
      occurredAt: new Date('2026-08-02T12:00:00.000Z'), publishedAt: null, attempts: 0,
      nextAttemptAt: new Date(), lockedAt: null, lastError: null, createdAt: new Date(),
    } satisfies AttendanceOutboxEvent;
    expect(toAttendanceEventEnvelope(event)).toMatchObject({
      eventId: event.eventId, eventType: event.eventType, producer: 'attendance-service', schemaVersion: 1,
      correlationId: 'request-1', payload: { version: 1 },
    });
  });
});
