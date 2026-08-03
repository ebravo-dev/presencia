import { describe, expect, it } from 'vitest';
import { studentCredentialsSchema } from './uat.schemas.js';

describe('studentCredentialsSchema', () => {
  const valid = {
    username: 'alumno@uat.edu.mx',
    password: 'secret',
    attendanceUuid: '12345678-1234-4234-9234-123456789abc',
    deviceBindingId: '12345678-1234-4234-9234-123456789abd',
    platform: 'android',
  };

  it('requires the stable phone identity on every student login', () => {
    expect(studentCredentialsSchema.safeParse(valid).success).toBe(true);
    expect(studentCredentialsSchema.safeParse({
      username: valid.username,
      password: valid.password,
    }).success).toBe(false);
  });

  it('accepts only supported mobile platforms', () => {
    expect(studentCredentialsSchema.safeParse({ ...valid, platform: 'ios' }).success).toBe(true);
    expect(studentCredentialsSchema.safeParse({ ...valid, platform: 'web' }).success).toBe(false);
  });

  it('rejects unknown fields instead of silently weakening the contract', () => {
    expect(studentCredentialsSchema.safeParse({ ...valid, skipDeviceBinding: true }).success).toBe(false);
  });
});
