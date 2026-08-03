import { createHash } from 'node:crypto';
import axios, { type AxiosInstance } from 'axios';
import { ApiError } from '../../../errors/api-error.js';

export class AttendanceCaptureClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, internalToken: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/+$/, ''), timeout: 10_000,
      headers: { 'X-Internal-Service-Token': internalToken },
    });
  }

  async capture(input: {
    correlationId: string;
    uatSessionId: string;
    externalGroupId: string;
    professorExternalId: string;
    date: string;
    entries: Array<{ uatStudentId: number; status: 'PRESENT' | 'ABSENT' }>;
  }) {
    const idempotencyKey = stableUuid(JSON.stringify(input));
    try {
      const response = await this.http.post('/internal/v1/attendance/captures', {
        externalGroupId: input.externalGroupId,
        professorExternalId: input.professorExternalId,
        date: input.date,
        uatSessionId: input.uatSessionId,
        entries: input.entries,
      }, {
        headers: { 'Idempotency-Key': idempotencyKey, 'X-Correlation-Id': input.correlationId },
      });
      return response.data as unknown;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const body = error.response.data as Record<string, unknown> | undefined;
        throw new ApiError(
          error.response.status,
          typeof body?.error === 'string' ? body.error : 'ATTENDANCE_CAPTURE_REJECTED',
          typeof body?.message === 'string' ? body.message : 'Attendance Service rechazó la captura.',
        );
      }
      throw new ApiError(503, 'ATTENDANCE_SERVICE_UNAVAILABLE', 'Attendance Service no está disponible.');
    }
  }
}

function stableUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
