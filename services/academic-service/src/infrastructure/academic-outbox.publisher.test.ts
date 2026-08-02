import { describe, expect, it } from 'vitest';
import type { AcademicOutboxEvent } from '../generated/prisma/index.js';
import { toAcademicEventEnvelope } from './academic-outbox.publisher.js';

describe('Academic outbox event envelope', () => {
  it('preserves tracing and contract metadata', () => {
    const event = {
      eventId: 'e5350b31-672f-48aa-bc8e-28698927b71d',
      eventType: 'academic.roster_updated.v1',
      aggregateId: 'group-1',
      correlationId: 'request-1',
      causationId: 'uat-event-1',
      payload: { activeStudents: 30 },
      occurredAt: new Date('2026-08-02T12:00:00.000Z'),
      publishedAt: null,
      attempts: 0,
      nextAttemptAt: new Date('2026-08-02T12:00:00.000Z'),
      lockedAt: null,
      lastError: null,
      createdAt: new Date('2026-08-02T12:00:00.000Z'),
    } satisfies AcademicOutboxEvent;

    expect(toAcademicEventEnvelope(event)).toEqual({
      eventId: event.eventId,
      eventType: 'academic.roster_updated.v1',
      occurredAt: '2026-08-02T12:00:00.000Z',
      correlationId: 'request-1',
      causationId: 'uat-event-1',
      producer: 'academic-service',
      aggregateId: 'group-1',
      schemaVersion: 1,
      payload: { activeStudents: 30 },
    });
  });
});
