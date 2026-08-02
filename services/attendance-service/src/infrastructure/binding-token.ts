import { SignJWT } from 'jose';
import type { DeviceBindingValue } from '../domain/device-binding.js';

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
