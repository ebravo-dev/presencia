import { z } from 'zod';

const booleanValue = z.preprocess(
  (value) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : value,
  z.boolean(),
);

export const coordinationQueryEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3500),
  PRESENCIA_DEBUG_MODE: booleanValue.default(false),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/presencia_coordination_query?schema=public'),
  RABBITMQ_URL: z.string().min(1).default('amqp://guest:guest@localhost:5672'),
  ACADEMIC_SERVICE_URL: z.url().default('http://localhost:3300'),
  ATTENDANCE_SERVICE_URL: z.url().default('http://localhost:3400'),
  RECONCILE_INTERVAL_MS: z.coerce.number().int().min(10_000).default(300_000),
  INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  METRICS_TOKEN: z.string().min(32).default('development-metrics-token-change-me'),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;
  for (const [field, secret] of [
    ['INTERNAL_API_TOKEN', value.INTERNAL_API_TOKEN],
    ['METRICS_TOKEN', value.METRICS_TOKEN],
  ] as const) {
    if (secret.startsWith('development-')) context.addIssue({ code: 'custom', path: [field], message: 'Production secret is required' });
  }
  if (value.INTERNAL_API_TOKEN === value.METRICS_TOKEN) {
    context.addIssue({ code: 'custom', path: ['METRICS_TOKEN'], message: 'Secrets must be distinct' });
  }
});

export type CoordinationQueryEnv = z.infer<typeof coordinationQueryEnvSchema>;
export const loadCoordinationQueryEnv = (source: NodeJS.ProcessEnv = process.env) => coordinationQueryEnvSchema.parse(source);
