import { z } from 'zod';
import type {
  StoredUatSession,
  StoredUatStudentSession,
  UatLoginResponse,
  UatStudentCareerItem,
  UatStudentCareerSelection,
} from '../../domain/types/uat.interfaces.js';
import type { UatClientFactory } from '../http/client/uat-client.factory.js';
import type { UatStudentClientFactory } from '../http/client/uat-student-client.factory.js';
import type { CredentialCipher } from '../security/credential-cipher.js';

export interface SessionCodec<TSession> {
  encode(session: TSession): string;
  decode(value: string): TSession;
}

const baseSessionSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  cookieJar: z.unknown(),
});

const loginSchema = z.object({ exito: z.boolean() }).passthrough();
const identitySessionSchema = z.object({
  identityId: z.string().min(1),
  sessionId: z.string().min(1),
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime(),
});

const teacherSessionSchema = baseSessionSchema.extend({
  credentialCipher: z.string().min(1),
  login: loginSchema,
  identitySession: identitySessionSchema.optional(),
});

const studentSessionSchema = baseSessionSchema.extend({
  login: loginSchema,
  careers: z.array(z.record(z.unknown())),
  selectedCareer: z.record(z.unknown()),
  deviceBindingToken: z.string().optional(),
  identitySession: identitySessionSchema.optional(),
});

function exportedCookieJar(session: { client: { exportSessionState?(): unknown } }): unknown {
  const cookieJar = session.client.exportSessionState?.();
  if (cookieJar === undefined) {
    throw new Error('El cliente UAT no permite serializar su CookieJar.');
  }
  return cookieJar;
}

export class TeacherSessionCodec implements SessionCodec<StoredUatSession> {
  constructor(
    private readonly clientFactory: UatClientFactory,
    private readonly cipher: CredentialCipher,
  ) {}

  encode(session: StoredUatSession): string {
    return this.cipher.encrypt(JSON.stringify({
      id: session.id,
      username: session.username,
      credentialCipher: session.credentialCipher,
      login: session.login,
      ...(session.identitySession ? { identitySession: session.identitySession } : {}),
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      cookieJar: exportedCookieJar(session),
    }));
  }

  decode(value: string): StoredUatSession {
    const payload = teacherSessionSchema.parse(JSON.parse(this.cipher.decrypt(value)));
    return {
      id: payload.id,
      username: payload.username,
      credentialCipher: payload.credentialCipher,
      login: payload.login as UatLoginResponse,
      ...(payload.identitySession ? { identitySession: payload.identitySession } : {}),
      client: this.clientFactory.restore(payload.cookieJar),
      createdAt: new Date(payload.createdAt),
      lastUsedAt: new Date(payload.lastUsedAt),
      expiresAt: new Date(payload.expiresAt),
    };
  }
}

export class StudentSessionCodec implements SessionCodec<StoredUatStudentSession> {
  constructor(
    private readonly clientFactory: UatStudentClientFactory,
    private readonly cipher: CredentialCipher,
  ) {}

  encode(session: StoredUatStudentSession): string {
    return this.cipher.encrypt(JSON.stringify({
      id: session.id,
      username: session.username,
      login: session.login,
      careers: session.careers,
      selectedCareer: session.selectedCareer,
      ...(session.deviceBindingToken ? { deviceBindingToken: session.deviceBindingToken } : {}),
      ...(session.identitySession ? { identitySession: session.identitySession } : {}),
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      cookieJar: exportedCookieJar(session),
    }));
  }

  decode(value: string): StoredUatStudentSession {
    const payload = studentSessionSchema.parse(JSON.parse(this.cipher.decrypt(value)));
    return {
      id: payload.id,
      username: payload.username,
      login: payload.login as UatLoginResponse,
      careers: payload.careers as UatStudentCareerItem[],
      selectedCareer: payload.selectedCareer as UatStudentCareerSelection,
      ...(payload.deviceBindingToken ? { deviceBindingToken: payload.deviceBindingToken } : {}),
      ...(payload.identitySession ? { identitySession: payload.identitySession } : {}),
      client: this.clientFactory.restore(payload.cookieJar),
      createdAt: new Date(payload.createdAt),
      lastUsedAt: new Date(payload.lastUsedAt),
      expiresAt: new Date(payload.expiresAt),
    };
  }
}
