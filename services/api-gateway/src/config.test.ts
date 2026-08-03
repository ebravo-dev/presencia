import { describe, expect, it } from 'vitest';
import { gatewayEnvSchema, parseCorsOrigins, parseRouteOverrides } from './config.js';

describe('gateway configuration', () => {
  it('fails closed with development secrets in production', () => {
    const result = gatewayEnvSchema.safeParse({ NODE_ENV: 'production' });
    expect(result.success).toBe(false);
  });

  it('does not retain an internal service token at the public edge', () => {
    const result = gatewayEnvSchema.parse({
      NODE_ENV: 'test',
      INTERNAL_API_TOKEN: 'an-internal-secret-that-must-not-reach-the-edge',
    });
    expect('INTERNAL_API_TOKEN' in result).toBe(false);
  });

  it('normalizes the CORS allowlist', () => {
    expect(parseCorsOrigins('https://a.example, https://b.example ,')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('parses route cutovers and rejects reserved internal prefixes', () => {
    expect(parseRouteOverrides('{"/api/uat/profesor/sync":"identity"}')).toEqual([
      { prefix: '/api/uat/profesor/sync', target: 'identity' },
    ]);
    expect(() => parseRouteOverrides('{"/internal":"uat-integration"}')).toThrow();
    expect(() => parseRouteOverrides('{"/professors":"identity"}')).toThrow();
  });
});
