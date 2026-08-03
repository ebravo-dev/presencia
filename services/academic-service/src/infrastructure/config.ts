import { z } from 'zod';

const booleanValue = z.preprocess(
  (value) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : value,
  z.boolean(),
);

export const academicEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3300),
  PRESENCIA_DEBUG_MODE: booleanValue.default(false),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/presencia_academic?schema=public'),
  RABBITMQ_URL: z.string().min(1).default('amqp://guest:guest@localhost:5672'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  METRICS_TOKEN: z.string().min(32).default('development-metrics-token-change-me'),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;
  if (value.INTERNAL_API_TOKEN.startsWith('development-') || value.METRICS_TOKEN.startsWith('development-')) {
    context.addIssue({ code: 'custom', path: ['INTERNAL_API_TOKEN'], message: 'Production secrets are required' });
  }
  if (value.INTERNAL_API_TOKEN === value.METRICS_TOKEN) {
    context.addIssue({ code: 'custom', path: ['METRICS_TOKEN'], message: 'Metrics token must be distinct' });
  }
});

export type AcademicEnv = z.infer<typeof academicEnvSchema>;
export const loadAcademicEnv = (source: NodeJS.ProcessEnv = process.env): AcademicEnv => academicEnvSchema.parse(source);
