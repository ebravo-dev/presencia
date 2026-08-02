import 'dotenv/config';
import { z } from 'zod';

export const UAT_PORTAL_BASE_URL = 'https://administracionescolar.uat.edu.mx';
export const UAT_ALUMNOS_BASE_URL = 'https://alumnossur.uat.edu.mx';

const DEVELOPMENT_SECRETS = new Set([
  'development-coordination-jwt-secret-change-me',
  'development-internal-service-token-change-me',
  'development-attendance-job-secret-change-me',
  'development-uat-session-secret-change-me',
]);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3100),
  APP_TIME_ZONE: z.string().default('America/Mexico_City'),
  UAT_BASE_URL: z
    .string()
    .url()
    .default(UAT_PORTAL_BASE_URL)
    .transform((value) => value.replace(/\/+$/, '')),
  UAT_ALUMNOS_BASE_URL: z
    .string()
    .url()
    .default(UAT_ALUMNOS_BASE_URL)
    .transform((value) => value.replace(/\/+$/, '')),
  UAT_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  UAT_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().max(100).default(5),
  UAT_CIRCUIT_OPEN_MS: z.coerce.number().int().positive().max(600_000).default(30_000),
  UAT_ID_CICLO_ESCOLAR: z.preprocess(
    (value) => value === undefined || value === '' ? undefined : value,
    z.coerce.number().int().positive().optional(),
  ),
  PRESENCIA_DEBUG_MODE: z.preprocess(
    (value) => value === undefined || value === '' ? undefined : value === true || value === 'true',
    z.boolean().default(false),
  ),
  PRESENCIA_DEBUG_CYCLE_ID: z.coerce.number().int().positive().default(150),
  PRESENCIA_DEBUG_CYCLE_NAME: z.string().default('2026 - 1 PRIMAVERA'),
  PRESENCIA_DEBUG_EXTRA_PROFESSORS: z.coerce.number().int().min(0).max(25).default(4),
  PRESENCIA_DEBUG_EXTRA_PROFESSORS_JSON: z.string().optional(),
  PRESENCIA_DEBUG_VERBOSE_LOGS: z.preprocess(
    (value) => value === undefined || value === '' ? undefined : value === true || value === 'true',
    z.boolean().default(false),
  ),
  UAT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(45),
  REDIS_URL: z.string().url().default('redis://localhost:6379/0'),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
  DOMAIN_EVENT_POLL_INTERVAL_MS: z.coerce.number().int().positive().max(60_000).default(1_000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/presencia_coordination?schema=public'),
  COORDINATION_JWT_SECRET: z.string().min(32).default('development-coordination-jwt-secret-change-me'),
  INTERNAL_API_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  COORDINATION_WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  COORDINATION_COOKIE_SECURE: z.preprocess(
    (value) => value === undefined || value === '' ? undefined : value === true || value === 'true',
    z.boolean().optional(),
  ),
  ATTENDANCE_BACKEND_URL: z.string().url().default('http://localhost:3000'),
  IDENTITY_SERVICE_URL: z.string().url().optional(),
  IDENTITY_SERVICE_REQUIRED: z.preprocess(
    (value) => value === undefined || value === '' ? undefined : value === true || value === 'true',
    z.boolean().default(false),
  ),
  ACADEMIC_SERVICE_URL: z.string().url().optional(),
  ACADEMIC_SERVICE_REQUIRED: z.preprocess(
    (value) => value === undefined || value === '' ? undefined : value === true || value === 'true',
    z.boolean().default(false),
  ),
  ATTENDANCE_BACKEND_SERVICE_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  ATTENDANCE_JOB_ENCRYPTION_SECRET: z.string().min(32).default('development-attendance-job-secret-change-me'),
  UAT_SESSION_ENCRYPTION_SECRET: z.string().min(32).default('development-uat-session-secret-change-me'),
  COORDINATION_WEB_DIST: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;

  const secretFields = [
    'COORDINATION_JWT_SECRET',
    'INTERNAL_API_TOKEN',
    'ATTENDANCE_BACKEND_SERVICE_TOKEN',
    'ATTENDANCE_JOB_ENCRYPTION_SECRET',
    'UAT_SESSION_ENCRYPTION_SECRET',
  ] as const;

  for (const field of secretFields) {
    if (DEVELOPMENT_SECRETS.has(value[field])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'Must be configured with a non-development value in production',
      });
    }
  }

  const identitySecrets = [
    value.COORDINATION_JWT_SECRET,
    value.ATTENDANCE_JOB_ENCRYPTION_SECRET,
    value.UAT_SESSION_ENCRYPTION_SECRET,
  ];
  const serviceSecrets = [value.INTERNAL_API_TOKEN, value.ATTENDANCE_BACKEND_SERVICE_TOKEN];
  if (identitySecrets.some((secret) => serviceSecrets.includes(secret))
    || new Set(identitySecrets).size !== identitySecrets.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COORDINATION_JWT_SECRET'],
      message: 'JWT and encryption secrets must be distinct from service tokens and from each other',
    });
  }

  if (value.PRESENCIA_DEBUG_MODE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PRESENCIA_DEBUG_MODE'],
      message: 'Debug mode cannot be enabled in production',
    });
  }

  if (value.COORDINATION_COOKIE_SECURE === false) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COORDINATION_COOKIE_SECURE'],
      message: 'Secure cookies cannot be disabled in production',
    });
  }

  if (value.IDENTITY_SERVICE_REQUIRED && !value.IDENTITY_SERVICE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['IDENTITY_SERVICE_URL'],
      message: 'Identity Service URL is required when identity integration is enabled',
    });
  }
  if (value.ACADEMIC_SERVICE_REQUIRED && !value.ACADEMIC_SERVICE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ACADEMIC_SERVICE_URL'],
      message: 'Academic Service URL is required when academic integration is enabled',
    });
  }

  const rabbitmq = new URL(value.RABBITMQ_URL);
  if (rabbitmq.username === 'guest' || rabbitmq.password === 'guest') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RABBITMQ_URL'],
      message: 'RabbitMQ guest credentials cannot be used in production',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
