import type { z } from 'zod';
import {
  academicProjectionResponseSchema,
  attendanceProjectionResponseSchema,
  type AcademicProjectionSnapshot,
  type AttendanceProjectionSnapshot,
} from '../domain/reconciliation-snapshot.js';

export interface ProjectionSources {
  academic(): Promise<AcademicProjectionSnapshot[]>;
  attendance(): Promise<AttendanceProjectionSnapshot[]>;
}

export class ProjectionSourceClient implements ProjectionSources {
  constructor(
    private readonly academicServiceUrl: string,
    private readonly attendanceServiceUrl: string,
    private readonly internalToken: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  academic(): Promise<AcademicProjectionSnapshot[]> {
    return this.get(`${this.academicServiceUrl}/internal/v1/academic/coordination-projection`, academicProjectionResponseSchema);
  }

  attendance(): Promise<AttendanceProjectionSnapshot[]> {
    return this.get(`${this.attendanceServiceUrl}/internal/v1/attendance/coordination-projection`, attendanceProjectionResponseSchema);
  }

  private async get<TSchema extends z.ZodType<{ data: unknown[] }>>(
    url: string,
    schema: TSchema,
  ): Promise<z.infer<TSchema>['data']> {
    const response = await this.request(url, {
      headers: { 'x-internal-service-token': this.internalToken, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Projection source ${url} returned HTTP ${response.status}.`);
    return schema.parse(await response.json()).data;
  }
}
