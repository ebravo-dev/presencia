import { describe, expect, it } from 'vitest';
import {
    issueStudentBindingToken,
    safeTokenEqual,
    verifyStudentBindingToken,
} from './student-device-binding-auth.js';

const secret = 'test-secret-with-at-least-thirty-two-characters';

describe('student device binding authorization', () => {
    it('issues a token scoped to matricula and device identity', () => {
        const token = issueStudentBindingToken({ matricula: '2251330007', deviceBindingId: 'device-1' }, secret);

        expect(verifyStudentBindingToken(token, secret)).toEqual({
            type: 'student-device-binding',
            matricula: '2251330007',
            deviceBindingId: 'device-1',
        });
    });

    it('rejects a token signed with another service secret', () => {
        const token = issueStudentBindingToken({ matricula: '2251330007' }, secret);

        expect(verifyStudentBindingToken(token, 'different-secret-with-at-least-thirty-two-chars')).toBeNull();
    });

    it('compares internal service tokens without accepting missing or different values', () => {
        expect(safeTokenEqual(secret, secret)).toBe(true);
        expect(safeTokenEqual(secret, undefined)).toBe(false);
        expect(safeTokenEqual(secret, `${secret}-changed`)).toBe(false);
    });
});
