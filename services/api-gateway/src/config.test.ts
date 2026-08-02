import { describe, expect, it } from 'vitest';
import { gatewayEnvSchema, parseCorsOrigins } from './config.js';

describe('gateway configuration', () => {
  it('fails closed with development secrets in production', () => {
    const result = gatewayEnvSchema.safeParse({ NODE_ENV: 'production' });
    expect(result.success).toBe(false);
  });

  it('requires different internal and metrics tokens', () => {
    const token = 'a-secure-token-with-at-least-thirty-two-characters';
    const result = gatewayEnvSchema.safeParse({
      NODE_ENV: 'production',
      INTERNAL_API_TOKEN: token,
      METRICS_TOKEN: token,
    });
    expect(result.success).toBe(false);
  });

  it('normalizes the CORS allowlist', () => {
    expect(parseCorsOrigins('https://a.example, https://b.example ,')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});
