import { z } from 'zod';

const developmentSecrets = new Set([
  'development-app-log-ingestion-key-change-me',
  'development-internal-service-token-change-me',
  'development-metrics-token-change-me',
]);

export const appLogEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3600),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/presencia_app_logs?schema=public'),
  APP_LOG_INGESTION_KEY: z.string().min(32).default('development-app-log-ingestion-key-change-me'),
  INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  METRICS_TOKEN: z.string().min(32).default('development-metrics-token-change-me'),
  INGESTION_RATE_LIMIT_MAX: z.coerce.number().int().positive().max(10_000).default(600),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;
  for (const field of ['APP_LOG_INGESTION_KEY', 'INTERNAL_API_TOKEN', 'METRICS_TOKEN'] as const) {
    if (developmentSecrets.has(value[field])) {
      context.addIssue({ code: 'custom', path: [field], message: 'Production secret is required' });
    }
  }
  if (new Set([value.APP_LOG_INGESTION_KEY, value.INTERNAL_API_TOKEN, value.METRICS_TOKEN]).size !== 3) {
    context.addIssue({ code: 'custom', path: ['APP_LOG_INGESTION_KEY'], message: 'Secrets must be distinct' });
  }
});

export type AppLogEnv = z.infer<typeof appLogEnvSchema>;
export const loadAppLogEnv = (source: NodeJS.ProcessEnv = process.env): AppLogEnv => appLogEnvSchema.parse(source);
