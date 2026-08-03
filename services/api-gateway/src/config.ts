import { z } from 'zod';
import {
  publicRouteContracts,
  type GatewayRouteOverride,
  type GatewayTarget,
} from '@presencia/contracts-http';

const developmentSecrets = new Set([
  'development-metrics-token-change-me',
]);

export const gatewayEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  UAT_INTEGRATION_URL: z.url().default('http://localhost:3100'),
  IDENTITY_SERVICE_URL: z.url().optional(),
  ACADEMIC_SERVICE_URL: z.url().optional(),
  ATTENDANCE_SERVICE_URL: z.url().optional(),
  COORDINATION_QUERY_SERVICE_URL: z.url().optional(),
  ROUTE_TARGET_OVERRIDES: z.string().default('{}'),
  REDIS_URL: z.url().default('redis://localhost:6379/0'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  METRICS_TOKEN: z.string().min(32).default('development-metrics-token-change-me'),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().max(10_000_000).default(1_048_576),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;

  for (const [field, secret] of [['METRICS_TOKEN', value.METRICS_TOKEN]] as const) {
    if (developmentSecrets.has(secret)) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: 'Must be configured with a non-development value in production',
      });
    }
  }

});

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;

export function loadGatewayEnv(source: NodeJS.ProcessEnv = process.env): GatewayEnv {
  return gatewayEnvSchema.parse(source);
}

export function parseCorsOrigins(value: string): string[] {
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}

const overridableTargetSchema = z.enum([
  'uat-integration',
  'identity',
  'academic',
  'attendance',
  'coordination-query',
] satisfies Exclude<GatewayTarget, 'gateway' | 'denied'>[]);

export function parseRouteOverrides(value: string): GatewayRouteOverride[] {
  const parsed = z.record(z.string(), overridableTargetSchema).parse(JSON.parse(value) as unknown);
  return Object.entries(parsed).map(([prefix, target]) => {
    if (!prefix.startsWith('/') || prefix.includes('?') || prefix.includes('#')) {
      throw new Error(`Invalid gateway override prefix: ${prefix}`);
    }
    if (prefix === '/internal' || prefix.startsWith('/internal/') || prefix === '/health' || prefix === '/metrics') {
      throw new Error(`Reserved gateway prefix cannot be overridden: ${prefix}`);
    }
    const normalizedPrefix = prefix.replace(/\/+$/, '') || '/';
    const belongsToPublicContract = publicRouteContracts.some(
      (contract) => normalizedPrefix === contract.prefix
        || normalizedPrefix.startsWith(`${contract.prefix}/`),
    );
    if (!belongsToPublicContract) {
      throw new Error(`Retired or unknown gateway prefix cannot be overridden: ${prefix}`);
    }
    return { prefix: normalizedPrefix, target };
  });
}
