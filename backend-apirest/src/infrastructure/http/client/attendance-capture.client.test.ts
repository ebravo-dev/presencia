import { describe, expect, it } from 'vitest';
import { attendanceCaptureIdempotencyKey, type AttendanceCaptureInput } from './attendance-capture.client.js';

describe('AttendanceCaptureClient idempotency', () => {
  const input: AttendanceCaptureInput = {
    correlationId: 'request-1',
    externalGroupId: '947699',
    professorExternalId: '308127',
    date: '2026-08-02',
    entries: [{ uatStudentId: 515722, status: 'PRESENT' }],
  };

  it('keeps the key stable across HTTP retries with a new correlation id', () => {
    expect(attendanceCaptureIdempotencyKey({ ...input, correlationId: 'request-2' }))
      .toBe(attendanceCaptureIdempotencyKey(input));
  });

  it('changes the key when the attendance command changes', () => {
    expect(attendanceCaptureIdempotencyKey({
      ...input,
      entries: [{ uatStudentId: 515722, status: 'ABSENT' }],
    })).not.toBe(attendanceCaptureIdempotencyKey(input));
  });

  it('treats entry order as irrelevant', () => {
    const entries = [
      { uatStudentId: 515722, status: 'PRESENT' as const },
      { uatStudentId: 515723, status: 'ABSENT' as const },
    ];
    expect(attendanceCaptureIdempotencyKey({ ...input, entries }))
      .toBe(attendanceCaptureIdempotencyKey({ ...input, entries: [...entries].reverse() }));
  });
});
