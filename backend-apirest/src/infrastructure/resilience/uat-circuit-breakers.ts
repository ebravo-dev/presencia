import axios from 'axios';
import { env } from '../../config/env.js';
import { CircuitBreaker } from './circuit-breaker.js';

function isAvailabilityFailure(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return !error.response || error.response.status === 429 || error.response.status >= 500;
}

function createUatCircuitBreaker(): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: env.UAT_CIRCUIT_FAILURE_THRESHOLD,
    openDurationMs: env.UAT_CIRCUIT_OPEN_MS,
    isAvailabilityFailure,
  });
}

export const teacherUatCircuitBreaker = createUatCircuitBreaker();
export const studentUatCircuitBreaker = createUatCircuitBreaker();
