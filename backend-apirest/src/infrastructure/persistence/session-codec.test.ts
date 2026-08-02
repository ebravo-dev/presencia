import { randomUUID } from 'node:crypto';
import { CookieJar } from 'tough-cookie';
import { describe, expect, it } from 'vitest';
import type { StoredUatSession, StoredUatStudentSession } from '../../domain/types/uat.interfaces.js';
import { UatClientFactory } from '../http/client/uat-client.factory.js';
import { UatStudentClientFactory } from '../http/client/uat-student-client.factory.js';
import { CredentialCipher } from '../security/credential-cipher.js';
import { StudentSessionCodec, TeacherSessionCodec } from './session-codec.js';

const cipher = new CredentialCipher('test-session-encryption-secret-with-32-characters');

describe('encrypted UAT session codecs', () => {
  it('restores the teacher ASP.NET CookieJar without exposing cookies in Redis', () => {
    const factory = new UatClientFactory();
    const jar = authenticatedJar('https://administracionescolar.uat.edu.mx');
    const client = factory.restore(jar.serializeSync());
    const codec = new TeacherSessionCodec(factory, cipher);
    const now = new Date('2026-08-02T12:00:00.000Z');
    const session: StoredUatSession = {
      id: randomUUID(),
      username: 'teacher@uat.edu.mx',
      credentialCipher: cipher.encrypt('temporary-password'),
      client,
      login: { exito: true, parametros: {} },
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    };

    const encoded = codec.encode(session);
    const restored = codec.decode(encoded);

    expect(encoded).not.toContain('ASPXAUTH');
    expect(restored.client.getCookieDiagnostics()).toEqual({
      cookieNames: ['ASP.NET_SessionId', '.ASPXAUTH'],
      hasSessionCookie: true,
      hasAuthCookie: true,
    });
  });

  it('restores student career context and device authorization', () => {
    const factory = new UatStudentClientFactory();
    const jar = authenticatedJar('https://alumnossur.uat.edu.mx');
    const codec = new StudentSessionCodec(factory, cipher);
    const now = new Date('2026-08-02T12:00:00.000Z');
    const session: StoredUatStudentSession = {
      id: randomUUID(),
      username: 'student@uat.edu.mx',
      client: factory.restore(jar.serializeSync()),
      login: { exito: true, parametros: {} },
      careers: [{ Id_Plan_Estudio: 3313, Num_Matricula: 2251330007 }],
      selectedCareer: { exito: true, parametros: { Id_Plan_Estudio_AlumnosUAT: 3313 } },
      deviceBindingToken: 'signed-binding-token',
      identitySession: {
        identityId: 'identity-1', sessionId: 'identity-session-1',
        accessToken: 'identity-access-token', expiresAt: '2026-08-02T13:00:00.000Z',
      },
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    };

    const restored = codec.decode(codec.encode(session));
    expect(restored.deviceBindingToken).toBe('signed-binding-token');
    expect(restored.identitySession?.identityId).toBe('identity-1');
    expect(restored.careers[0]?.Id_Plan_Estudio).toBe(3313);
    expect(restored.client.getCookieDiagnostics().hasAuthCookie).toBe(true);
  });
});

function authenticatedJar(baseUrl: string): CookieJar {
  const jar = new CookieJar();
  jar.setCookieSync('ASP.NET_SessionId=session-value; Path=/; HttpOnly', baseUrl);
  jar.setCookieSync('.ASPXAUTH=auth-value; Path=/; HttpOnly', baseUrl);
  return jar;
}
