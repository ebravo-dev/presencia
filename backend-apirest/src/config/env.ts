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
  UAT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(45),
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
