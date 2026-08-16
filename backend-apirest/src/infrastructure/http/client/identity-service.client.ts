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

export interface StaffIdentityUser {
  id: string;
  identityId: string;
  email: string;
  name: string;
  role: 'COORDINATOR' | 'READ_ONLY';
  disabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffSessionGrant {
  user: StaffIdentityUser;
  identityId: string;
  sessionId: string;
  accessToken: string;
  expiresAt: string;
}

export class IdentityServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 5_000,
  ) {}

  health(): Promise<unknown> {
    return this.request('/health/ready', { method: 'GET' });
  }

  async createAuthenticatedSession(input: CreateVerifiedIdentitySessionInput): Promise<IdentitySessionGrant> {
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
    await this.request('/internal/v1/sessions/current', {
      method: 'DELETE',
      body: { token: accessToken },
    });
  }

  async createStaffSession(email: string, password: string): Promise<StaffSessionGrant> {
    return (await this.request<{ data: StaffSessionGrant }>('/internal/v1/staff/sessions', {
      method: 'POST', body: { email, password },
    })).data;
  }

  async createSuperUserSession(password: string): Promise<Omit<StaffSessionGrant, 'user'> & { user: { role: 'SUPER_USER' } }> {
    return (await this.request<{ data: Omit<StaffSessionGrant, 'user'> & { user: { role: 'SUPER_USER' } } }>('/internal/v1/super-user/sessions', {
      method: 'POST', body: { password },
    })).data;
  }

  async verify(accessToken: string) {
    return (await this.request<{ data: {
      valid: true;
      identity: { id: string; email: string | null; displayName: string; role: string; disabledAt: string | null };
    } }>('/internal/v1/sessions/verify', { method: 'POST', body: { token: accessToken } })).data;
  }

  listStaffAccounts(): Promise<{ data: StaffIdentityUser[]; meta: { generatedAt: string } }> {
    return this.request('/internal/v1/staff/accounts', { method: 'GET' });
  }

  createStaffAccount(input: { email: string; name: string; password: string; role?: string } & StaffAuditInput) {
    return this.request<{ data: StaffIdentityUser }>('/internal/v1/staff/accounts', { method: 'POST', body: input });
  }

  updateStaffAccount(id: string, input: Partial<{ email: string; name: string; password: string; role: string; disabled: boolean }> & StaffAuditInput) {
    return this.request<{ data: StaffIdentityUser }>(`/internal/v1/staff/accounts/${encodeURIComponent(id)}`, { method: 'PUT', body: input });
  }

  async deleteStaffAccount(id: string, audit: StaffAuditInput): Promise<void> {
    await this.request(`/internal/v1/staff/accounts/${encodeURIComponent(id)}`, { method: 'DELETE', body: audit });
  }

  importStaffAccounts(accounts: Array<{
    legacySourceId: string; email: string; name: string; passwordHash: string;
    role: 'COORDINATOR' | 'READ_ONLY'; disabled: boolean;
  }>, audit: StaffAuditInput) {
    return this.request('/internal/v1/staff/accounts/import', { method: 'POST', body: { accounts, ...audit } });
  }

  resetDemoData(): Promise<{ data: { identities: number } }> {
    return this.request('/internal/v1/identities/demo-data', { method: 'DELETE' });
  }

  private async request<T>(path: string, options: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown }): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        method: options.method,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          'x-internal-service-token': this.internalToken,
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      throw new ApiError(503, 'IDENTITY_SERVICE_UNAVAILABLE', 'Identity Service no está disponible.', {
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined;
      throw new ApiError(response.status, typeof body?.error === 'string' ? body.error : 'IDENTITY_SERVICE_ERROR', `Identity Service respondió ${response.status}.`, {
        status: response.status,
      });
    }
    return payload as T;
  }
}

interface StaffAuditInput {
  actorIdentityId: string;
  correlationId: string;
  reason: string;
}
