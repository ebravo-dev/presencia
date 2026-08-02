import { z } from 'zod';

const developmentSecrets = new Set([
  'development-internal-service-token-change-me',
  'development-metrics-token-change-me',
]);

export const gatewayEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LEGACY_BACKEND_URL: z.url().default('http://localhost:3000'),
  UAT_INTEGRATION_URL: z.url().default('http://localhost:3100'),
  REDIS_URL: z.url().default('redis://localhost:6379/0'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  METRICS_TOKEN: z.string().min(32).default('development-metrics-token-change-me'),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().max(10_000_000).default(1_048_576),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;

  for (const [field, secret] of [
    ['INTERNAL_API_TOKEN', value.INTERNAL_API_TOKEN],
    ['METRICS_TOKEN', value.METRICS_TOKEN],
  ] as const) {
    if (developmentSecrets.has(secret)) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: 'Must be configured with a non-development value in production',
      });
    }
  }

  if (value.INTERNAL_API_TOKEN === value.METRICS_TOKEN) {
    context.addIssue({
      code: 'custom',
      path: ['METRICS_TOKEN'],
      message: 'Metrics and internal service tokens must be different',
    });
  }
});

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;

export function loadGatewayEnv(source: NodeJS.ProcessEnv = process.env): GatewayEnv {
  return gatewayEnvSchema.parse(source);
}

export function parseCorsOrigins(value: string): string[] {
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}
