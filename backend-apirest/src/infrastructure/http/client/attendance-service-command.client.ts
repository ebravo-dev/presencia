import { ApiError } from '../../../errors/api-error.js';
import type {
  AttendanceBindingClient,
  StudentDeviceBindingInput,
  StudentDeviceBindingResponse,
} from '../../../application/ports/attendance-binding.client.js';

export class AttendanceServiceCommandClient implements AttendanceBindingClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly internalToken: string, private readonly timeoutMs = 10_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  createStudentDeviceBinding(input: StudentDeviceBindingInput): Promise<StudentDeviceBindingResponse> {
    return this.request('/internal/v1/attendance/device-bindings/initial', {
      method: 'POST',
      body: input,
    });
  }

  async unbindStudentDevice(input: {
    matricula: string;
    actorIdentityId: string;
    actorRole: 'COORDINATOR' | 'SUPER_USER';
    reason: string;
    correlationId: string;
  }): Promise<void> {
    await this.request(`/internal/v1/attendance/device-bindings/${encodeURIComponent(input.matricula)}`, {
      method: 'DELETE',
      correlationId: input.correlationId,
      body: {
        actorIdentityId: input.actorIdentityId,
        actorRole: input.actorRole,
        reason: input.reason,
      },
    });
  }

  listStudentDeviceBindings(input: { q?: string | undefined }): Promise<{ data: unknown[] }> {
    return this.request('/internal/v1/attendance/device-bindings', { method: 'GET', query: input });
  }

  bindingInfrastructureSummary(): Promise<{
    data: { count: number; recentBindings: unknown[] }; meta: { generatedAt: string };
  }> {
    return this.request('/internal/v1/attendance/infrastructure/bindings', { method: 'GET' });
  }

  private async request<T = unknown>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'DELETE'; body?: unknown; correlationId?: string | undefined;
      query?: Record<string, string | undefined> | undefined;
    },
  ): Promise<T> {
    let response: Response;
    try {
      const url = new URL(path, this.baseUrl);
      for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined) url.searchParams.set(key, value);
      response = await fetch(url, {
        method: options.method,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-internal-service-token': this.internalToken,
          ...(options.correlationId ? { 'x-correlation-id': options.correlationId } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      throw new ApiError(502, 'ATTENDANCE_SERVICE_UNAVAILABLE', 'Attendance Service no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
      throw new ApiError(
        response.status,
        typeof body?.error === 'string' ? body.error : 'ATTENDANCE_BINDING_COMMAND_REJECTED',
        typeof body?.message === 'string' ? body.message : 'Attendance Service rechazó la operación.',
      );
    }
    return payload as T;
  }
}
