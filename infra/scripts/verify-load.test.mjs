import assert from 'node:assert/strict';
import test from 'node:test';
import { loadOptions, percentile } from './verify-load.mjs';

test('load percentiles use the nearest-rank definition', () => {
  assert.equal(percentile([50, 10, 30, 20, 40], 0.5), 30);
  assert.equal(percentile([50, 10, 30, 20, 40], 0.95), 50);
  assert.throws(() => percentile([], 0.95), /sample/);
});

test('load options are bounded below the shared gateway rate limit', () => {
  assert.deepEqual(loadOptions({}), {
    requests: 200,
    concurrency: 20,
    warmupRequests: 5,
    p95LimitMs: 750,
    p99LimitMs: 1500,
    maxErrorRate: 0.01,
  });
  assert.throws(() => loadOptions({ PRESENCIA_LOAD_REQUESTS: '281' }), /between 1 and 280/);
  assert.throws(() => loadOptions({ PRESENCIA_LOAD_CONCURRENCY: '0' }), /between 1 and 100/);
  assert.throws(() => loadOptions({ PRESENCIA_LOAD_MAX_ERROR_RATE: '1.1' }), /between 0 and 1/);
});
