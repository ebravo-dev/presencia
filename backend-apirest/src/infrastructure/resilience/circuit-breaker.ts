export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly openDurationMs: number;
  readonly isAvailabilityFailure: (error: unknown) => boolean;
  readonly now?: () => number;
}

export class CircuitOpenError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('El circuito hacia UAT está abierto temporalmente.');
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private readonly now: () => number;
  private state: CircuitState = 'closed';
  private failures = 0;
  private openUntil = 0;
  private halfOpenRequestInFlight = false;

  constructor(private readonly options: CircuitBreakerOptions) {
    if (options.failureThreshold < 1 || options.openDurationMs < 1) {
      throw new Error('Circuit breaker thresholds must be positive.');
    }
    this.now = options.now ?? Date.now;
  }

  async execute<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    this.prepareExecution();
    try {
      const result = await operation();
      this.close();
      return result;
    } catch (error) {
      if (this.options.isAvailabilityFailure(error)) this.recordFailure();
      else if (this.state === 'half-open') this.close();
      throw error;
    } finally {
      this.halfOpenRequestInFlight = false;
    }
  }

  snapshot(): { state: CircuitState; failures: number; retryAfterMs: number } {
    this.refreshState();
    return {
      state: this.state,
      failures: this.failures,
      retryAfterMs: this.state === 'open' ? Math.max(0, this.openUntil - this.now()) : 0,
    };
  }

  private prepareExecution(): void {
    this.refreshState();
    if (this.state === 'open') throw new CircuitOpenError(Math.max(1, this.openUntil - this.now()));
    if (this.state === 'half-open') {
      if (this.halfOpenRequestInFlight) throw new CircuitOpenError(this.options.openDurationMs);
      this.halfOpenRequestInFlight = true;
    }
  }

  private refreshState(): void {
    if (this.state === 'open' && this.now() >= this.openUntil) this.state = 'half-open';
  }

  private recordFailure(): void {
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.options.failureThreshold) {
      this.state = 'open';
      this.openUntil = this.now() + this.options.openDurationMs;
    }
  }

  private close(): void {
    this.state = 'closed';
    this.failures = 0;
    this.openUntil = 0;
  }
}
