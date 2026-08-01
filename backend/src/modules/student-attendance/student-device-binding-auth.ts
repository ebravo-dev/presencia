import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

export interface StudentBindingTokenPayload {
    type: 'student-device-binding';
    matricula: string;
    deviceBindingId?: string;
}

export function safeTokenEqual(expected: string, provided?: string): boolean {
    if (!provided) return false;
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function issueStudentBindingToken(
    input: { matricula: string; deviceBindingId?: string },
    secret: string,
): string {
    return jwt.sign(
        { type: 'student-device-binding', ...input } satisfies StudentBindingTokenPayload,
        secret,
        {
            audience: 'student-device-binding',
            issuer: 'presencia-backend',
            expiresIn: 60 * 60 * 24 * 180,
        },
    );
}

export function verifyStudentBindingToken(token: string, secret: string): StudentBindingTokenPayload | null {
    try {
        const payload = jwt.verify(token, secret, {
            audience: 'student-device-binding',
            issuer: 'presencia-backend',
        });
        if (typeof payload === 'string' || payload.type !== 'student-device-binding' || typeof payload.matricula !== 'string') {
            return null;
        }
        return {
            type: 'student-device-binding',
            matricula: payload.matricula,
            deviceBindingId: typeof payload.deviceBindingId === 'string' ? payload.deviceBindingId : undefined,
        };
    } catch {
        return null;
    }
}
