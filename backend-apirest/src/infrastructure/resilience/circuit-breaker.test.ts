import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('opens after consecutive availability failures and recovers through half-open', async () => {
    let now = 1_000;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      openDurationMs: 5_000,
      isAvailabilityFailure: () => true,
      now: () => now,
    });
    const unavailable = vi.fn(async () => { throw new Error('network down'); });

    await expect(breaker.execute(unavailable)).rejects.toThrow('network down');
    await expect(breaker.execute(unavailable)).rejects.toThrow('network down');
    await expect(breaker.execute(unavailable)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(unavailable).toHaveBeenCalledTimes(2);

    now += 5_000;
    await expect(breaker.execute(async () => 'restored')).resolves.toBe('restored');
    expect(breaker.snapshot()).toEqual({ state: 'closed', failures: 0, retryAfterMs: 0 });
  });

  it('does not trip for a functional rejection such as invalid credentials', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      openDurationMs: 5_000,
      isAvailabilityFailure: () => false,
    });
    await expect(breaker.execute(async () => { throw new Error('invalid credentials'); })).rejects.toThrow();
    expect(breaker.snapshot().state).toBe('closed');
  });
});
