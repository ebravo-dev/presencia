import { z } from 'zod';

const booleanValue = z.preprocess(
  (value) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : value,
  z.boolean(),
);

export const attendanceEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3400),
  PRESENCIA_DEBUG_MODE: booleanValue.default(false),
  APP_TIME_ZONE: z.string().min(1).refine(isValidTimeZone, 'APP_TIME_ZONE must be a valid IANA timezone').default('America/Monterrey'),
  DATABASE_URL: z.string().min(1).default('postgresql://postgres:postgres@localhost:5432/presencia_attendance_v2?schema=public'),
  RABBITMQ_URL: z.string().min(1).default('amqp://guest:guest@localhost:5672'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  BINDING_JWT_SECRET: z.string().min(32).default('development-binding-jwt-secret-change-me'),
  METRICS_TOKEN: z.string().min(32).default('development-metrics-token-change-me'),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;
  for (const [field, secret] of [
    ['INTERNAL_API_TOKEN', value.INTERNAL_API_TOKEN],
    ['BINDING_JWT_SECRET', value.BINDING_JWT_SECRET],
    ['METRICS_TOKEN', value.METRICS_TOKEN],
  ] as const) {
    if (secret.startsWith('development-')) context.addIssue({ code: 'custom', path: [field], message: 'Production secret is required' });
  }
  if (new Set([value.INTERNAL_API_TOKEN, value.BINDING_JWT_SECRET, value.METRICS_TOKEN]).size !== 3) {
    context.addIssue({ code: 'custom', path: ['INTERNAL_API_TOKEN'], message: 'Secrets must be distinct' });
  }
});

export type AttendanceEnv = z.infer<typeof attendanceEnvSchema>;
export const loadAttendanceEnv = (source: NodeJS.ProcessEnv = process.env): AttendanceEnv => attendanceEnvSchema.parse(source);

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
