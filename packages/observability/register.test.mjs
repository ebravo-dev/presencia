import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trace } from '@opentelemetry/api';

test('preloads the SDK and exports a named span without application changes', () => {
  const span = trace.getTracer('presencia-test').startSpan('preload-probe');
  assert.equal(span.isRecording(), true);
  assert.match(span.spanContext().traceId, /^[a-f0-9]{32}$/);
  assert.match(span.spanContext().spanId, /^[a-f0-9]{16}$/);
  span.end();
});
