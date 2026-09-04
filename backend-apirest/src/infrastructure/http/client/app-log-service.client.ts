import { ApiError } from '../../../errors/api-error.js';

export interface AppLogQuery {
  q?: string;
  application?: 'STUDENT' | 'PROFESSOR';
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  installationId?: string;
  userIdentifier?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export class AppLogServiceClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly internalToken: string, private readonly timeoutMs = 10_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  health() { return this.get('/health/ready', {}, Math.min(this.timeoutMs, 2_000)); }
  search(query: AppLogQuery) { return this.get('/internal/v1/app-logs', query); }
  summary() { return this.get('/internal/v1/app-logs/summary'); }

  private async get(path: string, query: object = {}, timeoutMs = this.timeoutMs) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json', 'x-internal-service-token': this.internalToken },
      });
    } catch (error) {
      throw new ApiError(503, 'APP_LOG_SERVICE_UNAVAILABLE', 'El servicio de logs de aplicaciones no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
      throw new ApiError(
        response.status,
        typeof body?.error === 'string' ? body.error : 'APP_LOG_SERVICE_ERROR',
        typeof body?.message === 'string' ? body.message : 'El servicio de logs rechazó la solicitud.',
      );
    }
    return payload;
  }
}
