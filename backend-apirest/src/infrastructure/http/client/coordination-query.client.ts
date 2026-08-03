import { ApiError } from '../../../errors/api-error.js';

export class CoordinationQueryClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly internalToken: string, private readonly timeoutMs = 10_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  overview() { return this.get('/internal/v1/coordination/overview'); }
  health() { return this.get('/health/ready'); }
  coordinations() { return this.get('/internal/v1/coordination/coordinations'); }
  teachers(query: { coordinationId?: string; search?: string; page: number; pageSize: number }) {
    return this.get('/internal/v1/coordination/teachers', query);
  }
  teacherAssignments(teacherId: string) {
    return this.get(`/internal/v1/coordination/teachers/${encodeURIComponent(teacherId)}/assignments`);
  }
  weeklyReport(query: { teacherId: string; weekStart: string }) {
    return this.get('/internal/v1/coordination/reports/attendance-weekly', query);
  }
  rangeReport(query: { teacherId: string; startDate: string; endDate: string }) {
    return this.get('/internal/v1/coordination/reports/attendance-range', query);
  }

  async resetDemoData(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(new URL('/internal/v1/coordination/demo-data', this.baseUrl), {
        method: 'DELETE',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'application/json', 'x-internal-service-token': this.internalToken },
      });
    } catch (error) {
      throw new ApiError(503, 'COORDINATION_QUERY_UNAVAILABLE', 'El servicio de consultas no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    if (!response.ok) throw new ApiError(response.status, 'COORDINATION_QUERY_ERROR', 'El servicio de consultas rechazó el reinicio demo.');
  }

  private async get(path: string, query: Record<string, string | number | undefined> = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'application/json', 'x-internal-service-token': this.internalToken },
      });
    } catch (error) {
      throw new ApiError(503, 'COORDINATION_QUERY_UNAVAILABLE', 'El servicio de consultas no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
      throw new ApiError(
        response.status,
        typeof body?.error === 'string' ? body.error : 'COORDINATION_QUERY_ERROR',
        typeof body?.message === 'string' ? body.message : 'El servicio de consultas rechazó la solicitud.',
      );
    }
    return payload;
  }
}
