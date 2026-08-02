import { describe, expect, it } from 'vitest';
import { createTeacherAuthenticatedEvent } from '../../domain/events/teacher-authenticated.event.js';
import {
  calculateOutboxBackoffMs,
  consumerRetryDecision,
  parseTeacherAuthenticatedEvent,
} from './durable-domain-event-bus.js';

describe('durable event policies', () => {
  it('uses capped exponential backoff for outbox publishing', () => {
    expect(calculateOutboxBackoffMs(1)).toBe(2_000);
    expect(calculateOutboxBackoffMs(4)).toBe(16_000);
    expect(calculateOutboxBackoffMs(20)).toBe(256_000);
  });

  it('routes consumer failures through three delayed retries and then DLQ', () => {
    expect(consumerRetryDecision(0)).toMatchObject({ action: 'retry', retryCount: 1, delayMs: 5_000 });
    expect(consumerRetryDecision(1)).toMatchObject({ action: 'retry', retryCount: 2, delayMs: 30_000 });
    expect(consumerRetryDecision(2)).toMatchObject({ action: 'retry', retryCount: 3, delayMs: 300_000 });
    expect(consumerRetryDecision(3)).toEqual({ action: 'dead-letter' });
  });

  it('round-trips a versioned teacher event from RabbitMQ JSON', () => {
    const event = createTeacherAuthenticatedEvent({
      sessionId: 'session-id',
      username: 'teacher@uat.edu.mx',
      loginParameters: { Id_Plantilla_AdmonUAT: '1234' },
    });
    const restored = parseTeacherAuthenticatedEvent(Buffer.from(JSON.stringify(event)));
    expect(restored.eventName).toBe('teacher.authenticated.v1');
    expect(restored.occurredAt).toBeInstanceOf(Date);
    expect(restored.teacher.plantillaId).toBe(1234);
  });

  it('rejects malformed messages before invoking a domain listener', () => {
    expect(() => parseTeacherAuthenticatedEvent(Buffer.from('{"eventName":"teacher.authenticated.v1"}'))).toThrow();
  });
});
