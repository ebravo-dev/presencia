import { describe, expect, it, vi } from 'vitest';
import type { StoredUatSession } from '../../domain/types/uat.interfaces.js';
import { UatService } from './uat.service.js';

describe('UatService App Review isolation', () => {
  it('creates an ephemeral review session without creating an Identity record', async () => {
    const sessions = new Map<string, StoredUatSession>();
    const client = {
      authenticate: vi.fn(async () => ({
        exito: true,
        parametros: {
          Id_Plantilla_AdmonUAT: '999900',
          Cve_Usuario_AdmonUAT: 'APPREVIEW',
          Txt_Usuario_AdmonUAT: 'Profesor de Revisión',
        },
      })),
      getCookieDiagnostics: () => ({
        cookieNames: ['ASP.NET_SessionId', '.ASPXAUTH'], hasSessionCookie: true, hasAuthCookie: true,
      }),
    };
    const identity = {
      createAuthenticatedSession: vi.fn(async () => { throw new Error('must not be called'); }),
      revoke: vi.fn(async () => undefined),
    };
    const service = new UatService(
      {
        create: async (id: string, session: StoredUatSession) => { sessions.set(id, session); },
        get: async (id: string) => sessions.get(id) ?? null,
        delete: async (id: string) => sessions.delete(id),
        size: async () => sessions.size,
      },
      { createFor: () => ({ client, source: 'APP_REVIEW' }) } as never,
      { encrypt: () => 'encrypted-review-password' } as never,
      identity as never,
    );

    const session = await service.createSession({
      username: 'appreview.profesor@uat.edu.mx', password: 'teacher-review-password',
    });
    const response = await service.toSessionResponse(session);

    expect(session.source).toBe('APP_REVIEW');
    expect(response).not.toHaveProperty('identitySession');
    expect(identity.createAuthenticatedSession).not.toHaveBeenCalled();
    expect(sessions.get(session.id)).toBe(session);
  });
});
