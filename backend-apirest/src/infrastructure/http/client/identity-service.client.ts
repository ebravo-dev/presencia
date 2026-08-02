import { ApiError } from '../../../errors/api-error.js';
import type { IdentitySessionGrant } from '../../../domain/types/uat.interfaces.js';

export interface CreateVerifiedIdentitySessionInput {
  readonly kind: 'PROFESSOR' | 'STUDENT';
  readonly role: 'PROFESSOR' | 'STUDENT';
  readonly institutionalIdentifier: string;
  readonly email?: string;
  readonly displayName: string;
  readonly source: 'UAT_TEACHER' | 'UAT_STUDENT';
  readonly correlationId: string;
  readonly deviceId?: string;
}

interface IdentityServiceResponse {
  data?: {
    identity?: { id?: string };
    sessionId?: string;
    accessToken?: string;
    expiresAt?: string;
  };
}

export class IdentityServiceClient {
  constructor(
    private readonly baseUrl: string | undefined,
    private readonly internalToken: string,
    private readonly required: boolean,
    private readonly timeoutMs = 5_000,
  ) {}

  async createAuthenticatedSession(input: CreateVerifiedIdentitySessionInput): Promise<IdentitySessionGrant | undefined> {
    if (!this.baseUrl) {
      if (this.required) throw new ApiError(503, 'IDENTITY_SERVICE_REQUIRED', 'Identity Service no está configurado.');
      return undefined;
    }
    const response = await this.request<IdentityServiceResponse>('/internal/v1/authenticated-sessions', {
      method: 'POST',
      body: input,
    });
    const data = response.data;
    if (!data?.identity?.id || !data.sessionId || !data.accessToken || !data.expiresAt) {
      throw new ApiError(502, 'IDENTITY_SERVICE_INVALID_RESPONSE', 'Identity Service devolvió una sesión inválida.');
    }
    return {
      identityId: data.identity.id,
      sessionId: data.sessionId,
      accessToken: data.accessToken,
      expiresAt: data.expiresAt,
    };
  }

  async revoke(accessToken: string): Promise<void> {
    if (!this.baseUrl) return;
    await this.request('/internal/v1/sessions/current', {
      method: 'DELETE',
      body: { token: accessToken },
    });
  }

  private async request<T>(path: string, options: { method: 'POST' | 'DELETE'; body: unknown }): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        method: options.method,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-internal-service-token': this.internalToken,
        },
        body: JSON.stringify(options.body),
      });
    } catch (error) {
      throw new ApiError(503, 'IDENTITY_SERVICE_UNAVAILABLE', 'Identity Service no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new ApiError(502, 'IDENTITY_SERVICE_ERROR', `Identity Service respondió ${response.status}.`, {
        status: response.status,
      });
    }
    return payload as T;
  }
}
