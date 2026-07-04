import 'dotenv/config';
import { z } from 'zod';

export const UAT_PORTAL_BASE_URL = 'https://administracionescolar.uat.edu.mx';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3100),
  UAT_BASE_URL: z
    .string()
    .url()
    .default(UAT_PORTAL_BASE_URL)
    .transform((value) => value.replace(/\/+$/, '')),
  UAT_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  UAT_ID_CICLO_ESCOLAR: z.preprocess(
    (value) => value === undefined || value === '' ? undefined : value,
    z.coerce.number().int().positive().optional(),
  ),
  UAT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(45),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/presencia_coordination?schema=public'),
  COORDINATION_JWT_SECRET: z.string().min(32).default('development-coordination-jwt-secret-change-me'),
  COORDINATION_WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  COORDINATION_COOKIE_SECURE: z.preprocess(
    (value) => value === undefined || value === '' ? undefined : value === true || value === 'true',
    z.boolean().optional(),
  ),
  ATTENDANCE_BACKEND_URL: z.string().url().default('http://localhost:3000'),
  ATTENDANCE_BACKEND_SERVICE_TOKEN: z.string().min(32).default('development-internal-service-token-change-me'),
  COORDINATION_WEB_DIST: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
