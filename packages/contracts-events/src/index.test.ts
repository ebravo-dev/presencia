import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseDomainEvent } from './index.js';

describe('domain event contract', () => {
  it('accepts a versioned event envelope', () => {
    const event = parseDomainEvent({
      id: randomUUID(),
      name: 'attendance.upload_requested.v1',
      occurredAt: new Date().toISOString(),
      correlationId: 'request-123',
      producer: 'attendance-service',
      aggregateId: 'attendance-456',
      payload: { batchId: 'batch-789' },
    });

    expect(event.name).toBe('attendance.upload_requested.v1');
  });

  it('rejects unversioned or unknown event names', () => {
    expect(() => parseDomainEvent({ name: 'attendance.upload_requested' })).toThrow();
  });
});
