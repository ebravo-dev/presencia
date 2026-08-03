import { jwtVerify, SignJWT } from 'jose';
import type { DeviceBindingValue } from '../domain/device-binding.js';

export interface BindingTokenClaims {
  readonly subject: string;
  readonly matricula: string;
  readonly deviceBindingId: string | null;
  readonly bindingVersion: number;
}

export async function issueBindingToken(binding: DeviceBindingValue, secret: string): Promise<string> {
  return new SignJWT({
    role: 'STUDENT_DEVICE',
    matricula: binding.matricula,
    deviceBindingId: binding.deviceBindingId,
    bindingVersion: binding.bindingVersion,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(binding.id)
    .setIssuer('presencia-attendance')
    .setAudience('presencia-student-app')
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(secret));
}

export async function verifyBindingToken(token: string, secret: string): Promise<BindingTokenClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    issuer: 'presencia-attendance',
    audience: 'presencia-student-app',
    algorithms: ['HS256'],
  });
  if (
    payload.role !== 'STUDENT_DEVICE'
    || typeof payload.sub !== 'string'
    || typeof payload.matricula !== 'string'
    || !(typeof payload.deviceBindingId === 'string' || payload.deviceBindingId === null)
    || !Number.isSafeInteger(payload.bindingVersion)
    || Number(payload.bindingVersion) < 1
  ) {
    throw new Error('INVALID_BINDING_TOKEN_CLAIMS');
  }
  return {
    subject: payload.sub,
    matricula: payload.matricula,
    deviceBindingId: payload.deviceBindingId,
    bindingVersion: Number(payload.bindingVersion),
  };
}
