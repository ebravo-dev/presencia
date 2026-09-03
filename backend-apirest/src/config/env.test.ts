import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

describe('UAT Integration demo environment', () => {
  it('rejects invalid boolean values instead of silently enabling production behavior', () => {
    expect(envSchema.safeParse({ PRESENCIA_DEBUG_MODE: 'yes' }).success).toBe(false);
  });

  it('allows only the private demo service or loopback when demo mode is enabled', () => {
    expect(envSchema.safeParse({
      NODE_ENV: 'test', PRESENCIA_DEBUG_MODE: 'true',
      PRESENCIA_DEMO_PORTAL_URL: 'https://example.com',
    }).success).toBe(false);
    expect(envSchema.safeParse({
      NODE_ENV: 'test', PRESENCIA_DEBUG_MODE: 'true',
      PRESENCIA_DEMO_PORTAL_URL: 'http://demo-portal-service:3900',
    }).success).toBe(true);
  });

  it('applies the same private-network restriction to App Review routing', () => {
    expect(envSchema.safeParse({
      NODE_ENV: 'test', PRESENCIA_APP_REVIEW_ENABLED: 'true',
      PRESENCIA_DEMO_PORTAL_URL: 'https://public.example.com',
    }).success).toBe(false);
    expect(envSchema.safeParse({
      NODE_ENV: 'test', PRESENCIA_APP_REVIEW_ENABLED: 'true',
      PRESENCIA_DEMO_PORTAL_URL: 'http://demo-portal-service:3900',
    }).success).toBe(true);
  });
});
