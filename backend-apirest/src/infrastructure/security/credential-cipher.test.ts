import { describe, expect, it } from 'vitest';
import { CredentialCipher } from './credential-cipher.js';

describe('CredentialCipher', () => {
  it('cifra con autenticación y recupera la credencial', () => {
    const cipher = new CredentialCipher('a-secure-test-secret-with-more-than-32-characters');
    const encrypted = cipher.encrypt('contraseña-secreta');

    expect(encrypted).not.toContain('contraseña-secreta');
    expect(cipher.decrypt(encrypted)).toBe('contraseña-secreta');
    expect(cipher.encrypt('contraseña-secreta')).not.toBe(encrypted);
  });
});
